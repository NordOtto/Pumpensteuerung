"""Modbus-TCP-Server :502 — LOGO 8.4 schreibt hier Sensorwerte hinein.

Pi übernimmt die Rolle, die früher der ESP32 hatte: Server, an den die LOGO
über ihren Modbus-TCP-Block aktiv die Analog-Sensorwerte (Druck, Durchfluss,
Wassertemp) schreibt. Register-Layout 1:1 wie in src/config.h.

Skalierungen entsprechen src/modbus_tcp.cpp:
  Reg 2 (HR:3) Durchfluss:    raw / 100   → L/min  (Sensor 200…1000 raw → 0…85 L/min,
                                                    siehe Anpassung in der LOGO)
  Reg 3 (HR:4) Druck:         raw / 100   → bar
  Reg 4 (HR:5) Wassertemp:    raw / 10    → °C
"""
from __future__ import annotations

import asyncio

from pymodbus.datastore import (
    ModbusServerContext,
    ModbusSlaveContext,
    ModbusSequentialDataBlock,
)
from pymodbus.server import StartAsyncTcpServer
from pymodbus.transaction import ModbusSocketFramer

from .config import settings
from .state import app_state, web_log

REG_COUNT = 20
REG_FLOW = 2
REG_PRESSURE = 3
REG_WATER_TEMP = 4


class _ObservedDataBlock(ModbusSequentialDataBlock):
    """Hookt setValues, um State zu aktualisieren wenn LOGO schreibt."""

    def setValues(self, address, values):  # noqa: N802 (pymodbus API)
        super().setValues(address, values)
        # pymodbus offset: address ist 1-basiert, wir wollen 0-basiert
        base = address - 1
        for i, raw in enumerate(values):
            reg = base + i
            if reg == REG_FLOW:
                # Unterstuetzt beide LOGO-Varianten:
                # - neu: LOGO schreibt L/min * 100
                # - alt: LOGO schreibt Analog-Rohwert 200..1000 fuer 0..85 L/min
                if raw <= 1000:
                    flow = max(0.0, (raw - 200) * 85.0 / 800.0)
                else:
                    flow = raw / 100.0
                # Sensor-Messbereich beginnt praktisch erst bei ca. 5 L/min.
                app_state.flow_rate = flow if flow >= 5.0 else 0.0
            elif reg == REG_PRESSURE:
                app_state.pressure_bar = raw / 100.0
            elif reg == REG_WATER_TEMP:
                app_state.water_temp = raw / 10.0


_context: ModbusServerContext | None = None
_server_task: asyncio.Task | None = None


def _build_context() -> ModbusServerContext:
    block = _ObservedDataBlock(1, [0] * REG_COUNT)
    slave = ModbusSlaveContext(hr=block, zero_mode=False)
    return ModbusServerContext(slaves=slave, single=True)


async def start() -> None:
    global _context, _server_task
    _context = _build_context()
    web_log(f"[TCP] Modbus-TCP-Server lauscht auf {settings.tcp_host}:{settings.tcp_port}")
    _server_task = asyncio.create_task(
        StartAsyncTcpServer(
            context=_context,
            address=(settings.tcp_host, settings.tcp_port),
            framer=ModbusSocketFramer,
        )
    )


async def stop() -> None:
    if _server_task and not _server_task.done():
        _server_task.cancel()
        try:
            await _server_task
        except asyncio.CancelledError:
            pass
