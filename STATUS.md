# Projektstand — Migration auf Pi 3B+ Solo-Brain

Stand: 2026-05-01

## Ziel

Pumpensteuerung **und** smarte Bewässerung laufen auf einem Raspberry Pi 3B+
als alleinigem "Gehirn". Kein Docker, kein Heimserver, kein Home-Assistant
als Pflicht-Abhängigkeit. HA bleibt **optional** über den bestehenden
MQTT-Broker `192.168.1.136:1883` angebunden. Der Bewässerungsautomat ist
ausschließlich lokal verfügbar, Updates per OTA aus GitHub-Releases.

Phase 1 (jetzt umgesetzt): LOGO bleibt für analoge Sensoren, Pi spricht V20
direkt via TTL-RS485-Adapter am Pi-UART. Phase 2 (später): NORVI IIOT-AE02-I
ersetzt LOGO+ESP32 vollständig.

## Was umgesetzt ist

### Backend ([pi/backend/](pi/backend/))

Komplett-Rewrite in Python (FastAPI + pymodbus + paho-mqtt + APScheduler).
1:1-Port der Logik aus dem alten Docker-Backend mit identischen Tunings.

| Modul | Inhalt |
|---|---|
| [app/main.py](pi/backend/app/main.py) | FastAPI-Lifespan, asyncio-Loops (PI 500 ms, RTU slow 2 s, Timeguard 10 s, Irrigation 5 s, MQTT-Publish 2 s, Pressure-Log 5 s, WS-Broadcast 1 s) |
| [app/state.py](pi/backend/app/state.py) | Pydantic-State (Singleton `app_state`), Port von `state.js` |
| [app/config.py](pi/backend/app/config.py) | `.env`-Settings: MQTT, RTU, TCP, Pfade |
| [app/persistence.py](pi/backend/app/persistence.py) | Atomic-JSON-Schreib/Lese-Layer kompatibel zum alten `/data`-Layout |
| [app/storage.py](pi/backend/app/storage.py) | **SQLite**: Bewässerungs-History + Druck/Flow/Hz-Time-Series. Retention 30 Tage / 5000 Einträge. WAL-Mode. |
| [app/pressure_ctrl.py](pi/backend/app/pressure_ctrl.py) | **PI-Druckregler 1:1 aus `pressureCtrl.js`**: Kp=8, Ki=1, Anti-Windup, Trockenlauf-Lock+Grace+Retries, Spike-Detect 0.4 bar/3 s, Min-Freq-Timeout, Druck-Timeout, Fix-Hz-Modus |
| [app/timeguard.py](pi/backend/app/timeguard.py) | Wochenschaltuhr, zoneinfo Europe/Berlin |
| [app/presets.py](pi/backend/app/presets.py) | Preset-Verwaltung (Druck/Durchfluss/FixHz), max 20, Default "Normal" |
| [app/irrigation.py](pi/backend/app/irrigation.py) | ET0-Bewässerung: Wetter-Schwellen, Wasserbilanz, Smart-ET, Wochenlimit, Zonen-Cycle, History → SQLite |
| [app/modbus_rtu.py](pi/backend/app/modbus_rtu.py) | V20-Master via USB-RS485 oder TTL-Adapter am Pi-UART. Polling 500 ms (Status/Hz) + 2 s (U/I/P/Fault) |
| [app/modbus_tcp.py](pi/backend/app/modbus_tcp.py) | TCP-Server :502 — LOGO schreibt Sensorwerte in Reg 2/3/4 |
| [app/mqtt_client.py](pi/backend/app/mqtt_client.py) | paho-mqtt → bestehender Broker `192.168.1.136:1883`. Topic-Schema unverändert (`pumpensteuerung/raw/**`, `cmd/**`). Reconnect mit Republish. |
| [app/ha_discovery.py](pi/backend/app/ha_discovery.py) | **Auto-Discovery** — V20, Druck/Flow/Wassertemp, PI-Tunings, Zeitfenster, Spike-Settings, Lüfter, Bewässerung, Presets-Select. Wird bei jedem MQTT-Connect gefeuert. |
| [app/ws.py](pi/backend/app/ws.py) | WebSocket `/ws` — broadcasted vollen State 1 Hz |
| [app/api/routes.py](pi/backend/app/api/routes.py) | REST: `/api/v20/{start,stop,reset,freq}`, `/api/pressure`, `/api/timeguard`, `/api/presets`, `/api/preset/apply`, `/api/vacation/set`, `/api/irrigation/*`, `/api/history/pressure` (mit Bucket-Aggregation) |

