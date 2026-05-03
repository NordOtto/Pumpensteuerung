# Projektstand - Pumpensteuerung und Bewaesserung

Stand: 2026-05-03

## Zielbild

Die Pumpensteuerung laeuft als lokale Webapp auf dem Raspberry Pi. Der Pi ist
das zentrale System fuer Druckregelung, V20-Ansteuerung, Presets,
Bewaesserungsprogramme, Smart-ET-Empfehlungen, OTA-Updates und die HMI-UI.
Home Assistant bleibt optional ueber MQTT angebunden, ist aber keine harte
Abhaengigkeit fuer die Bedienung.

Aktueller Pi:

| Bereich | Stand |
|---|---|
| Pi-IP | `192.168.1.86` |
| Backend | FastAPI auf `127.0.0.1:8000`, Service `pumpe-backend.service` |
| Frontend | Next.js Standalone auf `127.0.0.1:3001`, Service `pumpe-frontend.service` |
| Aktueller Release-Link | `/opt/pumpe/current` -> `/opt/pumpe/releases/b4b0c56-main` |
| OTA-Repo | `NordOtto/Pumpensteuerung` |

## Zuletzt umgesetzt

### UI-Redesign

- Dashboard-Leitstand entfernt, weil die Werte bereits in der UI vorhanden sind.
- Helle Webapp/HMI-Oberflaeche eingefuehrt:
  - Tailwind-Glassmorphism mit `bg-white/75`, `backdrop-blur`, feinen Borders,
    weichen Schatten und leichten Verlaeufen.
  - Framer-Motion fuer Seiteneinstieg, Karten und Guide-Wechsel.
  - App-Shell mit modernerem Profi-Look statt generischem Dashboard.
- Bestehende Bereiche optisch aufgewertet statt neue doppelte Top-Metriken
  einzubauen.
- OTA-Log darf als funktionale dunkle Konsole bleiben; normale UI-Flaechen sind
  hell gehalten.

Wichtiger Commit:

- `3feb4f1 feat: redesign pump ui shell`

### Smart-ET-Guide

- Dunklen Smart-ET-Assistenten durch hellen gefuehrten Guide ersetzt.
- Guide fuehrt in vier Schritten:
  1. Nutzung und Preset
  2. Boden und Sonne
  3. Messwerte
  4. Empfehlung pruefen und uebernehmen
- Empfehlung wird in das aktuell geoeffnete Programm uebernommen.
- Live-Status-Updates ueberschreiben lokale, noch nicht gespeicherte
  Programmaenderungen nicht mehr.
- Umschalten von `fixed` auf `smart_et` bleibt nun erhalten.
- Messfelder umbenannt:
  - `Test-mm` -> `Gemessene Regenhoehe mm`
  - `Test-min` -> `Testdauer min`
  - zusaetzlich wird die berechnete Rate in `mm/h` gezeigt.

Wichtige Commits:

- `e63df02 fix: keep program edits during live updates`
- `0abfd9b chore: clarify irrigation wizard measurement labels`

### Smart-ET und Tiefenbewaesserung

- Rasen-Profil realistischer gemacht:
  - Ziel grob 25 mm pro Bewaesserung.
  - Mindestdefizit grob 16 mm.
  - Bei voller Sonne/Stress bis ca. 30 mm Ziel und 19.2 mm Mindestdefizit.
- Lange Bewaesserung mit Cycle-and-Soak ergaenzt:
  - Zonen koennen in Beregnungsbloecke und Sickerpausen aufgeteilt werden.
  - Beispiel: 12 min beregnen, 25 min sickern, dann naechster Block.
  - Backend stoppt waehrend der Sickerpause Zone und Pumpe, danach laeuft die
    Zone weiter.
- ZoneEditor hat Felder fuer `Beregnungsblock min` und `Sickerpause min`.

Wichtiger Commit:

- `dbb2ef5 feat: add deep watering cycle soak`

### Hahnmodus und Presets

- Neuer Preset-Modus `3`: Hahnmodus.
- Hahnmodus ist als Standard gedacht fuer Wasserhahn, Schlauchtrommel,
  Giesskanne und spontane Entnahme.
- Hahnmodus regelt nicht per PI, sondern arbeitet mit:
  - Einschaltdruck `p_on`
  - Ausschaltdruck `p_off`
  - fester Drehzahl in Hz
- Beispiel auf dem Pi gesetzt:
  - `Normal` als Hahnmodus
  - `p_on=2.2`
  - `p_off=3.7`
  - `setpoint_hz=45`
- Bewaesserungsmodi koennen weiterhin fuer Rasen, Tropfschlauch, Pool usw.
  eigene Presets mit PI-Regelung oder Fix-Hz nutzen.
