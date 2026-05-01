"""SQLite-Persistenz für zwei Use-Cases:

1. **Irrigation-History**: ersetzt die bisherige JSON-Datei
   `irrigation_history.json`. JSON wird beim ersten Start migriert.

2. **Pressure-Log**: neuer Time-Series-Speicher für Druck/Durchfluss/Frequenz.
   Backend schreibt alle 5 s einen Sample. Retention: 30 Tage. Frontend
   liest Aggregate über `/api/history/pressure`.

Bewusst ohne ORM gehalten — sqlite3 reicht, hält den Pi-Footprint klein.
"""
from __future__ import annotations

import json
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from .config import settings

_DB_LOCK_TIMEOUT_S = 5.0
PRESSURE_RETENTION_S = 30 * 24 * 3600  # 30 Tage
HISTORY_RETENTION = 5000               # max Einträge in irrigation_history


def _connect() -> sqlite3.Connection:
    Path(settings.db_path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(settings.db_path, timeout=_DB_LOCK_TIMEOUT_S, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    return conn


@contextmanager
def db() -> Iterator[sqlite3.Connection]:
    conn = _connect()
    try:
        yield conn
    finally:
        conn.close()


def init_schema() -> None:
    with db() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS irrigation_history (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            ts          INTEGER NOT NULL,        -- unix ms
            type        TEXT    NOT NULL,        -- run | skip
            result      TEXT,                    -- completed | stopped | interrupted | (skip)
            reason      TEXT,
            program_id  TEXT,
            program_name TEXT,
            runtime_s   INTEGER,
            water_budget_mm REAL,
            payload     TEXT                     -- restliche Felder als JSON
        );
        CREATE INDEX IF NOT EXISTS idx_irr_ts ON irrigation_history(ts DESC);

        CREATE TABLE IF NOT EXISTS pressure_log (
            ts          INTEGER PRIMARY KEY,     -- unix s (Sekunden-Auflösung reicht)
            pressure    REAL,
            flow        REAL,
            frequency   REAL,
            running     INTEGER NOT NULL DEFAULT 0
        );
        """)


# ── Irrigation History ────────────────────────────────────────
def insert_irrigation_event(entry: dict[str, Any]) -> None:
    """`entry` enthält mindestens type, kann program_id, runtime_s, etc.
    Felder, die nicht in eigene Spalten passen, gehen ins payload-JSON."""
    known = {"type", "result", "reason", "program_id", "program_name",
             "runtime_s", "water_budget_mm", "at"}
    extras = {k: v for k, v in entry.items() if k not in known}
    ts_ms = int(time.time() * 1000)
    if "at" in entry:
        try:
            from datetime import datetime
            ts_ms = int(datetime.fromisoformat(str(entry["at"]).replace("Z", "+00:00")).timestamp() * 1000)
        except (TypeError, ValueError):
            pass
    with db() as c:
        c.execute(
            """INSERT INTO irrigation_history
               (ts, type, result, reason, program_id, program_name,
                runtime_s, water_budget_mm, payload)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                ts_ms,
                str(entry.get("type", "")),
                entry.get("result"),
                entry.get("reason"),
                entry.get("program_id"),
                entry.get("program_name"),
                entry.get("runtime_s"),
                entry.get("water_budget_mm"),
                json.dumps(extras) if extras else None,
            ),
        )
        c.execute(
            """DELETE FROM irrigation_history WHERE id IN (
               SELECT id FROM irrigation_history ORDER BY ts DESC LIMIT -1 OFFSET ?
            )""",
            (HISTORY_RETENTION,),
        )


def list_irrigation_events(limit: int = 250) -> list[dict[str, Any]]:
    with db() as c:
        rows = c.execute(
            "SELECT * FROM irrigation_history ORDER BY ts DESC LIMIT ?",
            (limit,),
        ).fetchall()
    out: list[dict[str, Any]] = []
    for r in rows:
        d = dict(r)
        from datetime import datetime, timezone
        d["at"] = datetime.fromtimestamp(d["ts"] / 1000, tz=timezone.utc).isoformat()
        d.pop("id", None)
        d.pop("ts", None)
        if d.get("payload"):
            try:
                d.update(json.loads(d["payload"]))
            except (TypeError, json.JSONDecodeError):
                pass
        d.pop("payload", None)
        out.append(d)
    return out


def migrate_irrigation_json(json_history: list[dict[str, Any]]) -> int:
    """Übernimmt einmalig den JSON-Bestand in die Tabelle.
    Wird nur ausgeführt, wenn die Tabelle leer ist."""
    with db() as c:
        count = c.execute("SELECT COUNT(*) AS n FROM irrigation_history").fetchone()["n"]
    if count > 0 or not json_history:
        return 0
    for entry in json_history:
        insert_irrigation_event(entry)
    return len(json_history)


# ── Pressure Log ──────────────────────────────────────────────
def insert_pressure_sample(pressure: float, flow: float, frequency: float, running: bool) -> None:
    ts = int(time.time())
    with db() as c:
        c.execute(
            """INSERT OR REPLACE INTO pressure_log (ts, pressure, flow, frequency, running)
               VALUES (?, ?, ?, ?, ?)""",
            (ts, pressure, flow, frequency, 1 if running else 0),
        )
        # Retention
        cutoff = ts - PRESSURE_RETENTION_S
        c.execute("DELETE FROM pressure_log WHERE ts < ?", (cutoff,))


def get_pressure_history(seconds: int = 3600, max_points: int = 360) -> list[dict[str, Any]]:
    """Liefert Druckverlauf der letzten `seconds`. Wenn mehr Punkte als
    `max_points` vorhanden, wird per Bucket-Aggregation reduziert (avg)."""
    cutoff = int(time.time()) - seconds
    bucket_s = max(1, seconds // max_points)
    with db() as c:
        rows = c.execute(
            """SELECT (ts / ?) * ? AS bucket,
                      AVG(pressure)  AS pressure,
                      AVG(flow)      AS flow,
                      AVG(frequency) AS frequency,
                      MAX(running)   AS running
               FROM pressure_log
               WHERE ts >= ?
               GROUP BY bucket
               ORDER BY bucket ASC""",
            (bucket_s, bucket_s, cutoff),
        ).fetchall()
    return [
        {
            "ts": int(r["bucket"]),
            "pressure": r["pressure"],
            "flow": r["flow"],
            "frequency": r["frequency"],
            "running": bool(r["running"]),
        }
        for r in rows
    ]
