# Pumpe-Backend (Pi 3B+ Solo-Brain)

Python-Backend für Brunnenpumpensteuerung + smarte Bewässerung. Ersetzt den
bisherigen Docker-Stack (Node.js auf Heimserver) und den ESP32-RTU-Pfad zum
V20. Läuft als systemd-Service direkt auf dem Pi.

## Architektur (Phase 1)

```
Pi 3B+
  ├─ uvicorn :8000 (FastAPI)
  │    ├─ pymodbus RTU  ──USB-RS485──▶ V20
  │    ├─ pymodbus TCP-Server :502 ◀── LOGO 8.4 (Sensoren)
  │    └─ paho-mqtt  ──▶ 192.168.1.136:1883 (bestehender Broker)
  │
  └─ next.js :3001 (UI, separate App in pi/frontend)
```

MQTT-Broker bleibt der bestehende **192.168.1.136:1883** — kein lokaler
Mosquitto auf dem Pi. Topic-Schema (`pumpensteuerung/raw/**`,
`pumpensteuerung/cmd/**`) ist unverändert kompatibel zur Home Assistant
Integration.

## Setup (Pi)

```bash
# Pi-User
sudo useradd -r -s /usr/sbin/nologin pumpe
sudo mkdir -p /var/lib/pumpe/data
sudo chown -R pumpe:pumpe /var/lib/pumpe

# Code deployen (Beispiel, später durch OTA-Mechanismus ersetzt)
sudo mkdir -p /opt/pumpe
sudo rsync -av pi/backend/ /opt/pumpe/backend/
sudo chown -R pumpe:pumpe /opt/pumpe

# venv
cd /opt/pumpe/backend
sudo -u pumpe python3.11 -m venv .venv
sudo -u pumpe .venv/bin/pip install -e .

# .env aus .env.example anlegen, MQTT-Credentials eintragen
sudo -u pumpe cp .env.example .env

# Bestehende /data/*.json vom alten Backend übernehmen (optional)
sudo -u pumpe scp altserver:/data/*.json /var/lib/pumpe/data/
```

## Lokal entwickeln (Windows/Mac)

```bash
cd pi/backend
python -m venv .venv
.\.venv\Scripts\activate    # Windows
pip install -e .[dev]
cp .env.example .env        # MQTT_BROKER auf eigenen Test-Broker zeigen lassen
                            # RTU_PORT=COM3 (Windows) ggf. anpassen oder mocken
uvicorn app.main:app --reload
```

> **Hinweis:** `modbus_tcp.py` lauscht standardmäßig auf Port 502 (privilegiert).
> Auf Linux per `setcap 'cap_net_bind_service=+ep' /usr/bin/python3.11` oder
> systemd-`AmbientCapabilities=CAP_NET_BIND_SERVICE`. Lokal zum Testen: in
> `.env` `TCP_PORT=5020` setzen.

## Modulübersicht

| Datei | Rolle |
|---|---|
| `app/main.py` | FastAPI-Lifespan, asyncio-Tasks, MQTT-Befehlsdispatch |
| `app/state.py` | Pydantic-State (Singleton `app_state`) |
| `app/config.py` | `.env`-Settings (MQTT/RTU/TCP/Pfade) |
| `app/persistence.py` | JSON-Read/Write (`/var/lib/pumpe/data/*.json`) |
| `app/pressure_ctrl.py` | **PI-Druckregler — 1:1 Port von `pressureCtrl.js`**. Tunings nicht ändern ohne Pumpentest! |
| `app/timeguard.py` | Wochenschaltuhr, zoneinfo Europe/Berlin |
| `app/modbus_rtu.py` | V20-Master via USB-RS485 |
| `app/modbus_tcp.py` | TCP-Server :502 für LOGO-Sensoren |
| `app/mqtt_client.py` | paho-mqtt → externer Broker, raw/cmd-Topics |

## Noch zu portieren (folgt)

- `presets.py` (von `presets.js`)
- `irrigation.py` (von `irrigation.js`, ET0-Scheduler)
- `ha_discovery.py` (Auto-Discovery)
- `auth.py` (PBKDF2-Login)
- `ws.py` (WebSocket /ws @ 1 Hz, vom Frontend konsumiert)
- REST-Routen unter `app/api/`