- Presets sind jetzt im Zonen-Editor sichtbar; eigene Presets koennen einer Zone
  zugewiesen werden.
- Hahnmodus-Preset zeigt Ein-/Ausschaltdruck im Preset-Manager.
- Zahlenfelder lassen sich wieder normal bearbeiten, ohne haengende fuehrende
  Null.

Wichtige Commits:

- `f40c1f7 feat: add tap pressure preset mode`
- `8154fc1 fix: share preset list with zone editor`
- `de1a44b fix: allow editing numeric fields naturally`
- `a33fb96 feat: configure tap pressure per preset`

### OTA und Versionierung

- OTA-Konfiguration auf das korrekte Release-Repo gesetzt:
  - `GITHUB_REPO=NordOtto/Pumpensteuerung`
- Pi-Konfiguration unter `/opt/pumpe/ota/config.env` entsprechend korrigiert.
- OTA-Check konnte danach Release-Info laden und meldete den aktuellen Release.

Wichtiger Commit:

- `50fa271 fix: point ota config to release repo`

Wichtig: Der direkte Pi-Deploy wurde zuletzt mehrfach per Datei-/Build-Kopie
gemacht. Das funktioniert fuer schnelle Tests, ersetzt aber noch keinen sauber
getaggten OTA-Release mit aktuellem Stand.

### Programm-Speichern

- Fehler `422 Field required body.body` beim Speichern von
  Bewaesserungsprogrammen behoben.
- Ursache: FastAPI interpretierte den Endpoint so, als muesste ein JSON-Feld
  `body` existieren. Das Frontend sendet aber korrekt `{ "programs": [...] }`.
- Backend-Endpoint nimmt nun den kompletten JSON-Body direkt an.
- Auf dem Pi deployed, Backend neu gestartet und direkt gegen
  `127.0.0.1:8000/api/irrigation/programs` getestet:
  - Programme lesen: OK
  - Programme speichern: `200 OK`

Wichtiger Commit:

- `829d80b fix: accept irrigation program save body`

### Dashboard-Bewaesserungssteuerung

- Hauptseite hat jetzt eine kompakte Bewaesserungs-Karte statt nur einzelner
  Schnellstart-Karten.
- Programme koennen direkt auf dem Dashboard gewaehlt werden.
- Zwei Startarten sind sichtbar getrennt:
  - `Automatik jetzt`: nutzt Wetter, ET, Defizit und Wochenlimit.
  - `Manuell X min`: uebergeht Wetterpruefung und nutzt die eingestellte
    Laufzeit.
- Manuelle Laufzeit hat Schnellwerte und ein Minutenfeld.
- Stop-Button stoppt die aktive Bewaesserung.
- Waerend eines Laufs zeigt das Dashboard:
  - manuell oder automatisch gestartet
  - aktives Programm
  - aktive Zone
  - Lauf-/Sickerphase
  - aktives Zonen-Preset
  - Restzeit gesamt und aktueller Schritt
- Backend liefert diese Laufstatus-Felder im WebSocket-State.
- Nach Bewaesserungsende wird automatisch wieder das Rueckfall-Preset `Normal`
  aktiviert, damit der Hahnmodus wieder Standard ist.

Wichtiger Commit:

- `70ed4ca feat: add dashboard irrigation controls`

### Bedienlogik bereinigt

- Hauptseite ist jetzt der zentrale Bedienort.
- Live-Werte stehen oben nebeneinander.
- Pumpensteuerung steht direkt unter den Live-Werten.
- Pumpensteuerung hat einen dynamischen Hauptbutton:
  - `Pumpe starten`, wenn sie aus ist.
  - `Pumpe stoppen`, wenn sie laeuft.
- `FU Reset` wird nur bei FU-Fehler angezeigt.
- Die aktive Programmuebersicht wird nur waehrend einer laufenden
  Bewaesserung angezeigt.
- `Steuerung` wurde aus der Navigation entfernt.
- `/control` leitet auf `/dashboard` weiter.
- Start/Stop-Buttons wurden von der Zonenseite entfernt; Zonen ist jetzt
  Uebersicht/Diagnose.

Wichtiger Commit:

- `a13c843 refactor: centralize dashboard controls`

### Mobile Dashboard anpassbar

- Hauptseite ist jetzt mobile-first gedacht; Desktop ist nur sekundaere
  Darstellung.
- Dashboard-Bereiche sind einklappbar.
- Dashboard-Bereiche koennen per Drag-and-Drop verschoben werden.
- Reihenfolge und Einklappstatus werden lokal im Browser gespeichert.

