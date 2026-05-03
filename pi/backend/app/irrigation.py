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
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from .config import settings
from .persistence import (
    IRRIGATION_HISTORY_FILE,
    IRRIGATION_PROGRAMS_FILE,
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
BASE = settings.mqtt_topic_prefix

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
        "id": "zone_1",
        "name": "Zone 1",
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


def _normalize_days(days: Any) -> list[bool]:
    if not isinstance(days, list) or len(days) != 7:
        return [True] * 7
    return [bool(d) for d in days]


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
        "days": _normalize_days(input_.get("days")),
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
        "zones": [
            {
                "id": _normalize_id(z.get("id") or z.get("name"), f"zone_{zi + 1}"),
                "name": str(z.get("name") or z.get("id") or f"Zone {zi + 1}"),
                "enabled": z.get("enabled") is not False,
                "duration_min": _clamp(z.get("duration_min", z.get("duration", 10)), 1, 240),
                "water_mm": _clamp(z.get("water_mm", 6), 0.1, 50),
                "min_deficit_mm": _clamp(z.get("min_deficit_mm", 8), 0.1, 80),
                "target_mm": _clamp(z.get("target_mm", 12), 0.1, 100),
                "cycle_min": _clamp(z.get("cycle_min", 0), 0, 240),
                "soak_min": _clamp(z.get("soak_min", 0), 0, 240),
                "deficit_mm": _clamp(z.get("deficit_mm", 0), 0, 200),
                "preset": str(z.get("preset") or "Normal"),
                "plant_type": str(z.get("plant_type") or ""),
            }
            for zi, z in enumerate(zones_in)
        ],
        "last_balance_date": input_.get("last_balance_date"),
        "last_run_at": input_.get("last_run_at"),
        "last_skip_reason": input_.get("last_skip_reason") or "",
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

    def remaining_s(self, now: float) -> int:
        current = max(0, self.zone_ends_at - now) if self.zone_ends_at else 0
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
        weather = load_json(IRRIGATION_WEATHER_FILE)

        if isinstance(programs, list) and programs:
            app_state.irrigation.programs = [_normalize_program(p, i) for i, p in enumerate(programs)]
        else:
            app_state.irrigation.programs = [_normalize_program(DEFAULT_PROGRAM, 0)]

        if isinstance(weather, dict):
            for k, v in weather.items():
                if hasattr(app_state.irrigation.weather, k):
                    setattr(app_state.irrigation.weather, k, v)

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
            "zones": irr.zones,
            "history": irr.history[-25:],
        }

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
        w = app_state.irrigation.weather
        for target, keys in mapping.items():
            for k in keys:
                if k in data and data[k] not in (None, ""):
                    try:
                        setattr(w, target, float(data[k]))
                    except (TypeError, ValueError):
                        pass
                    break
        w.updated_at = _now_iso()
        self._save_weather()
        self.recompute_decision()
        web_log("[IRR] Wetterdaten via MQTT/API aktualisiert")
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
    def _smart_zone_runtime(zone: dict[str, Any]) -> dict[str, float]:
        desired = min(float(zone.get("deficit_mm", 0)), float(zone.get("target_mm", zone.get("water_mm", 1))))
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
            rain = float(w.forecast_rain_mm or 0) + float(w.rain_24h_mm or 0)
            if float(w.wind_kmh or 0) > t["wind_max_kmh"]:
                return {"allowed": False, "reason": "Wind zu hoch", "runtime_factor": 0, "water_budget_mm": 0}
            if w.soil_moisture_pct is not None and float(w.soil_moisture_pct) >= t["soil_moisture_skip_pct"]:
                return {"allowed": False, "reason": "Bodenfeuchte ausreichend", "runtime_factor": 0, "water_budget_mm": 0}
            if rain >= t["skip_rain_mm"]:
                return {"allowed": False, "reason": "Regenprognose", "runtime_factor": 0, "water_budget_mm": 0}
            et0 = w.et0_mm if w.et0_mm is not None else t["et0_default_mm"]
            budget = (
                max((float(z.get("deficit_mm", 0)) for z in program["zones"]), default=0)
                if program["mode"] == "smart_et" else max(0.0, et0 - rain)
            )

            if program["mode"] == "smart_et":
                due = [z for z in program["zones"]
                       if z["enabled"] and float(z.get("deficit_mm", 0)) >= float(z.get("min_deficit_mm", 0))]
                if not due:
                    return {"allowed": False, "reason": "Defizit zu gering",
                            "runtime_factor": 0, "water_budget_mm": budget}
                runtimes = {}
                max_factor = 0.0
                for z in due:
                    r = self._smart_zone_runtime(z)
                    runtimes[z["id"]] = r
                    max_factor = max(max_factor, r["factor"])
                return {
                    "allowed": True,
                    "reason": "Smart ET Freigabe",
                    "runtime_factor": max_factor or 1.0,
                    "water_budget_mm": budget,
                    "zone_ids": [z["id"] for z in due],
                    "zone_runtimes": runtimes,
                    "weekly_runs": self._weekly_run_count(program),
                }

            factor = (budget / max(t["et0_default_mm"], 0.1)) * program["seasonal_factor"]
            if rain >= t["reduce_rain_mm"]:
                factor *= 0.6
            factor = _clamp(factor, program["min_runtime_factor"], program["max_runtime_factor"])
            if budget <= 0.2:
                return {"allowed": False, "reason": "Budget ausreichend",
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
        for offset in range(14):
            d = base + timedelta(days=offset)
            d = d.replace(hour=program["start_hour"], minute=program["start_min"],
                          second=0, microsecond=0)
            if program["days"][d.weekday()] and d > base:
                return d.isoformat()
        return None

    def recompute_decision(self, program_id: str = "") -> None:
        programs = app_state.irrigation.programs
        if program_id:
            program = next((p for p in programs if p["id"] == program_id), None)
        else:
            program = next((p for p in programs if p["enabled"]), programs[0] if programs else None)
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
        d.phase = "soak" if self._active and self._active.soaking else ("run" if self._active else "idle")
        d.started_by = self._active.started_by if self._active else ""
        now = datetime.now(_TZ).timestamp()
        d.remaining_s = self._active.remaining_s(now) if self._active else 0
        d.zone_remaining_s = max(0, round((self._active.zone_ends_at or now) - now)) if self._active else 0
        d.ends_at = datetime.fromtimestamp(self._active.zone_ends_at, tz=_TZ).isoformat() if self._active and self._active.zone_ends_at else None

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
        self._publish(f"{BASE}/irrigation/zone/{zone['id']}/command", json.dumps(payload), False)

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

    def _start_zone_cycle(self) -> None:
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

    def _finish_zone(self) -> None:
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

    def _finish_run(self, result: str, reason: str = "") -> None:
        if not self._active:
            return
        if self._active.zone:
            self._publish_zone_command(self._active.zone, "stop", self._active.program, 0)
        self._v20_stop()
        program = self._active.program
        restore_preset = self._active.restore_preset or "Normal"
        if result == "completed" and program["mode"] == "smart_et":
            for zone in self._active.zones:
                smart = (self._active.zone_runtimes or {}).get(zone["id"])
                applied = (smart["applied_mm"] if smart
                           else float(zone.get("water_mm", 0)) * (self._active.runtime_factor or 1))
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
            })
            self.recompute_decision(program_id)
            self.publish_decision()
            return {"ok": False, "error": ev["reason"], "decision": ev}

        if self._active:
            self._finish_run("interrupted", "Neues Programm gestartet")

        allowed_ids = set(ev.get("zone_ids") or []) if ev.get("zone_ids") else None
        zones = [z for z in program["zones"]
                 if z["enabled"] and (allowed_ids is None or z["id"] in allowed_ids)]
        if not zones:
            return {"ok": False, "error": "Keine aktive Zone"}

        zone_runtimes = ev.get("zone_runtimes")
        if manual and duration_min is not None:
            duration_s = max(30, min(8 * 3600, round(float(duration_min) * 60)))
            zone_runtimes = {z["id"]: {"runtime_s": duration_s, "applied_mm": 0.0, "factor": 1.0} for z in zones}

        self._active = _ActiveRun(
            program=program,
            zones=zones,
            zone_runtimes=zone_runtimes,
            runtime_factor=ev.get("runtime_factor", 1),
            water_budget_mm=ev.get("water_budget_mm", 0),
            started_at=datetime.now(_TZ).timestamp(),
            started_by="manual" if manual else "auto",
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
            safety = self._safety_block_reason()
            if safety:
                self._finish_run("stopped", safety)
                return
            if self._active.soaking and now >= self._active.zone_ends_at:
                self._finish_soak()
                return
            if self._active.zone and now >= self._active.zone_ends_at:
                self._finish_zone()
                return
            self.recompute_decision(self._active.program["id"])
            self.publish_decision()
            return

        d = datetime.now(_TZ)
        minute_key = f"{d.year}-{d.month}-{d.day} {d.hour}:{d.minute}"
        if minute_key == self._last_schedule_minute:
            self.recompute_decision()
            self.publish_decision()
            return
        self._last_schedule_minute = minute_key

        for program in app_state.irrigation.programs:
            if not program["enabled"] or not program["days"][d.weekday()]:
                continue
            if program["start_hour"] == d.hour and program["start_min"] == d.minute:
                res = self.run_program(program["id"], manual=False, force_weather=False)
                if not res["ok"]:
                    web_log(f"[IRR] Programm {program['name']} uebersprungen: {res['error']}")
                return
        self.recompute_decision()
        self.publish_decision()
