"""MQTT-Bridge zum bestehenden externen Broker (192.168.1.136:1883).

Verantwortlichkeiten in der neuen Architektur:
  - **Publisht** `pumpensteuerung/raw/**` Telemetrie + HA-State-Topics
    (damit HA-Dashboards & Automatisierungen unverändert weiterlaufen).
  - **Subskribiert** `pumpensteuerung/cmd/**` und HA-Set-Topics → leitet
    Befehle via Callback an die Steuerlogik weiter (modbus_rtu, presets, etc.).

Der Pi liest V20+LOGO direkt via Modbus — MQTT ist hier nur noch HA-Schnittstelle,
nicht mehr Daten-Backbone wie früher.
"""
from __future__ import annotations

import threading
from typing import Callable

import paho.mqtt.client as mqtt

from .config import settings
from .state import app_state, web_log

CommandCallback = Callable[[str, str], None]


class MqttBridge:
    def __init__(self) -> None:
        self._client = mqtt.Client(
            mqtt.CallbackAPIVersion.VERSION2,
            client_id="pumpe-pi-backend",
            clean_session=True,
        )
        if settings.mqtt_user:
            self._client.username_pw_set(settings.mqtt_user, settings.mqtt_pass)
        self._client.on_connect = self._on_connect
        self._client.on_disconnect = self._on_disconnect
        self._client.on_message = self._on_message
        self._command_cbs: list[CommandCallback] = []
        self._connected_cbs: list[Callable[[], None]] = []
        self._lock = threading.Lock()
        self._base = settings.mqtt_topic_prefix
        self._cmd_prefix = f"{self._base}/cmd/"

    # ── Public API ─────────────────────────────────────────────
    def start(self) -> None:
        self._client.connect_async(settings.mqtt_broker, settings.mqtt_port, keepalive=30)
        self._client.loop_start()

    def stop(self) -> None:
        self._client.loop_stop()
        self._client.disconnect()

    def on_command(self, cb: CommandCallback) -> None:
        self._command_cbs.append(cb)

    def on_connected(self, cb: Callable[[], None]) -> None:
        """Callback bei jedem (Re-)Connect — z.B. für HA-Discovery-Republish."""
        self._connected_cbs.append(cb)

    def send_cmd(self, suffix: str, value: str | float | int) -> None:
        """Befehl auf cmd/<suffix> publizieren — Kompatibilität zum alten Schema."""
        if not self._client.is_connected():
            print(f"[MQTT] send_cmd verworfen (nicht verbunden): {suffix}={value}", flush=True)
            return
        self._client.publish(f"{self._cmd_prefix}{suffix}", str(value), qos=0, retain=False)

    def publish_raw(self, suffix: str, value: str | float | int, retain: bool = False) -> None:
        """raw/<suffix> publishen — ersetzt was früher der ESP32 publiziert hat."""
        if not self._client.is_connected():
            return
        self._client.publish(f"{self._base}/raw/{suffix}", str(value), qos=0, retain=retain)

    def publish_state(self, suffix: str, value: str | float | int, retain: bool = False) -> None:
        """HA-State-Topic publizieren (z.B. pressure/state, v20/running/state)."""
        if not self._client.is_connected():
            return
        self._client.publish(f"{self._base}/{suffix}", str(value), qos=0, retain=retain)

    def publish(self, topic: str, value: str | float | int, retain: bool = False) -> None:
        """Vollständig qualifiziertes Topic publizieren."""
        if not self._client.is_connected():
            return
        self._client.publish(topic, str(value), qos=0, retain=retain)

    # ── Callbacks ──────────────────────────────────────────────
    def _on_connect(self, client, userdata, flags, reason_code, properties=None):
        if reason_code == 0:
            app_state.sys.mqtt = True
            web_log(f"[MQTT] Verbunden mit {settings.mqtt_broker}:{settings.mqtt_port}")
            # Befehle vom alten Schema (cmd/v20/start, cmd/v20/freq, …)
            client.subscribe(f"{self._cmd_prefix}#", qos=0)
            # HA-Set-Topics (pumpensteuerung/<x>/set, durch HA-Discovery gemanagt)
            client.subscribe(f"{self._base}/+/set", qos=0)
            client.subscribe(f"{self._base}/+/+/set", qos=0)
            # Bewässerungs-Topics (handle_mqtt im IrrigationManager)
            client.subscribe(f"{self._base}/irrigation/weather/input", qos=0)
            client.subscribe(f"{self._base}/irrigation/program/+/start", qos=0)
            client.subscribe(f"{self._base}/irrigation/program/+/stop", qos=0)
            client.subscribe(f"{self._base}/irrigation/zone/+/state", qos=0)
            for cb in self._connected_cbs:
                try:
                    cb()
                except Exception as exc:
                    print(f"[MQTT] connected callback error: {exc}", flush=True)
        else:
            app_state.sys.mqtt = False
            web_log(f"[MQTT] Connect fehlgeschlagen rc={reason_code}")

    def _on_disconnect(self, client, userdata, *args, **kwargs):
        app_state.sys.mqtt = False
        web_log("[MQTT] Verbindung verloren – Reconnect läuft")

    def _on_message(self, client, userdata, msg):
        topic = msg.topic
        try:
            payload = msg.payload.decode("utf-8", errors="replace")
        except Exception:
            return
        with self._lock:
            for cb in self._command_cbs:
                try:
                    cb(topic, payload)
                except Exception as exc:
                    print(f"[MQTT] command callback error: {exc}", flush=True)


bridge = MqttBridge()