**MQTT-Broker bleibt der bestehende** `192.168.1.136:1883` — kein lokaler
Mosquitto auf dem Pi.

### Frontend ([pi/frontend/](pi/frontend/))

Next.js 15 + React 19 + Tailwind + shadcn-Style. Standalone-Build, läuft als
systemd-Service hinter nginx.

| Datei/Bereich | Inhalt |
|---|---|
| [app/layout.tsx](pi/frontend/app/layout.tsx) + [components/top-bar](pi/frontend/components/top-bar.tsx) + [bottom-nav](pi/frontend/components/bottom-nav.tsx) | App-Shell, Mode-Badge (AUTO/MANUELL/FEHLER), WLAN/MQTT-Indikator, Mobile-Bottom-Nav |
| [lib/ws.tsx](pi/frontend/lib/ws.tsx) | WebSocket-Provider mit Auto-Reconnect, leitet Mode + Warnungen aus dem State ab |
| [lib/api.ts](pi/frontend/lib/api.ts) | Typisierter REST-Client |
| [components/{kpi-card, zone-card, status-badge, hold-button, warning-list, section}](pi/frontend/components/) | Wiederverwendbare Komponenten. HoldButton: 1.5 s Long-Press mit Progress-Ring |
| [app/dashboard](pi/frontend/app/dashboard/page.tsx) | KPI Druck/Durchfluss/Hz (Tabular-Nums, Industrie-HMI-Stil), Pumpenstatus + Hold-Start, drei Zonen-Karten, Warnungsliste |
| [app/control](pi/frontend/app/control/page.tsx) | Manuelle V20-Steuerung, Hz-Slider, Programm-Start/Stop |
| [app/zones](pi/frontend/app/zones/page.tsx) | Wetter+ET0, alle Zonen mit Bodenfeuchte/Defizit/Laufzeit |
| [app/analytics](pi/frontend/app/analytics/page.tsx) | **Echte historische Charts** aus SQLite (1 h / 6 h / 24 h / 7 T), Bewässerungs-Historie |
| [app/settings](pi/frontend/app/settings/page.tsx) | PI-Tunings, Zeitfenster, Presets, Urlaubsmodus, Systeminfo |

**Theme strikt nach Spec**: Hintergrund #ffffff, Primär #2588eb, OK #14c957,
Warn #ffa000, Fehler #ff0000. Touch-Targets ≥48 px, deutsche UI-Strings.

### Ops ([pi/ops/](pi/ops/) + [.github/workflows/](.github/workflows/))

| Datei | Zweck |
|---|---|
| [systemd/pumpe-backend.service](pi/ops/systemd/pumpe-backend.service) | uvicorn als systemd-Unit, dialout-Gruppe für `/dev/ttyAMA0`, `CAP_NET_BIND_SERVICE` für Port 502 |
| [systemd/pumpe-frontend.service](pi/ops/systemd/pumpe-frontend.service) | Next.js standalone als systemd-Unit |
| [systemd/pumpe-ota.{timer,service}](pi/ops/systemd/) | OTA-Check alle 60 min |
| [nginx/pumpe.conf](pi/ops/nginx/pumpe.conf) | TLS-Termination, `/api`+`/ws` → Backend, `/` → Next.js |
| [ota/update.sh](pi/ops/ota/update.sh) | Pull GitHub-Release, minisign-Verify, atomarer Symlink-Swap, Smoke-Test, Rollback |
| [setup.sh](pi/ops/setup.sh) | Erstinstallation: Pakete, User, UART-Konfig, Erst-Build aus Repo, nginx, TLS, Services |
| [.github/workflows/pi-release.yml](.github/workflows/pi-release.yml) | Tag-Push → Backend+Frontend bauen → minisign-signiertes Tarball ans Release |

## Was funktioniert (sobald deployed)

- V20 direkt via Modbus-RTU steuern (Start/Stop/Reset/Sollfrequenz)
- LOGO-Sensoren via Modbus-TCP entgegennehmen
- PI-Druckregelung mit allen Schutzmechanismen
- Wochenschaltuhr Europe/Berlin
- Presets (Druck/Durchfluss/FixHz)
- Smart-ET-Bewässerung mit Wetter+Wasserbilanz
- HA-Auto-Discovery — alle Entitäten erscheinen automatisch
- REST-API + WebSocket fürs Frontend
- Echte Druck/Flow/Hz-Historie 30 Tage in SQLite, Charts in `/analytics`
- Bewässerungs-Historie 5000 Einträge in SQLite
- OTA-Updates aus GitHub-Releases mit minisign-Verifizierung und Rollback

