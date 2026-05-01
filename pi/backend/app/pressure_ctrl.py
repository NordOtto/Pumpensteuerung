"""PI-Druckregelung — 1:1 Port von docker/backend/pressureCtrl.js.

ALLE Konstanten, Schwellen und Reihenfolgen sind bewusst identisch zur
Node.js-Referenz übernommen. Tunings (Kp=8, Ki=1, p_on/p_off, Trockenlauf-
Logik, Spike-Detect, Overpressure-Hysterese) wurden in der Praxis validiert
und dürfen nicht "verbessert" werden, ohne die Pumpe entsprechend neu zu
testen.

Statt MQTT-Befehle an den ESP32 zu senden (`mqtt.sendCmd('v20/start', '1')`)
ruft dieser Port die übergebenen Callbacks auf, die direkt Modbus-RTU zum
V20 sprechen. So bleibt die Reglerlogik unabhängig von der Transport-Schicht.
"""
from __future__ import annotations

import time
from collections.abc import Callable
from typing import Any

from .persistence import PRESSURE_FILE, load_json, save_json
from .state import app_state, web_log
from .timeguard import is_allowed as tg_is_allowed

# ── Konstanten (identisch zu pressureCtrl.js:61-71) ──
DT = 0.5
NO_DEMAND_S = 5
DRY_RUN_S = 60
DRY_RUN_LOCK_S = 120
DRY_RUN_GRACE_S = 90
DRY_RUN_MAX_RETRIES = 3
DRY_RUN_RETRY_WINDOW_MS = 60 * 60 * 1000
MIN_FREQ_TIMEOUT_S = 60
OVERPRESSURE_HYSTERESIS = 0.3
PRESSURE_TIMEOUT_MS = 5000
FIXED_FREQ_REFRESH_MS = 2000
SPIKE_MIN_SETPOINT_MARGIN = 0.15
SPIKE_STARTUP_SUPPRESS_S = 8

# ── Spike-Detect Ringbuffer ──
SPIKE_SLOTS = 22


def _now_ms() -> int:
    return int(time.time() * 1000)


def _clamp(val: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, val))


