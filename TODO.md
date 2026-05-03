# TODO - Pumpensteuerung und Bewaesserung

Stand: 2026-05-03

Diese Datei ist die Arbeitsliste fuer die naechsten Sessions. Erledigtes steht
kurz unten als Kontext, offene Punkte sind nach Prioritaet sortiert.

## Sofort pruefen

### 1. Programm-Speichern in der UI testen

Status: erledigt im Backend, bitte einmal im Browser gegenpruefen.

- In Settings ein Bewaesserungsprogramm oeffnen.
- Modus auf `smart_et` stellen.
- Eine Zone bearbeiten oder Wizard-Empfehlung uebernehmen.
- `Alle Programme speichern` klicken.
- Erwartung: kein `422`, Aenderung bleibt nach Reload erhalten.

Technischer Fix:

- Commit `829d80b fix: accept irrigation program save body`
- Auf Pi deployed und per API mit HTTP 200 getestet.

### 2. Hahnmodus real testen

Ziel: Standardbetrieb fuer Wasserhahn/Schlauchtrommel.

- Hahn oeffnen und beobachten:
  - Start bei ca. `p_on`
  - Lauf mit fixer Hz
  - Stop bei ca. `p_off`
- Typische Szenarien testen:
  - Giesskanne fuellen
  - Schlauchtrommel halb offen
  - kurzer Zapfvorgang
  - laengerer Zapfvorgang
- Falls die Pumpe taktet:
  - `p_on` etwas senken
  - `p_off` etwas anheben oder senken
  - feste Hz leicht anpassen

### 3. Dashboard-Bewaesserung real testen

Status: UI und Backend sind umgesetzt und auf dem Pi deployed. Die
Bedienlogik wurde danach weiter aufgeraeumt.

- Auf der Hauptseite ein Programm waehlen.
- `Automatik jetzt` testen:
  - Erwartung: startet nur, wenn Wetter/ET/Defizit es erlauben.
- `Manuell X min` testen:
  - Erwartung: startet mit der eingestellten Laufzeit und uebergeht die
    Wetterpruefung.
- Waerend des Laufs pruefen:
  - Restzeit gesamt
  - aktueller Schritt
  - manuell/automatisch
  - aktive Zone
  - Laufphase oder Sickerpause
- `Bewaesserung stoppen` pruefen.
- Nach Ende/Stop pruefen:
  - aktives Preset springt zurueck auf `Normal`.

Technischer Stand:

- Commit `70ed4ca feat: add dashboard irrigation controls`
- Commit `a13c843 refactor: centralize dashboard controls`
- Auf Pi deployed; `/dashboard` und `/zones` antworten mit HTTP 200,
  `/control` leitet auf `/dashboard` weiter.

### 4. Smart-ET-Messung kalibrieren

Ziel: Wizard soll echte Laufzeiten liefern, nicht Schaetzwerte.

- Regenmesser oder mehrere gerade Becher in die Zone stellen.
- Zone z. B. 10 Minuten laufen lassen.
- Wasserhoehe in mm messen.
- Im Wizard eintragen:
  - `Gemessene Regenhoehe mm`
  - `Testdauer min`
- Daraus berechnet die App `mm/h`.

Hinweis: `1 mm` auf dem Rasen entspricht `1 Liter pro m2`. Fuer Laufzeiten ist
`mm/h` wichtiger als nur `l/min`, weil die Flaeche und Duesenverteilung
entscheidend sind.

## Naechste wichtige Fixes

### Versionierung und OTA sauberziehen

Problem: Es gab direkte Deploys auf den Pi. Das ist fuer Entwicklung schnell,
aber die angezeigte Version und GitHub-Releases koennen hinterherhinken.
Zusatzbefund: Der Pi erreicht GitHub, aber
`https://api.github.com/repos/NordOtto/Pumpensteuerung/releases/latest`
antwortet mit 404. Das spricht fuer ein privates Repo ohne Token auf dem Pi.

