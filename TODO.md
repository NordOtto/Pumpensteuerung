# TODO — Pumpensteuerung Pi-Migration

Stand: 2026-05-01. Diese Datei dokumentiert den Stand für eine neue Session
nach `/clear`.

---

## 🔥 SOFORT: Bug-Fixes auf den Pi deployen

Zwei kritische Bugs sind im Code behoben (Branch `feature/ui-redesign`, Commit `639aa5a`),
müssen aber noch auf den Pi deployed werden:

1. **Hz-Anzeige zeigte 50× zu hohe Werte** (600 Hz statt 12 Hz) — `modbus_rtu.py:90`
2. **Pumpe pendelt bei kleiner Wasserentnahme** (Überdruck-/No-demand-Stop feuert
   wegen Flow-Sensor-Filter < 5 L/min) — `pressure_ctrl.py` nutzt jetzt `effective_flow`
   (Frequenz-basierte Schätzung) statt rohem Sensorwert.

### Deploy-Befehle (SSH auf Pi):

```bash
cd /tmp && rm -rf pumpensteuerung
git clone -b feature/ui-redesign https://github.com/NordOtto/Pumpensteuerung.git pumpensteuerung
sudo cp pumpensteuerung/pi/backend/app/modbus_rtu.py /opt/pumpe/current/backend/app/
sudo cp pumpensteuerung/pi/backend/app/pressure_ctrl.py /opt/pumpe/current/backend/app/
sudo systemctl restart pumpe-backend
journalctl -u pumpe-backend -f
```

**Verify:** Hz-Anzeige in der UI sollte jetzt 0–60 Hz statt 0–3000 Hz zeigen.
Pumpe sollte bei dauerhaftem Wasserzapfen durchlaufen statt zu pendeln.

---

## ✅ Erledigt in dieser Session

### Batch 1 — Infrastruktur-Cleanup (Branch `cleanup/remove-docker-esp32`, gepusht)
- 58 Dateien gelöscht: `docker/`, `src/`, `include/`, `lib/`, `test/`,
  `platformio.ini`, `partitions.csv`, `docker-compose.yml`, `docker-stack.yml`,
  `.github/workflows/build.yml`
- `CLAUDE.md` auf Pi-Only-Architektur aktualisiert
- PR-Link: https://github.com/NordOtto/Pumpensteuerung/pull/new/cleanup/remove-docker-esp32

### Bug-Fixes (Branch `feature/ui-redesign`, Commit `639aa5a`, gepusht)
- Hz-Lesefehler (× 50.0) entfernt
- Pumpen-Pendeln durch effective_flow gefixt

### UI-Komponenten begonnen (Branch `feature/ui-redesign`, **noch nicht committet**)
- `components/empty-state.tsx` ✅
- `components/weather-widget.tsx` ✅ (mit Lucide-Icons, Tone-System, "Keine Wetterdaten"-State)
- `components/irrigation-advisor.tsx` ✅ (Bewässerungs-Wizard-Panel)
- `lib/types.ts` ✅ (`Preset`, `OtaStatus` Interfaces ergänzt)
- `lib/api.ts` ✅ (Preset-CRUD, Programs-CRUD, OTA-Endpoints ergänzt)

---

## 🚧 Offen — Nächste Session

### Batch 2e: Visuelles Redesign (in_progress)
Pages aktualisieren um die neuen Komponenten zu nutzen + visuelles Polish.

**Dateien:**
- `pi/frontend/app/dashboard/page.tsx` — Hero-Karte mit Pump-Status, KPIs polishen,
  Warnungen nur wenn vorhanden, Zonen aus echten Programmen statt hardcoded
- `pi/frontend/app/zones/page.tsx` — `WeatherWidget` einsetzen, `IrrigationAdvisor`
  oben einbauen, Zone-Cards mit farbigem Border
- `pi/frontend/app/control/page.tsx` — Preset-Selector als prominenten Block oben
- `pi/frontend/components/zone-card.tsx` — farbige linke Border je nach State

### Batch 2c+2d: Preset-Editor + Programm/Zonen-Editor
**Datei:** `pi/frontend/app/settings/page.tsx`

Aktuell hat die Settings-Seite einen `PresetsSection`-Platzhalter:
```tsx
<div>Preset-Editor folgt — aktuell über REST `/api/presets` erreichbar.</div>
```

**Implementieren:**
1. **Preset-CRUD-UI:**
   - Liste aller Presets via `api.fetchPresets()`
   - Edit-Form: Name, Modus (Druck/Durchfluss/FixHz Select), Setpoint, Kp, Ki,
     freq_min, freq_max, setpoint_hz (nur Modus 2), expected_pressure
   - "+" Button für neuen Preset → `api.savePreset()`
   - Delete-Icon → `api.deletePreset()` (Backend gibt 409 wenn aktiv)
