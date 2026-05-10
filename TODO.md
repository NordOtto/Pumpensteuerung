# TODO — Pumpensteuerung & Bewässerung

Stand: 2026-05-09

Arbeitsliste für die nächsten Sessions. Erledigtes steht unten als Kontext.

## Sofort prüfen / pflegen

### 1. Zonen-Daten eintragen

Damit die neue **Durchfluss-basierte Defizit-Berechnung** sauber funktioniert, müssen pro Zone in Settings → Programme:

- `Niederschlag mm/h` korrekt setzen (MP-Rotator typ. 10 mm/h, Tropfschlauch je nach Hersteller)
- `Fläche m²` (Rasen, Beet) bzw. `Länge m` (Hecke, Tropfschlauch) eintragen — Label wechselt automatisch je nach `plant_type`
- Slider „Frequenz" je Zone:
  - Rasen: eher Richtung „lang & selten" (rechts) — fördert tiefe Wurzeln
  - Hecke/Beet: ausgewogen oder „kurz & häufig" (links)
- `min_deficit_mm` und `target_mm` je nach Pflanzentyp einstellen

### 2. Sperrzeiten + Sperrtage konfigurieren

Pro Programm in Settings → Programme:

- Sperrtage markieren (z.B. Sonntag wenn Hausgebrauch hoch)
- Sperrzeit aktivieren (typisch 11:00–18:00 — Mittagshitze, Wasserverdunstung)

### 3. Echtbetrieb beobachten (1–2 Wochen)

- Läuft die Automatik täglich zur Startzeit?
- Wird bei Regen 24h ≥ Threshold übersprungen, bei Regen 48h reduziert?
- Stimmt das Defizit-Update nach manuellem Lauf? (Vorher/Nachher-Wert in Zone-Details)
- Wenn Durchflussmesser-Wert vom theoretischen abweicht → Web-Log gibt's Hinweis; ggf. `precipitation_mm_per_h` korrigieren

### 4. Hahnmodus weiter testen

(Übernommen aus früherem Stand — bleibt offen)

- Hahn öffnen, beobachten ob `p_on`/`p_off` und feste Hz vernünftig schalten
- Szenarien: Gießkanne, Schlauchtrommel halb offen, kurzer/langer Zapfvorgang
- Bei Takten: `p_on`/`p_off`/Hz feinjustieren

## Nächste wichtige Fixes

### ESP32-Code aus Repo entfernen

Die Architektur ist Pi-only — ESP32-Reste in `src/`, `platformio.ini`, alte `docker/`-Strukturen, README-Erwähnungen etc. werden bereinigt. Siehe Kontext-Notiz.

### Versionierung & OTA sauber halten

- Direkt-Deploys (siehe [DEPLOYMENT.md](DEPLOYMENT.md)) werden zwischen den Sessions oft gemacht — sind aber **nicht** OTA-Releases.
- Stabile Stände sollten als `git tag vX.Y.Z` getaggt werden, damit GitHub Actions ein signiertes Release-Tarball baut.
- App-Version aus Git-Commit/Tag in Build schreiben → UI zeigt installierte Version + OTA-Verfügbarkeit.

### Backend-Testumgebung

- `pytest` Setup für `pi/backend` — venv aktivieren und API-Regressionstests anlegen
- Insbesondere für `irrigation.py` (Schema-Migration, evaluate_program, applied_mm-Logik)

### Programmeditor weiter absichern

- Programmnamen nicht leer
- Zonen-ID stabil halten
- Validierung: `precipitation_mm_per_h` 0.5–60, `area_value` plausibel
- Speichern-Button mit „ungespeichert"-Zustand

## UI-Verbesserungen

### Dashboard

- Mini-Verlaufskurve für Druck (letzte 5 Min)
- Aktive Regelart prävisuell darstellen (Hahnmodus / PI / Fix-Hz)
- Warnungen/Interlocks als ruhige Statuszeile

### Wetter-Tab

- „In 3h kommt 2mm Regen"-Komponente (Stunden-Timeline der OWM-Vorhersage)
- Trend-Anzeige für ET₀ der letzten 7 Tage

### Settings

- Inline-Hilfen (Tooltips) für Kp, Ki, p_on, p_off, target_mm etc.
- Preset-Modi als Klartext (nicht als Nummer)

## Features, die fachlich nützlich wären

### Trockenlauf- & Leckage-Diagnose

- Pumpe läuft, Druck steigt nicht → Warnung
- Pumpe taktet zu oft im Hahnmodus → Warnung
- Druck fällt nachts ohne Entnahme → Leck?
- Flow-Sensor meldet Durchfluss obwohl keine Zone aktiv → Leck/Verstopfung

### Saison- & Wetterlogik verfeinern

`seasonal_factor` ist ein pauschaler Faktor. Besser:
- Auto-Ableitung aus Monat, Temperatur, ET₀, Sonnenlage
- Manuell übersteuerbar
- UI-Erklärung: 1.0 normal, 0.7 weniger, 1.3 mehr Wasser

### Bewässerungsprotokoll & Auswertung

In `/analytics` ausbauen:
- Laufzeit pro Zone/Woche
- gemessene Wassermenge (jetzt verfügbar dank Durchflussmesser-Integration!) vs. theoretisch
- Smart-ET-Defizitverlauf
- Übersprungene Starts mit Grund
- Vergleich Regen/ET₀/Bewässerung

### Backup & Export

- Export von Presets, Programmen, Drucksettings, Timeguard
- Import/Restore über UI
- Automatisches Backup vor OTA-Install

## Erledigt — als Kontext

### Mai 2026

- Bewässerungs-Refactor: `days` → `blocked_days` + `blocked_window`
- Hydrawise-ähnliche Wetter-Logik (24h Skip, 48h Credit gegen Defizit)
- Durchflussmesser-Integration für `applied_mm`-Berechnung mit Clamping
- `applied_mm`-Bug bei manuellem Lauf gefixt + proportionaler Anteil bei Stop
- Manueller Start während Automatik blockiert (statt unterbrechen)
- Frequenz-Slider pro Zone (kurz/häufig ↔ lang/selten)
- Niederschlagsrate `precipitation_mm_per_h` und `area_value`/`area_unit` pro Zone
- TopBar minimalistisch (Druck/L-min/Hz + Preset)
- Theme-Switcher in Settings → System (Hell/Dunkel/System)
- Custom Duration Picker auf Dashboard
- Capacitor Android-APK mit Cert-Pinning + Auto-Update via Service Worker
- nginx-Location für APK-Download
- Schnell-Deploy-Workflow dokumentiert ([DEPLOYMENT.md](DEPLOYMENT.md))

### Vor Mai 2026

- Dashboard-Leitstand entfernt
- Helle UI mit Tailwind/Framer-Motion/Glassmorphism
- Smart-ET-Wizard als Guide
- OTA-Repo-Konfiguration
- Hahnmodus als Preset-Modus
- Eigene Presets im Zonen-Editor
- Programmspeichern-422 behoben
- Dashboard-Bereiche einklappbar + Drag-and-Drop
