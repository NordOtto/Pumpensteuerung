"""JSON-Persistenz für Konfigurationen.

Layout bleibt kompatibel zur bisherigen Docker-Backend-Struktur (`/data/*.json`),
damit existierende Dateien per `scp` 1:1 vom alten Server übernommen werden können.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .config import settings


def _file(name: str) -> Path:
    return settings.data_dir / name


def load_json(name: str) -> dict[str, Any] | None:
    path = _file(name)
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"[persistence] {name} konnte nicht gelesen werden: {exc}", flush=True)
        return None


def save_json(name: str, data: dict[str, Any]) -> None:
    path = _file(name)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(path)


# ── Topic-Bindings: hier zentral, damit beim Migrieren vom alten /data
#    nur die Dateinamen identisch sein müssen ──
PRESSURE_FILE = "pressure_ctrl.json"
TIMEGUARD_FILE = "timeguard.json"
PRESETS_FILE = "presets.json"
IRRIGATION_PROGRAMS_FILE = "irrigation_programs.json"
IRRIGATION_WEATHER_FILE = "irrigation_weather.json"
IRRIGATION_HISTORY_FILE = "irrigation_history.json"
AUTH_FILE = "auth.json"