2. **Programm/Zonen-Editor:**
   - Liste der Programme aus `status.irrigation.programs`
   - Edit-Form: Name, Tage (Mo–So Toggle), Startzeit, Modus (fixed/smart_et),
     weather_enabled, Schwellwerte (skip_rain_mm etc. bei smart_et)
   - Pro Programm: Zonen-Liste mit Add/Remove
   - Zone-Form: Name, duration_min, water_mm, target_mm, preset (Dropdown), plant_type
   - Save → `api.savePrograms()`

### Batch 3: OTA-Update-Flow

**Backend** (`pi/backend/app/`):
1. `state.py` — `OtaState`-Klasse hinzufügen mit Feldern:
   ```python
   class OtaState(BaseModel):
       running: bool = False
       log: list[str] = Field(default_factory=list)
       exit_code: int | None = None
       update_available: bool = False
       current_version: str = "pi-backend-0.1.0"
       latest_version: str | None = None
       last_check: str | None = None
   ```
   In `AppState`: `ota: OtaState = Field(default_factory=OtaState)`
2. `api/routes.py` — drei Endpoints:
   - `GET /api/ota/status` → `app_state.ota.model_dump()`
   - `POST /api/ota/check` → spawnt asyncio.subprocess `/opt/pumpe/ota/update.sh check-and-apply`,
     409 wenn `app_state.ota.running`
   - `GET /api/ota/log` → `{lines: app_state.ota.log, running, exit_code}`
3. Subprocess-Helfer `_run_ota()` der stdout zeilenweise nach `app_state.ota.log` schreibt.

**Frontend:**
- Neue Sektion in `app/settings/page.tsx`:
  - Zeigt aktuelle Version (`status.sys.fw`), letzten Check
  - "Auf Updates prüfen"-Button → `api.otaCheck()` → polling `api.otaLog()` alle 2s
  - Live-Log in `<pre>`-Block

### Batch 4: Bewässerungs-Assistent integrieren
- `IrrigationAdvisor`-Komponente ist fertig (Datei vorhanden)
- Auf `app/zones/page.tsx` einbauen (oben über dem WeatherWidget)
- Liest read-only aus `status.irrigation.decision`

### Branch-Strategie
- `cleanup/remove-docker-esp32` → PR an `main` (manuell anlegen via Browser, gh CLI nicht installiert)
- `feature/ui-redesign` → enthält Bug-Fixes + UI-Arbeit, später PR an `main`
- Empfehlung: erst `cleanup` mergen, dann `pi-migration` in `main` mergen, dann UI-Branch
  rebasen und PR

---

## 📁 Wichtige Dateien (Quick-Reference)

| Datei | Status | Zweck |
|-------|--------|-------|
| `pi/frontend/components/empty-state.tsx` | ✅ neu | Leerstand-Komponente |
| `pi/frontend/components/weather-widget.tsx` | ✅ neu | Wetter-Anzeige mit Icons |
| `pi/frontend/components/irrigation-advisor.tsx` | ✅ neu | Bewässerungs-Assistent |
| `pi/frontend/components/zone-card.tsx` | 🚧 offen | farbige Border je State |
| `pi/frontend/components/kpi-card.tsx` | 🚧 evtl. | bleibt evtl. wie ist |
| `pi/frontend/lib/types.ts` | ✅ erweitert | `Preset`, `OtaStatus` ergänzt |
| `pi/frontend/lib/api.ts` | ✅ erweitert | Preset/Programs/OTA APIs |
| `pi/frontend/app/dashboard/page.tsx` | 🚧 offen | Hero-Karte, echte Zones |
| `pi/frontend/app/zones/page.tsx` | 🚧 offen | WeatherWidget + Advisor |
| `pi/frontend/app/control/page.tsx` | 🚧 offen | Preset-Selector oben |
| `pi/frontend/app/settings/page.tsx` | 🚧 offen | Preset-Editor + Program-Editor + OTA |
| `pi/backend/app/state.py` | 🚧 offen | OtaState-Modell |
| `pi/backend/app/api/routes.py` | 🚧 offen | OTA-Endpoints |
| `pi/backend/app/modbus_rtu.py` | ✅ Bug-Fix | Hz-Skalierung |
| `pi/backend/app/pressure_ctrl.py` | ✅ Bug-Fix | effective_flow |

---

## 🧠 Kontext für nächste Session

- Genehmigter Plan: `C:\Users\otto1\.claude\plans\piped-hopping-nygaard.md`
- Aktueller Branch: `feature/ui-redesign` (basiert auf `pi-migration`)
- Backend läuft auf Pi unter `/opt/pumpe/current/backend/`, gestartet via `pumpe-backend.service`
- Frontend Build via `npm run build` in `pi/frontend/`
- MQTT-Broker extern: `192.168.1.136:1883`
- Wetter kommt aus HA über MQTT-Topic `pumpensteuerung/irrigation/weather/input`
  (Ecowitt + OpenWeatherMap)
- User ist Hardware-orientiert, nutzt PowerShell unter Windows, kein gh CLI installiert
- User-Feedback zur UI: "lieblos, leer, generisch" → mehr visuelles Gewicht,
  bessere Leerzustände, echte Daten statt "---"
