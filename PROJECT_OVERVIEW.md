# Projekt-Übersicht: Pumpensteuerung

> **Zweck dieses Dokuments:** Vollständige technische Referenz für das Projekt.
>
> **Hinweis:** Credentials und private Konfiguration sind in `src/secrets.h` ausgelagert (nicht im Repo). Vorlage: `src/secrets.h.example`.

---

## 1. Architektur

```
Browser (HTTPS :6060)
  └─ nginx ──→ static files (index.html)
            ──→ /ws   → backend:3000 (WebSocket)
            ──→ /api/ → backend:3000 (REST)

backend:3000 (Node.js, Docker) ──MQTT──→ Broker
  │  PI-Druckregelung (500 ms)              │
  │  Timeguard / Wochenschaltuhr            │ ←── ESP32 raw Sensordaten
  │  Presets (/data/presets.json)           │ ──→ ESP32 Befehle
  │  HA Auto-Discovery                      │
  │  WebSocket Server (Browser)             └─── Home Assistant
  └─ REST API

ESP32 (reine Hardware-Brücke)
  ├─ Modbus RTU → Sinamics V20 (Befehle ausführen)
  ├─ Modbus TCP ← Siemens LOGO 8.4 (Sensordaten: flow, pressure, water_temp)
  ├─ DS18B20 (OneWire, Umgebungstemperatur)
  ├─ 4-Pin PWM-Lüfter (25 kHz, Tachometer)
  └─ MQTT: raw-Topics publishen, cmd-Topics subscriben
```

**Kernprinzip:** Alle Steuerungslogik läuft im Docker Stack auf dem Heimserver. Der ESP32 ist eine reine Hardware-Brücke – keine Logik, keine Persistenz. Hardware kann jederzeit ausgetauscht werden ohne Softwareänderungen.

---

## 2. Projektstruktur

```
c:\dev\modbus_logo\
├── src/                          # ESP32 Firmware (PlatformIO / Arduino)
│   ├── main.cpp                  # Setup, Loop, MQTT-Watchdog
│   ├── config.h                  # Pins, Konstanten, AppState-Struct
│   ├── secrets.h                 # Credentials (WiFi, MQTT, OTA) ← .gitignore
│   ├── secrets.h.example         # Vorlage
│   ├── modbus_v20.h/.cpp         # Modbus RTU Master → V20
│   ├── modbus_tcp.h/.cpp         # Modbus TCP Server ← LOGO (Sensordaten)
│   ├── mqtt_ha.h/.cpp            # MQTT Bridge (raw publish / cmd subscribe)
│   ├── sensors.h/.cpp            # DS18B20 + PWM-Lüftersteuerung
│   ├── webserver.h/.cpp          # Lokaler Notfall-Webserver (OTA, Diagnose)
│   └── web_index.h               # Minimal-Dashboard HTML (PROGMEM)
├── docker/
│   ├── backend/
│   │   ├── server.js             # Haupteinstieg
│   │   ├── state.js              # Gemeinsamer State
│   │   ├── mqttClient.js         # MQTT raw subscribe + HA publish + cmd publish
│   │   ├── pressureCtrl.js       # PI-Druckregelung
│   │   ├── timeguard.js          # Wochenschaltuhr
│   │   ├── presets.js            # Preset-Verwaltung
│   │   ├── haDiscovery.js        # HA Auto-Discovery
│   │   ├── websocketServer.js    # Browser WebSocket
│   │   ├── restApi.js            # Express REST /api/*
│   │   ├── package.json
│   │   └── Dockerfile
│   ├── nginx/
│   │   ├── nginx.conf            # HTTPS Reverse Proxy
│   │   ├── docker-entrypoint.sh  # Self-signed Cert Generator
│   │   └── Dockerfile
│   └── frontend/
│       └── index.html            # Dashboard
├── docker-compose.yml            # Lokaler Build + Test
├── docker-stack.yml              # Docker Swarm Deploy
├── .github/workflows/build.yml   # CI/CD: Build + Push nach ghcr.io
├── platformio.ini
├── partitions.csv
└── .gitignore
```

