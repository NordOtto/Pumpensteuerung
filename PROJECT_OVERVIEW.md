# Projekt-Übersicht: Pumpensteuerung

> **Zweck:** Vollständige technische Referenz für das Projekt.
>
> **Aktueller Stand:** 2026-05-09 — Pi-only Architektur, ESP32 entfernt.

---

## 1. Zielbild & Architektur

Brunnenwasseranlage mit Druckregelung und smarter Bewässerung. Ein Raspberry Pi 3B+ ist das einzige Steuerungssystem.

```
Browser / Android-App (HTTPS :443)
  │
  └─ nginx (Reverse Proxy, Self-Signed TLS)
     ├─ /          → Next.js :3001 (SSR/Static + PWA)
     ├─ /ws        → FastAPI :8000 (WebSocket, ~1 Hz State-Broadcast)
     ├─ /api       → FastAPI :8000 (REST)
     └─ /pumpe.apk → /var/www/pumpe/downloads/pumpe.apk

FastAPI (Python, pi/backend/)
  ├─ Modbus RTU  → Sinamics V20 (Befehle, 500ms-Takt)
  ├─ Modbus TCP  ← Siemens LOGO 8.4 (Sensordaten Reg 2–4)
  ├─ MQTT        → externer Broker 192.168.1.136:1883
  │              ↔ Home Assistant (optional)
  ├─ Druckregelung (PI mit Anti-Windup)
  ├─ Bewässerungs-Engine (Smart-ET, Wetter, Durchfluss-Integration)
  ├─ Preset-Verwaltung
  ├─ Timeguard (Wochenschaltuhr, Sperrzeiten)
  └─ Wetter-Provider (OpenWeatherMap + Ecowitt)
```

**Kernprinzip:** Alle Logik läuft im Pi. Hardware (V20, LOGO) ist über Modbus angebunden — austauschbar ohne Softwareänderungen.

---

## 2. Repo-Struktur

```
modbus_logo/
├── pi/
│   ├── backend/                       # Python FastAPI
│   │   ├── app/
│   │   │   ├── main.py                # Haupteinstieg, startet Loops
│   │   │   ├── state.py               # Gemeinsamer AppState (Pydantic)
│   │   │   ├── modbus_rtu.py          # RTU-Client → V20
│   │   │   ├── modbus_tcp.py          # TCP-Server ← LOGO
│   │   │   ├── pressure_ctrl.py       # PI-Druckregelung
│   │   │   ├── irrigation.py          # Bewässerungs-Engine + Wetter-Logik
│   │   │   ├── presets.py             # Preset-Verwaltung
│   │   │   ├── mqtt_client.py         # MQTT subscribe/publish
│   │   │   ├── timeguard.py           # Wochenschaltuhr (Druckregelung)
│   │   │   ├── weather_provider.py    # OWM + Ecowitt Adapter
│   │   │   ├── ws.py                  # WebSocket-Broadcast
│   │   │   └── api/routes.py          # REST /api/*
│   │   ├── data/                      # Persistente JSONs (presets, programs)
│   │   └── pyproject.toml
│   ├── frontend/                      # Next.js 15 (App Router)
│   │   ├── app/
│   │   │   ├── dashboard/             # Hauptseite (Pumpe + Bewässerung)
│   │   │   ├── settings/              # Programme, Presets, OTA, Theme
│   │   │   ├── zones/                 # Zonen-Übersicht
│   │   │   ├── weather/               # Wetterdaten + Forecast
│   │   │   ├── analytics/             # (geplant: Auswertungen)
│   │   │   ├── assistant/             # Smart-ET-Guide
│   │   │   └── layout.tsx             # TopBar + ThemeProvider
│   │   ├── components/
│   │   │   ├── top-bar.tsx            # Live-Metriken (Druck/L-min/Hz)
│   │   │   ├── theme-provider.tsx     # Light/Dark/System
│   │   │   ├── duration-picker.tsx    # Custom-Minuten-Wheel
│   │   │   └── ui/                    # Card, Badge, Toggle, ...
│   │   ├── lib/
│   │   │   ├── api.ts                 # Backend REST Client
│   │   │   ├── ws.tsx                 # WebSocket Hook
│   │   │   └── types.ts               # TypeScript-Typen
│   │   ├── android/                   # Capacitor-Wrapper-APK
│   │   │   └── app/src/main/res/
│   │   │       ├── raw/pumpe.crt      # Pi-Cert (gepinnt)
│   │   │       └── xml/network_security_config.xml
│   │   ├── public/                    # Icons, Manifest, Service Worker
│   │   ├── capacitor.config.ts
│   │   └── next.config.mjs
│   └── ops/
│       ├── setup.sh                   # Erstinstallation auf Pi
│       ├── systemd/
│       │   ├── pumpe-backend.service
│       │   ├── pumpe-frontend.service
│       │   └── pumpe-ota.timer
│       ├── nginx/pumpe.conf           # HTTPS + APK-Location
│       └── ota/update.sh              # GitHub Releases → install
├── .github/workflows/pi-release.yml   # CI/CD Release-Build
├── DEPLOYMENT.md                      # Schnell-Deploy-Workflow (Dev)
├── OTA-UPDATE-SYSTEM.md               # OTA-Pfad (Stable Releases)
├── STATUS.md                          # Aktueller Projektstand
├── TODO.md                            # Arbeitsliste
├── CLAUDE.md                          # Anleitung für Claude Code
└── V20_MODBUS_REGISTER.md             # V20-Registertabelle
```

