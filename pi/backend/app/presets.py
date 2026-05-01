"""Betriebsmodi / Preset-Verwaltung — Port von docker/backend/presets.js.

Modi:
  0 = Druck       (PI-Druckregelung)
  1 = Durchfluss  (PI auf flow_setpoint)
  2 = FixHz       (Festfrequenz, PI deaktiviert; Trockenlauf-/Überdruckschutz aktiv)
"""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from .persistence import PRESETS_FILE, load_json, save_json
from .state import app_state, web_log

MAX_PRESETS = 20


@dataclass
class Preset:
    name: str
    mode: int = 0
    setpoint: float = 3.0
    kp: float = 8.0
    ki: float = 1.0
    freq_min: float = 35.0
    freq_max: float = 52.0
    setpoint_hz: float = 0.0
    expected_pressure: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "mode": self.mode,
            "setpoint": self.setpoint,
            "kp": self.kp,
            "ki": self.ki,
            "freq_min": self.freq_min,
            "freq_max": self.freq_max,
            "setpoint_hz": self.setpoint_hz,
            "expected_pressure": self.expected_pressure,
        }


DEFAULT_PRESET = Preset(name="Normal")


def _clamp_hz(v: float) -> float:
    if not isinstance(v, (int, float)) or v <= 0:
        return 0.0
    return max(10.0, min(60.0, float(v)))


def _clamp_pressure(v: float) -> float:
    if not isinstance(v, (int, float)) or v <= 0:
        return 0.0
    return max(0.1, min(8.0, float(v)))


@dataclass
class PresetManager:
    """Hält die Liste der Presets und wendet sie an.

    Abhängigkeiten werden injiziert (pressure_ctrl, V20-Callbacks), damit
    die Logik nicht hart an Modbus-Implementierung gekoppelt ist.
    """
    pi_ctrl: Any                              # PressureController-Instanz
    on_v20_start: Callable[[], None]
    on_v20_freq: Callable[[float], None]

    presets: list[Preset] = field(default_factory=lambda: [Preset(name="Normal")])
    on_changed: Callable[[], None] | None = None

    def load(self) -> None:
        data = load_json(PRESETS_FILE)
        if isinstance(data, list) and data:
            self.presets = [self._from_dict(p) for p in data]
        # Sicherstellen, dass "Normal" existiert
        if not any(p.name == "Normal" for p in self.presets):
            self.presets.insert(0, Preset(name="Normal"))
        web_log(f"[Presets] Geladen: {', '.join(p.name for p in self.presets)}")

    def save(self) -> None:
        save_json(PRESETS_FILE, [p.to_dict() for p in self.presets])

    def list(self) -> dict[str, Any]:
        return {
            "active": app_state.active_preset,
            "presets": [p.to_dict() for p in self.presets],
        }

    def add_or_update(self, body: dict[str, Any]) -> bool:
        name = (body.get("name") or "").strip()
        if not name or len(name) > 32:
            return False
        entry = self._from_dict(body)
        for i, p in enumerate(self.presets):
            if p.name == name:
                self.presets[i] = entry
                self.save()
                self._notify()
                return True
        if len(self.presets) >= MAX_PRESETS:
            return False
        self.presets.append(entry)
        self.save()
        self._notify()
        return True

    def delete(self, name: str) -> bool:
        if app_state.active_preset == name:
            return False
        idx = next((i for i, p in enumerate(self.presets) if p.name == name), -1)
        if idx < 0:
            return False
        self.presets.pop(idx)
        self.save()
        self._notify()
        return True

    def apply(self, name: str) -> bool:
        preset = next((p for p in self.presets if p.name == name), None)
        if preset is None:
            return False

        self.pi_ctrl.set_manual_stop(False)
        self.pi_ctrl._reset_integral()  # private API – bewusst, wie pi.resetIntegral()

        if preset.mode == 2:
            # Fix-Frequenz: PI deaktivieren, Sollfrequenz direkt setzen
            app_state.pi.enabled = False
            app_state.pi.ctrl_mode = 2
            app_state.pi.flow_setpoint = 0
            app_state.active_preset = name
            app_state.ctrl_mode = 2
            app_state.preset_expected_pressure = preset.expected_pressure or 0.0
            app_state.preset_setpoint_hz = preset.setpoint_hz or 0.0
            if preset.setpoint_hz > 0:
                self.on_v20_start()
                self.on_v20_freq(preset.setpoint_hz)
                app_state.v20.freq_setpoint = preset.setpoint_hz
            web_log(f"[Presets] Aktiviert (FixHz): {name} {preset.setpoint_hz} Hz")
            return True

        # Mode 0/1: PI re-konfigurieren
        if app_state.ctrl_mode == 2:
            self.pi_ctrl.force_stop()
        self.pi_ctrl.set_config({
            "enabled": True,
            "setpoint": preset.setpoint,
            "kp": preset.kp,
            "ki": preset.ki,
            "freq_min": preset.freq_min,
            "freq_max": preset.freq_max,
        })
        app_state.pi.ctrl_mode = preset.mode
        app_state.pi.flow_setpoint = preset.setpoint if preset.mode == 1 else 0
        app_state.active_preset = name
        app_state.ctrl_mode = preset.mode
        app_state.preset_expected_pressure = 0
        app_state.preset_setpoint_hz = 0
        web_log(f"[Presets] Aktiviert: {name}")
        return True

    # ── intern ────────────────────────────────────────────────
    def _notify(self) -> None:
        if self.on_changed:
            try:
                self.on_changed()
            except Exception as exc:
                print(f"[Presets] on_changed error: {exc}", flush=True)

    @staticmethod
    def _from_dict(d: dict[str, Any]) -> Preset:
        try:
            mode = int(d.get("mode", 0))
        except (TypeError, ValueError):
            mode = 0
        if mode not in (0, 1, 2):
            mode = 0

        def f(key: str, default: float) -> float:
            try:
                return float(d.get(key, default))
            except (TypeError, ValueError):
                return default

        return Preset(
            name=str(d.get("name", "Unbenannt")),
            mode=mode,
            setpoint=f("setpoint", 3.0),
            kp=f("kp", 8.0),
            ki=f("ki", 1.0),
            freq_min=f("freq_min", 35.0),
            freq_max=f("freq_max", 52.0),
            setpoint_hz=_clamp_hz(f("setpoint_hz", 0.0)),
            expected_pressure=_clamp_pressure(f("expected_pressure", 0.0)),
        )
