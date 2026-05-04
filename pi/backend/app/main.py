"""FastAPI-Einstieg + asyncio-Orchestrierung.

Tasks:
  - PI-Regler           500 ms
  - Modbus-RTU fast     500 ms (Status/IstHz)
  - Modbus-RTU slow    2000 ms (U/I/P/Fault)
  - Modbus-TCP-Server   :502   (Hintergrund, von LOGO geschrieben)
  - Timeguard          10 s
  - MQTT-Publish        2 s    (HA-State-Topics)
  - Uptime-Counter      1 s
"""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI

from . import ha_discovery, modbus_rtu, modbus_tcp, storage, timeguard, ws
from .api.deps import deps
from .api.routes import router as api_router
from .config import settings
from .irrigation import IrrigationManager
from .mqtt_client import bridge
from .presets import PresetManager
from .pressure_ctrl import PressureController
from .state import app_state, web_log
from .weather_provider import WeatherProvider


# ── Reglerzustand: PressureController bekommt Modbus-Calls als Callbacks ──
def _on_start() -> None:
    asyncio.create_task(modbus_rtu.client.start())


def _on_stop() -> None:
    asyncio.create_task(modbus_rtu.client.stop())


def _on_freq(hz: float) -> None:
    asyncio.create_task(modbus_rtu.client.set_frequency(hz))


pi_ctrl = PressureController(_on_start, _on_stop, _on_freq)
preset_mgr = PresetManager(
    pi_ctrl=pi_ctrl,
    on_v20_start=_on_start,
    on_v20_freq=_on_freq,
)
irrigation = IrrigationManager(
    mqtt_publish=lambda topic, value, retain: bridge.publish(topic, value, retain),
    v20_stop=_on_stop,
    presets_apply=preset_mgr.apply,
)
weather_provider = WeatherProvider(irrigation.ingest_weather)
_main_loop: asyncio.AbstractEventLoop | None = None


# ── Periodische Tasks ─────────────────────────────────────────
async def _pi_loop():
    while True:
        try:
            await modbus_rtu.client.poll_fast()
            pi_ctrl.tick()
        except Exception as exc:
            web_log(f"[LOOP] PI-Tick Fehler: {exc}")
        await asyncio.sleep(0.5)


async def _slow_loop():
    while True:
        try:
            await modbus_rtu.client.poll_slow()
        except Exception as exc:
            web_log(f"[LOOP] slow poll Fehler: {exc}")
        await asyncio.sleep(2.0)


async def _timeguard_loop():
    while True:
        timeguard.tick(stop_v20_callback=lambda: asyncio.create_task(modbus_rtu.client.stop()))
        await asyncio.sleep(10.0)


async def _irrigation_loop():
    while True:
        try:
            irrigation.tick()
        except Exception as exc:
            web_log(f"[LOOP] Irrigation-Tick Fehler: {exc}")
        await asyncio.sleep(5.0)


async def _weather_loop():
    while True:
        try:
            if weather_provider.should_refresh():
                await weather_provider.refresh()
        except Exception as exc:
            web_log(f"[LOOP] Weather-Refresh Fehler: {exc}")
        await asyncio.sleep(60.0)


async def _mqtt_publish_loop():
    """Veröffentlicht alle 2 s die HA-Telemetrie (raw/* + state-Topics)."""
    while True:
        try:
            v = app_state.v20
            bridge.publish_raw("v20/frequency", f"{v.frequency:.2f}")
            bridge.publish_raw("v20/current", f"{v.current:.2f}")
            bridge.publish_raw("v20/voltage", f"{v.voltage:.1f}")
            bridge.publish_raw("v20/power", str(round(v.power)))
            bridge.publish_raw("v20/running", "ON" if v.running else "OFF")
            bridge.publish_raw("v20/connected", "ON" if v.connected else "OFF")
            bridge.publish_raw("v20/fault", "ON" if v.fault else "OFF")
            bridge.publish_raw("v20/fault_code", str(v.fault_code))
            bridge.publish_raw("v20/status", v.status)
            bridge.publish_raw("pressure", f"{app_state.pressure_bar:.2f}")
            bridge.publish_raw("flow", f"{app_state.flow_rate:.1f}")
            if app_state.water_temp is not None:
                bridge.publish_raw("water_temp", f"{app_state.water_temp:.1f}")
            # HA-State-Topics (vereinfachte Auswahl — Vollausbau in ha_discovery)
            bridge.publish_state("pressure/state", f"{app_state.pressure_bar:.2f}", retain=True)
            bridge.publish_state("pressure/setpoint/state", f"{app_state.pi.setpoint:.2f}", retain=True)
            bridge.publish_state("v20/running/state", "ON" if v.running else "OFF")
            if v.freq_setpoint:
                bridge.publish_state("v20/freq_set/state", f"{v.freq_setpoint:.1f}")
        except Exception as exc:
            web_log(f"[LOOP] MQTT publish Fehler: {exc}")
        await asyncio.sleep(2.0)


