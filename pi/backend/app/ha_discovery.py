"""Home Assistant MQTT Auto-Discovery — Port von docker/backend/haDiscovery.js.

Pi-Backend übernimmt die Rolle, die früher das Docker-Backend hatte:
publiziert HA-Discovery-Configs auf `homeassistant/<comp>/pumpensteuerung/<id>/config`
und füttert die zugehörigen State-Topics aus dem `_mqtt_publish_loop` in main.py.

Nach Preset-CRUD muss `refresh_preset_select()` aufgerufen werden, damit HA
die geänderte Optionsliste sieht.
"""
from __future__ import annotations

import json
from typing import Any

from .mqtt_client import bridge

BASE = "pumpensteuerung"
DEVICE_INFO = {
    "ids": "pumpensteuerung",
    "name": "Pumpensteuerung",
    "mf": "DIY",
    "mdl": "Raspberry Pi 3B+ Backend",
    "sw": "pi-backend-0.1.0",
}

_preset_mgr = None  # wird in send_discovery() gesetzt


def _pub(component: str, object_id: str, payload: dict[str, Any]) -> None:
    payload["dev"] = DEVICE_INFO
    topic = f"homeassistant/{component}/pumpensteuerung/{object_id}/config"
    bridge.publish(topic, json.dumps(payload), retain=True)