Wichtiger Commit:

- `afd4a5e feat: make dashboard panels reorderable`

## Was aktuell funktioniert

- Webapp auf dem Pi laeuft.
- Backend-Service laeuft.
- Frontend-Service laeuft.
- Druck-/Pumpenstatus wird ueber WebSocket in der UI angezeigt.
- Presets lassen sich verwalten und anwenden.
- Zonen koennen Presets aus der Preset-Liste verwenden.
- Hahnmodus kann als normaler Standard-Pumpenmodus genutzt werden.
- Bewaesserungsprogramme koennen gespeichert werden.
- Bewaesserung kann auf der Hauptseite automatisch oder manuell mit Minutenwert
  gestartet und gestoppt werden.
- Aktive Bewaesserung zeigt Restzeit, Zone, Phase und Startart.
- Pumpenstart/-stop und Bewaesserungsstart/-stop sind nur noch auf der
  Hauptseite bedienbar.
- Zonenseite ist eine reine Uebersicht.
- Smart-ET-Guide kann Empfehlungen erzeugen und ins geoeffnete Programm
  uebernehmen.
- Cycle-and-Soak ist im Backend und in der UI konfigurierbar.
- OTA-Check kann Release-Info laden.

## Wichtige Dateien

| Datei | Zweck |
|---|---|
| `pi/backend/app/pressure_ctrl.py` | Druckregelung, PI-Regler, Hahnmodus, Schutzlogik |
| `pi/backend/app/presets.py` | Preset-Verwaltung und Preset-Normalisierung |
| `pi/backend/app/irrigation.py` | Programme, Zonen, Smart-ET-Entscheidung, Cycle-and-Soak |
| `pi/backend/app/irrigation_wizard.py` | Smart-ET-Empfehlungslogik |
| `pi/backend/app/api/routes.py` | REST-API, inklusive Programmspeichern und OTA |
| `pi/frontend/app/dashboard/page.tsx` | Dashboard/UI-Hauptseite |
| `pi/frontend/app/settings/page.tsx` | Programme, Smart-ET-Guide, Presets, OTA, Settings |
| `pi/frontend/lib/api.ts` | Frontend-REST-Client |
| `pi/frontend/lib/types.ts` | Gemeinsame Frontend-Typen |
| `pi/ops/ota/config.env.example` | Beispielkonfiguration fuer OTA |
| `pi/ops/ota/update.sh` | OTA-Check, Install und Rollback |

## Test- und Deploy-Stand

Lokal zuletzt erfolgreich:

- `npm run typecheck` in `pi/frontend`
- `npm run build` in `pi/frontend`
- Python Compile-Check fuer `pi/backend/app/api/routes.py`

Auf dem Pi zuletzt geprueft:

- `pumpe-frontend.service`: active
- `/settings`: HTTP 200
- `/dashboard`: HTTP 200
- `/zones`: HTTP 200
- `/control`: Redirect 307 auf Dashboard
- `pumpe-backend.service`: active
- `GET /api/irrigation/programs`: OK
- `POST /api/irrigation/programs`: HTTP 200

Hinweis: Lokale Windows-Python-Umgebung ist nicht vollstaendig fuer Backend-Tests
eingerichtet (`fastapi` fehlt dort). Backend-Tests sollten in der Backend-venv
oder auf dem Pi laufen.

## Bekannte offene Punkte

- Aktueller Code ist lokal committed, aber ein sauberer OTA-Release mit den
  neuesten Commits muss noch erstellt und getestet werden.
- Version in der App/Backend-Meldung zeigt noch nicht zwingend die aktuellsten
  lokalen Commits, weil Direktdeploys am Release-System vorbei gingen.
- Smart-ET-Bewaesserung sollte real mit Regenmesser/Messbecher kalibriert
  werden, damit `mm/h` stimmt.
- Cycle-and-Soak muss im echten Betrieb beobachtet werden:
  - Ventile sauber aus?
  - Pumpe waehrend Sickerpause wirklich aus?
  - Home-Assistant/MQTT-Zonen reagieren korrekt auf Start/Stop?
- Hahnmodus-Werte muessen in der Praxis feinjustiert werden, damit die Pumpe
  bei kleiner Entnahme angenehm startet und nicht taktet.
- OTA-Flow braucht noch eine End-to-End-Probe mit neuem Tag und Rollback.
- OTA-Check gegen GitHub liefert aktuell 404 fuer
  `NordOtto/Pumpensteuerung`, obwohl GitHub erreichbar ist. Wahrscheinliche
  Ursache: privates Repo ohne GitHub-Token auf dem Pi.