## Datenpersistenz auf dem Pi

```
/var/lib/pumpe/
├── data/                          # JSON-Configs (kompatibel zu alten /data)
│   ├── pressure_ctrl.json
│   ├── timeguard.json
│   ├── presets.json
│   ├── irrigation_programs.json
│   └── irrigation_weather.json
└── state.db                       # SQLite — Druckhistorie + Bewässerungs-History
```

JSON-Bestand vom alten Docker-Backend lässt sich per `scp` 1:1 übernehmen.
Beim ersten Start migriert das Backend `irrigation_history.json` automatisch
in die SQLite-Tabelle.

## Was noch offen ist

### Hard nötig vor Inbetriebnahme

| Aufgabe | Aufwand |
|---|---|
| **TTL-Adapter vom ESP32 abstecken und an Pi GPIO 14/15 verkabeln** | 5 min, siehe [INSTALL.md](INSTALL.md) |
| **Pi 3B+ aufsetzen** (Raspbian Bookworm Lite, statische IP, SSH) | 20 min |
| **`bash pi/ops/setup.sh`** ausführen (baut Erst-Release lokal) | 15 min, davon ~10 min `npm run build` auf dem Pi |
| **`.env` füllen** (MQTT-Credentials aus dem alten ESP32 oder Heimserver) | 2 min |
| **LOGO Modbus-TCP-Ziel-IP** im LOGO-Soft Comfort von ESP32-IP auf Pi-IP umstellen | 5 min |
| **Reboot** damit die UART-Umschaltung greift | 1 min |

### Nice-to-have (kann später)

- **Auth-Layer** ([app/auth.py](pi/backend/app/auth.py) folgt) — PBKDF2-SHA512 Login wie im alten Backend, erzwungener Passwortwechsel beim ersten Login. Bis dahin: nginx auf LAN beschränken (`ufw allow from 192.168.0.0/16 to 443`).
- **Preset-CRUD-UI** im Frontend (aktuell nur "anwenden" — Erstellen/Editieren über REST `/api/presets`).
- **Aufräumen alte Codebase**: Wenn Pi stabil läuft, alten Docker-Stack auf Heimserver stoppen+entfernen, ESP32-V20-RTU-Code in [src/modbus_v20.cpp](src/modbus_v20.cpp) entfernen oder ESP32 als Sub-Node für Lüfter+DS18B20 weiterlaufen lassen.
- **Phase 2: NORVI IIOT-AE02-I-Migration** — LOGO ersetzen, Druck/Flow/Wassertemp direkt am NORVI 4–20 mA. Backend bleibt unverändert, nur Sensor-Quellen-Konfiguration in `modbus_*.py` umstellen.

## Migration-Reihenfolge (Empfehlung)

1. Pi parallel zum bestehenden System aufsetzen (anderer IP)
2. **Trockentest ohne LOGO-Umkonfiguration**: Pi spricht V20, aber LOGO schreibt weiter zum ESP32. → Pi-Backend-Logs prüfen, RTU-Verbindung testet sich selbst.
3. **Erst dann LOGO umschwenken**: in LOGO-Soft Comfort die TCP-Ziel-IP auf Pi ändern. Sensoren erscheinen jetzt auf dem Pi.
4. **ESP32 stilllegen** (Stromversorgung trennen) oder als reinen Lüfter-Sub-Node weiterlaufen lassen.
5. **Eine Woche parallel zum alten Stack**: Watchtower auf Heimserver pausieren, alten Backend-Container stoppen aber **nicht löschen** (Schnell-Rollback wenn nötig).
6. **Endabnahme**: Trockenlaufschutz manuell auslösen, PI-Regelung beobachten, Spike-Detect mit Schlauchventil testen, alte Backend-Container final entfernen.

## Bekannte Risiken

- **Galvanische Trennung fehlt** beim TTL-Adapter direkt am Pi-UART — bei einem V20-Erdfehler kann der Pi sterben. Übergangslösung. Mittelfristig isolierten USB-RS485-Stick (Waveshare USB-to-RS485-B) nachrüsten.
- **Pi 3B+ ist beim Erst-Build von Next.js am Limit** — `npm run build` auf dem Pi dauert 5–10 min und kann RAM-knapp werden. Alternative: Frontend lokal vorbauen und Tarball auf den Pi kopieren (das macht der OTA-Pfad sowieso).
- **Self-Signed-TLS** bedeutet Browser-Warnung bei jedem Erstbesuch. Nicht öffentlich exponieren.
