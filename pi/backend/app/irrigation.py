"""Bewässerungscomputer — 1:1 Port von docker/backend/irrigation.js.

Die ET0-Logik (Wasser-Bilanz, Smart-ET, Wetterschwellen, Wochenlimit,
Fix-Mode mit Faktor-Reduktion bei Regen) wurde in der Praxis getunt —
Schwellen und Faktoren bleiben unverändert.

Statt MQTT direkt zu nutzen, bekommt der IrrigationManager die Bridge
und den PresetManager injiziert. Das hält die Logik testbar.
"""
from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from .config import settings
from .persistence import (
    IRRIGATION_HISTORY_FILE,
    IRRIGATION_OVERSEEDING_FILE,
    IRRIGATION_PROGRAMS_FILE,
    IRRIGATION_SEQUENTIAL_FILE,
    IRRIGATION_WEATHER_FILE,
    load_json,
    save_json,
)
from .state import app_state, web_log
from .storage import (
    insert_irrigation_event,
    list_irrigation_events,
    migrate_irrigation_json,
)
from .timeguard import is_allowed as tg_is_allowed

_TZ = ZoneInfo(settings.tz)
HISTORY_LIMIT = 250
TICK_S = 30
SCHEDULE_CATCHUP_MIN = 10   # Nachhol-Fenster für verpasste Auto-Starts (Neustart etc.)
TRANSIENT_RETRY_MIN = 180   # Nachfass-Fenster, solange nur ein temporärer Blocker im Weg stand
FREQ_SLIDER_MIN = 0.7       # Frequenz-Slider "häufig" → min_deficit × 0.7
FREQ_SLIDER_SPAN = 0.6      # "selten" → × (0.7 + 0.6) = 1.3
BASE = settings.mqtt_topic_prefix

# Blocker, die sich im Lauf des Tages von selbst erledigen können. Ein daran
# gescheiterter Auto-Start darf den Tagesversuch nicht verbrauchen, sonst fällt
# die Bewässerung wegen einer kurzen MQTT-Störung für den ganzen Tag aus.
TRANSIENT_BLOCKERS = {"MQTT getrennt", "V20-Stoerung", "Trockenlauf-Sperre", "Zeitfenster gesperrt"}

DEFAULT_THRESHOLDS = {
    "skip_rain_mm": 6.0,
    "reduce_rain_mm": 2.0,
    "wind_max_kmh": 35.0,
    "soil_moisture_skip_pct": 70.0,
    "et0_default_mm": 3.0,
}

DEFAULT_PROGRAM: dict[str, Any] = {
    "id": "garten",
    "name": "Garten",
    "enabled": False,
    "days": [True, True, True, True, True, False, False],
    "start_hour": 6,
    "start_min": 0,
    "mode": "fixed",
    "seasonal_factor": 1.0,
    "weather_enabled": True,
    "max_runs_per_week": 3,
    "min_runtime_factor": 0.25,
    "max_runtime_factor": 1.5,
    "thresholds": dict(DEFAULT_THRESHOLDS),
    "zones": [{
        "id": "garten",
        "name": "Garten",
        "enabled": True,
        "duration_min": 10,
        "water_mm": 6,
        "min_deficit_mm": 8,
        "target_mm": 12,
        "cycle_min": 0,
        "soak_min": 0,
        "deficit_mm": 0,
        "preset": "Normal",
        "plant_type": "Rasen",
    }],
    "last_run_at": None,
    "last_skip_reason": "",
}


def _clamp(v: Any, lo: float, hi: float) -> float:
    try:
        n = float(v)
    except (TypeError, ValueError):
        return lo
    return max(lo, min(hi, n))


def _now_iso() -> str:
    return datetime.now(_TZ).isoformat()


def _local_date_key(dt: datetime | None = None) -> str:
    return (dt or datetime.now(_TZ)).strftime("%Y-%m-%d")


def _normalize_id(value: Any, fallback: str) -> str:
    raw = str(value or fallback or "").strip().lower()
    safe = re.sub(r"[^a-z0-9_-]+", "_", raw).strip("_")
    return safe or fallback


def _normalize_days(days: Any, default: bool = True) -> list[bool]:
    """7-Tage-Liste (Mo–So). default = Wert für fehlende/ungültige Eingabe."""
    if not isinstance(days, list) or len(days) != 7:
        return [default] * 7
    return [bool(d) for d in days]


def _normalize_blocked_window(bw: Any) -> dict[str, Any]:
    bw = bw or {}
    return {
        "enabled": bool(bw.get("enabled")),
        "start_hour": int(_clamp(bw.get("start_hour", 11), 0, 23)),
        "start_min": int(_clamp(bw.get("start_min", 0), 0, 59)),
        "end_hour": int(_clamp(bw.get("end_hour", 18), 0, 23)),
        "end_min": int(_clamp(bw.get("end_min", 0), 0, 59)),
    }


def _in_blocked_window(now: datetime, bw: dict[str, Any]) -> bool:
    """True wenn `now` im Sperrfenster bw liegt (über Mitternacht-fähig)."""
    if not bw or not bw.get("enabled"):
        return False
    now_min = now.hour * 60 + now.minute
    start_min = int(bw.get("start_hour", 0)) * 60 + int(bw.get("start_min", 0))
    end_min = int(bw.get("end_hour", 0)) * 60 + int(bw.get("end_min", 0))
    if start_min == end_min:
        return False
    if start_min < end_min:
        return start_min <= now_min < end_min
    return now_min >= start_min or now_min < end_min


def _normalize_program(input_: dict[str, Any], idx: int = 0) -> dict[str, Any]:
    pid = _normalize_id(input_.get("id") or input_.get("name"), f"program_{idx + 1}")
    thresholds = {**DEFAULT_THRESHOLDS, **(input_.get("thresholds") or {})}
    zones_in = input_.get("zones") or []
    mode_raw = input_.get("mode")
    mode = "smart_et" if (mode_raw == "smart_et" or input_.get("smart_et") is True) else "fixed"
    return {
        "id": pid,
        "name": str(input_.get("name") or pid),
        "enabled": bool(input_.get("enabled")),
        "blocked_days": _normalize_days(input_.get("blocked_days"), default=False),
        "blocked_window": _normalize_blocked_window(input_.get("blocked_window")),
        "start_hour": int(_clamp(input_.get("start_hour"), 0, 23)),
        "start_min": int(_clamp(input_.get("start_min"), 0, 59)),
        "mode": mode,
        "seasonal_factor": _clamp(input_.get("seasonal_factor", 1), 0.1, 2),
        "weather_enabled": input_.get("weather_enabled") is not False,
        "max_runs_per_week": round(_clamp(input_.get("max_runs_per_week", 3), 1, 7)),
        "min_runtime_factor": _clamp(input_.get("min_runtime_factor", 0.25), 0.05, 2),
        "max_runtime_factor": _clamp(input_.get("max_runtime_factor", 1.5), 0.1, 3),
        "thresholds": {
            "skip_rain_mm": _clamp(thresholds["skip_rain_mm"], 0, 100),
            "reduce_rain_mm": _clamp(thresholds["reduce_rain_mm"], 0, 100),
            "wind_max_kmh": _clamp(thresholds["wind_max_kmh"], 0, 150),
            "soil_moisture_skip_pct": _clamp(thresholds["soil_moisture_skip_pct"], 0, 100),
            "et0_default_mm": _clamp(thresholds["et0_default_mm"], 0.1, 12),
        },
        "zones": [_normalize_zone(z, zi) for zi, z in enumerate(zones_in)],
        "last_balance_date": input_.get("last_balance_date"),
        "last_run_at": input_.get("last_run_at"),
        "last_auto_attempt_date": input_.get("last_auto_attempt_date"),
        "last_skip_reason": input_.get("last_skip_reason") or "",
    }


