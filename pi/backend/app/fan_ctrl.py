"""Gehäuselüfter-Steuerung über GPIO — kühlt den V20-Kühlkörper.

Drei Modi (`app_state.fan.mode`):
  * "auto"     — an wenn der FU läuft, aus nach Nachlaufzeit (On/Off).
  * "pwm_auto" — Drehzahl folgt dem FU-Ausgangsstrom (app_state.v20.current),
                 linear interpoliert zwischen (src_min→pwm_min) und
                 (src_max→pwm_max). Aus nach Nachlaufzeit.
  * "aus"      — Lüfter dauerhaft deaktiviert.

Hardware: Arctic P9 MAX (4-Pin-PWM) am PWM-Pin von GPIO 18 (phys. Pin 12).
Wenn Hardware-PWM (sysfs /sys/class/pwm) verfügbar ist, wird das Tastverhältnis
mit 25 kHz ausgegeben; sonst Fallback auf reines HIGH/LOW (duty>0 = an). Fehlt
RPi.GPIO/sysfs oder darf der Service-User nicht zugreifen, läuft alles als No-Op
— das Backend darf daran nie sterben.
"""
from __future__ import annotations

import time
from pathlib import Path
from typing import Any

from .persistence import FAN_FILE, load_json, save_json
from .state import app_state, web_log

# BCM-Nummerierung: GPIO 18 = physischer Pin 12 (Hardware-PWM-fähig, PWM0).
FAN_GPIO = 18
PWM_HZ = 25000                       # Intel/Arctic-Spec
PWM_CHIP = Path("/sys/class/pwm/pwmchip0")
PWM_CHANNEL = 0                      # GPIO18 = PWM0 Kanal 0
PWM_ALT_FUNC = "a5"                  # ALT5 = PWM0-Funktion auf GPIO18 (pinctrl)
_VALID_MODES = ("auto", "pwm_auto", "aus")


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