def send_discovery(preset_mgr: Any) -> None:
    """Sendet alle Auto-Discovery-Topics an HA. Idempotent — kann bei jedem
    Connect aufgerufen werden, retain=True hält die Configs persistent."""
    global _preset_mgr
    _preset_mgr = preset_mgr

    # ── Sensoren V20 ──
    _pub("sensor", "v20_freq", {
        "name": "V20 Frequenz", "stat_t": f"{BASE}/v20/frequency",
        "unit_of_meas": "Hz", "dev_cla": "frequency",
        "uniq_id": "pumpensteuerung_v20_freq", "ic": "mdi:sine-wave",
    })
    _pub("sensor", "v20_current", {
        "name": "V20 Motorstrom", "stat_t": f"{BASE}/v20/current",
        "unit_of_meas": "A", "dev_cla": "current",
        "uniq_id": "pumpensteuerung_v20_current",
    })
    _pub("sensor", "v20_voltage", {
        "name": "V20 Spannung", "stat_t": f"{BASE}/v20/voltage",
        "unit_of_meas": "V", "dev_cla": "voltage",
        "uniq_id": "pumpensteuerung_v20_voltage",
    })
    _pub("sensor", "v20_power", {
        "name": "V20 Leistung", "stat_t": f"{BASE}/v20/power",
        "unit_of_meas": "W", "dev_cla": "power", "ic": "mdi:flash",
        "uniq_id": "pumpensteuerung_v20_power",
    })
    _pub("sensor", "v20_fault_code", {
        "name": "V20 Fehlercode", "stat_t": f"{BASE}/v20/fault_code",
        "uniq_id": "pumpensteuerung_v20_fault_code", "ic": "mdi:alert-circle",
    })
    _pub("sensor", "v20_status", {
        "name": "V20 Status", "stat_t": f"{BASE}/v20/status",
        "uniq_id": "pumpensteuerung_v20_status", "ic": "mdi:state-machine",
    })

    # ── Binary Sensors ──
    _pub("binary_sensor", "v20_connected", {
        "name": "V20 Verbunden", "stat_t": f"{BASE}/v20/connected",
        "dev_cla": "connectivity", "payload_on": "ON", "payload_off": "OFF",
        "uniq_id": "pumpensteuerung_v20_connected",
    })
    _pub("binary_sensor", "v20_fault", {
        "name": "V20 Störung", "stat_t": f"{BASE}/v20/fault",
        "dev_cla": "problem", "payload_on": "ON", "payload_off": "OFF",
        "uniq_id": "pumpensteuerung_v20_fault",
    })
    _pub("binary_sensor", "timeguard_allowed", {
        "name": "Zeitfenster", "stat_t": f"{BASE}/timeguard/allowed",
        "payload_on": "ON", "payload_off": "OFF",
        "uniq_id": "pumpensteuerung_timeguard_allowed", "ic": "mdi:clock",
    })
    _pub("binary_sensor", "dryrun_locked", {
        "name": "Trockenlauf-Sperre", "stat_t": f"{BASE}/dryrun/locked",
        "dev_cla": "problem", "payload_on": "ON", "payload_off": "OFF",
        "uniq_id": "pumpensteuerung_dryrun_locked", "ic": "mdi:water-off",
    })

    # ── Switches ──
    _pub("switch", "v20_running", {
        "name": "V20 Start/Stop",
        "stat_t": f"{BASE}/v20/running/state",
        "cmd_t": f"{BASE}/v20/running/set",
        "payload_on": "ON", "payload_off": "OFF",
        "uniq_id": "pumpensteuerung_v20_running", "ic": "mdi:pump",
    })
    _pub("switch", "pi_enabled", {
        "name": "PI Druckregelung",
        "stat_t": f"{BASE}/pi/enabled/state",
        "cmd_t": f"{BASE}/pi/enabled/set",
        "payload_on": "ON", "payload_off": "OFF",
        "uniq_id": "pumpensteuerung_pi_enabled", "ic": "mdi:gauge",
    })
    _pub("switch", "timeguard_enabled", {
        "name": "Zeitsperre",
        "stat_t": f"{BASE}/timeguard/enabled/state",
        "cmd_t": f"{BASE}/timeguard/enabled/set",
        "payload_on": "ON", "payload_off": "OFF",
        "uniq_id": "pumpensteuerung_timeguard_enabled", "ic": "mdi:clock-outline",
    })
    _pub("switch", "vacation", {
        "name": "Urlaubsmodus",
        "stat_t": f"{BASE}/vacation/state",
        "cmd_t": f"{BASE}/vacation/set",
        "payload_on": "ON", "payload_off": "OFF",
        "uniq_id": "pumpensteuerung_vacation", "ic": "mdi:beach",
    })
    _pub("switch", "pi_spike_enabled", {
        "name": "Hahn-zu Erkennung",
        "stat_t": f"{BASE}/pi/spike/enabled/state",
        "cmd_t": f"{BASE}/pi/spike/enabled/set",
        "payload_on": "ON", "payload_off": "OFF",
        "uniq_id": "pumpensteuerung_pi_spike_enabled", "ic": "mdi:water-alert",
    })

    # ── Numbers ──
    _pub("number", "v20_freq_set", {
        "name": "V20 Frequenz Soll",
        "stat_t": f"{BASE}/v20/freq_set/state",
        "cmd_t": f"{BASE}/v20/freq_set/set",
        "min": 0, "max": 60, "step": 0.5, "unit_of_meas": "Hz",
        "uniq_id": "pumpensteuerung_v20_freq_set", "ic": "mdi:sine-wave",
    })
    _pub("number", "pi_setpoint", {
        "name": "Druck Sollwert",
        "stat_t": f"{BASE}/pressure/setpoint/state",
        "cmd_t": f"{BASE}/pressure/setpoint/set",
        "min": 0.1, "max": 6.0, "step": 0.1, "unit_of_meas": "bar",
        "uniq_id": "pumpensteuerung_pi_setpoint", "ic": "mdi:gauge",
    })
    _pub("number", "pi_freq_min", {
        "name": "PI Freq Min",
        "stat_t": f"{BASE}/pi/freq_min/state",
        "cmd_t": f"{BASE}/pi/freq_min/set",
        "min": 10, "max": 60, "step": 1, "unit_of_meas": "Hz",
        "uniq_id": "pumpensteuerung_pi_freq_min",
    })
    _pub("number", "pi_freq_max", {
        "name": "PI Freq Max",
        "stat_t": f"{BASE}/pi/freq_max/state",
        "cmd_t": f"{BASE}/pi/freq_max/set",
        "min": 10, "max": 60, "step": 1, "unit_of_meas": "Hz",
        "uniq_id": "pumpensteuerung_pi_freq_max",
    })
    _pub("number", "pi_spike_threshold", {
        "name": "Hahn-zu Druckanstieg",
        "stat_t": f"{BASE}/pi/spike/threshold/state",
        "cmd_t": f"{BASE}/pi/spike/threshold/set",
        "min": 0.05, "max": 5.0, "step": 0.05, "unit_of_meas": "bar",
        "uniq_id": "pumpensteuerung_pi_spike_threshold", "ic": "mdi:gauge-full",
    })
    _pub("number", "pi_spike_window", {
        "name": "Hahn-zu Zeitfenster",
        "stat_t": f"{BASE}/pi/spike/window/state",
        "cmd_t": f"{BASE}/pi/spike/window/set",
        "min": 1, "max": 10, "step": 0.5, "unit_of_meas": "s",
        "uniq_id": "pumpensteuerung_pi_spike_window", "ic": "mdi:timer",
    })

    # ── Buttons ──
    _pub("button", "v20_fault_reset", {
        "name": "V20 Fehler quittieren",
        "cmd_t": f"{BASE}/cmd/v20/reset",
        "uniq_id": "pumpensteuerung_v20_fault_reset", "ic": "mdi:alert-circle-check",
    })
    _pub("button", "dryrun_reset", {
        "name": "Trockenlauf-Sperre aufheben",
        "cmd_t": f"{BASE}/dryrun/reset",
        "uniq_id": "pumpensteuerung_dryrun_reset", "ic": "mdi:water-check",
    })

    # ── Druck / Durchfluss / Temperatur ──
    _pub("sensor", "pressure", {
        "name": "Druck", "stat_t": f"{BASE}/pressure/state",
        "unit_of_meas": "bar", "dev_cla": "pressure",
        "uniq_id": "pumpensteuerung_pressure", "ic": "mdi:gauge",
    })
    _pub("sensor", "flow", {
        "name": "Durchfluss", "stat_t": f"{BASE}/flow/state",
        "unit_of_meas": "L/min",
        "uniq_id": "pumpensteuerung_flow", "ic": "mdi:waves",
    })
    _pub("sensor", "water_temp", {
        "name": "Wassertemperatur", "stat_t": f"{BASE}/raw/water_temp",
        "unit_of_meas": "°C", "dev_cla": "temperature",
        "uniq_id": "pumpensteuerung_water_temp",
    })

    # ── System ──
    _pub("sensor", "uptime", {
        "name": "Uptime", "stat_t": f"{BASE}/sys/uptime",
        "unit_of_meas": "s", "dev_cla": "duration", "ent_cat": "diagnostic",
        "uniq_id": "pumpensteuerung_uptime", "ic": "mdi:timer-outline",
    })

    # ── Preset Select (dynamisch) ──
    refresh_preset_select()

    _pub("sensor", "ctrl_mode", {
        "name": "Regelungsmodus", "stat_t": f"{BASE}/ctrl_mode/state",
        "uniq_id": "pumpensteuerung_ctrl_mode", "ic": "mdi:tune",
    })

    # ── Bewässerung ──
    _pub("binary_sensor", "irrigation_running", {
        "name": "Bewässerung aktiv", "stat_t": f"{BASE}/irrigation/running",
        "payload_on": "ON", "payload_off": "OFF",
        "uniq_id": "pumpensteuerung_irrigation_running", "ic": "mdi:sprinkler",
    })
    _pub("sensor", "irrigation_active_program", {
        "name": "Bewässerung Programm", "stat_t": f"{BASE}/irrigation/active_program",
        "uniq_id": "pumpensteuerung_irrigation_active_program", "ic": "mdi:calendar-clock",
    })
    _pub("sensor", "irrigation_active_zone", {
        "name": "Bewässerung Zone", "stat_t": f"{BASE}/irrigation/active_zone",
        "uniq_id": "pumpensteuerung_irrigation_active_zone", "ic": "mdi:sprinkler-variant",
    })
    _pub("sensor", "irrigation_skip_reason", {
        "name": "Bewässerung Entscheidung", "stat_t": f"{BASE}/irrigation/skip_reason",
        "uniq_id": "pumpensteuerung_irrigation_skip_reason", "ic": "mdi:information-outline",
    })
    _pub("sensor", "irrigation_water_budget", {
        "name": "Bewässerung Wasserbudget", "stat_t": f"{BASE}/irrigation/water_budget_mm",
        "unit_of_meas": "mm",
        "uniq_id": "pumpensteuerung_irrigation_water_budget", "ic": "mdi:water-percent",
    })
    _pub("sensor", "irrigation_runtime_factor", {
        "name": "Bewässerung Laufzeitfaktor", "stat_t": f"{BASE}/irrigation/runtime_factor",
        "uniq_id": "pumpensteuerung_irrigation_runtime_factor", "ic": "mdi:timer-cog-outline",
    })
    _pub("sensor", "irrigation_next_start", {
        "name": "Bewässerung nächster Start", "stat_t": f"{BASE}/irrigation/next_start",
        "uniq_id": "pumpensteuerung_irrigation_next_start", "ic": "mdi:calendar-start",
    })

    print("[HA] Auto-Discovery gesendet", flush=True)


def refresh_preset_select() -> None:
    """Wird nach Preset-CRUD gerufen — aktualisiert nur die Select-Options in HA."""
    if _preset_mgr is None:
        return
    options = [p["name"] for p in _preset_mgr.list()["presets"]]
    _pub("select", "preset", {
        "name": "Betriebsmodus",
        "stat_t": f"{BASE}/preset/state",
        "cmd_t": f"{BASE}/preset/set",
        "options": options,
        "uniq_id": "pumpensteuerung_preset", "ic": "mdi:water-pump",
    })
    print(f"[HA] Preset-Select aktualisiert: {', '.join(options)}", flush=True)