Vorschlag:

- GitHub Fine-Grained Token mit Repository `NordOtto/Pumpensteuerung` und
  `Contents: Read-only` erstellen.
- Token auf dem Pi unter `/opt/pumpe/ota/.github_token` ablegen.
- In `/opt/pumpe/ota/config.env` setzen:
  `GITHUB_TOKEN_FILE=/opt/pumpe/ota/.github_token`
- Datei auf `chmod 600` setzen und `update.sh check` testen.
- App-Version aus Git-Commit/Tag in Build schreiben.
- UI zeigt:
  - installierte Version
  - Commit-SHA
  - Build-Zeit
  - OTA-Release-Version
- Neuen Release-Tag fuer den aktuellen Stand erstellen.
- OTA-Update einmal komplett testen:
  - Check
  - Install
  - Smoke-Test
  - Rollback

### Backend-Testumgebung reparieren

Problem: Lokale Windows-Python-Umgebung hatte kein `fastapi`; `pytest` konnte
das `app`-Modul nicht importieren.

Vorschlag:

- Backend-venv dokumentieren und einrichten.
- Einen kurzen Befehl standardisieren:
  - `cd pi/backend`
  - `.venv/Scripts/python -m pytest` auf Windows oder
  - `.venv/bin/python -m pytest` auf Pi/Linux
- API-Regressionstest fuer Programmspeichern aufnehmen.

### Programmeditor weiter absichern

Sinnvolle Validierungen:

- Programmnamen duerfen nicht leer sein.
- Zonen-ID stabil halten und nicht versehentlich duplizieren.
- Laufzeit, Ziel-mm, Mindestdefizit, Cycle und Soak mit Min/Max validieren.
- Warnung anzeigen, wenn Smart-ET aktiv ist, aber Zone `water_mm` oder Rate
  unplausibel ist.
- Speichern-Button mit sichtbarem "ungespeichert" Zustand.

## UI-Verbesserungen

### Mehr HMI-Profi-Gefuehl

Die grobe Bedienhierarchie ist jetzt bereinigt. Weitere sinnvolle Schritte:

- Kleine Verlaufslinie fuer Druck direkt auf Dashboard.
- Aktive Regelart noch praevisueller darstellen:
  - `Hahnmodus: Ein/Aus nach Druck`
  - `PI-Regelung: haelt Solldruck`
  - `Fix-Hz: feste Drehzahl`
- Warnungen/Interlocks als ruhige, aber klare Statuszeile direkt unter der
  Pumpensteuerung.

### Preset-Manager besser erklaeren

Bereits teilweise umgesetzt, sollte weiter verfeinert werden.

Noch sinnvoll:

- Modus nicht als Nummer zeigen, sondern als Klartext:
  - Druckregelung
  - Durchflussregelung
  - Feste Drehzahl
  - Hahnmodus
- `Setpoint` dauerhaft in Fachsprache umbenennen:
  - bei Druckregelung: `Solldruck`
  - bei Durchflussregelung: `Soll-Durchfluss`
  - bei Fix-Hz: `Feste Drehzahl`
- Inline-Hilfen:
  - `Kp`: wie stark die Pumpe sofort auf Druckfehler reagiert.
  - `Ki`: wie stark dauerhafte Abweichung ueber Zeit nachgeregelt wird.
  - `p_on`: Einschaltdruck.
  - `p_off`: Ausschaltdruck.

### Wizard weiter verbessern

Vorschlaege:

- Wizard-Ergebnis als verstaendliche Entscheidung anzeigen:
  - "Deine Zone bringt 30 mm/h."
  - "Fuer 25 mm braucht sie ca. 50 Minuten."
  - "Aufgeteilt in 4 Bloecke mit Sickerpausen."
- Warnung bei unplausibler Messung:
  - sehr kleine mm bei langer Testdauer
  - sehr hohe mm/h
  - Testdauer unter 5 Minuten