---

## 3. CI/CD Pipeline

```
git push → GitHub Actions → Docker Build → ghcr.io/nordotto/pumpe-backend:latest
                                         → ghcr.io/nordotto/pumpe-nginx:latest
                                                    ↓
                                          Watchtower (alle 60s)
                                          erkennt neues Image → Container-Update
```

- **GitHub Actions:** `.github/workflows/build.yml`
- **Registry:** `ghcr.io/nordotto` (privat, `read:packages` Token erforderlich)
- **Watchtower:** läuft als Container, überwacht Container mit Label `com.centurylinklabs.watchtower.enable=true`
- **AppArmor Fix:** `aa-remove-unknown` war nötig auf dem Host (cgroupv2 + AppArmor Konflikt)

---

## 4. MQTT Topic-Struktur

### ESP32 publisht (raw Sensordaten, alle 500 ms):

| Topic | Format | Bedeutung |
|-------|--------|-----------|
| `pumpensteuerung/raw/v20/frequency` | float | Ist-Frequenz Hz |
| `pumpensteuerung/raw/v20/current` | float | Motorstrom A |
| `pumpensteuerung/raw/v20/voltage` | float | Ausgangsspannung V |
| `pumpensteuerung/raw/v20/power` | float | Leistung W |
| `pumpensteuerung/raw/v20/running` | ON/OFF | Läuft-Zustand |
| `pumpensteuerung/raw/v20/connected` | ON/OFF | RTU verbunden |
| `pumpensteuerung/raw/v20/fault` | ON/OFF | Störung aktiv |
| `pumpensteuerung/raw/v20/fault_code` | int | Fehlercode |
| `pumpensteuerung/raw/v20/status` | text | Statustext |
| `pumpensteuerung/raw/pressure` | float | Druck bar |
| `pumpensteuerung/raw/flow` | float | Durchfluss L/min |
| `pumpensteuerung/raw/water_temp` | float | Wassertemperatur °C |
| `pumpensteuerung/raw/temperature` | float | DS18B20 Umgebung °C |
| `pumpensteuerung/raw/fan/rpm` | int | Lüfter RPM |
| `pumpensteuerung/raw/fan/pwm` | int | Lüfter PWM 0–255 |
| `pumpensteuerung/raw/fan/mode` | text | Lüfter-Modus |

### Backend sendet Befehle an ESP32:

| Topic | Format | Aktion |
|-------|--------|--------|
| `pumpensteuerung/cmd/v20/start` | "1" | V20 starten |
| `pumpensteuerung/cmd/v20/stop` | "1" | V20 stoppen |
| `pumpensteuerung/cmd/v20/reset` | "1" | Störung quittieren |
| `pumpensteuerung/cmd/v20/freq` | float Hz | Frequenz setzen |
| `pumpensteuerung/cmd/fan/pwm` | 0–255 | Lüfter PWM |
| `pumpensteuerung/cmd/fan/mode` | text | Lüfter-Modus |

### Backend publisht zu HA (alle 2 s, identisch zu alter Firmware):

`pumpensteuerung/v20/*`, `pumpensteuerung/pressure/*`, `pumpensteuerung/pi/*`, `pumpensteuerung/timeguard/*`, `pumpensteuerung/fan/*`, `pumpensteuerung/dryrun/*`, `pumpensteuerung/sys/uptime`

### Backend subscribt (HA/Browser Set-Topics):

`pumpensteuerung/v20/running/set`, `/v20/freq_set/set`, `/v20/fault_reset`, `/pressure/setpoint/set`, `/pi/enabled/set`, `/pi/freq_min/set`, `/pi/freq_max/set`, `/timeguard/enabled/set`, `/preset/set`, `/fan/pwm/set`, `/fan/mode/set`, `/dryrun/reset`

---

## 5. Hardware

### ESP32-DevKit-C – GPIO-Belegung