---

## 3. Komponenten im Detail

### 3.1 Backend (FastAPI)

**Loops** (alle parallel im `main.py`):

| Loop | Frequenz | Zweck |
|---|---|---|
| `pressure_ctrl_loop` | 500 ms | PI-Druckregelung, V20-Ansteuerung |
| `modbus_rtu_loop` | 500 ms | V20 lesen (Frequenz, Strom, Status) |
| `modbus_tcp_loop` | (passiv) | LOGO schreibt Sensordaten Reg 2–4 |
| `irrigation_loop` | 5 s | Bewässerungs-Tick (`tick()`), Auto-Start, Flow-Integration |
| `mqtt_loop` | 1 s | Publish State, Subscribe Cmd |
| `weather_refresh_loop` | 60 min | OWM + Ecowitt Daten holen |
| `ws_broadcast` | 1 s | State an verbundene Browser senden |

**Bewässerungs-Engine (`irrigation.py`):**

- `evaluate_program(program)` → entscheidet ob Lauf erlaubt (Wetter, Defizit, Sperrzeit)
- `run_program(id, manual=False, duration_min=None)` → startet Programm
- `tick()` (alle 5s) → Hintergrund-Auto-Start zur Programm-Startzeit, Flow-Sampling, Zonen-Wechsel
- `_finish_run(result)` → schreibt `applied_mm` ins Defizit (sensorbasiert wenn Fläche+Liter vorhanden, sonst theoretisch)

**Wetter-Logik (Hydrawise-Stil):**
```
Regen-Credit = rain_24h_mm + 0.7 × forecast_48h_mm
Defizit_eff (pro Zone) = deficit_mm - Regen-Credit
Wenn Defizit_eff < min_deficit_mm × Slider-Faktor → Skip
Sonst Smart-ET-Lauf mit reduzierter Laufzeit
```

### 3.2 Frontend (Next.js 15)

- **App Router** + Server Components (statisch prerendered, hydratisiert client-side)
- **WebSocket** (`/ws`) für Live-State (1 Hz)
- **PWA-Setup** über `@ducanh2912/next-pwa` mit Workbox-Service-Worker
- **Theme** über `data-theme="light|dark"` auf `<html>`, gesteuert von `theme-provider.tsx` mit System-Auto-Detection
- **TopBar** zeigt Live-Druck/Durchfluss/Hz + aktives Preset (kompakt für Mobile)

### 3.3 Android-App (Capacitor)

- **Modus:** Remote-URL-Wrapper. Lädt UI live von `https://pumpe.local`
- **Cert-Pinning:** Self-Signed-Cert in `android/app/src/main/res/raw/pumpe.crt` als Trust-Anchor
- **Auto-Update der UI:** Service Worker zieht neue Builds beim nächsten Start — keine APK-Updates nötig solange nichts Natives geändert wird
- **APK-Distribution:** `https://pumpe.local/pumpe.apk` (nginx alias auf `/var/www/pumpe/downloads/pumpe.apk`)