class FanController:
    def __init__(self, pin: int = FAN_GPIO) -> None:
        self._pin = pin
        self._gpio = None            # RPi.GPIO-Modul (HIGH/LOW-Fallback)
        self._pwm_path: Path | None = None  # sysfs-Kanal, wenn Hardware-PWM aktiv
        self._duty = -1              # zuletzt gesetztes Tastverhältnis (0..100), -1 = unbekannt
        self._off_at: float | None = None   # monotone Deadline für Nachlauf
        # Beim Boot ist pwm0 evtl. noch nicht exportiert/berechtigt, wenn das Backend
        # startet → HW-PWM scheitert und tick() versucht es eine Weile erneut.
        self._hw_pwm_retries = 30
        self._init_gpio()

    # ── Hardware-Init ─────────────────────────────────────────
    def _init_gpio(self) -> None:
        # 1) Hardware-PWM über sysfs bevorzugen (sauberes 25 kHz, kein Jitter).
        if self._init_hw_pwm():
            web_log(f"[FAN] Hardware-PWM auf GPIO {self._pin} (25 kHz) aktiv")
            return
        # 2) Fallback: reines HIGH/LOW über RPi.GPIO (rpi-lgpio).
        try:
            import RPi.GPIO as GPIO  # type: ignore

            GPIO.setmode(GPIO.BCM)
            GPIO.setwarnings(False)
            GPIO.setup(self._pin, GPIO.OUT, initial=GPIO.LOW)
        except Exception as exc:
            web_log(f"[FAN] GPIO-Init fehlgeschlagen ({exc}) — Lüfter deaktiviert")
            return
        self._gpio = GPIO
        web_log(f"[FAN] GPIO {self._pin} (HIGH/LOW, kein Hardware-PWM) initialisiert")

    def _init_hw_pwm(self) -> bool:
        try:
            if not PWM_CHIP.exists():
                return False
            ch = PWM_CHIP / f"pwm{PWM_CHANNEL}"
            if not ch.exists():
                (PWM_CHIP / "export").write_text(str(PWM_CHANNEL))
            period_ns = int(1_000_000_000 / PWM_HZ)
            (ch / "period").write_text(str(period_ns))
            (ch / "duty_cycle").write_text("0")
            (ch / "enable").write_text("1")
            # Das pwm-Overlay aktiviert den PWM-Block, schaltet aber den Pin-Mux
            # nicht zuverlässig auf die PWM-Alt-Funktion (Pin bleibt sonst Input →
            # Lüfter sieht kein Signal und läuft auf Failsafe-Vollgas). Daher den
            # Mux explizit auf ALT5 (= PWM0 auf GPIO18) setzen.
            import subprocess
            subprocess.run(["pinctrl", "set", str(self._pin), PWM_ALT_FUNC],
                           check=False, capture_output=True)
            self._pwm_path = ch
            return True
        except Exception:
            # Beim Boot oft "Permission denied", weil pwm0 noch nicht via udev
            # berechtigt ist. Nicht laut loggen — tick() probiert es erneut.
            return False

    # ── Ausgabe ───────────────────────────────────────────────
    def _set_pwm(self, duty: int) -> None:
        duty = int(_clamp(duty, 0, 100))
        if duty == self._duty:
            return
        prev = self._duty
        self._duty = duty
        if self._pwm_path is not None:
            try:
                period_ns = int(self._pwm_path.joinpath("period").read_text() or 0)
                (self._pwm_path / "duty_cycle").write_text(str(int(period_ns * duty / 100)))
            except Exception as exc:
                web_log(f"[FAN] PWM-Schreibfehler ({exc})")
        elif self._gpio is not None:
            self._gpio.output(self._pin, self._gpio.HIGH if duty > 0 else self._gpio.LOW)
        # nur Zustandswechsel an/aus loggen, nicht jede Drehzahländerung
        if (prev <= 0) != (duty <= 0):
            web_log(f"[FAN] Lüfter {'AN' if duty > 0 else 'AUS'}")
        app_state.fan.current_pwm = duty
        app_state.fan.running = duty > 0

    def _pwm_for_current(self) -> int:
        """PWM 0..100 linear aus dem FU-Strom zwischen src_min..src_max."""
        f = app_state.fan
        cur = app_state.v20.current
        if f.src_max <= f.src_min:
            return f.pwm_max
        frac = _clamp((cur - f.src_min) / (f.src_max - f.src_min), 0.0, 1.0)
        return int(round(f.pwm_min + frac * (f.pwm_max - f.pwm_min)))

    # ── Tick (1 Hz aus main._fan_loop) ────────────────────────
    def tick(self) -> None:
        # HW-PWM beim Boot nachholen, falls pwm0 zum Start noch nicht bereit war.
        if self._pwm_path is None and self._hw_pwm_retries > 0:
            self._hw_pwm_retries -= 1
            if self._init_hw_pwm():
                self._duty = -1  # erzwingt Neuausgabe des aktuellen Soll-Werts
                web_log(f"[FAN] Hardware-PWM auf GPIO {self._pin} (25 kHz) aktiv (nachträglich)")

        f = app_state.fan
        running = app_state.v20.running
        now = time.monotonic()

        if f.mode == "aus":
            self._off_at = None
            self._set_pwm(0)
            return

        target = 100 if f.mode == "auto" else self._pwm_for_current()

        if running:
            self._off_at = None
            self._set_pwm(target)
        else:
            if self._duty > 0:
                # FU gestoppt → Nachlauf-Deadline setzen, dann abschalten
                if self._off_at is None:
                    self._off_at = now + f.postrun_s
                elif now >= self._off_at:
                    self._set_pwm(0)
                    self._off_at = None
            else:
                self._set_pwm(0)

    def cleanup(self) -> None:
        self._set_pwm(0)
        if self._pwm_path is not None:
            try:
                (self._pwm_path / "enable").write_text("0")
            except Exception:
                pass
        if self._gpio is not None:
            self._gpio.cleanup(self._pin)

    # ── Persistenz / Config ───────────────────────────────────
    def load(self) -> None:
        cfg = load_json(FAN_FILE)
        if cfg is None:
            return
        f = app_state.fan
        for key in ("mode", "postrun_s", "pwm_min", "pwm_max", "src_min", "src_max"):
            if key in cfg:
                setattr(f, key, cfg[key])

    def save(self) -> None:
        f = app_state.fan
        save_json(FAN_FILE, {
            "mode": f.mode,
            "postrun_s": f.postrun_s,
            "pwm_min": f.pwm_min,
            "pwm_max": f.pwm_max,
            "src_min": f.src_min,
            "src_max": f.src_max,
        })

    def set_config(self, cfg: dict[str, Any]) -> None:
        f = app_state.fan
        if "mode" in cfg and cfg["mode"] in _VALID_MODES:
            f.mode = cfg["mode"]
        if "postrun_s" in cfg:
            f.postrun_s = int(_clamp(float(cfg["postrun_s"]), 0, 3600))
        if "pwm_min" in cfg:
            f.pwm_min = int(_clamp(float(cfg["pwm_min"]), 0, 100))
        if "pwm_max" in cfg:
            f.pwm_max = int(_clamp(float(cfg["pwm_max"]), 0, 100))
        if f.pwm_min > f.pwm_max:
            f.pwm_min = f.pwm_max
        if "src_min" in cfg:
            f.src_min = _clamp(float(cfg["src_min"]), 0.0, 200.0)
        if "src_max" in cfg:
            f.src_max = _clamp(float(cfg["src_max"]), 0.0, 200.0)
        if f.src_max <= f.src_min:
            f.src_max = f.src_min + 0.1
        web_log(
            f"[FAN] Config: mode={f.mode} postrun={f.postrun_s}s "
            f"pwm={f.pwm_min}-{f.pwm_max}% src={f.src_min}-{f.src_max}A"
        )
        self.save()


controller = FanController()