class PressureController:
    """Hält den Reglerzustand. `tick()` 2× pro Sekunde aufrufen.

    Pumpensteuerung erfolgt über drei Callbacks, die der Aufrufer setzt:
      * on_start()       → V20 starten
      * on_stop()        → V20 stoppen
      * on_freq(hz)      → V20 Sollfrequenz setzen
    """

    def __init__(
        self,
        on_start: Callable[[], None],
        on_stop: Callable[[], None],
        on_freq: Callable[[float], None],
    ) -> None:
        self._on_start = on_start
        self._on_stop = on_stop
        self._on_freq = on_freq

        # Reglerzustand
        self._integral = 0.0
        self._pump_state = 0
        self._start_sent_at = 0

        # No-demand / Dry-run
        self._no_flow_since = 0
        self._dry_run_no_flow_since = 0
        self._dry_run_lock_until = 0
        self._dry_run_grace_until = 0
        self._dry_run_retry_count = 0
        self._dry_run_retry_window_end = 0
        self._dry_run_hard_locked = False

        # Min-Freq
        self._min_freq_since = 0

        # Fix-Frequenz Refresh
        self._last_fixed_freq_sent = 0

        # Spike-Detect Ringbuffer
        self._spike_buf = [0.0] * SPIKE_SLOTS
        self._spike_idx = 0
        self._spike_filled = False

        # Manueller Stop
        self._manual_stopped = False

        # Druck-Timeout
        self._last_pressure_ts = 0
        self._last_known_pressure = 0.0

        self._last_debug_ms = 0

    # ── Public API ─────────────────────────────────────────────
    def load(self) -> None:
        cfg = load_json(PRESSURE_FILE)
        if cfg is None:
            return
        pi = app_state.pi
        for key in ("enabled", "setpoint", "p_on", "p_off", "kp", "ki",
                    "freq_min", "freq_max", "spike_enabled",
                    "spike_threshold", "spike_window_s"):
            if key in cfg:
                setattr(pi, key, cfg[key])
        if "vacation_enabled" in cfg:
            app_state.vacation.enabled = bool(cfg["vacation_enabled"])

    def save(self) -> None:
        pi = app_state.pi
        save_json(PRESSURE_FILE, {
            "enabled": pi.enabled,
            "setpoint": pi.setpoint,
            "p_on": pi.p_on,
            "p_off": pi.p_off,
            "kp": pi.kp,
            "ki": pi.ki,
            "freq_min": pi.freq_min,
            "freq_max": pi.freq_max,
            "spike_enabled": pi.spike_enabled,
            "spike_threshold": pi.spike_threshold,
            "spike_window_s": pi.spike_window_s,
            "vacation_enabled": app_state.vacation.enabled,
        })

    def set_config(self, cfg: dict[str, Any]) -> None:
        pi = app_state.pi
        if "enabled" in cfg:
            pi.enabled = bool(cfg["enabled"])
        if "setpoint" in cfg:
            pi.setpoint = _clamp(float(cfg["setpoint"]), 0.1, 6.0)
        if "p_on" in cfg:
            pi.p_on = _clamp(float(cfg["p_on"]), 0.1, pi.setpoint)
        if "p_off" in cfg:
            pi.p_off = _clamp(float(cfg["p_off"]), pi.setpoint, 8.0)
        if "kp" in cfg:
            pi.kp = float(cfg["kp"])
        if "ki" in cfg:
            pi.ki = float(cfg["ki"])
        if "freq_min" in cfg:
            pi.freq_min = _clamp(float(cfg["freq_min"]), 10, 60)
        if "freq_max" in cfg:
            pi.freq_max = _clamp(float(cfg["freq_max"]), 10, 60)
        if pi.freq_min > pi.freq_max:
            pi.freq_min = pi.freq_max
        if "spike_enabled" in cfg:
            pi.spike_enabled = bool(cfg["spike_enabled"])
        if "spike_threshold" in cfg:
            pi.spike_threshold = _clamp(float(cfg["spike_threshold"]), 0.05, 5.0)
        if "spike_window_s" in cfg:
            pi.spike_window_s = _clamp(float(cfg["spike_window_s"]), 1, 10)
        web_log(
            f"[PI] Config: SP={pi.setpoint} p_on={pi.p_on} p_off={pi.p_off} "
            f"fMin={pi.freq_min} fMax={pi.freq_max} kp={pi.kp} ki={pi.ki} "
            f"spike={pi.spike_enabled}({pi.spike_threshold}bar/{pi.spike_window_s}s)"
        )
        self.save()

    def set_vacation(self, enabled: bool) -> None:
        app_state.vacation.enabled = bool(enabled)
        web_log(
            "[PI] Urlaubsmodus aktiviert – Pumpe gesperrt"
            if enabled else "[PI] Urlaubsmodus deaktiviert"
        )
        self.save()

    def reset_dryrun(self, reason: str = "manuell") -> None:
        self._dry_run_lock_until = 0
        self._dry_run_no_flow_since = 0
        self._no_flow_since = 0
        self._min_freq_since = 0
        self._dry_run_grace_until = _now_ms() + DRY_RUN_GRACE_S * 1000
        self._dry_run_hard_locked = False
        if reason in ("manuell", "lock"):
            self._dry_run_retry_count = 0
            self._dry_run_retry_window_end = 0
        app_state.pi.dry_run_locked = False
        web_log(f"[PI] Trockenlauf-Sperre aufgehoben ({reason}) – {DRY_RUN_GRACE_S}s Grace-Period")

    def set_manual_stop(self, v: bool) -> None:
        self._manual_stopped = v
        if v:
            self._reset_integral()
            self._pump_state = 0

    def force_stop(self) -> None:
        self._pump_state = 0
        self._reset_integral()
        self._on_stop()

    # ── Hauptzyklus (alle 500 ms) ──────────────────────────────
    def tick(self) -> None:
        now = _now_ms()
        pi = app_state.pi
        st = app_state

        # Urlaubsmodus
        if st.vacation.enabled:
            if st.v20.running:
                self._on_stop()
                web_log("[PI] Urlaubsmodus – Pumpe gestoppt")
            self._reset_integral()
            return

        # Zeitsperre
        if not tg_is_allowed():
            if st.v20.running:
                self._on_stop()
                web_log("[PI] Zeitsperre aktiv – Pumpe gestoppt")
            self._reset_integral()
            return

        # Druckwert-Tracking
        if st.pressure_bar != self._last_known_pressure and st.pressure_bar > 0:
            self._last_known_pressure = st.pressure_bar
            self._last_pressure_ts = now

        # ── Trockenlauf-Sperren ──
        if self._dry_run_hard_locked:
            pi.dry_run_locked = True
            if st.v20.running:
                self._on_stop()
                web_log("[PI] Trockenlauf HARD-LOCK – V20 gestoppt (manueller Reset nötig)")
            self._reset_integral()
            return
        if self._dry_run_lock_until > 0 and now < self._dry_run_lock_until:
            pi.dry_run_locked = True
            if st.v20.running:
                self._on_stop()
                web_log("[PI] Trockenlauf-Sperre – V20 gestoppt")
            self._reset_integral()
            return
        elif self._dry_run_lock_until > 0 and now >= self._dry_run_lock_until:
            self._dry_run_lock_until = 0
            pi.dry_run_locked = False
            if self._dry_run_retry_window_end == 0 or now > self._dry_run_retry_window_end:
                self._dry_run_retry_count = 0
                self._dry_run_retry_window_end = now + DRY_RUN_RETRY_WINDOW_MS
            self._dry_run_retry_count += 1
            if self._dry_run_retry_count > DRY_RUN_MAX_RETRIES:
                self._dry_run_hard_locked = True
                pi.dry_run_locked = True
                web_log(
                    f"[PI] Max Auto-Retries ({DRY_RUN_MAX_RETRIES}/h) erreicht – HARD-LOCK"
                )
                self._reset_integral()
                return
            self._dry_run_grace_until = now + DRY_RUN_GRACE_S * 1000
            self._dry_run_no_flow_since = 0
            self._min_freq_since = 0
            web_log(
                f"[PI] Trockenlauf-Sperre abgelaufen – Auto-Retry "
                f"{self._dry_run_retry_count}/{DRY_RUN_MAX_RETRIES} – {DRY_RUN_GRACE_S}s Grace"
            )

        pi.dry_run_locked = False

        # ── Fix-Frequenz-Modus (mode=2) ──
        if st.ctrl_mode == 2:
            self._tick_fixed_freq(now)
            return

        # PI deaktiviert
        if not pi.enabled:
            self._reset_integral()
            return

        # Druck-Timeout
        if self._last_pressure_ts > 0 and (now - self._last_pressure_ts) > PRESSURE_TIMEOUT_MS:
            if self._pump_state != 0:
                web_log("[PI] Druck-Timeout! Kein Wert – V20 gestoppt")
                self._on_stop()
                self._reset_integral()
                self._last_pressure_ts = 0
            return

        pressure = st.pressure_bar
        flow = st.flow_rate
        running = st.v20.running
        freq = st.v20.frequency

        # ── Flow-Schätzung im Totbereich ──
        # Muss VOR den flow-basierten Stop-Checks (Überdruck, No-demand, Dry-run)
        # berechnet werden. Sensor-Untergrenze ist 5 L/min — bei niedriger
        # Echtentnahme (3–4 L/min) liefert er 0, was die Stop-Checks fälschlich
        # triggert ("Pumpe pendelt bei kleiner Wasserentnahme"). effective_flow
        # nutzt stattdessen die V20-Frequenz als Schätzwert: bei 35–50 Hz
        # ergibt das 2.8–4 L/min, was über der 1 L/min-Schwelle liegt.
        effective_flow = flow
        if flow < 1.0 and running and freq > 0:
            effective_flow = (freq / 50.0) * 4.0
            st.flow_estimated = True
        else:
            st.flow_estimated = False

        # ── Spike-Detect ──
        self._spike_buf[self._spike_idx] = pressure
        self._spike_idx = (self._spike_idx + 1) % SPIKE_SLOTS
        if self._spike_idx == 0:
            self._spike_filled = True

        # Hahn-zu darf nicht schon waehrend des Druckaufbaus ausloesen.
        # Sonst taktet die Pumpe bei niedrigem Druck: schneller Anstieg von
        # z.B. 2.0 auf 2.4 bar wurde als "Hahn zu" interpretiert, obwohl der
        # Sollwert 3.0 bar noch gar nicht erreicht ist.
        spike_armed = (
            pressure >= max(pi.p_on, pi.setpoint - SPIKE_MIN_SETPOINT_MARGIN)
            and (now - self._start_sent_at) > SPIKE_STARTUP_SUPPRESS_S * 1000
        )
        if (running and self._pump_state == 2 and pi.spike_enabled and spike_armed
                and (self._spike_filled or self._spike_idx > 0)):
            window_slots = min(round(pi.spike_window_s / DT), SPIKE_SLOTS - 1)
            old_idx = (self._spike_idx - 1 - window_slots + SPIKE_SLOTS * 2) % SPIKE_SLOTS
            old_pressure = self._spike_buf[old_idx]
            rise = pressure - old_pressure
            if rise >= pi.spike_threshold:
                web_log(
                    f"[PI] Hahn-zu erkannt: +{rise:.2f} bar in {pi.spike_window_s}s "
                    f"(Schwelle {pi.spike_threshold} bar) – sauberer Stop"
                )
                self._on_stop()
                self._reset_integral()
                self._spike_filled = False
                self._spike_idx = 0
                self._spike_buf = [0.0] * SPIKE_SLOTS
                return

        # ── Überdruck-Stop ──
        if (running and self._pump_state == 2
                and pressure > pi.setpoint + OVERPRESSURE_HYSTERESIS and effective_flow < 1.0):
            web_log(
                f"[PI] Überdruck-Stop: {pressure:.2f} > {pi.setpoint}+"
                f"{OVERPRESSURE_HYSTERESIS} bar bei flow<1 – V20 STOP"
            )
            self._on_stop()
            self._reset_integral()
            return

        # ── No-demand Shutdown ──
        if effective_flow < 1.0 and pressure >= pi.setpoint:
            if self._no_flow_since == 0:
                self._no_flow_since = now
            if (now - self._no_flow_since) > NO_DEMAND_S * 1000:
                if running:
                    web_log(
                        f"[PI] No-demand: flow={effective_flow:.1f} + Druck {pressure:.2f} bar "
                        f"≥ SP → Pumpe STOP"
                    )
                    self._on_stop()
                self._reset_integral()
                self._no_flow_since = 0
                return
        elif effective_flow >= 1.0:
            self._no_flow_since = 0

        # ── Dry-run Protection ──
        if self._dry_run_grace_until > 0 and now >= self._dry_run_grace_until:
            self._dry_run_grace_until = 0
            web_log("[PI] Trockenlauf Grace-Period abgelaufen")
        if (self._dry_run_grace_until == 0 and effective_flow < 1.0
                and running and pressure < pi.setpoint):
            if self._dry_run_no_flow_since == 0:
                self._dry_run_no_flow_since = now
            if (now - self._dry_run_no_flow_since) > DRY_RUN_S * 1000:
                web_log(
                    f"[PI] TROCKENLAUF! {DRY_RUN_S}s kein Durchfluss → Stop + "
                    f"Sperre {DRY_RUN_LOCK_S//60} min"
                )
                self._on_stop()
                self._dry_run_lock_until = now + DRY_RUN_LOCK_S * 1000
                pi.dry_run_locked = True
                self._reset_integral()
                return
        else:
            self._dry_run_no_flow_since = 0

        # ── Druck-Modus (ctrl_mode=0) Pumpenlogik ──
        if pi.ctrl_mode == 0:
            if self._pump_state == 0:
                if (not self._manual_stopped) and pressure > 0 and pressure < pi.p_on:
                    web_log(
                        f"[PI] Einschaltdruck unterschritten ({pressure:.2f} bar < {pi.p_on} bar) – START"
                    )
                    self._on_start()
                    self._pump_state = 1
                    self._start_sent_at = now
                pi.active = False
                pi.pump_state = 0
                return

            if self._pump_state == 1:
                if running:
                    self._pump_state = 2
                    web_log("[PI] Pumpe läuft – PI aktiv")
                    self._dry_run_grace_until = now + DRY_RUN_GRACE_S * 1000
                    self._dry_run_no_flow_since = 0
                elif now - self._start_sent_at > 10000:
                    web_log("[PI] START Timeout – V20 nicht gestartet")
                    self._pump_state = 0
                pi.pump_state = self._pump_state
                pi.active = False
                return

            # pump_state == 2
            if pressure >= pi.p_off:
                web_log(
                    f"[PI] Ausschaltdruck überschritten ({pressure:.2f} > {pi.p_off}) – STOP"
                )
                self._on_stop()
                self._reset_integral()
                return
            if not running:
                web_log("[PI] V20 nicht mehr aktiv – PI zurückgesetzt")
                self._reset_integral()
                return

        # ── Durchfluss-Modus (ctrl_mode=1) ──
        if pi.ctrl_mode == 1:
            if not running and self._pump_state == 0:
                self._on_start()
                self._pump_state = 1
                self._start_sent_at = now
                pi.pump_state = 1
                pi.active = False
                return
            if self._pump_state == 1:
                if running:
                    self._pump_state = 2
                elif now - self._start_sent_at > 10000:
                    self._pump_state = 0
                pi.pump_state = self._pump_state
                pi.active = False
                return

        # ── PI-Algorithmus ──
        setpoint = pi.flow_setpoint if pi.ctrl_mode == 1 else pi.setpoint
        measured = effective_flow if pi.ctrl_mode == 1 else pressure
        error = setpoint - measured
        self._integral += error * DT

        max_integral = (pi.freq_max - pi.freq_min) / (pi.ki or 0.001)
        self._integral = _clamp(self._integral, -max_integral, max_integral)

        freq_mid = (pi.freq_min + pi.freq_max) / 2
        freq_out = pi.kp * error + pi.ki * self._integral + freq_mid
        freq_out = _clamp(freq_out, pi.freq_min, pi.freq_max)

        if now - self._last_debug_ms > 30000:
            self._last_debug_ms = now
            web_log(
                f"[PI] SP={setpoint} PV={measured:.2f} err={error:.2f} I={self._integral:.1f} "
                f"fMin={pi.freq_min} fMax={pi.freq_max} fMid={freq_mid:.1f} → {freq_out:.1f} Hz"
            )

        self._on_freq(round(freq_out, 1))
        st.v20.freq_setpoint = freq_out

        # ── Min-Freq-Timeout (nur Druck-Modus) ──
        if (pi.ctrl_mode == 0 and self._dry_run_grace_until == 0
                and freq_out <= pi.freq_min + 0.5 and pressure < pi.setpoint - 0.2):
            if self._min_freq_since == 0:
                self._min_freq_since = now
            if (now - self._min_freq_since) > MIN_FREQ_TIMEOUT_S * 1000:
                web_log(
                    f"[PI] Min-Freq-Timeout: {MIN_FREQ_TIMEOUT_S}s auf {pi.freq_min} Hz, "
                    f"Druck {pressure:.2f} < SP – Stop + Sperre {DRY_RUN_LOCK_S}s"
                )
                self._on_stop()
                self._dry_run_lock_until = now + DRY_RUN_LOCK_S * 1000
                pi.dry_run_locked = True
                self._min_freq_since = 0
                self._reset_integral()
                return
        else:
            self._min_freq_since = 0

        pi.active = True
        pi.pump_state = self._pump_state

    # ── Hilfsfunktionen ────────────────────────────────────────
    def _reset_integral(self) -> None:
        self._integral = 0.0
        self._pump_state = 0
        app_state.pi.active = False
        app_state.pi.pump_state = 0
        self._no_flow_since = 0

    def _tick_fixed_freq(self, now: int) -> None:
        st = app_state
        hz = st.preset_setpoint_hz or 0
        expected = st.preset_expected_pressure or 0
        if hz <= 0:
            return

        if self._last_pressure_ts > 0 and (now - self._last_pressure_ts) > PRESSURE_TIMEOUT_MS:
            if st.v20.running:
                web_log("[PI] Druck-Timeout (Fix-Hz) – V20 gestoppt")
                self._on_stop()
            self._last_pressure_ts = 0
            return

        # effective_flow auch im Fix-Hz-Modus, Begründung siehe tick().
        eff_flow = st.flow_rate
        if st.flow_rate < 1.0 and st.v20.running and st.v20.frequency > 0:
            eff_flow = (st.v20.frequency / 50.0) * 4.0

        if (expected > 0 and st.v20.running
                and st.pressure_bar > expected + OVERPRESSURE_HYSTERESIS and eff_flow < 1.0):
            web_log(
                f"[PI] Überdruck-Stop (Fix-Hz): {st.pressure_bar:.2f} > "
                f"{expected}+{OVERPRESSURE_HYSTERESIS} bar – Stop"
            )
            self._on_stop()
            return

        if (expected > 0 and self._dry_run_grace_until == 0
                and eff_flow < 1.0 and st.v20.running
                and st.pressure_bar < expected * 0.5):
            if self._dry_run_no_flow_since == 0:
                self._dry_run_no_flow_since = now
            if (now - self._dry_run_no_flow_since) > DRY_RUN_S * 1000:
                web_log(
                    f"[PI] TROCKENLAUF (Fix-Hz)! {DRY_RUN_S}s kein Fluss + "
                    f"p<{expected*0.5} – Stop + Sperre {DRY_RUN_LOCK_S}s"
                )
                self._on_stop()
                self._dry_run_lock_until = now + DRY_RUN_LOCK_S * 1000
                app_state.pi.dry_run_locked = True
                return
        else:
            self._dry_run_no_flow_since = 0

        if self._dry_run_grace_until > 0 and now >= self._dry_run_grace_until:
            self._dry_run_grace_until = 0

        if self._manual_stopped:
            return

        if not st.v20.running:
            self._on_start()
            self._last_fixed_freq_sent = 0
            self._dry_run_grace_until = now + DRY_RUN_GRACE_S * 1000

        if now - self._last_fixed_freq_sent > FIXED_FREQ_REFRESH_MS:
            self._on_freq(round(hz, 1))
            st.v20.freq_setpoint = hz
            self._last_fixed_freq_sent = now
