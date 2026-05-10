# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projekt-Kontext

Pumpensteuerung für eine Brunnenwasseranlage. Ein Raspberry Pi 3B+ übernimmt die gesamte Steuerungslogik:
- liest per **Modbus RTU** (MAX13487 RS-485) einen Siemens Simatic V20 Frequenzumrichter aus
- empfängt Sensordaten (Druck, Durchfluss, Wassertemperatur) per **Modbus TCP** von einer Siemens LOGO 8.4 SPS
- steuert intelligente Bewässerungsprogramme mit Wetter-Integration
- publiziert Zustandsdaten per MQTT an Home Assistant

## Repo-Struktur

```
modbus_logo/
└── pi/
    ├── backend/        → Python FastAPI (Modbus, MQTT, REST, WebSocket)
    ├── frontend/       → Next.js 15 Dashboard (App Router)
    └── ops/
        ├── setup.sh    → Erstinstallation auf Raspbian Bookworm Lite
        ├── systemd/    → pumpe-backend.service, pumpe-frontend.service, pumpe-ota.timer
        ├── nginx/      → HTTPS Reverse Proxy (Self-Signed TLS)
        └── ota/        → update.sh (GitHub Releases → signierter Tarball)
```

## Entwicklungs-Befehle

### Backend (Python FastAPI)

```bash
cd pi/backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
```

### Frontend (Next.js)

```bash
cd pi/frontend
npm install
npm run dev        # Dev-Server auf :3000
npm run build      # Produktions-Build (standalone)
```

### OTA-Release auslösen

```bash
git tag v1.2.3
git push origin v1.2.3
# → GitHub Actions (pi-release.yml) baut Tarball + signiert mit minisign
# → Pi pullt beim nächsten Timer-Tick (≤60 min) automatisch
```

## Architektur

```
Browser (HTTPS :443)
  └─ nginx ──→ /          → Next.js :3001 (SSR/Static)
            ──→ /ws       → FastAPI :8000 (WebSocket, 1Hz State-Broadcast)
            ──→ /api      → FastAPI :8000 (REST)

FastAPI ──RTU──→ V20 Frequenzumrichter (500ms Takt)
        ←─TCP──  LOGO 8.4 SPS (schreibt Sensor-Register 2–4)
        ──MQTT─→ Broker 192.168.1.136:1883 ←→ Home Assistant
```

**Backend-Module (`pi/backend/app/`):**

| Datei | Zweck |
|-------|-------|
| `main.py` | Haupteinstieg, startet alle Loops |
| `state.py` | Gemeinsamer AppState (Pydantic) |
| `modbus_rtu.py` | RTU-Client → V20 (pymodbus 3.6.x) |
| `modbus_tcp.py` | TCP-Server ← LOGO (Port 502) |
| `pressure_ctrl.py` | PI-Druckregelung (500ms Takt, Anti-Windup) |
| `irrigation.py` | Bewässerungsprogramme + Wetter-ET0-Logik |
| `presets.py` | Preset-Verwaltung |
| `mqtt_client.py` | MQTT subscribe/publish, HA-Integration |
| `timeguard.py` | Wochenschaltuhr (Europe/Berlin) |
| `api/routes.py` | FastAPI REST `/api/*` |
| `ws.py` | WebSocket-Broadcast |

## Secrets und Credentials

ENV-Variablen in `/opt/pumpe/current/backend/.env` (aus `.env.example` ableiten):
```
MQTT_BROKER=192.168.1.136
MQTT_PORT=1883
MQTT_USER=<mqtt-user>
MQTT_PASS=<mqtt-password>
RTU_PORT=/dev/ttyAMA0
TZ=Europe/Berlin
```

## CI/CD

Es gibt **zwei** Deploy-Pfade:

**1. Direkt-Deploy (Entwicklung)** — siehe [DEPLOYMENT.md](DEPLOYMENT.md)
   - Lokal `npm run build`, dann tar + scp + entpacken in `/opt/pumpe/current/frontend/.next/standalone/`
   - Backend: einzelne `.py`-Dateien per `scp` + `systemctl restart pumpe-backend`
   - **Wichtig:** Standalone-Verzeichnis vor dem Entpacken **immer** mit `rm -rf` leeren — sonst zeigt der Service alte Builds.

**2. OTA-Release (Stable)** — siehe [OTA-UPDATE-SYSTEM.md](OTA-UPDATE-SYSTEM.md)
```
git push vX.Y.Z → GitHub Actions (pi-release.yml)
    → Next.js standalone build
    → Python requirements.txt generieren
    → pumpe-vX.Y.Z.tar.gz + .sha256 + .minisig
    → GitHub Release Assets
        ↓
    Pi OTA-Timer (≤60 min) → update.sh → verify + install + restart
```