async def _uptime_loop():
    while True:
        app_state.sys.uptime += 1
        await asyncio.sleep(1.0)


async def _pressure_log_loop():
    """Schreibt alle 5 s einen Druck/Flow/Hz-Sample in die SQLite. Retention 30 d."""
    while True:
        try:
            storage.insert_pressure_sample(
                pressure=app_state.pressure_bar,
                flow=app_state.flow_rate,
                frequency=app_state.v20.frequency,
                running=app_state.v20.running,
            )
        except Exception as exc:
            web_log(f"[LOOP] pressure log Fehler: {exc}")
        await asyncio.sleep(5.0)


# ── MQTT-Befehlshandler ───────────────────────────────────────
def _on_mqtt_command(topic: str, payload: str) -> None:
    """Behandelt cmd/* und HA-set-Topics. Läuft im paho-Thread —
    Modbus-Calls als asyncio-Tasks queuen."""
    base = settings.mqtt_topic_prefix

    if topic.startswith(f"{base}/irrigation/"):
        # Bewässerungs-Topics benötigen keinen asyncio-Loop. Wichtig: Der
        # paho-Callback läuft in einem Thread ohne Eventloop, daher darf diese
        # Verarbeitung nicht hinter asyncio.get_event_loop() hängen.
        irrigation.handle_mqtt(topic, payload)
        return

    loop = _main_loop
    if loop is None:
        web_log(f"[MQTT] Befehl verworfen, Eventloop noch nicht bereit: {topic}")
        return

    if topic == f"{base}/cmd/v20/start":
        asyncio.run_coroutine_threadsafe(modbus_rtu.client.start(), loop)
    elif topic == f"{base}/cmd/v20/stop":
        asyncio.run_coroutine_threadsafe(modbus_rtu.client.stop(), loop)
    elif topic == f"{base}/cmd/v20/reset":
        asyncio.run_coroutine_threadsafe(modbus_rtu.client.fault_reset(), loop)
    elif topic == f"{base}/cmd/v20/freq":
        try:
            asyncio.run_coroutine_threadsafe(
                modbus_rtu.client.set_frequency(float(payload)), loop
            )
        except ValueError:
            pass
    elif topic == f"{base}/pressure/setpoint/set":
        try:
            pi_ctrl.set_config({"setpoint": float(payload)})
        except ValueError:
            pass
    elif topic == f"{base}/pi/enabled/set":
        pi_ctrl.set_config({"enabled": payload.upper() == "ON"})
    elif topic == f"{base}/vacation/set":
        pi_ctrl.set_vacation(payload.upper() == "ON")


# ── FastAPI-App ───────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    global _main_loop
    _main_loop = asyncio.get_running_loop()
    # Dependency-Container für REST-Routen befüllen
    deps.pi_ctrl = pi_ctrl
    deps.preset_mgr = preset_mgr
    deps.irrigation = irrigation
    deps.weather_provider = weather_provider
    deps.rtu = modbus_rtu.client

    # SQLite-Schema sicherstellen
    storage.init_schema()

    # Persistierte Configs laden
    pi_ctrl.load()
    timeguard.load()
    preset_mgr.load()
    irrigation.load()
    weather_provider.load()

    # Preset-CRUD soll HA-Select aktualisieren
    preset_mgr.on_changed = ha_discovery.refresh_preset_select

    # Modbus-Verbindungen aufbauen
    await modbus_rtu.client.connect()
    await modbus_tcp.start()

    # MQTT
    bridge.on_command(_on_mqtt_command)
    bridge.on_connected(lambda: ha_discovery.send_discovery(preset_mgr))
    bridge.start()

    # Periodische Tasks
    tasks = [
        asyncio.create_task(_pi_loop()),
        asyncio.create_task(_slow_loop()),
        asyncio.create_task(_timeguard_loop()),
        asyncio.create_task(_irrigation_loop()),
        asyncio.create_task(_weather_loop()),
        asyncio.create_task(_mqtt_publish_loop()),
        asyncio.create_task(_uptime_loop()),
        asyncio.create_task(_pressure_log_loop()),
        asyncio.create_task(ws.broadcast_loop()),
    ]
    web_log(f"[SYS] Backend gestartet ({app_state.sys.fw})")
    try:
        yield
    finally:
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await modbus_tcp.stop()
        await modbus_rtu.client.close()
        bridge.stop()


app = FastAPI(title="Pumpensteuerung", version=app_state.sys.fw, lifespan=lifespan)
app.include_router(api_router)
app.include_router(ws.router)


@app.get("/api/health")
async def health():
    return {"ok": True, "uptime": app_state.sys.uptime, "fw": app_state.sys.fw}
