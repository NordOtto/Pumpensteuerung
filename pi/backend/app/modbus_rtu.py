"""Modbus-RTU-Master für Sinamics V20 — ersetzt den ESP32-RTU-Pfad.

Pi spricht über USB-RS485-Adapter (`/dev/ttyUSB0`) mit dem V20.
Register-Map identisch zu src/config.h. Skalierungen 1:1 übernommen.

Polling-Strategie (entspricht früherer ESP32-Logik):
  * Status (ZSW) + Ist-Frequenz (HIW) alle 500 ms
  * Spannung/Strom/Leistung/Fault alle 2 s
"""
from __future__ import annotations

import asyncio

from pymodbus.client import AsyncModbusSerialClient
from pymodbus.exceptions import ModbusException

from .config import settings
from .state import app_state, web_log

# Register-Map (0-basiert, identisch zu src/config.h)
REG_STW = 99
REG_HSW = 100
REG_ZSW = 109
REG_HIW = 110
REG_VOLTAGE = 342
REG_CURRENT = 344
REG_POWER = 346
REG_FAULT_CODE = 54

CMD_START = 0x047F
CMD_STOP = 0x047E
CMD_FAULT_RESET = 0x04FE

FREQ_WRITE_SCALE = 327.68
FREQ_READ_SCALE = 0.0030517578
CURRENT_SCALE = 0.01
POWER_SCALE = 0.01


class V20RtuClient:
    def __init__(self) -> None:
        self._client: AsyncModbusSerialClient | None = None
        self._lock = asyncio.Lock()

    async def connect(self) -> None:
        self._client = AsyncModbusSerialClient(
            port=settings.rtu_port,
            baudrate=settings.rtu_baud,
            bytesize=8,
            parity="N",
            stopbits=1,
            timeout=1.0,
        )
        ok = await self._client.connect()
        app_state.sys.rtu_connected = ok
        app_state.v20.connected = ok
        if ok:
            web_log(f"[RTU] Verbunden auf {settings.rtu_port} @ {settings.rtu_baud} 8N1")
        else:
            web_log(f"[RTU] Verbindung zu {settings.rtu_port} fehlgeschlagen")

    async def close(self) -> None:
        if self._client:
            self._client.close()

    # ── Befehle ───────────────────────────────────────────────
    async def start(self) -> None:
        await self._write(REG_STW, CMD_START)

    async def stop(self) -> None:
        await self._write(REG_STW, CMD_STOP)

    async def fault_reset(self) -> None:
        await self._write(REG_STW, CMD_FAULT_RESET)

    async def set_frequency(self, hz: float) -> None:
        raw = max(0, min(0xFFFF, int(round(hz * FREQ_WRITE_SCALE))))
        await self._write(REG_HSW, raw)

    # ── Polling ───────────────────────────────────────────────
    async def poll_fast(self) -> None:
        """Status + Ist-Frequenz (500 ms-Takt)."""
        regs = await self._read(REG_ZSW, 2)
        if regs is None:
            return
        zsw, hiw = regs[0], regs[1]
        v = app_state.v20
        v.running = bool(zsw & 0x0004)             # Bit 2
        v.fault = bool(zsw & 0x0008)               # Bit 3
        v.frequency = round(hiw * FREQ_READ_SCALE * 50.0, 2)  # 16384 → 50 Hz
        v.status = "RUN" if v.running else ("FAULT" if v.fault else "IDLE")

    async def poll_slow(self) -> None:
        """Spannung/Strom/Leistung/Fault-Code (2 s-Takt)."""
        v = app_state.v20
        voltage = await self._read(REG_VOLTAGE, 1)
        if voltage is not None:
            v.voltage = float(voltage[0])
        current = await self._read(REG_CURRENT, 1)
        if current is not None:
            v.current = current[0] * CURRENT_SCALE
        power = await self._read(REG_POWER, 1)
        if power is not None:
            v.power = power[0] * POWER_SCALE * 1000  # kW → W (passt zu state.js)
        fault = await self._read(REG_FAULT_CODE, 1)
        if fault is not None:
            v.fault_code = int(fault[0])

    # ── intern ────────────────────────────────────────────────
    async def _read(self, address: int, count: int) -> list[int] | None:
        if not self._client or not self._client.connected:
            return None
        async with self._lock:
            try:
                rr = await self._client.read_holding_registers(
                    address=address, count=count, slave=settings.rtu_slave
                )
            except (ModbusException, asyncio.TimeoutError) as exc:
                web_log(f"[RTU] read error addr={address}: {exc}")
                app_state.v20.connected = False
                app_state.sys.rtu_connected = False
                return None
        if rr.isError():
            return None
        app_state.v20.connected = True
        app_state.sys.rtu_connected = True
        return list(rr.registers)

    async def _write(self, address: int, value: int) -> None:
        if not self._client or not self._client.connected:
            web_log(f"[RTU] write skipped (offline) addr={address} val=0x{value:04X}")
            return
        async with self._lock:
            try:
                await self._client.write_register(
                    address=address, value=value, slave=settings.rtu_slave
                )
            except (ModbusException, asyncio.TimeoutError) as exc:
                web_log(f"[RTU] write error addr={address}: {exc}")


client = V20RtuClient()