### 3.4 OTA-System

- Release-Tag (`vX.Y.Z`) → GitHub Actions baut signierten Tarball
- Pi-OTA-Timer (≤60 min) prüft GitHub API, lädt + verifiziert (minisign), installiert
- Symlink `/opt/pumpe/current` zeigt auf aktive Version
- Details: [OTA-UPDATE-SYSTEM.md](OTA-UPDATE-SYSTEM.md)

### 3.5 Direkt-Deploy (Entwicklung)

- `npm run build` lokal → Tar von `.next/standalone` + `.next/static` + `public`
- `scp` auf Pi → entpacken in `/opt/pumpe/current/frontend/.next/standalone/`
- Backend: `scp` einzelner `.py`-Dateien + `systemctl restart pumpe-backend`
- Details: [DEPLOYMENT.md](DEPLOYMENT.md)

---

## 4. Modbus

| Bus | Rolle | Verbindung |
|---|---|---|
| RTU (Pi → V20) | Master | `/dev/ttyAMA0`, 9600 bps, 8N1, MAX13487 RS-485 Treiber, Slave-Adresse 1 |
| TCP (LOGO → Pi) | Server (Pi) | Port 502, LOGO schreibt Sensordaten in Register 2–4 |

**V20 Steuerwort:**
- `0x047F` = Start
- `0x047E` = Stop
- `0x04FE` = Fault Reset

Vollständige Registertabelle: [V20_MODBUS_REGISTER.md](V20_MODBUS_REGISTER.md)

---

## 5. Secrets & Credentials

ENV-Variablen in `/opt/pumpe/current/backend/.env` (aus `.env.example` ableiten):

```env
MQTT_BROKER=192.168.1.136
MQTT_PORT=1883
MQTT_USER=<mqtt-user>
MQTT_PASS=<mqtt-password>
RTU_PORT=/dev/ttyAMA0
TZ=Europe/Berlin
OWM_API_KEY=<openweathermap-api-key>
ECOWITT_HOST=<lokale-ecowitt-station-ip>
```

**GitHub-Token für OTA** (für privates Repo):
- `/opt/pumpe/ota/.github_token` (chmod 600, Fine-Grained Token mit `Contents: Read-only`)
- Konfig in `/opt/pumpe/ota/config.env`: `GITHUB_TOKEN_FILE=/opt/pumpe/ota/.github_token`

---

## 6. Bekannte Fehler & Lösungen

| Problem | Ursache | Lösung |
|---|---|---|
| `pymodbus ImportError ModbusSlaveContext` | pymodbus 3.7+ hat Klasse entfernt | `pyproject.toml`: `pymodbus>=3.6,<3.7` |
| `npm ci` schlägt fehl (kein lockfile) | `package-lock.json` fehlt | `npm install --package-lock-only --legacy-peer-deps` und committen |
| NodeSource vs Debian npm Konflikt | `libnode108` Kollision | NodeSource-Repo VOR `apt install` einrichten; kein separates `npm`-Paket |
| RTU "No response" | A/B-Leitungen vertauscht / kein gemeinsames GND | Pin-Tausch + dediziertes GND-Kabel |
| Durchfluss zeigt 2 L/min bei Stillstand | Sensor-Rauschen unter Messbereich | Threshold 5 L/min in `modbus_tcp.py` |
| LOGO schreibt Sensordaten nicht | Register 0+1 (STW/HSW) werden vom Pi nicht verarbeitet | V20-Steuerung über RTU/MQTT — LOGO nur für Sensor-Register 2–4 |
| Frontend-Deploy zeigt alten Inhalt | `.next/standalone/` nicht geleert | `sudo rm -rf .../.next/standalone` vor `tar xzf` (siehe DEPLOYMENT.md) |
| App auf Handy zeigt alte UI | Service-Worker-Cache | App komplett aus Switcher wegwischen + neu öffnen |
