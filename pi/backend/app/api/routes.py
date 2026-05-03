"""REST-Endpunkte — bewahrt das Schema des alten restApi.js.

Frontend bleibt damit unverändert kompatibel: gleiche Pfade, gleiche
Payload-Struktur. Auth wird in einem späteren Schritt portiert (auth.py),
für Phase 1 läuft alles über interne LAN-Authentifizierung via nginx.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import APIRouter, Body, HTTPException
from pydantic import BaseModel

from ..state import app_state, log_buffer, log_seq
from ..storage import get_pressure_history
from ..irrigation_wizard import recommend_smart_et
from .deps import deps

router = APIRouter(prefix="/api")
OTA_DIR = Path("/opt/pumpe/ota")
OTA_CONFIG_FILE = OTA_DIR / "config.env"
OTA_TOKEN_FILE = OTA_DIR / ".github_token"


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
async def irrigation_programs_set(body: Any = Body(...)):
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


@router.post("/irrigation/wizard/recommend")
async def irrigation_wizard_recommend(body: dict):
    return recommend_smart_et(body or {})


class RunBody(BaseModel):
    program_id: str
    force_weather: bool = True
    duration_min: float | None = None


@router.post("/irrigation/run")
async def irrigation_run(body: RunBody):
    res = deps.irrigation.run_program(
        body.program_id,
        manual=True,
        force_weather=body.force_weather,
        duration_min=body.duration_min,
    )
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
    _refresh_ota_token_state()
    return app_state.ota.model_dump()


class OtaTokenBody(BaseModel):
    token: str


@router.post("/ota/token")
async def ota_token_set(body: OtaTokenBody):
    token = body.token.strip()
    if len(token) < 20:
        raise HTTPException(status_code=400, detail="Token zu kurz")
    try:
        _store_ota_token(token)
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Token konnte nicht gespeichert werden: {exc}")
    ok, message = await _validate_ota_token()
    app_state.ota.token_configured = True
    app_state.ota.token_ok = ok
    app_state.ota.token_message = message
    if not ok:
        raise HTTPException(status_code=400, detail=message)
    return {"ok": True, "configured": True, "token_ok": True, "message": message}


@router.delete("/ota/token")
async def ota_token_delete():
    try:
        OTA_TOKEN_FILE.unlink(missing_ok=True)
        _ensure_token_config(remove=True)
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Token konnte nicht geloescht werden: {exc}")
    app_state.ota.token_configured = False
    app_state.ota.token_ok = None
    app_state.ota.token_message = "Kein Token hinterlegt"
    return {"ok": True, "configured": False}


@router.post("/ota/check")
async def ota_check():
    if app_state.ota.running:
        raise HTTPException(status_code=409, detail="OTA bereits aktiv")
    import asyncio
    asyncio.create_task(_run_ota("check"))
    return {"ok": True}


@router.post("/ota/install")
async def ota_install(body: dict | None = None):
    if app_state.ota.running:
        raise HTTPException(status_code=409, detail="OTA bereits aktiv")
    import asyncio
    tag = str((body or {}).get("tag") or app_state.ota.latest_version or "")
    asyncio.create_task(_run_ota("install", tag))
    return {"ok": True}


@router.post("/ota/rollback")
async def ota_rollback():
    if app_state.ota.running:
        raise HTTPException(status_code=409, detail="OTA bereits aktiv")
    import asyncio
    asyncio.create_task(_run_ota("rollback"))
    return {"ok": True}


@router.get("/ota/log")
async def ota_log():
    return {
        "lines": app_state.ota.log,
        "running": app_state.ota.running,
        "exit_code": app_state.ota.exit_code,
    }


async def _run_ota(action: str, tag: str = "") -> None:
    import asyncio
    import json
    from datetime import datetime, timezone
    app_state.ota.running = True
    app_state.ota.log = []
    app_state.ota.exit_code = None
    app_state.ota.phase = action
    app_state.ota.last_check = datetime.now(timezone.utc).isoformat()
    try:
        cmd = ["/opt/pumpe/ota/update.sh"]
        if action == "check":
            cmd.append("check")
        elif action == "install":
            cmd.extend(["install", tag])
        elif action == "rollback":
            cmd.append("rollback")
        else:
            cmd.append("status")
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        output_lines: list[str] = []
        async for line in proc.stdout:
            decoded = line.decode().rstrip()
            output_lines.append(decoded)
            app_state.ota.log.append(decoded)
        await proc.wait()
        _apply_ota_json("\n".join(output_lines))
        app_state.ota.exit_code = proc.returncode
        if proc.returncode == 0 and app_state.ota.token_configured:
            app_state.ota.token_ok = True
            app_state.ota.token_message = "Token gueltig, Release-Info konnte geladen werden"
    except Exception as exc:
        app_state.ota.log.append(f"Fehler: {exc}")
        app_state.ota.exit_code = -1
    finally:
        app_state.ota.running = False
        app_state.ota.phase = "idle"
        _refresh_ota_token_state()


def _apply_ota_json(text: str) -> None:
    import json
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end <= start:
        return
    try:
        info = json.loads(text[start:end + 1])
    except json.JSONDecodeError:
        return
    app_state.ota.current_version = info.get("current") or app_state.ota.current_version
    app_state.ota.latest_version = info.get("latest") or app_state.ota.latest_version
    app_state.ota.latest_commit = info.get("commit") or app_state.ota.latest_commit
    app_state.ota.latest_date = info.get("published_at") or app_state.ota.latest_date
    app_state.ota.changelog = info.get("changelog") or app_state.ota.changelog
    app_state.ota.update_available = bool(info.get("update_available"))


def _refresh_ota_token_state() -> None:
    configured = OTA_TOKEN_FILE.exists() and OTA_TOKEN_FILE.stat().st_size > 0
    app_state.ota.token_configured = configured
    if not configured:
        app_state.ota.token_ok = None
        app_state.ota.token_message = "Kein GitHub-Token hinterlegt"


def _store_ota_token(token: str) -> None:
    OTA_DIR.mkdir(parents=True, exist_ok=True)
    OTA_TOKEN_FILE.write_text(token + "\n", encoding="utf-8")
    OTA_TOKEN_FILE.chmod(0o600)
    _ensure_token_config(remove=False)


def _ensure_token_config(remove: bool) -> None:
    lines = []
    if OTA_CONFIG_FILE.exists():
        lines = OTA_CONFIG_FILE.read_text(encoding="utf-8").splitlines()
    next_lines = [line for line in lines if not line.strip().startswith("GITHUB_TOKEN_FILE=")]
    if not remove:
        next_lines.append(f"GITHUB_TOKEN_FILE={OTA_TOKEN_FILE}")
    OTA_CONFIG_FILE.write_text("\n".join(next_lines).rstrip() + "\n", encoding="utf-8")


async def _validate_ota_token() -> tuple[bool, str]:
    import asyncio
    proc = await asyncio.create_subprocess_exec(
        "/opt/pumpe/ota/update.sh",
        "check",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    out, _ = await proc.communicate()
    text = out.decode(errors="replace").strip()
    if proc.returncode == 0:
        return True, "Token gueltig, Release-Info konnte geladen werden"
    tail = text.splitlines()[-1] if text else "Release-Info konnte nicht geladen werden"
    return False, tail