HECKE_DEFAULT_WIRKBREITE_M = 0.5  # Tropfschlauch: angenommene 0.5 m breiter Wurzelstreifen
PLANT_LINEAR_HINTS = ("hecke", "tropf", "drip", "strauch")  # plant_type-Trigger für Strecken-Modus


def _is_linear_zone(zone: dict[str, Any]) -> bool:
    if str(zone.get("area_unit") or "").lower() == "m":
        return True
    pt = str(zone.get("plant_type") or "").lower()
    return any(h in pt for h in PLANT_LINEAR_HINTS)


def _zone_area_m2(zone: dict[str, Any]) -> float:
    """Effektive Fläche der Zone in m². Bei Strecke (Tropfschlauch) wird mit Wirkbreite multipliziert."""
    val = float(zone.get("area_value", 0) or 0)
    if val <= 0:
        return 0.0
    if _is_linear_zone(zone):
        return val * HECKE_DEFAULT_WIRKBREITE_M
    return val


def _normalize_zone(z: dict[str, Any], zi: int) -> dict[str, Any]:
    duration_min = _clamp(z.get("duration_min", z.get("duration", 10)), 1, 240)
    water_mm = _clamp(z.get("water_mm", 6), 0.1, 50)
    # Default mm/h aus duration_min + water_mm berechnen (falls nicht explizit gesetzt)
    default_mm_h = water_mm / max(duration_min / 60.0, 0.01)
    plant_type = str(z.get("plant_type") or "")
    linear_hint = any(h in plant_type.lower() for h in PLANT_LINEAR_HINTS)
    area_unit_raw = str(z.get("area_unit") or ("m" if linear_hint else "m2")).lower()
    area_unit = "m" if area_unit_raw == "m" else "m2"
    return {
        "id": _normalize_id(z.get("id") or z.get("name"), f"zone_{zi + 1}"),
        "name": str(z.get("name") or z.get("id") or f"Zone {zi + 1}"),
        "enabled": z.get("enabled") is not False,
        "duration_min": duration_min,
        "water_mm": water_mm,
        "precipitation_mm_per_h": _clamp(z.get("precipitation_mm_per_h", default_mm_h), 0.5, 60),
        "frequency_pref": _clamp(z.get("frequency_pref", 0.5), 0.0, 1.0),
        "area_value": _clamp(z.get("area_value", 0), 0, 10000),
        "area_unit": area_unit,
        "min_deficit_mm": _clamp(z.get("min_deficit_mm", 8), 0.1, 80),
        "target_mm": _clamp(z.get("target_mm", 12), 0.1, 100),
        "cycle_min": _clamp(z.get("cycle_min", 0), 0, 240),
        "soak_min": _clamp(z.get("soak_min", 0), 0, 240),
        "deficit_mm": _clamp(z.get("deficit_mm", 0), 0, 200),
        "preset": str(z.get("preset") or "Normal"),
        "plant_type": plant_type,
    }


@dataclass
class _ActiveRun:
    program: dict[str, Any]
    zones: list[dict[str, Any]]
    zone_runtimes: dict[str, dict[str, float]] | None
    runtime_factor: float
    water_budget_mm: float
    started_at: float
    started_by: str = "auto"
    restore_preset: str = "Normal"
    zone_index: int = 0
    zone: dict[str, Any] | None = None
    zone_started_at: float = 0.0
    zone_ends_at: float = 0.0
    total_runtime_s: int = 0
    zone_remaining_s: float = 0.0
    soaking: bool = False
    paused: bool = False
    paused_since: float = 0.0
    paused_date: str = ""
    paused_phase: str = "run"
    paused_remaining_s: float = 0.0
    # Durchfluss-Integration (Liter pro Zone, Schlüssel = zone_id)
    flow_liters_by_zone: dict[str, float] = field(default_factory=dict)
    flow_last_sample_ts: float = 0.0

    def remaining_s(self, now: float) -> int:
        current = self.paused_remaining_s if self.paused else (max(0, self.zone_ends_at - now) if self.zone_ends_at else 0)
        future = max(0, self.zone_remaining_s)
        for zone in self.zones[self.zone_index + 1:]:
            smart = (self.zone_runtimes or {}).get(zone["id"])
            if smart:
                future += max(30, round(float(smart.get("runtime_s", 30))))
            else:
                future += max(30, round(float(zone.get("duration_min", 1)) * 60 * self.runtime_factor))
        return max(0, round(current + future))


