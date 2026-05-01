"""REST-Endpunkte — bewahrt das Schema des alten restApi.js.

Frontend bleibt damit unverändert kompatibel: gleiche Pfade, gleiche
Payload-Struktur. Auth wird in einem späteren Schritt portiert (auth.py),
für Phase 1 läuft alles über interne LAN-Authentifizierung via nginx.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..state import app_state, log_buffer, log_seq
from ..storage import get_pressure_history
from .deps import deps

router = APIRouter(prefix="/api")


# ── /status ───────────────────────────────────────────────────
@router.get("/status")
async def get_status() -> dict:
    return app_state.model_dump() | {
        "log_buffer": list(log_buffer)[-100:],
        "log_seq": log_seq,
    }


# ── /v20 ──────────────────────────────────────────────────────
@router.post("/v20/start")
async def v20_start():
    start_hz = app_state.v20.freq_setpoint or app_state.pi.freq_min
    await deps.rtu.set_frequency(start_hz)
    await deps.rtu.start()
    return {"ok": True}


@router.post("/v20/stop")
async def v20_stop():
    await deps.rtu.stop()
    return {"ok": True}


@router.post("/v20/reset")
async def v20_reset():
    await deps.rtu.fault_reset()
    return {"ok": True}


class FreqBody(BaseModel):
    hz: float


@router.post("/v20/freq")
async def v20_freq(body: FreqBody):
    await deps.rtu.set_frequency(body.hz)
    return {"ok": True, "hz": app_state.v20.freq_setpoint}


# ── /pressure ─────────────────────────────────────────────────
@router.get("/pressure")
async def pressure_get():
    return app_state.pi.model_dump() | {"vacation_enabled": app_state.vacation.enabled}


@router.post("/pressure")
async def pressure_set(body: dict):
    deps.pi_ctrl.set_config(body)
    if "vacation_enabled" in body:
        deps.pi_ctrl.set_vacation(bool(body["vacation_enabled"]))
    return {"ok": True}


@router.post("/pressure/reset_dryrun")
async def pressure_reset_dryrun():
    deps.pi_ctrl.reset_dryrun("api")
    return {"ok": True}


# ── /timeguard ────────────────────────────────────────────────
@router.get("/timeguard")
async def timeguard_get():
    return app_state.timeguard.model_dump()


@router.post("/timeguard")
async def timeguard_set(body: dict):
    from .. import timeguard as tg
    tg.set_config(body)
    return {"ok": True}


# ── /presets ──────────────────────────────────────────────────
@router.get("/presets")
async def presets_list():
    return deps.preset_mgr.list()


@router.post("/presets")
async def presets_add(body: dict):
    if not deps.preset_mgr.add_or_update(body):
        raise HTTPException(status_code=400, detail="Limit erreicht oder ungültiger Name")
    return {"ok": True}


@router.delete("/presets/{name}")
async def presets_delete(name: str):
    if not deps.preset_mgr.delete(name):
        raise HTTPException(status_code=400, detail="Preset aktiv oder nicht gefunden")
    return {"ok": True}


class ApplyBody(BaseModel):
    name: str


@router.post("/preset/apply")
async def preset_apply(body: ApplyBody):
    if not deps.preset_mgr.apply(body.name):
        raise HTTPException(status_code=404, detail="Preset nicht gefunden")
    return {"ok": True, "active": body.name}


# ── /vacation ─────────────────────────────────────────────────
@router.post("/vacation/set")
async def vacation_set(body: dict):
    deps.pi_ctrl.set_vacation(bool(body.get("enabled")))
    return {"ok": True, "enabled": app_state.vacation.enabled}


# ── /irrigation ───────────────────────────────────────────────
@router.get("/irrigation/programs")
async def irrigation_programs_get():
    return deps.irrigation.get_programs()


@router.post("/irrigation/programs")
async def irrigation_programs_set(body: dict | list):
    try:
        return deps.irrigation.set_programs(body)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/irrigation/weather")
async def irrigation_weather_get():
    return deps.irrigation.get_weather()


@router.post("/irrigation/weather")
async def irrigation_weather_set(body: dict):
    deps.irrigation.ingest_weather(body)
    return {"ok": True}


@router.get("/irrigation/history")
async def irrigation_history_get():
    return deps.irrigation.get_history()


@router.get("/irrigation/status")
async def irrigation_status_get():
    return deps.irrigation.get_status()


class RunBody(BaseModel):
    program_id: str
    force_weather: bool = True


@router.post("/irrigation/run")
async def irrigation_run(body: RunBody):
    res = deps.irrigation.run_program(body.program_id, manual=True, force_weather=body.force_weather)
    if not res["ok"]:
        raise HTTPException(status_code=400, detail=res["error"])
    return res


@router.post("/irrigation/stop")
async def irrigation_stop(body: dict | None = None):
    pid = (body or {}).get("program_id", "")
    return deps.irrigation.stop_program(pid, "REST Stop")


# ── /history ──────────────────────────────────────────────────
@router.get("/history/pressure")
async def history_pressure(seconds: int = 3600, max_points: int = 360):
    """Druck/Flow/Hz-Verlauf aus SQLite. Bucket-Aggregation auf max_points."""
    seconds = max(60, min(30 * 24 * 3600, seconds))
    max_points = max(30, min(2000, max_points))
    return {"samples": get_pressure_history(seconds=seconds, max_points=max_points)}


# ── /ota ──────────────────────────────────────────────────────
@router.get("/ota/status")
async def ota_status():
    return app_state.ota.model_dump()


@router.post("/ota/check")
async def ota_check():
    if app_state.ota.running:
        raise HTTPException(status_code=409, detail="OTA bereits aktiv")
    import asyncio
    asyncio.create_task(_run_ota())
    return {"ok": True}


@router.get("/ota/log")
async def ota_log():
    return {
        "lines": app_state.ota.log,
        "running": app_state.ota.running,
        "exit_code": app_state.ota.exit_code,
    }


async def _run_ota() -> None:
    import asyncio
    from datetime import datetime, timezone
    app_state.ota.running = True
    app_state.ota.log = []
    app_state.ota.exit_code = None
    app_state.ota.last_check = datetime.now(timezone.utc).isoformat()
    try:
        proc = await asyncio.create_subprocess_exec(
            "/opt/pumpe/ota/update.sh", "check-and-apply",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        async for line in proc.stdout:
            app_state.ota.log.append(line.decode().rstrip())
        await proc.wait()
        app_state.ota.exit_code = proc.returncode
        app_state.ota.update_available = proc.returncode == 0
    except Exception as exc:
        app_state.ota.log.append(f"Fehler: {exc}")
        app_state.ota.exit_code = -1
    finally:
        app_state.ota.running = False
