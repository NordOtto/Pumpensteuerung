# Projektstand — Pumpensteuerung & Bewässerung

Stand: 2026-05-09

## Zielbild

Lokale Webapp auf einem Raspberry Pi 3B+. Der Pi ist das **einzige** Steuerungssystem:

- Druckregelung (PI), V20-Frequenzumrichter via Modbus RTU
- Sensordaten (Druck, Durchfluss, Wassertemperatur) via Modbus TCP von einer Siemens LOGO 8.4
- Smarte Bewässerung mit Wetter-Integration (OpenWeatherMap + Ecowitt)
- HTTPS-UI über nginx → Next.js + FastAPI
- MQTT-Integration für Home Assistant (optional)
- Android-App als Capacitor-Wrapper (lädt UI live vom Pi)

| Bereich | Stand |
|---|---|
| Pi-IP | `192.168.1.86` (mDNS: `pumpe.local`) |
| Backend | FastAPI auf `127.0.0.1:8000` (`pumpe-backend.service`) |
| Frontend | Next.js Standalone auf `127.0.0.1:3001` (`pumpe-frontend.service`) |
| nginx | HTTPS auf `:443` mit Self-Signed-Cert |
| Aktueller Release | `/opt/pumpe/current` |
| OTA-Repo | `NordOtto/Pumpensteuerung` |
| Android-APK | `https://pumpe.local/pumpe.apk` (Capacitor-Wrapper) |

## Zuletzt umgesetzt (Mai 2026)

### Bewässerungs-Refactor — Hintergrund-Automatik & Manuell

**Konzept klar getrennt:**
- **Automatik = Hintergrund.** Läuft nach fester Tagesstartzeit (z.B. täglich 06:00) sofern Wetter+Defizit es zulassen. Kein Knopf nötig.
- **Manuell = Knopf.** Du klickst, du gibst die Dauer vor. Sperren (Sperrtag/Sperrzeit) gelten auch für Manuell.

**Schema-Änderungen pro Programm:**
- `days` (feste Bewässerungstage) **entfernt**
- `blocked_days[7]` neu: Tage an denen NICHT bewässert wird
- `blocked_window` neu: Sperr-Stundenfenster (z.B. 11:00–18:00)

**Schema-Änderungen pro Zone:**
- `precipitation_mm_per_h` — Niederschlagsrate (Garten/Vorgarten MP-Rotator: 10 mm/h, Hecke Tropfschlauch: ~15 mm/h)
- `frequency_pref` — Slider 0.0 (kurz/häufig) bis 1.0 (lang/selten); skaliert effektives `min_deficit_mm` mit Faktor 0.4–2.0
- `area_value` + `area_unit` — Fläche m² (Rasen/Beet) oder Länge m (Hecke/Tropfschlauch); UI-Label wechselt automatisch je nach `plant_type`

### Hydrawise-ähnliche Wetter-Logik

Statt binär „skip wenn 13mm Regenprognose":
- **Regen-Credit** = `rain_24h_mm + 0.7 × forecast_48h_mm`
- Pro Zone wird Credit vom Defizit abgezogen → Zone läuft **reduziert** statt komplett ausgesetzt
- Skip nur bei akutem Regen heute (`forecast_24h_mm ≥ skip_rain_mm`), nicht bei Regen übermorgen

### Durchfluss-Integration in Defizit

- Während aktiver Zone wird `flow_rate` (L/min) integriert → tatsächliche Liter
- Beim Lauf-Ende: `applied_mm = Liter / Fläche_m²` (1 L/m² = 1 mm)
- Geclamped auf 0.5×–2× vom theoretischen Wert (Schutz vor Sensorfehlern, Lecks)
- Ohne Sensor/Fläche: Fallback auf theoretisch (`duration × precipitation_mm_per_h`)

### Manueller Lauf rechnet ins Defizit

Bug-Fix: `applied_mm` war für manuelle Läufe hardcoded `0.0` → Defizit wurde nicht reduziert. Jetzt:
- `applied_mm = duration_min/60 × precipitation_mm_per_h` (theoretisch)
- bzw. echte Sensorwerte wenn verfügbar
- Bei vorzeitigem Stop wird der **proportionale** Anteil mitgerechnet
- Auch im fixed-Mode (vorher nur smart_et)

### UI-Refactor

- **TopBar:** zeigt nur noch Live-Werte (Druck/L-min/Hz) + aktives Preset. Kein Logo, kein Pumpensteuerung-Text, kein Theme-Toggle. Theme-Switcher (Hell/Dunkel/System) ist nun in Settings → System → Erscheinungsbild.
- **Dashboard:** „Jetzt smart starten"-Button entfernt (verwirrend gewesen). Nur noch „Manuell" + „Stoppen". Subtitle erklärt: „Automatik läuft täglich um HH:MM, sofern Wetter+Defizit es zulassen."
- **Custom Duration Picker** neben den Quick-Buttons (10/20/30/45/60) — beliebige Minuten frei wählbar.
- **Regen-Chips** im Bewässerungs-Panel: „Regen 24h" und „Regen 48h" mit Live-Werten.
- **Settings → Programme:** Wochentag-Auswahl ersetzt durch Sperrtage (rot = gesperrt). Sperrzeit-Editor pro Programm. Pro Zone: Niederschlag mm/h, Fläche m²/Länge m (kontextsensitives Label), Frequenz-Slider.
- **Fehler-Mapping** für Backend-Reasons in lesbare deutsche Texte.

### Android-App

- **Capacitor-Wrapper** im Remote-URL-Modus. Lädt UI live von `https://pumpe.local`.
- **Auto-Update** der UI über Service Worker — keine APK-Updates nötig solange nichts Natives geändert wird.
- **Cert-Pinning:** Pi-Cert (Self-Signed) ist in der APK eingebettet, kein Cleartext.
- **PWA-Setup** parallel: Browser-User auf Android können auch „Zum Startbildschirm hinzufügen".
- APK-Distribution: `https://pumpe.local/pumpe.apk` (Sideload).

## Nächste sinnvolle Schritte

- Pro Zone die `area_value` (m² für Rasen, m für Hecke) eintragen, damit der Durchflussmesser-basierte Defizit-Update genau wird
- Längeres Real-Test-Fenster: Automatik mit Sperrtagen/Sperrzeiten + Hydrawise-Logik beobachten
- ggf. Frequenz-Slider in den Settings noch leicht ausgleichen wenn er zu aggressiv/lasch wirkt
- Trockenlauf-Diagnose ausbauen (Druck stagniert trotz Pumpe an → Warnung)

## Repo-Hinweis

ESP32-Code wird aus dem Repo entfernt — die Architektur ist Pi-only. Siehe [DEPLOYMENT.md](DEPLOYMENT.md) für den aktuellen Deploy-Workflow und [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) für die Gesamtarchitektur.