class IrrigationManager:
    def __init__(
        self,
        mqtt_publish: Callable[[str, str, bool], None],
        v20_stop: Callable[[], None],
        presets_apply: Callable[[str], bool],
    ) -> None:
        self._publish = mqtt_publish
        self._v20_stop = v20_stop
        self._presets_apply = presets_apply
        self._active: _ActiveRun | None = None
        self._last_tick: float = 0.0
        self._last_schedule_minute: str = ""

    # ── Persistenz ────────────────────────────────────────────
    def load(self) -> None:
        programs = load_json(IRRIGATION_PROGRAMS_FILE)
        overseeding = load_json(IRRIGATION_OVERSEEDING_FILE)
        sequential = load_json(IRRIGATION_SEQUENTIAL_FILE)
        weather = load_json(IRRIGATION_WEATHER_FILE)

        if isinstance(programs, list) and programs:
            app_state.irrigation.programs = [_normalize_program(p, i) for i, p in enumerate(programs)]
        else:
            app_state.irrigation.programs = [_normalize_program(DEFAULT_PROGRAM, 0)]

        if isinstance(weather, dict):
            for k, v in weather.items():
                if hasattr(app_state.irrigation.weather, k):
                    setattr(app_state.irrigation.weather, k, v)
        if isinstance(overseeding, dict):
            for k, v in overseeding.items():
                if hasattr(app_state.irrigation.overseeding, k):
                    setattr(app_state.irrigation.overseeding, k, v)
        if isinstance(sequential, dict):
            for k, v in sequential.items():
                if hasattr(app_state.irrigation.sequential, k):
                    setattr(app_state.irrigation.sequential, k, v)

        # Einmalige Migration JSON → SQLite (No-op nach erstem Lauf)
        legacy = load_json(IRRIGATION_HISTORY_FILE)
        if isinstance(legacy, list) and legacy:
            migrated = migrate_irrigation_json(legacy)
            if migrated:
                web_log(f"[IRR] {migrated} History-Einträge nach SQLite migriert")

        # In-Memory-Cache aus SQLite befüllen (für WebSocket-Push)
        app_state.irrigation.history = list_irrigation_events(HISTORY_LIMIT)

        self.recompute_decision()
        web_log("[IRR] Konfiguration geladen")

    def _save_programs(self) -> None:
        try:
            save_json(IRRIGATION_PROGRAMS_FILE, app_state.irrigation.programs)
        except OSError as exc:
            print(f"[IRR] programs save error: {exc}", flush=True)

    def _save_weather(self) -> None:
        try:
            save_json(IRRIGATION_WEATHER_FILE, app_state.irrigation.weather.model_dump())
        except OSError as exc:
            print(f"[IRR] weather save error: {exc}", flush=True)

    def _save_overseeding(self) -> None:
        try:
            save_json(IRRIGATION_OVERSEEDING_FILE, app_state.irrigation.overseeding.model_dump())
        except OSError as exc:
            print(f"[IRR] overseeding save error: {exc}", flush=True)

    def _save_sequential(self) -> None:
        try:
            save_json(IRRIGATION_SEQUENTIAL_FILE, app_state.irrigation.sequential.model_dump())
        except OSError as exc:
            print(f"[IRR] sequential save error: {exc}", flush=True)

    def _add_history(self, entry: dict[str, Any]) -> None:
        entry = {"at": _now_iso(), **entry}
        app_state.irrigation.history.append(entry)
        app_state.irrigation.history = app_state.irrigation.history[-HISTORY_LIMIT:]
        try:
            insert_irrigation_event(entry)
        except Exception as exc:
            print(f"[IRR] history insert error: {exc}", flush=True)

    # ── Public API ───────────────────────────────────────────
    def get_programs(self) -> dict[str, Any]:
        return {"programs": app_state.irrigation.programs}

    def set_programs(self, body: Any) -> dict[str, Any]:
        items = body if isinstance(body, list) else (body or {}).get("programs")
        if not isinstance(items, list) or not items:
            raise ValueError("programs array required")
        normalized = [_normalize_program(p, i) for i, p in enumerate(items)]
        ids = set()
        for p in normalized:
            if p["id"] in ids:
                raise ValueError(f"duplicate program id: {p['id']}")
            ids.add(p["id"])
        app_state.irrigation.programs = normalized
        self.recompute_decision()
        self._save_programs()
        return self.get_programs()

    def get_weather(self) -> dict[str, Any]:
        return {
            **app_state.irrigation.weather.model_dump(),
            "decision": app_state.irrigation.decision.model_dump(),
        }

    def get_history(self) -> dict[str, Any]:
        return {"history": list_irrigation_events(HISTORY_LIMIT)}

    def get_status(self) -> dict[str, Any]:
        irr = app_state.irrigation
        return {
            "programs": irr.programs,
            "weather": irr.weather.model_dump(),
            "decision": irr.decision.model_dump(),
            "overseeding": irr.overseeding.model_dump(),
            "sequential": irr.sequential.model_dump(),
            "zones": irr.zones,
            "history": irr.history[-25:],
        }

    def set_overseeding(self, body: Any) -> dict[str, Any]:
        data = body or {}
        o = app_state.irrigation.overseeding
        enabled = bool(data.get("enabled"))
        program_id = str(data.get("program_id") or o.program_id or "")
        program = next((p for p in app_state.irrigation.programs if p["id"] == program_id), None)
        if enabled and not program:
            raise ValueError("Programm fehlt")
        known_zones = {z["id"] for z in (program or {}).get("zones", [])}
        zone_ids = [str(z) for z in (data.get("zone_ids") or o.zone_ids or []) if str(z) in known_zones]
        if enabled and not zone_ids:
            zone_ids = [z["id"] for z in (program or {}).get("zones", []) if z.get("enabled")]
        if enabled and not zone_ids:
            raise ValueError("Keine Zone ausgewaehlt")
        now = datetime.now(_TZ)
        days = int(_clamp(data.get("days", o.days), 1, 30))
        o.enabled = enabled
        o.program_id = program_id
        o.zone_ids = zone_ids
        o.duration_min = _clamp(data.get("duration_min", o.duration_min), 0.5, 30)
        o.interval_min = int(_clamp(data.get("interval_min", o.interval_min), 15, 12 * 60))
        o.days = days
        if enabled:
            o.started_at = o.started_at or now.isoformat()
            o.ends_at = (now + timedelta(days=days)).isoformat()
            o.next_run_at = now.isoformat()
            o.last_message = "Nachsaat aktiv"
        else:
            o.last_message = "Nachsaat gestoppt"
        self._save_overseeding()
        self.publish_decision()
        return o.model_dump()

    def get_overseeding(self) -> dict[str, Any]:
        return app_state.irrigation.overseeding.model_dump()

    def set_sequential(self, body: Any) -> dict[str, Any]:
        data = body or {}
        s = app_state.irrigation.sequential
        s.enabled = bool(data.get("enabled", s.enabled))
        s.start_hour = int(_clamp(data.get("start_hour", s.start_hour), 0, 23))
        s.start_min = int(_clamp(data.get("start_min", s.start_min), 0, 59))
        self._save_sequential()
        self.recompute_decision()
        self.publish_decision()
        return s.model_dump()

    def get_sequential(self) -> dict[str, Any]:
        return app_state.irrigation.sequential.model_dump()

    def ingest_weather(self, payload: Any) -> bool:
        data = payload
        if isinstance(payload, str):
            import json
            try:
                data = json.loads(payload)
            except json.JSONDecodeError:
                try:
                    data = {"forecast_rain_mm": float(payload)}
                except ValueError:
                    data = {}
        if not isinstance(data, dict):
            return False

        mapping = {
            "forecast_rain_mm": ("forecast_rain_mm", "forecastRainMm", "rain_forecast_mm"),
            "forecast_rain_1h_mm": ("forecast_rain_1h_mm", "forecastRain1hMm"),
            "forecast_rain_24h_mm": ("forecast_rain_24h_mm", "forecastRain24hMm"),
            "forecast_rain_48h_mm": ("forecast_rain_48h_mm", "forecastRain48hMm"),
            "forecast_rain_7d_mm": ("forecast_rain_7d_mm", "forecastRain7dMm"),
            "rain_24h_mm": ("rain_24h_mm", "rain24hMm", "rain_today_mm"),
            "temp_c": ("temp_c", "tempC", "temperature"),
            "humidity_pct": ("humidity_pct", "humidityPct", "humidity"),
            "wind_kmh": ("wind_kmh", "windKmh", "wind_speed"),
            "wind_gust_kmh": ("wind_gust_kmh", "windGustKmh", "wind_gust"),
            "solar_w_m2": ("solar_w_m2", "solarWM2", "solar_radiation"),
            "uv_index": ("uv_index", "uvIndex"),
            "et0_mm": ("et0_mm", "et0Mm", "evapotranspiration_mm"),
            "soil_moisture_pct": ("soil_moisture_pct", "soilMoisturePct", "soil_moisture"),
        }
        # Klare Daten-Domänen:
        #   forecast_only=True  → OWM-Forecast (Regen/ET0/UV für Planung)
        #   forecast_only=False → Ecowitt/HA Ist-Daten (Temp, Wind, Regen-Ist, Boden...)
        # Jede Quelle schreibt NUR ihre Domäne. Forecast-Felder sind für Ist-Updates
        # grundsätzlich schreibgeschützt – unabhängig vom aktuellen forecast_source.
        _FORECAST_KEYS = {
            "forecast_rain_mm", "forecast_rain_1h_mm", "forecast_rain_24h_mm",
            "forecast_rain_48h_mm", "forecast_rain_7d_mm",
        }
        forecast_only = bool(data.get("forecast_only"))
        w = app_state.irrigation.weather
        if forecast_only:
            # OWM: nur Forecast-Felder + UV/ET0 für Bewässerungsplanung
            mapping = {k: v for k, v in mapping.items() if k in _FORECAST_KEYS | {"uv_index", "et0_mm"}}
        else:
            # Ecowitt/HA: Forecast-Felder immer schreibgeschützt
            mapping = {k: v for k, v in mapping.items() if k not in _FORECAST_KEYS}
            # Lokale et0_mm-Pushes unter 0.3mm sind fast immer ein defekter/nicht
            # konfigurierter Sensor (Stormglass liefert min. 0.2mm) — würde sonst
            # die Wasserbilanz tagelang bei ~0 halten und Automatik-Bewässerung blockieren.
            if "et0_mm" in data:
                try:
                    if float(data["et0_mm"]) < 0.3:
                        data = {k: v for k, v in data.items() if k != "et0_mm"}
                except (TypeError, ValueError):
                    pass
        for target, keys in mapping.items():
            for k in keys:
                if k in data and data[k] not in (None, ""):
                    try:
                        setattr(w, target, float(data[k]))
                    except (TypeError, ValueError):
                        pass
                    break
        now = _now_iso()
        w.updated_at = now
        if forecast_only:
            w.forecast_source = str(data.get("forecast_source") or "openweathermap")
            w.forecast_updated_at = now
        else:
            w.current_source = str(data.get("current_source") or "local")
            w.current_updated_at = now
        self._save_weather()
        self.recompute_decision()
        web_log("[IRR] Wetter-Forecast aktualisiert" if forecast_only else "[IRR] Wetterdaten via MQTT/API aktualisiert")
        return True

    # ── Sicherheits-Vorprüfung ────────────────────────────────
    def _safety_block_reason(self) -> str:
        if app_state.vacation.enabled:
            return "Urlaubsmodus"
        if not tg_is_allowed():
            return "Zeitfenster gesperrt"
        if app_state.pi.dry_run_locked:
            return "Trockenlauf-Sperre"
        if app_state.v20.fault:
            return "V20-Stoerung"
        if not app_state.sys.mqtt:
            return "MQTT getrennt"
        return ""

    # ── Wasserbilanz / Smart-ET ───────────────────────────────
    def _weekly_run_count(self, program: dict[str, Any], dt: datetime | None = None) -> int:
        d = dt or datetime.now(_TZ)
        weekday = d.weekday()  # 0=Mo
        start = (d - timedelta(days=weekday)).replace(hour=0, minute=0, second=0, microsecond=0)
        start_ts = start.timestamp()
        count = 0
        for h in app_state.irrigation.history:
            if h.get("type") != "run" or h.get("result") != "completed":
                continue
            if h.get("program_id") != program["id"]:
                continue
            try:
                ts = datetime.fromisoformat(h["at"].replace("Z", "+00:00")).timestamp()
            except (KeyError, ValueError):
                continue
            if ts >= start_ts:
                count += 1
        return count

    def _update_water_balance(self, program: dict[str, Any]) -> bool:
        if program.get("mode") != "smart_et":
            return False
        today = _local_date_key()
        if program.get("last_balance_date") == today:
            return False
        # Rückwirkend für den ABGELAUFENEN Tag buchen: dessen ET0 steht morgens fest.
        # Früher wurde erst ab 9 Uhr der laufende Tag gebucht — Programme mit Start um
        # 6:00/7:30 sahen dadurch nie ein aufgebautes Defizit und wurden jeden Tag
        # mit "Regen kompensiert Defizit" übersprungen.
        w = app_state.irrigation.weather
        et0 = w.et0_mm if w.et0_mm is not None else program["thresholds"]["et0_default_mm"]
        rain = float(w.rain_24h_mm or 0)
        delta = (et0 * program["seasonal_factor"]) - rain
        for zone in program["zones"]:
            if not zone["enabled"]:
                continue
            zone["deficit_mm"] = _clamp(zone.get("deficit_mm", 0) + delta, 0, 200)
        program["last_balance_date"] = today
        self._save_programs()
        return True

    @staticmethod
    def _smart_zone_runtime(zone: dict[str, Any], rain_credit_mm: float = 0.0) -> dict[str, float]:
        deficit = max(0.0, float(zone.get("deficit_mm", 0)) - max(0.0, rain_credit_mm))
        desired = min(deficit, float(zone.get("target_mm", zone.get("water_mm", 1))))
        base_water = max(float(zone.get("water_mm", 1)), 0.1)
        base_min = max(float(zone.get("duration_min", 1)), 1)
        factor = _clamp(desired / base_water, 0.05, 3)
        return {
            "runtime_s": max(30, round(base_min * 60 * factor)),
            "applied_mm": round(base_water * factor * 10) / 10,
            "factor": round(factor * 100) / 100,
        }

    # ── Programm-Bewertung ────────────────────────────────────
    def evaluate_program(self, program: dict[str, Any] | None,
                         manual: bool = False, force_weather: bool = False) -> dict[str, Any]:
        safety = self._safety_block_reason()
        if safety:
            return {"allowed": False, "reason": safety, "runtime_factor": 0, "water_budget_mm": 0}
        if not program:
            return {"allowed": False, "reason": "Programm nicht gefunden", "runtime_factor": 0, "water_budget_mm": 0}
        if not manual and not program["enabled"]:
            return {"allowed": False, "reason": "Programm deaktiviert", "runtime_factor": 0, "water_budget_mm": 0}

        # Sperrtag-/Sperrzeit-Check gilt nur für Automatik. Manuell darf jederzeit gestartet werden.
        if not manual:
            now_local = datetime.now(_TZ)
            blocked_days = program.get("blocked_days") or [False] * 7
            if blocked_days[now_local.weekday()]:
                return {"allowed": False, "reason": "Sperrtag", "runtime_factor": 0, "water_budget_mm": 0}
            if _in_blocked_window(now_local, program.get("blocked_window") or {}):
                return {"allowed": False, "reason": "Sperrzeit aktiv", "runtime_factor": 0, "water_budget_mm": 0}

        if not force_weather and program["mode"] == "smart_et":
            self._update_water_balance(program)
            count = self._weekly_run_count(program)
            if count >= program["max_runs_per_week"]:
                return {
                    "allowed": False,
                    "reason": "Wochenlimit erreicht",
                    "runtime_factor": 0,
                    "water_budget_mm": max((float(z.get("deficit_mm", 0)) for z in program["zones"]), default=0),
                    "weekly_runs": count,
                }

        if not force_weather and program["weather_enabled"]:
            w = app_state.irrigation.weather
            t = program["thresholds"]
            # Regen-Credit: gefallener Regen (24h) + 70% der 48h-Vorhersage werden vom Defizit abgezogen
            # 70% weil nicht der ganze Regen im Wurzelraum ankommt (Verdunstung, Abfluss).
            rain_past = float(w.rain_24h_mm or 0)
            rain_forecast_48h = float(w.forecast_rain_48h_mm if w.forecast_rain_48h_mm is not None else (w.forecast_rain_mm or 0))
            rain_imminent = float(w.forecast_rain_24h_mm if w.forecast_rain_24h_mm is not None else 0)
            # Gefallener Regen wirkt im smart_et-Modus ausschliesslich über die
            # Wasserbilanz (_update_water_balance zieht ihn dort bereits ab). Ihn hier
            # nochmal als Credit abzuziehen wäre Doppelzählung und hat die Automatik
            # dauerhaft blockiert. Im fixed-Modus gibt es keine Bilanz → dort zählt er.
            if program["mode"] == "smart_et":
                rain_credit = 0.5 * rain_forecast_48h
            else:
                rain_credit = rain_past + 0.7 * rain_forecast_48h

            if float(w.wind_kmh or 0) > t["wind_max_kmh"]:
                return {"allowed": False, "reason": "Wind zu hoch", "runtime_factor": 0, "water_budget_mm": 0}
            if w.soil_moisture_pct is not None and float(w.soil_moisture_pct) >= t["soil_moisture_skip_pct"]:
                return {"allowed": False, "reason": "Bodenfeuchte ausreichend", "runtime_factor": 0, "water_budget_mm": 0}
            # Skip nur bei akutem Regen heute (24h) — übermorgen-Regen darf nicht trockene Pflanzen bestrafen
            if rain_imminent >= t["skip_rain_mm"]:
                return {"allowed": False, "reason": "Regen kommt heute", "runtime_factor": 0, "water_budget_mm": 0}

            et0 = w.et0_mm if w.et0_mm is not None else t["et0_default_mm"]

            if program["mode"] == "smart_et":
                # Pro Zone Defizit nach Regen-Credit prüfen
                # frequency_pref skaliert die Startschwelle: 0=häufig (×0.7), 1=selten (×1.3).
                # Früher 0.4–2.0 — bei "selten" verdoppelte das die Schwelle und schaltete
                # die Automatik faktisch ab (16.8mm bei ~4mm/Tag Aufbau).
                due = []
                for z in program["zones"]:
                    if not z["enabled"]:
                        continue
                    eff_deficit = float(z.get("deficit_mm", 0)) - rain_credit
                    slider = _clamp(float(z.get("frequency_pref", 0.5)), 0.0, 1.0)
                    eff_min_deficit = float(z.get("min_deficit_mm", 0)) * (FREQ_SLIDER_MIN + FREQ_SLIDER_SPAN * slider)
                    if eff_deficit >= eff_min_deficit:
                        due.append(z)
                budget = max((float(z.get("deficit_mm", 0)) - rain_credit for z in due), default=0.0)
                if not due:
                    return {"allowed": False, "reason": "Regen kompensiert Defizit",
                            "runtime_factor": 0, "water_budget_mm": max(budget, 0.0)}
                runtimes = {}
                max_factor = 0.0
                for z in due:
                    r = self._smart_zone_runtime(z, rain_credit_mm=rain_credit)
                    runtimes[z["id"]] = r
                    max_factor = max(max_factor, r["factor"])
                return {
                    "allowed": True,
                    "reason": "Smart ET Freigabe",
                    "runtime_factor": max_factor or 1.0,
                    "water_budget_mm": max(budget, 0.0),
                    "zone_ids": [z["id"] for z in due],
                    "zone_runtimes": runtimes,
                    "weekly_runs": self._weekly_run_count(program),
                }

            # Fixed-Mode: ET0 minus Regen-Credit als Bedarf
            budget = max(0.0, et0 - rain_credit)
            factor = (budget / max(t["et0_default_mm"], 0.1)) * program["seasonal_factor"]
            factor = _clamp(factor, program["min_runtime_factor"], program["max_runtime_factor"])
            if budget <= 0.2:
                return {"allowed": False, "reason": "Regen deckt Bedarf",
                        "runtime_factor": 0, "water_budget_mm": budget}
            return {"allowed": True, "reason": "ET Freigabe", "runtime_factor": factor, "water_budget_mm": budget}

        return {
            "allowed": True,
            "reason": "Manuell gestartet" if force_weather else "Wetterpruefung aus",
            "runtime_factor": _clamp(program["seasonal_factor"], program["min_runtime_factor"], program["max_runtime_factor"]),
            "water_budget_mm": 0,
        }

    @staticmethod
    def _next_start_for(program: dict[str, Any], from_dt: datetime | None = None) -> str | None:
        base = from_dt or datetime.now(_TZ)
        blocked_days = program.get("blocked_days") or [False] * 7
        for offset in range(14):
            d = base + timedelta(days=offset)
            d = d.replace(hour=program["start_hour"], minute=program["start_min"],
                          second=0, microsecond=0)
            if not blocked_days[d.weekday()] and d > base:
                return d.isoformat()
        return None

    def recompute_decision(self, program_id: str = "") -> None:
        programs = app_state.irrigation.programs
        if program_id:
            program = next((p for p in programs if p["id"] == program_id), None)
        else:
            enabled = [p for p in programs if p.get("enabled")]
            program = min(
                enabled,
                key=lambda p: self._next_start_for(p) or "9999-12-31T23:59:59",
                default=(programs[0] if programs else None),
            )
        ev = self.evaluate_program(program, manual=False)
        d = app_state.irrigation.decision
        d.allowed = ev["allowed"]
        d.reason = ev["reason"]
        d.program_id = (program or {}).get("id", "")
        d.water_budget_mm = round(ev.get("water_budget_mm", 0) * 10) / 10
        d.runtime_factor = round(ev.get("runtime_factor", 0) * 100) / 100
        d.next_start = self._next_start_for(program) if program else None
        d.running = self._active is not None
        d.active_zone = (self._active.zone or {}).get("id", "") if self._active else ""
        d.active_program = self._active.program["id"] if self._active else ""
        d.active_zone_name = (self._active.zone or {}).get("name", "") if self._active else ""
        d.active_program_name = self._active.program["name"] if self._active else ""
        d.active_preset = (self._active.zone or {}).get("preset", "") if self._active else ""
        d.phase = (
            "paused" if self._active and self._active.paused
            else "soak" if self._active and self._active.soaking
            else "run" if self._active else "idle"
        )
        d.started_by = self._active.started_by if self._active else ""
        now = datetime.now(_TZ).timestamp()
        d.remaining_s = self._active.remaining_s(now) if self._active else 0
        if self._active:
            started_ts = float(self._active.started_at or now)
            paused_ts = float(self._active.paused_since or 0)
            elapsed_s = (paused_ts - started_ts) if (self._active.paused and paused_ts > started_ts) else (now - started_ts)
            d.started_at = datetime.fromtimestamp(started_ts, tz=_TZ).isoformat()
            d.total_planned_s = max(d.remaining_s, round(max(0.0, elapsed_s)) + d.remaining_s)
        else:
            d.started_at = None
            d.total_planned_s = 0
        if self._active and self._active.paused:
            d.zone_remaining_s = max(0, round(self._active.paused_remaining_s))
            d.ends_at = None
            d.paused = True
            d.paused_since = datetime.fromtimestamp(self._active.paused_since, tz=_TZ).isoformat() if self._active.paused_since else None
        else:
            d.zone_remaining_s = max(0, round((self._active.zone_ends_at or now) - now)) if self._active else 0
            d.ends_at = datetime.fromtimestamp(self._active.zone_ends_at, tz=_TZ).isoformat() if self._active and self._active.zone_ends_at else None
            d.paused = False
            d.paused_since = None

    def publish_decision(self) -> None:
        d = app_state.irrigation.decision
        import json
        self._publish(f"{BASE}/irrigation/decision/state", json.dumps(d.model_dump()), True)
        self._publish(f"{BASE}/irrigation/active_program", d.active_program or "", True)
        self._publish(f"{BASE}/irrigation/active_zone", d.active_zone or "", True)
        self._publish(f"{BASE}/irrigation/skip_reason", d.reason or "", True)
        self._publish(f"{BASE}/irrigation/water_budget_mm", str(d.water_budget_mm), True)
        self._publish(f"{BASE}/irrigation/runtime_factor", str(d.runtime_factor), True)
        self._publish(f"{BASE}/irrigation/running", "ON" if d.running else "OFF", True)
        self._publish(f"{BASE}/irrigation/next_start", d.next_start or "", True)

    def _publish_zone_command(self, zone: dict[str, Any], action: str,
                               program: dict[str, Any], runtime_s: float) -> None:
        import json
        payload = {
            "action": action,
            "zone": zone["id"],
            "program": program["id"],
            "preset": zone.get("preset") or "Normal",
            "duration_s": max(0, round(runtime_s or 0)),
            "at": _now_iso(),
        }
        # ESPHome lauscht direkt auf valve/<zone>/set — schaltet das Magnetventil
        valve_state = "ON" if action == "start" else "OFF"
        self._publish(f"{BASE}/valve/{zone['id']}/set", valve_state, False)

    # ── Lauf-Steuerung ────────────────────────────────────────
    def _start_zone(self) -> None:
        if not self._active:
            return
        if self._active.zone_index >= len(self._active.zones):
            self._finish_run("completed")
            return
        zone = self._active.zones[self._active.zone_index]
        self._active.zone = zone
        smart = (self._active.zone_runtimes or {}).get(zone["id"])
        runtime_s = (smart["runtime_s"] if smart
                     else max(30, round(zone["duration_min"] * 60 * self._active.runtime_factor)))
        self._active.zone_remaining_s = runtime_s
        self._active.soaking = False
        self._start_zone_cycle()

    def _start_zone_cycle(self, count_runtime: bool = True) -> None:
        if not self._active or not self._active.zone:
            return
        zone = self._active.zone
        cycle_s = float(zone.get("cycle_min", 0) or 0) * 60
        runtime_s = self._active.zone_remaining_s
        if cycle_s > 0:
            runtime_s = min(runtime_s, cycle_s)
        runtime_s = max(30, round(runtime_s))
        now = datetime.now(_TZ).timestamp()
        self._active.zone_started_at = now
        self._active.zone_ends_at = now + runtime_s
        self._active.flow_last_sample_ts = now
        if count_runtime:
            self._active.total_runtime_s += runtime_s
        self._active.zone_remaining_s = max(0, self._active.zone_remaining_s - runtime_s)

        if zone.get("preset"):
            self._presets_apply(zone["preset"])
        self._publish_zone_command(zone, "start", self._active.program, runtime_s)

        app_state.irrigation.zones[zone["id"]] = {
            **app_state.irrigation.zones.get(zone["id"], {}),
            "command": "start",
            "state": "STARTING",
            "program": self._active.program["id"],
            "ends_at": datetime.fromtimestamp(self._active.zone_ends_at, tz=_TZ).isoformat(),
            "updated_at": _now_iso(),
        }
        suffix = f", Rest {round(self._active.zone_remaining_s / 60)} min" if self._active.zone_remaining_s > 0 else ""
        web_log(f"[IRR] Zone {zone['name']} gestartet ({round(runtime_s / 60)} min{suffix})")
        self.recompute_decision(self._active.program["id"])
        self.publish_decision()

    def _sample_flow(self, now_ts: float) -> None:
        """Integriert app_state.flow_rate (L/min) über die Zeit für die aktive Zone."""
        if not self._active or not self._active.zone or self._active.soaking:
            return
        last = self._active.flow_last_sample_ts or now_ts
        delta_s = max(0.0, now_ts - last)
        self._active.flow_last_sample_ts = now_ts
        if delta_s <= 0:
            return
        flow_lpm = float(getattr(app_state, "flow_rate", 0) or 0)
        if flow_lpm <= 0:
            return
        liters = flow_lpm * (delta_s / 60.0)
        zid = self._active.zone["id"]
        prev = float(self._active.flow_liters_by_zone.get(zid, 0.0))
        self._active.flow_liters_by_zone[zid] = prev + liters

    def _finish_zone(self) -> None:
        # Letzten Flow-Sample integrieren bevor wir die Zone abschließen
        self._sample_flow(datetime.now(_TZ).timestamp())
        if not self._active or not self._active.zone:
            return
        self._publish_zone_command(self._active.zone, "stop", self._active.program, 0)
        zid = self._active.zone["id"]
        soak_s = float(self._active.zone.get("soak_min", 0) or 0) * 60
        if self._active.zone_remaining_s > 0 and soak_s > 0:
            self._v20_stop()
            now = datetime.now(_TZ).timestamp()
            self._active.zone_ends_at = now + soak_s
            self._active.soaking = True
            app_state.irrigation.zones[zid] = {
                **app_state.irrigation.zones.get(zid, {}),
                "command": "stop",
                "state": "SOAKING",
                "ends_at": datetime.fromtimestamp(self._active.zone_ends_at, tz=_TZ).isoformat(),
                "updated_at": _now_iso(),
            }
            web_log(f"[IRR] Zone {self._active.zone['name']} Sickerpause ({round(soak_s / 60)} min)")
            self.recompute_decision(self._active.program["id"])
            self.publish_decision()
            return
        app_state.irrigation.zones[zid] = {
            **app_state.irrigation.zones.get(zid, {}),
            "command": "stop",
            "state": "STOPPING",
            "ends_at": None,
            "updated_at": _now_iso(),
        }
        self._active.zone_index += 1
        self._active.zone = None
        self._start_zone()

    def _finish_soak(self) -> None:
        if not self._active or not self._active.zone:
            return
        self._active.soaking = False
        self._start_zone_cycle()

    def pause_active(self, reason: str = "Pumpe gestoppt") -> dict[str, Any]:
        if not self._active:
            self._v20_stop()
            return {"ok": True, "paused": False}
        if self._active.paused:
            self._v20_stop()
            return {"ok": True, "paused": True}
        now = datetime.now(_TZ).timestamp()
        if self._active.zone:
            remaining = max(0, (self._active.zone_ends_at or now) - now)
            self._publish_zone_command(self._active.zone, "stop", self._active.program, 0)
            app_state.irrigation.zones[self._active.zone["id"]] = {
                **app_state.irrigation.zones.get(self._active.zone["id"], {}),
                "command": "stop",
                "state": "PAUSED",
                "ends_at": None,
                "updated_at": _now_iso(),
            }
        else:
            remaining = 0
        self._v20_stop()
        self._active.paused = True
        self._active.paused_since = now
        self._active.paused_date = _local_date_key()
        self._active.paused_phase = "soak" if self._active.soaking else "run"
        self._active.paused_remaining_s = max(0, round(remaining))
        self._active.zone_ends_at = 0
        web_log(f"[IRR] Programm {self._active.program['name']} pausiert ({reason})")
        self.recompute_decision(self._active.program["id"])
        self.publish_decision()
        return {"ok": True, "paused": True}

    def resume_active(self) -> dict[str, Any]:
        if not self._active or not self._active.paused:
            return {"ok": False, "error": "Keine pausierte Bewaesserung"}
        if self._active.paused_date and self._active.paused_date != _local_date_key():
            self._finish_run("stopped", "Pause abgelaufen")
            return {"ok": False, "error": "Pause ist nicht mehr vom selben Tag"}
        if not self._active.zone:
            return {"ok": False, "error": "Keine pausierte Zone"}
        self._active.paused = False
        self._active.paused_since = 0
        self._active.paused_date = ""
        remaining = max(30, round(self._active.paused_remaining_s or 0))
        self._active.paused_remaining_s = 0
        if self._active.paused_phase == "soak":
            now = datetime.now(_TZ).timestamp()
            self._active.soaking = True
            self._active.zone_ends_at = now + remaining
            web_log(f"[IRR] Sickerpause fortgesetzt ({round(remaining / 60)} min)")
        else:
            self._active.soaking = False
            self._active.zone_remaining_s = remaining
            self._start_zone_cycle(count_runtime=False)
            web_log(f"[IRR] Zone {self._active.zone['name']} fortgesetzt ({round(remaining / 60)} min)")
        self.recompute_decision(self._active.program["id"])
        self.publish_decision()
        return {"ok": True, "resumed": True}

    def _finish_run(self, result: str, reason: str = "") -> None:
        if not self._active:
            return
        # Letzten Flow-Sample integrieren (sofern aktive Zone)
        self._sample_flow(datetime.now(_TZ).timestamp())
        if self._active.zone:
            self._publish_zone_command(self._active.zone, "stop", self._active.program, 0)
        self._v20_stop()
        program = self._active.program
        restore_preset = self._active.restore_preset or "Normal"
        # Defizit reduzieren — auch bei manuellen Läufen und im fixed-Mode.
        # Bei vorzeitigem Stop nur die tatsächlich vergangene Zeit mitrechnen.
        if result in ("completed", "stopped"):
            now_ts = datetime.now(_TZ).timestamp()
            for zi, zone in enumerate(self._active.zones):
                smart = (self._active.zone_runtimes or {}).get(zone["id"])
                planned_s = float(smart["runtime_s"]) if smart else float(zone.get("duration_min", 0) or 0) * 60
                planned_mm = float(smart["applied_mm"]) if smart else float(zone.get("water_mm", 0) or 0) * (self._active.runtime_factor or 1)
                # Wieviel von dieser Zone ist tatsächlich gelaufen?
                if zi < self._active.zone_index:
                    fraction = 1.0  # vollständig durch
                elif zi == self._active.zone_index and self._active.zone_started_at and not self._active.soaking:
                    elapsed = max(0.0, now_ts - self._active.zone_started_at)
                    fraction = min(1.0, elapsed / max(planned_s, 1))
                else:
                    fraction = 0.0
                if fraction <= 0 or planned_mm <= 0:
                    continue
                theoretical = planned_mm * fraction
                # Wenn Durchflussmesser & Zonenfläche vorhanden: gemessene mm berechnen
                area_m2 = _zone_area_m2(zone)
                liters = float(self._active.flow_liters_by_zone.get(zone["id"], 0.0))
                applied = theoretical
                if area_m2 > 0 and liters > 0:
                    measured_mm = liters / area_m2  # 1 L/m² = 1 mm
                    # Clamp auf 0.5×–2× des theoretischen Werts (Schutz vor Sensor-Anomalien)
                    lo = theoretical * 0.5
                    hi = theoretical * 2.0
                    applied = max(lo, min(hi, measured_mm))
                    if abs(measured_mm - applied) > 0.5:
                        web_log(f"[IRR] Zone {zone['name']}: Sensor {measured_mm:.1f}mm geclamped auf {applied:.1f}mm (theor. {theoretical:.1f}mm)")
                    else:
                        web_log(f"[IRR] Zone {zone['name']}: gemessen {liters:.1f}L / {area_m2:.1f}m² = {applied:.1f}mm")
                zone["deficit_mm"] = _clamp(float(zone.get("deficit_mm", 0)) - applied, 0, 200)
        program["last_run_at"] = _now_iso()
        program["last_skip_reason"] = "" if result == "completed" else reason
        self._add_history({
            "type": "run",
            "result": result,
            "reason": reason,
            "program_id": program["id"],
            "program_name": program["name"],
            "runtime_factor": self._active.runtime_factor,
            "runtime_s": self._active.total_runtime_s,
            "water_budget_mm": round((self._active.water_budget_mm or 0) * 10) / 10,
            # auto | manual | nachsaat — landet im payload-JSON der History
            "started_by": self._active.started_by or "auto",
        })
        web_log(f"[IRR] Programm {program['name']} beendet: {result}{f' ({reason})' if reason else ''}")
        self._active = None
        if restore_preset:
            if self._presets_apply(restore_preset):
                web_log(f"[IRR] Rueckfall-Preset aktiviert: {restore_preset}")
            else:
                web_log(f"[IRR] Rueckfall-Preset nicht gefunden: {restore_preset}")
        self._save_programs()
        self.recompute_decision(program["id"])
        self.publish_decision()

    def run_program(
        self,
        program_id: str,
        manual: bool = False,
        force_weather: bool = False,
        duration_min: float | None = None,
        zone_ids: list[str] | None = None,
        started_by: str | None = None,
    ) -> dict[str, Any]:
        program = next((p for p in app_state.irrigation.programs if p["id"] == program_id), None)
        ev = self.evaluate_program(program, manual=manual, force_weather=force_weather)
        if not ev["allowed"]:
            if program:
                program["last_skip_reason"] = ev["reason"]
                self._save_programs()
            self._add_history({
                "type": "skip",
                "program_id": program_id,
                "program_name": (program or {}).get("name", program_id),
                "reason": ev["reason"],
                "water_budget_mm": ev.get("water_budget_mm", 0),
                "started_by": started_by or ("manual" if manual else "auto"),
            })
            self.recompute_decision(program_id)
            self.publish_decision()
            return {"ok": False, "error": ev["reason"], "decision": ev}

        # Wenn ein Lauf aktiv ist: nicht automatisch unterbrechen.
        # Manuelle Starts während aktiver Automatik werden abgewiesen — User soll bewusst stoppen.
        if self._active:
            active_by = self._active.started_by or "auto"
            if manual and active_by == "auto":
                return {"ok": False, "error": "Automatik läuft — bitte zuerst stoppen", "decision": ev}
            if not manual:
                # Automatischer Start während aktivem Lauf: nicht stören
                return {"ok": False, "error": "Programm läuft bereits", "decision": ev}
            # manuell + manuell: alten Lauf beenden für neuen
            self._finish_run("interrupted", "Neues Programm gestartet")

        allowed_ids = set(ev.get("zone_ids") or []) if ev.get("zone_ids") else None
        if zone_ids:
            requested = set(zone_ids)
            allowed_ids = requested if allowed_ids is None else allowed_ids & requested
        zones = [z for z in program["zones"]
                 if z["enabled"] and (allowed_ids is None or z["id"] in allowed_ids)]
        if not zones:
            return {"ok": False, "error": "Keine aktive Zone"}

        zone_runtimes = ev.get("zone_runtimes")
        if manual and duration_min is not None:
            duration_s = max(30, min(8 * 3600, round(float(duration_min) * 60)))
            zone_runtimes = {}
            for z in zones:
                # applied_mm aus der pro-Zone Niederschlagsrate berechnen, damit Defizit korrekt sinkt
                rate = float(z.get("precipitation_mm_per_h", 0) or 0)
                if rate <= 0:
                    # Fallback: aus water_mm/duration_min ableiten
                    base_water = float(z.get("water_mm", 0) or 0)
                    base_min = float(z.get("duration_min", 0) or 0)
                    rate = base_water / max(base_min / 60.0, 0.01) if base_min > 0 else 0.0
                applied_mm = round((duration_s / 3600.0) * rate, 2)
                zone_runtimes[z["id"]] = {"runtime_s": duration_s, "applied_mm": applied_mm, "factor": 1.0}

        self._active = _ActiveRun(
            program=program,
            zones=zones,
            zone_runtimes=zone_runtimes,
            runtime_factor=ev.get("runtime_factor", 1),
            water_budget_mm=ev.get("water_budget_mm", 0),
            started_at=datetime.now(_TZ).timestamp(),
            started_by=started_by or ("manual" if manual else "auto"),
            restore_preset="Normal",
        )
        web_log(f"[IRR] Programm {program['name']} gestartet ({ev['reason']})")
        self._start_zone()
        return {"ok": True, "decision": ev}

    def stop_program(self, program_id: str = "", reason: str = "Manuell gestoppt") -> dict[str, Any]:
        if not self._active:
            return {"ok": True}
        if program_id and self._active.program["id"] != program_id:
            return {"ok": False, "error": "Anderes Programm aktiv"}
        self._finish_run("stopped", reason)
        return {"ok": True}

    # ── MQTT-Eingang ─────────────────────────────────────────
    def handle_mqtt(self, topic: str, value: str) -> bool:
        if topic == f"{BASE}/irrigation/weather/input":
            self.ingest_weather(value)
            return True

        m = re.match(rf"^{re.escape(BASE)}/irrigation/program/([^/]+)/start$", topic)
        if m:
            force_weather = True
            try:
                import json
                obj = json.loads(value)
                if isinstance(obj, dict):
                    force_weather = obj.get("force") is not False
            except (ValueError, TypeError):
                pass
            self.run_program(m.group(1), manual=True, force_weather=force_weather)
            return True

        m = re.match(rf"^{re.escape(BASE)}/irrigation/program/([^/]+)/stop$", topic)
        if m:
            self.stop_program(m.group(1), "MQTT Stop")
            return True

        m = re.match(rf"^{re.escape(BASE)}/irrigation/zone/([^/]+)/state$", topic)
        if m:
            zid = m.group(1)
            payload: dict[str, Any] = {"state": str(value)}
            try:
                import json
                parsed = json.loads(value)
                if isinstance(parsed, dict):
                    payload = parsed
            except (ValueError, TypeError):
                pass
            app_state.irrigation.zones[zid] = {
                **app_state.irrigation.zones.get(zid, {}),
                **payload,
                "updated_at": _now_iso(),
            }
            return True

        return False

    # ── Periodischer Tick (alle 30 s) ────────────────────────
    def tick(self) -> None:
        now = datetime.now(_TZ).timestamp()
        if now - self._last_tick < TICK_S:
            return
        self._last_tick = now

        if self._active:
            if self._active.paused:
                if self._active.paused_date and self._active.paused_date != _local_date_key():
                    self._finish_run("stopped", "Pause abgelaufen")
                    return
                self.recompute_decision(self._active.program["id"])
                self.publish_decision()
                return
            safety = self._safety_block_reason()
            if safety:
                self._finish_run("stopped", safety)
                return
            # Durchfluss-Integration: nur wenn wir aktiv eine Zone bewässern (nicht in Sickerpause)
            self._sample_flow(now)
            if self._active.soaking and now >= self._active.zone_ends_at:
                self._finish_soak()
                return
            if self._active.zone and now >= self._active.zone_ends_at:
                self._finish_zone()
                return
            self.recompute_decision(self._active.program["id"])
            self.publish_decision()
            return

        if self._tick_overseeding(now):
            return

        d = datetime.now(_TZ)
        minute_key = f"{d.year}-{d.month}-{d.day} {d.hour}:{d.minute}"
        if minute_key == self._last_schedule_minute:
            self.recompute_decision()
            self.publish_decision()
            return
        self._last_schedule_minute = minute_key

        # Wasserbilanz täglich für ALLE smart_et-Programme fortschreiben — nicht nur
        # fürs nächste (recompute_decision evaluiert nur eins). Guard last_balance_date
        # macht das idempotent (max. 1× pro Tag und Programm).
        for program in app_state.irrigation.programs:
            if program.get("enabled") and program.get("mode") == "smart_et":
                self._update_water_balance(program)

        if app_state.irrigation.sequential.enabled:
            if self._tick_sequential(d):
                return
        else:
            for program in app_state.irrigation.programs:
                if not program["enabled"]:
                    continue
                blocked_days = program.get("blocked_days") or [False] * 7
                if blocked_days[d.weekday()]:
                    continue
                # Catch-up-Fenster statt exakter Minute: löst aus, wenn die heutige
                # Startzeit in den letzten SCHEDULE_CATCHUP_MIN lag — übersteht
                # Backend-Neustarts/verpasste Ticks. last_run_at (heute) verhindert
                # Doppel-Auslösung.
                start_today = d.replace(hour=program["start_hour"], minute=program["start_min"],
                                        second=0, microsecond=0)
                elapsed_min = (d - start_today).total_seconds() / 60.0
                # Pro Tag nur EIN Auto-Versuch (Lauf oder Skip) — sonst würde das
                # Catch-up-Fenster bei jedem Tick erneut auslösen und die History fluten.
                attempted_today = program.get("last_auto_attempt_date") == _local_date_key()
                if 0 <= elapsed_min < SCHEDULE_CATCHUP_MIN and not attempted_today:
                    res = self.run_program(program["id"], manual=False, force_weather=False)
                    # Tagesversuch nur verbrauchen, wenn die Entscheidung endgültig war.
                    if res["ok"] or res.get("error") not in TRANSIENT_BLOCKERS:
                        program["last_auto_attempt_date"] = _local_date_key()
                        self._save_programs()
                    if not res["ok"]:
                        web_log(f"[IRR] Programm {program['name']} uebersprungen: {res['error']}")
                    return
        self.recompute_decision()
        self.publish_decision()

    def _sequential_chain(self, weekday: int) -> list[dict[str, Any]]:
        """Alle heute faelligen Programme, sortiert nach ihrer (bisherigen) Startzeit."""
        due = []
        for program in app_state.irrigation.programs:
            if not program["enabled"]:
                continue
            blocked_days = program.get("blocked_days") or [False] * 7
            if blocked_days[weekday]:
                continue
            due.append(program)
        due.sort(key=lambda p: (p["start_hour"], p["start_min"]))
        return due

    def _tick_sequential(self, d: datetime) -> bool:
        """Sequenzieller Modus: alle faelligen Programme direkt hintereinander ab
        einer gemeinsamen Startzeit statt einzeln zu ihrer eigenen Uhrzeit."""
        s = app_state.irrigation.sequential
        chain = self._sequential_chain(d.weekday())
        if not chain:
            return False

        today = _local_date_key()
        active_id = s.active_program_id if s.active_date == today else ""
        if active_id and active_id not in {p["id"] for p in chain}:
            # Programm wurde deaktiviert/gesperrt seit Kettenstart — Zeiger vergessen.
            active_id = ""

        if active_id:
            # Kette läuft bereits heute: direkt mit dem naechsten Programm fortfahren,
            # sobald das vorige fertig ist (self._active ist hier bereits None).
            idx = next((i for i, p in enumerate(chain) if p["id"] == active_id), -1)
            remaining = chain[idx + 1:]
            if not remaining:
                return False
            next_program = remaining[0]
        else:
            # Kette heute noch nicht gestartet: Catch-up-Fenster ab der gemeinsamen Startzeit.
            # Hing der Start an einem vorübergehenden Blocker (MQTT/V20), ist chain[0]
            # noch unversucht — dann länger nachfassen statt den Tag zu verlieren.
            start_today = d.replace(hour=s.start_hour, minute=s.start_min, second=0, microsecond=0)
            elapsed_min = (d - start_today).total_seconds() / 60.0
            window = (SCHEDULE_CATCHUP_MIN if chain[0].get("last_auto_attempt_date") == today
                      else TRANSIENT_RETRY_MIN)
            if not (0 <= elapsed_min < window):
                return False
            next_program = chain[0]

        attempted_today = next_program.get("last_auto_attempt_date") == today
        if attempted_today:
            # Bereits versucht (Lauf oder Skip) — Kette zum naechsten weiterreichen.
            s.active_program_id = next_program["id"]
            s.active_date = today
            self._save_sequential()
            return self._tick_sequential(d)

        res = self.run_program(next_program["id"], manual=False, force_weather=False)
        if not res["ok"] and res.get("error") in TRANSIENT_BLOCKERS:
            # Vorübergehender Blocker: Kette nicht weiterschalten, beim nächsten
            # Tick erneut versuchen (Fenster bleibt über active_program_id offen).
            web_log(f"[IRR] Programm {next_program['name']} verzoegert: {res['error']}")
            return True
        next_program["last_auto_attempt_date"] = today
        self._save_programs()
        s.active_program_id = next_program["id"]
        s.active_date = today
        self._save_sequential()
        if not res["ok"]:
            web_log(f"[IRR] Programm {next_program['name']} uebersprungen: {res['error']}")
        return True

    def _tick_overseeding(self, now_ts: float) -> bool:
        o = app_state.irrigation.overseeding
        if not o.enabled:
            return False
        now = datetime.now(_TZ)
        try:
            ends_ts = datetime.fromisoformat(str(o.ends_at).replace("Z", "+00:00")).timestamp() if o.ends_at else 0
        except ValueError:
            ends_ts = 0
        if ends_ts and now_ts >= ends_ts:
            o.enabled = False
            o.last_message = "Nachsaat beendet"
            self._save_overseeding()
            self.publish_decision()
            return False
        try:
            next_ts = datetime.fromisoformat(str(o.next_run_at).replace("Z", "+00:00")).timestamp() if o.next_run_at else 0
        except ValueError:
            next_ts = 0
        if next_ts and now_ts < next_ts:
            return False

        res = self.run_program(
            o.program_id,
            manual=True,
            force_weather=True,
            duration_min=o.duration_min,
            zone_ids=o.zone_ids,
            started_by="nachsaat",
        )
        o.last_run_at = now.isoformat() if res["ok"] else o.last_run_at
        o.next_run_at = (now + timedelta(minutes=o.interval_min)).isoformat()
        o.last_message = "Nachsaat-Zyklus gestartet" if res["ok"] else f"Nachsaat blockiert: {res.get('error', 'unbekannt')}"
        self._save_overseeding()
        self.publish_decision()
        return bool(res["ok"])