- Optionaler Flaechenrechner:
  - Flaeche in m2
  - Wasserbedarf in Litern
  - Vergleich mit gemessener Niederschlagsrate

## Features, die fachlich nuetzlich waeren

### Trockenlauf- und Leckage-Diagnose

Moegliche Logik:

- Pumpe laeuft, aber Druck steigt nicht ausreichend.
- Pumpe taktet ungewoehnlich oft im Hahnmodus.
- Druck faellt nachts ohne Entnahme.
- Flow-Sensor meldet Durchfluss, obwohl keine Zone aktiv ist.

UI-Ausgabe:

- klare Diagnose
- Zeitpunkt
- betroffene Messwerte
- Handlungsempfehlung

### Saison- und Wetterlogik verbessern

Der aktuelle `seasonal_factor` ist ein pauschaler Faktor. Nuetzlicher waere:

- Automatisch aus Monat, Temperatur, ET0 und Sonnenlage ableiten.
- Manuell uebersteuerbar lassen.
- In der UI erklaeren:
  - `1.0` = normal
  - `0.7` = weniger Wasser
  - `1.3` = mehr Wasser

### Zonen-Kalibrierung speichern

Pro Zone speichern:

- Flaeche in m2
- Duesentyp, z. B. Rain Bird RVAN
- gemessene Niederschlagsrate mm/h
- letzte Kalibrierung
- Gleichmaessigkeitsnotiz

Damit kann der Wizard spaeter genauer arbeiten und muss nicht jedes Mal neu
erklaert werden.

### Bewaesserungsprotokoll mit Auswertung

Ausbauen in `/analytics`:

- Laufzeit pro Zone/Woche
- geschaetzte Wassermenge pro Zone
- Smart-ET-Defizitverlauf
- uebersprungene Starts mit Grund
- Vergleich Regen/ET0/Bewaesserung

### Manuelle Schnellaktionen

Praktisch fuer Alltag:

- "Hahnmodus aktivieren"
- "Rasen jetzt 30 min"
- "Zone 1 testen 2 min"
- "Alle Bewaesserung stoppen"
- "Pumpe sperren fuer 30 min"

Alle mit klarer Rueckmeldung und Long-Press fuer kritische Aktionen.

### Backup und Export

Nuetzlich vor groesseren Aenderungen:

- Export von:
  - Presets
  - Programmen
  - Drucksettings
  - Timeguard
- Import/Restore ueber UI.
- Automatisches Backup vor OTA-Install.

## Erledigt als Kontext

- Dashboard-Leitstand entfernt.
- Helle, modernere UI mit Tailwind, Framer Motion und Glassmorphism eingefuehrt.
- Smart-ET-Wizard als Guide neu gebaut.
- OTA-Repo-Konfiguration korrigiert.
- Hahnmodus als Preset-Modus ergaenzt.
- Eigene Presets im Zonen-Editor verfuegbar gemacht.
- Zahlenfelder repariert.
- Ein-/Ausschaltdruck fuer Hahnmodus-Presets ergaenzt.
- Live-Updates ueberschreiben Programmedits nicht mehr.
- Smart-ET fuer tiefe, seltenere Rasenbewaesserung angepasst.
- Cycle-and-Soak fuer Sickerphasen ergaenzt.
- Wizard-Messlabels erklaert und `mm/h` sichtbar gemacht.
- Programmspeichern-422 behoben und auf Pi getestet.
- Dashboard-Bewaesserungssteuerung mit Automatikstart, manuellem Minutenstart,
  Stop und Restzeit umgesetzt.
- Nach Bewaesserung wird wieder `Normal` als Rueckfall-Preset aktiviert.
- Bedienlogik bereinigt: Live-Werte oben, Pumpensteuerung darunter,
  Bewaesserung zentral auf der Hauptseite, Steuerungsseite entfernt,
  Zonenseite ohne Start/Stop.
- Dashboard-Bereiche sind einklappbar und per Drag-and-Drop verschiebbar;
  Zustand wird im Browser gespeichert.
