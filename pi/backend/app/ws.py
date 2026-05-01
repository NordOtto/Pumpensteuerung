"""WebSocket /ws — broadcasted den vollen State 1 Hz an alle Clients.

Frontend hängt sich hier dran und rendert KPIs/Zonen daraus. Identisches
Verhalten wie websocketServer.js im alten Backend.
"""
from __future__ import annotations

import asyncio
import json
from contextlib import suppress

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from .state import app_state, log_buffer, log_seq

router = APIRouter()
_clients: set[WebSocket] = set()
_lock = asyncio.Lock()


@router.websocket("/ws")
async def ws_endpoint(ws: WebSocket) -> None:
    await ws.accept()
    async with _lock:
        _clients.add(ws)
    try:
        while True:
            # Wir senden aktiv aus _broadcast_loop, hier nur Verbindung halten
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        async with _lock:
            _clients.discard(ws)


async def broadcast_loop() -> None:
    """Wird vom main.py als asyncio-Task gestartet (1 Hz)."""
    while True:
        if _clients:
            payload = json.dumps({
                "type": "status",
                "state": app_state.model_dump(),
                "log_buffer": list(log_buffer)[-50:],
                "log_seq": log_seq,
            })
            stale: list[WebSocket] = []
            async with _lock:
                clients = list(_clients)
            for ws in clients:
                try:
                    await ws.send_text(payload)
                except Exception:
                    stale.append(ws)
            if stale:
                async with _lock:
                    for ws in stale:
                        _clients.discard(ws)
                        with suppress(Exception):
                            await ws.close()
        await asyncio.sleep(1.0)
