"""Zentraler Anwendungs-State — 1:1 Port von docker/backend/state.js.

Pydantic-Modelle als typisierte, mutierbare Container. `app_state`
ist die singleton Instanz, die alle Module gemeinsam lesen/schreiben
(genauso wie `state.js` per require eingebunden wurde).
"""
from __future__ import annotations

from collections import deque
from pathlib import Path
from typing import Deque

from pydantic import BaseModel, Field


def _version(default: str = "pi-backend-0.1.0") -> str:
    here = Path(__file__).resolve()
    for parent in here.parents:
        candidate = parent / "VERSION"
        if candidate.exists():
            return f"pumpe-{candidate.read_text(encoding='utf-8').strip()}"
    return default


class V20State(BaseModel):
    frequency: float = 0.0
    current: float = 0.0
    voltage: float = 0.0
    power: float = 0.0
    running: bool = False
    connected: bool = False
    fault: bool = False
    fault_code: int = 0
    status: str = "OFFLINE"
    freq_setpoint: float = 0.0


class FanState(BaseModel):
    rpm: int = 0
    pwm: int = 0
    mode: str = "Auto"


class PIState(BaseModel):
    enabled: bool = True
    setpoint: float = 3.0           # bar
    p_on: float = 2.2
    p_off: float = 4.0
    kp: float = 8.0
    ki: float = 1.0
    freq_min: float = 35.0
    freq_max: float = 52.0
    active: bool = False
    pump_state: int = 0             # 0=AUS, 1=STARTET, 2=LÄUFT
    dry_run_locked: bool = False
    flow_setpoint: float = 0.0
    ctrl_mode: int = 0              # 0=Druck, 1=Durchfluss, 2=FixHz
    spike_enabled: bool = True
    spike_threshold: float = 0.4
    spike_window_s: float = 3.0


class TimeguardState(BaseModel):
    enabled: bool = True
    start_hour: int = 7
    start_min: int = 0
    end_hour: int = 22
    end_min: int = 0
    days: list[bool] = Field(default_factory=lambda: [True] * 7)
    allowed: bool = True
    synced: bool = True
    time: str = "--:--"


class PresetLockState(BaseModel):
    active: bool = False
    locked_preset: str = ""
    remaining_s: int = 0


class SysState(BaseModel):
    uptime: int = 0
    mqtt: bool = False
    fw: str = Field(default_factory=_version)
    rtu_connected: bool = False
    tcp_clients: int = 0
    ip: str = ""


class VacationState(BaseModel):
    enabled: bool = False


class WeatherState(BaseModel):
    forecast_rain_mm: float = 0.0
    rain_24h_mm: float = 0.0
    temp_c: float | None = None
    humidity_pct: float | None = None
    wind_kmh: float = 0.0
    wind_gust_kmh: float | None = None
    solar_w_m2: float | None = None
    uv_index: float | None = None
    et0_mm: float | None = None
    soil_moisture_pct: float | None = None
    updated_at: str | None = None


class IrrigationDecision(BaseModel):
    allowed: bool = True
    reason: str = "Bereit"
    program_id: str = ""
    water_budget_mm: float = 0.0
    runtime_factor: float = 1.0
    next_start: str | None = None
    active_zone: str = ""
    active_program: str = ""
    running: bool = False


class IrrigationState(BaseModel):
    programs: list[dict] = Field(default_factory=list)
    weather: WeatherState = Field(default_factory=WeatherState)
    decision: IrrigationDecision = Field(default_factory=IrrigationDecision)
    zones: dict = Field(default_factory=dict)
    history: list[dict] = Field(default_factory=list)


class OtaState(BaseModel):
    running: bool = False
    log: list[str] = Field(default_factory=list)
    exit_code: int | None = None
    update_available: bool = False
    current_version: str = Field(default_factory=_version)
    latest_version: str | None = None
    latest_commit: str | None = None
    latest_date: str | None = None
    changelog: str | None = None
    last_check: str | None = None
    phase: str = "idle"


class AppState(BaseModel):
    v20: V20State = Field(default_factory=V20State)

    pressure_bar: float = 0.0
    flow_rate: float = 0.0
    flow_estimated: bool = False
    water_temp: float | None = None
    temperature: float | None = None

    fan: FanState = Field(default_factory=FanState)
    pi: PIState = Field(default_factory=PIState)
    timeguard: TimeguardState = Field(default_factory=TimeguardState)

    active_preset: str = "Normal"
    ctrl_mode: int = 0
    preset_setpoint_hz: float = 0.0
    preset_expected_pressure: float = 0.0

    preset_lock: PresetLockState = Field(default_factory=PresetLockState)
    sys: SysState = Field(default_factory=SysState)
    vacation: VacationState = Field(default_factory=VacationState)
    irrigation: IrrigationState = Field(default_factory=IrrigationState)
    ota: OtaState = Field(default_factory=OtaState)

    # Log-Ringbuffer (deque ist nicht serialisierbar via pydantic — separat halten)
    model_config = {"arbitrary_types_allowed": True}


app_state = AppState()
log_buffer: Deque[str] = deque(maxlen=500)
log_seq: int = 0


def web_log(msg: str) -> None:
    """Identisch zu webLog() in pressureCtrl.js — Format HH:MM:SS msg."""
    global log_seq
    from datetime import datetime
    now = datetime.now()
    line = f"{now:%H:%M:%S} {msg}"
    log_buffer.append(line)
    log_seq += 1
    print(line, flush=True)