| GPIO | Funktion   | Richtung | Peripherie     | Hinweis                         |
|------|------------|----------|----------------|---------------------------------|
| 16   | RS485_RX   | Input    | UART1 RXD      | MAX13487 → ESP32                |
| 17   | RS485_TX   | Output   | UART1 TXD      | ESP32 → MAX13487                |
| 4    | DS18B20    | I/O      | OneWire        | 4,7 kΩ Pull-up auf 3,3 V        |
| 32   | FAN_PWM    | Output   | LEDC-Kanal 0   | 25 kHz, 8-bit                   |
| 36   | FAN_TACH   | Input    | GPIO-Interrupt | Falling Edge, 2 Pulse/Umdrehung |
| 2    | STATUS_LED | Output   | Onboard LED    | HIGH = online, LOW = offline    |

---

## 6. Modbus RTU – V20

| Parameter     | Wert      |
|---------------|-----------|
| Baud Rate     | 9600 bps  |
| Format        | 8N1       |
| Slave-Adresse | 1         |
| Poll-Intervall| 500 ms    |

### V20 Holding-Register

| Adresse | Parameter | R/W | Formel | Bedeutung |
|---------|-----------|-----|--------|-----------|
| 99 | STW | W | — | Steuerwort |
| 100 | HSW | W | Hz × 327.68 | Frequenz-Sollwert |
| 109 | ZSW | R | Bit2=läuft, Bit3=Störung | Zustandswort |
| 110 | HIW | R | Raw × 0.00305 = Hz | Ist-Frequenz |
| 24 | r0025 | R | 1:1 V | Ausgangsspannung |
| 26 | r0027 | R | × 0.01 A | Motorstrom |
| 31 | r0032 | R | × 0.01 kW | Wirkleistung |

### Steuerwort-Werte

| Wert | Bedeutung |
|------|-----------|
| 0x047F | Start |
| 0x047E | Stop |
| 0x04FE | Fault Reset (Phase 1) |

---

## 7. Modbus TCP – LOGO 8.4

| Parameter | Wert |
|-----------|------|
| Port | 502 |
| ESP32 Rolle | Server |
| LOGO Rolle | Client (schreibt Sensorwerte) |

### Schreibregister (LOGO → ESP32)

| Adresse | Funktion | Skalierung |
|---------|----------|------------|
| 2 | Durchfluss | Raw 200–1000 → 0–85 L/min |
| 3 | Druck | bar × 100 |
| 4 | Wassertemperatur | Raw 200–1000 → -25–125°C |

> Register 0 (STW) und 1 (HSW) werden vom ESP32 nicht mehr verarbeitet – V20-Steuerung erfolgt ausschließlich via MQTT.

---

## 8. Backend – Steuerungslogik

### PI-Druckregelung (`pressureCtrl.js`)

- Takt: 500 ms
- Algorithmus: PI mit Anti-Windup
- Kein-Bedarf-Erkennung: flow=0 + Druck≥Sollwert → Stop nach 5 s
- Trockenlauf-Schutz: flow=0 + Druck<Sollwert → Stop nach 30 s + 5 Min Sperre
- Persistenz: `/data/pressure_ctrl.json`

| Parameter | Default | Bedeutung |
|-----------|---------|-----------|
| setpoint | 3.0 bar | Druck-Sollwert |
| kp | 3.0 | Proportionalverstärkung |
| ki | 0.3 | Integralverstärkung |
| freq_min | 35.0 Hz | Untergrenze |
| freq_max | 50.0 Hz | Obergrenze |

### Wochenschaltuhr (`timeguard.js`)

- Zeitzone: `Europe/Berlin` via Container-TZ
- Config: start/end Stunde+Minute, Tage[7], enabled
- Bei Fenster-Ende + V20 läuft: automatischer Stop
- Persistenz: `/data/timeguard.json`

### Presets (`presets.js`)

- Gespeichert in `/data/presets.json`
- Default-Preset "Normal" bei erster Verwendung
- apply() setzt PI-Config + ctrl_mode

### REST API (`restApi.js`)

