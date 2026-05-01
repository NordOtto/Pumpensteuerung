"""Wochenschaltuhr — 1:1 Port von docker/backend/timeguard.js.

Nutzt zoneinfo (Europe/Berlin) statt System-TZ — robuster gegen Container-Konfig.
"""
from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from .config import settings
from .persistence import TIMEGUARD_FILE, load_json, save_json
from .state import app_state, web_log

_TZ = ZoneInfo(settings.tz)


def load() -> None:
    cfg = load_json(TIMEGUARD_FILE)
    if cfg is None:
        print(f"[TG] Keine Konfiguration in {TIMEGUARD_FILE} – Standardwerte", flush=True)
        return
    tg = app_state.timeguard
    for key in ("enabled", "start_hour", "start_min", "end_hour", "end_min"):
        if key in cfg:
            setattr(tg, key, cfg[key])
    if isinstance(cfg.get("days"), list) and len(cfg["days"]) == 7:
        tg.days = [bool(d) for d in cfg["days"]]


def save() -> None:
    tg = app_state.timeguard
    save_json(TIMEGUARD_FILE, {
        "enabled": tg.enabled,
        "start_hour": tg.start_hour,
        "start_min": tg.start_min,
        "end_hour": tg.end_hour,
        "end_min": tg.end_min,
        "days": tg.days,
    })


def set_config(cfg: dict) -> None:
    tg = app_state.timeguard
    if "enabled" in cfg:
        tg.enabled = bool(cfg["enabled"])
    for key in ("start_hour", "start_min", "end_hour", "end_min"):
        if key in cfg:
            setattr(tg, key, int(cfg[key]))
    if isinstance(cfg.get("days"), list) and len(cfg["days"]) == 7:
        tg.days = [bool(d) for d in cfg["days"]]
    save()


def is_allowed() -> bool:
    tg = app_state.timeguard
    if not tg.enabled:
        return True
    now = datetime.now(_TZ)
    # weekday(): 0=Mo, 6=So — passt direkt zum days-Array (Mo-So)
    if not tg.days[now.weekday()]:
        return False
    now_min = now.hour * 60 + now.minute
    start_min = tg.start_hour * 60 + tg.start_min
    end_min = tg.end_hour * 60 + tg.end_min
    if start_min <= end_min:
        return start_min <= now_min < end_min
    # Über Mitternacht
    return now_min >= start_min or now_min < end_min


def tick(stop_v20_callback) -> None:
    """Zyklus 10 s. Wenn Fenster gerade endet & Pumpe läuft → stop_v20_callback()."""
    tg = app_state.timeguard
    now = datetime.now(_TZ)
    tg.time = f"{now:%H:%M}"
    tg.synced = True
    allowed = is_allowed()
    if tg.allowed and not allowed and app_state.v20.running:
        web_log("[TIME] Zeitsperre aktiv – V20 wird gestoppt")
        stop_v20_callback()
    tg.allowed = allowed