## Android-App (Capacitor)

Die App ist ein **Wrapper im Remote-URL-Modus** — sie lädt UI live von `https://pumpe.local`. UI-Änderungen brauchen **keine** neue APK; der Service Worker zieht den neuen Build beim nächsten App-Start.

- APK-Distribution: `https://pumpe.local/pumpe.apk` (nginx-Alias auf `/var/www/pumpe/downloads/pumpe.apk`)
- Cert-Pinning: Pi-Cert ist in `pi/frontend/android/app/src/main/res/raw/pumpe.crt` eingebettet
- Bei Cert-Wechsel auf dem Pi muss die APK neu gebaut werden — siehe DEPLOYMENT.md

## Bewässerungs-Modell

Aktuelles Verhalten (seit Mai 2026):

- **Automatik = Hintergrund.** Programm startet täglich zu seiner `start_hour:start_min`-Zeit, sofern Wetter+Defizit es zulassen. Kein manueller "Start"-Button auf dem Dashboard.
- **Manuell = Knopf.** Im Dashboard "Manuell N min" startet einen einzelnen Lauf mit fester Dauer. Wird bei aktiver Automatik blockiert (User muss bewusst "Stoppen" drücken).
- **Sperren** (`blocked_days`, `blocked_window` pro Programm) gelten **nur für Automatik**. Manuell ist jederzeit möglich (außer Safety-Block).
- **Defizit-Update**:
  - Theoretisch aus `precipitation_mm_per_h × duration` (Fallback)
  - Sensorbasiert aus `flow_rate × Zeit / area_m²`, geclamped auf 0.5×–2× theoretisch (gegen Sensor-Anomalien)
  - Bei vorzeitigem Stop: proportional
- **Wetter-Logik** (Hydrawise-Stil):
  - `Regen-Credit = rain_24h_mm + 0.7 × forecast_48h_mm` wird vom Defizit abgezogen
  - Skip nur bei akutem Regen heute (`forecast_24h_mm ≥ skip_rain_mm`)
  - Sonst reduzierte Laufzeit statt komplett aussetzen
- **Frequenz-Slider** pro Zone skaliert effektives `min_deficit_mm` mit Faktor 0.4 (häufig) bis 2.0 (selten).

## Architektur-Notizen für Code-Änderungen

- **`days`** im Programm-Schema gibt es **nicht mehr** — verwende `blocked_days` (true = nicht bewässern).
- **Bei Schema-Änderungen in `irrigation.py`** immer auch `_normalize_program()` und `_normalize_zone()` mit Defaults erweitern, sonst crash beim Laden alter JSON.
- **TopBar-Layout** ist bewusst minimalistisch (Druck/L-min/Hz + Preset). Theme-Toggle ist in Settings → System.
- **ESP32-Code wurde aus dem Repo entfernt.** Frühere `src/`, `platformio.ini`, `partitions.csv` etc. existieren nicht mehr.

## Bekannte Fehler & Lösungen

| Problem | Ursache | Lösung |
|---------|---------|--------|
| pymodbus ImportError ModbusSlaveContext | pymodbus 3.7 hat ModbusSlaveContext entfernt | `pyproject.toml`: `pymodbus>=3.6,<3.7` |
| npm ci schlägt fehl (kein lockfile) | package-lock.json fehlte | `npm install --package-lock-only --legacy-peer-deps` lokal ausführen und committen |
| NodeSource npm vs Debian npm Konflikt | libnode108 Kollision | NodeSource-Repo VOR apt-get install einrichten; kein separates `npm`-Paket installieren |
| RTU "No response" | A/B-Leitungen vertauscht + kein separates GND | TX/RX tauschen + dediziertes GND-Kabel |
| Durchfluss zeigt 2 L/min bei Stillstand | Sensor-Rauschen unterhalb Messbereich | Threshold 5 L/min in `modbus_tcp.py` |
| LOGO schreibt Sensordaten nicht | Register 0+1 (STW/HSW) werden vom Pi nicht verarbeitet | V20-Steuerung über MQTT/RTU — LOGO nur für Sensor-Register 2–4 |

## Modbus

- **RTU (Pi → V20):** `/dev/ttyAMA0`, 9600 bps, 8N1, Slave-Adresse 1
- **TCP (LOGO → Pi):** Pi ist Server auf Port 502, LOGO schreibt Sensordaten in Register 2–4
- V20 Steuerwort: `0x047F` = Start, `0x047E` = Stop, `0x04FE` = Fault Reset

Vollständige Registertabelle: `V20_MODBUS_REGISTER.md`
