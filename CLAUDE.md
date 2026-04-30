# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projekt-Kontext

Pumpensteuerung für eine Brunnenwasseranlage. ESP32 liest per Modbus RTU einen Siemens Simatic V20 Frequenzumrichter aus und empfängt Sensordaten (Druck, Durchfluss, Temperatur) per Modbus TCP von einer Siemens LOGO 8.4 SPS. Alle Steuerungslogik läuft in einem Docker Stack auf dem Heimserver — der ESP32 ist eine **reine Hardware-Brücke**, keine Logik, keine Persistenz.

## Zwei Codebases in einem Repo

```
modbus_logo/
├── src/            → ESP32 Firmware (PlatformIO / C++)
└── docker/
    ├── backend/    → Node.js Steuerungslogik
    ├── nginx/      → HTTPS Reverse Proxy
    └── frontend/   → Dashboard (index.html)
```

## Entwicklungs-Befehle

### ESP32 Firmware (PlatformIO)

```bash
# Bauen
pio run

# Auf ESP32 flashen
pio run --target upload

# Serieller Monitor
pio device monitor

# Testen
pio test
```

### Docker Backend (lokaler Build + Test)

```bash
# Stack starten
docker-compose up --build

# Nur Backend-Logs
docker-compose logs -f backend

# Stack stoppen
docker-compose down
```

### Docker Swarm Deployment (Heimserver)

```bash
# Stack deployen
docker stack deploy -c docker-stack.yml pumpe

# Status prüfen
docker stack services pumpe

# Stack entfernen
docker stack rm pumpe
```

## Architektur

**Kernprinzip:** Steuerungslogik ausschließlich im Docker Backend. ESP32 darf nicht geändert werden wenn nur Backend-Logik angepasst wird.

```
Browser (HTTPS :6060)
  └─ nginx ──→ static files
            ──→ /ws  → backend:3000 (WebSocket)
            ──→ /api → backend:3000 (REST)

backend (Node.js) ──MQTT──→ Broker ──→ ESP32 (Befehle)
                                   ←── ESP32 (Sensordaten, 500ms)
                                   ←→  Home Assistant
```

**Backend-Module (`docker/backend/`):**

| Datei | Zweck |
|-------|-------|
| `server.js` | Haupteinstieg, initialisiert alle Module |
| `state.js` | Gemeinsamer State (alle Module lesen/schreiben hier) |
| `mqttClient.js` | MQTT subscribe/publish, HA-Topics, ESP32-Befehle |
| `pressureCtrl.js` | PI-Druckregelung (500ms Takt, Anti-Windup, Trockenlauf-Schutz) |
| `timeguard.js` | Wochenschaltuhr (Zeitzone Europe/Berlin) |
| `presets.js` | Preset-Verwaltung (`/data/presets.json`) |
| `restApi.js` | Express REST `/api/*` |
| `websocketServer.js` | Browser WebSocket |
| `haDiscovery.js` | HomeAssistant Auto-Discovery |

## Secrets und Credentials

`src/secrets.h` ist in `.gitignore` — **nie committen!**  
Vorlage: `src/secrets.h.example` — diese Datei kopieren und befüllen.

ENV-Variablen für Docker (im Portainer Stack oder `.env`):
```
MQTT_BROKER=<broker-ip>
MQTT_PORT=1883
MQTT_USER=<mqtt-user>
MQTT_PASS=<mqtt-password>
TZ=Europe/Berlin
```

## Versionierung & Updates

```
git push
    → GitHub Actions (build.yml): Docker Build
        → ghcr.io/nordotto/pumpe-backend:latest
        → ghcr.io/nordotto/pumpe-nginx:latest
            → Watchtower (läuft als Container, prüft alle 60s)
                → neues Image erkannt → Container automatisch neu gestartet
```

- Kein formales Versionierungs-Skript — es gibt immer nur `:latest`
- Jeder Push triggert sofort ein neues Image + automatisches Update auf dem Heimserver
- ESP32-Firmware muss separat per PlatformIO geflasht werden — kein OTA für Firmware

## CI/CD

```
git push → GitHub Actions → Docker Build → ghcr.io/nordotto/pumpe-backend:latest
                                         → ghcr.io/nordotto/pumpe-nginx:latest
                                                    ↓
                                          Watchtower (alle 60s) → Auto-Update
```

Images sind privat (`ghcr.io/nordotto`, `read:packages` Token erforderlich).

## MQTT Topics (Kurzübersicht)

- ESP32 publiziert Sensordaten auf `pumpensteuerung/raw/**` (500ms)
- Backend sendet Befehle auf `pumpensteuerung/cmd/**`
- Backend publiziert aufbereitete Daten für HA auf `pumpensteuerung/v20/**` etc. (2s)

Vollständige Topic-Liste: siehe `PROJECT_OVERVIEW.md` Abschnitt 4.

## Bekannte Fehler & Lösungen

> Diese Sektion wird nach jeder Session aktualisiert. Ziel: Kein Fehler wird zweimal gemacht.

| Problem | Ursache | Lösung |
|---------|---------|--------|
| AppArmor-Fehler beim Container-Start | cgroupv2 + AppArmor Konflikt auf dem Host | `aa-remove-unknown` auf dem Host ausführen |
| LOGO schreibt Sensordaten nicht zum ESP32 | Register 0+1 (STW/HSW) werden vom ESP32 nicht mehr verarbeitet | V20-Steuerung läuft ausschließlich über MQTT — LOGO nur noch für Sensor-Register 2–4 |

## Modbus

- **RTU (ESP32 → V20):** UART1, 9600 bps, 8N1, Slave-Adresse 1
- **TCP (LOGO → ESP32):** ESP32 ist Server auf Port 502, LOGO schreibt Sensordaten in Register 2–4
- V20 Steuerwort: `0x047F` = Start, `0x047E` = Stop, `0x04FE` = Fault Reset

Vollständige Registertabelle: `V20_MODBUS_REGISTER.md`