| Route | Methode | Funktion |
|-------|---------|----------|
| `/api/v20/start` | POST | V20 starten |
| `/api/v20/stop` | POST | V20 stoppen |
| `/api/v20/reset` | POST | Störung quittieren |
| `/api/v20/freq` | POST | Frequenz setzen |
| `/api/pressure` | GET/POST | PI-Config lesen/setzen |
| `/api/pressure/reset_dryrun` | POST | Trockenlauf quittieren |
| `/api/timeguard` | GET/POST | Zeitsperre lesen/setzen |
| `/api/presets` | GET/POST | Presets verwalten |
| `/api/presets/:name` | DELETE | Preset löschen |
| `/api/preset/apply` | POST | Preset anwenden |
| `/api/fan/pwm` | POST | Lüfter PWM setzen |
| `/api/fan/mode` | POST | Lüfter-Modus setzen |
| `/api/status` | GET | Vollständiger State |

---

## 9. Lüftersteuerung

| Modus | Name | Beschreibung |
|-------|------|--------------|
| 0 | Auto | PWM nach Temperaturkurve (25°C→30 PWM, 40°C→255 PWM) |
| 1 | LOGO | Legacy, nicht mehr genutzt |
| 2 | MQTT | PWM von `fan/pwm/set` |
| 3 | Web | PWM vom Dashboard |

---

## 10. Docker Stack

### Services

| Service | Image | Port | Funktion |
|---------|-------|------|----------|
| backend | `ghcr.io/nordotto/pumpe-backend:latest` | 3000 (intern) | Node.js Steuerungslogik |
| nginx | `ghcr.io/nordotto/pumpe-nginx:latest` | 6060 (HTTPS), 6061 (HTTP→HTTPS) | Reverse Proxy + Static Files |

### Volumes

| Volume | Mountpoint | Inhalt |
|--------|------------|--------|
| `app-data` | `/data` | Presets, Timeguard, PI-Config |
| `ssl-certs` | `/etc/nginx/ssl` | Self-signed Zertifikat |

### ENV-Variablen (Portainer Stack)

```
MQTT_BROKER=192.168.1.136
MQTT_PORT=1883
MQTT_USER=mqtt
MQTT_PASS=mqtt-ha1
TZ=Europe/Berlin
```

---

## 11. Mögliche Features (Low → High Aufwand)

### Low
- **Betriebsstunden-Zähler** – Gesamtlaufzeit der Pumpe in `/data` persistent speichern
- **Letzter Fehler loggen** – V20 Fault-Code mit Timestamp in State speichern
- **Preset-Export/Import** – Presets als JSON über UI exportieren/importieren
- **MQTT Last Will** – Backend publiziert `offline` Topic bei Verbindungsabbruch
- **Watchtower E-Mail-Benachrichtigung** – bei erfolgreichem Update per Mail informieren

### Medium
- **Druck-Verlaufsdiagramm** – Chart.js im Dashboard, letzte 60 Minuten Druckverlauf
- **Mehrere Drucksollwerte (Tageszeit)** – z.B. tagsüber 3 bar, nachts 2.5 bar
- **Automatischer V20-Fehler-Reset** – nach Störung X Sekunden warten und automatisch quittieren
- **Push-Benachrichtigung (HA)** – bei Trockenlauf-Sperre oder V20-Störung HA-Notification senden
- **OTA über Dashboard** – ESP32 Firmware-Update direkt aus dem Docker-Dashboard
- **Betriebslog exportieren** – Log-Buffer als CSV-Download
- **Portainer externe Erreichbarkeit** – DynDNS + VPN/Tunnel für automatisches Stack-Redeploy

### High
- **Mehrere Pumpen** – Backend-Architektur für n Pumpen erweitern (Multi-Instance)
- **4–20 mA Sensoren direkt am ESP32** – LOGO entfällt, ESP32 liest Sensoren direkt (ADS1115 ADC)
- **Energiekosten-Tracking** – kWh aus Leistungswerten berechnen, Kosten pro Monat anzeigen
- **Fernzugriff über WireGuard** – VPN-Tunnel zum Heimserver statt Self-signed Cert
- **Redundanter Broker** – MQTT-Cluster oder Fallback-Broker konfigurieren
- **Grafana + InfluxDB** – Langzeit-Zeitreihendatenbank für alle Sensorwerte
