# OTA-Update-System - Pumpensteuerung

Dieses Dokument beschreibt das OTA- und Versionssystem dieses Projekts.
Es ist bewusst auf die Pumpensteuerung angepasst und enthaelt keine Pfade
oder Begriffe aus dem alten Stoermelder-Projekt.

## 1) Zielbild

Der normale Arbeitsablauf ist:

1. Aenderungen lokal umsetzen.
2. Frontend/Backend pruefen.
3. Commit erstellen.
4. Direkt auf den Pi deployen, damit die Aenderung sofort getestet werden kann.
5. Commits nach GitHub pushen.
6. GitHub Actions baut ein Release-Archiv.
7. Die Pi-UI zeigt ueber OTA die neue Version an.
8. Das Update kann in der UI installiert werden.

Der Direkt-Deploy ersetzt das Release nicht. Er ist nur der schnelle Testpfad.
Das OTA-System bleibt die saubere Versionierung fuer nachvollziehbare Releases.

## 2) Wichtige Projektpfade

| Bereich | Datei/Pfad |
|---|---|
| Release Workflow | `.github/workflows/pi-release.yml` |
| OTA-Script fuer den Pi | `pi/ops/ota/update.sh` |
| OTA-Beispielkonfig | `pi/ops/ota/config.env.example` |
| Backend OTA-API | `pi/backend/app/api/routes.py` |
| Backend Version-State | `pi/backend/app/state.py` |
| Frontend OTA-UI | `pi/frontend/app/settings/page.tsx` |
| Frontend API Client | `pi/frontend/lib/api.ts` |
| Frontend Typen | `pi/frontend/lib/types.ts` |
| Systemd Backend | `pi/ops/systemd/pumpe-backend.service` |
| Systemd OTA Timer | `pi/ops/systemd/pumpe-ota.timer` |
| Installationshilfe | `pi/ops/setup.sh` |

## 3) GitHub Release Workflow

Der Release Workflow liegt in `.github/workflows/pi-release.yml`.

Ausloeser:

- Push auf `main`
- manueller Start ueber `workflow_dispatch`

Versionierung:

- Wenn beim manuellen Start eine Version angegeben wird, nutzt der Workflow diese.
- Ohne Eingabe wird aus `VERSION` die Major/Minor-Basis gelesen und die Patch-Nummer aus `GITHUB_RUN_NUMBER` gebildet.
- Beispiel: `VERSION=0.1.0` und Run `42` ergibt `0.1.42`.
- Der GitHub-Tag wird als `vX.Y.Z` erzeugt.

Release-Artefakte:

- `pumpe-vX.Y.Z.tar.gz`
- `pumpe-vX.Y.Z.tar.gz.sha256`
- optional `pumpe-vX.Y.Z.tar.gz.minisig`

Das Archiv enthaelt:

- `VERSION`
- `COMMIT`
- `manifest.json`
- Backend-App unter `backend/`
- Frontend-Standalone-Build unter `frontend/.next`

## 4) GitHub-Berechtigungen und Secrets

Der Workflow braucht:

- `permissions: contents: write`

Fuer signierte OTA-Updates werden diese Secrets genutzt:

- `MINISIGN_KEY`
- `MINISIGN_PASSWORD`

Wenn `MINISIGN_KEY` fehlt, wird das Release ohne Signatur hochgeladen.
Der aktuelle Pi-Updater erwartet aber eine `.minisig` und einen Public Key.
Fuer echte OTA-Installationen muss Signierung deshalb sauber eingerichtet sein.

## 5) Pi-Dateisystem

Auf dem Pi wird dieses Layout verwendet:

```text
/opt/pumpe/
  current -> /opt/pumpe/releases/<tag>
  releases/
    <tag>/
  ota/
    update.sh
    config.env
    minisign.pub
    .github_token
```

Wichtige Dateien:

- `/opt/pumpe/ota/update.sh`
- `/opt/pumpe/ota/config.env`
- `/opt/pumpe/ota/.github_token`
- `/opt/pumpe/ota/minisign.pub`

`config.env` enthaelt mindestens:

```bash
GITHUB_REPO=NordOtto/Pumpensteuerung
MINISIGN_PUBKEY=/opt/pumpe/ota/minisign.pub
GITHUB_TOKEN_FILE=/opt/pumpe/ota/.github_token
```

## 6) Token fuer private GitHub-Repos

Da das Repository privat ist, braucht der Pi einen GitHub Token.

Empfehlung:

- Fine-grained Personal Access Token
- Zugriff nur auf `NordOtto/Pumpensteuerung`
- Repository permissions: `Contents: Read-only`

Der Token wird ueber die UI eingetragen:

- Seite: `Einstellungen`
- Panel: `System-Update`
- Feld: `GitHub Token`

Backend-Endpunkte:

| Zweck | Endpoint | Datei |
|---|---|---|
| Token speichern | `POST /api/ota/token` | `pi/backend/app/api/routes.py` |
| Token entfernen | `DELETE /api/ota/token` | `pi/backend/app/api/routes.py` |
| OTA-Status inkl. Tokenstatus | `GET /api/ota/status` | `pi/backend/app/api/routes.py` |

Der Token wird auf dem Pi in `/opt/pumpe/ota/.github_token` gespeichert.
Er wird nie im Klartext an das Frontend zurueckgegeben.

Wichtig wegen systemd-Hardening:

- `pumpe-backend.service` nutzt `ProtectSystem=strict`.
- Deshalb muss `/opt/pumpe/ota` explizit beschreibbar sein.
- In `pi/ops/systemd/pumpe-backend.service` ist dafuer gesetzt:

```ini
ReadWritePaths=/var/lib/pumpe /opt/pumpe/ota
```

## 7) OTA-Check und Installation

Das OTA-Script `pi/ops/ota/update.sh` unterstuetzt:

```bash
/opt/pumpe/ota/update.sh status
/opt/pumpe/ota/update.sh check
/opt/pumpe/ota/update.sh install [tag]
/opt/pumpe/ota/update.sh check-and-apply
/opt/pumpe/ota/update.sh apply <tag>
/opt/pumpe/ota/update.sh rollback
```

### Check

`check` ruft GitHub Releases ab:

```text
https://api.github.com/repos/NordOtto/Pumpensteuerung/releases/latest
```

Bei Erfolg gibt das Script JSON aus:

```json
{
  "current": "b4b0c56-main",
  "latest": "v0.1.2",
  "commit": "...",
  "published_at": "...",
  "changelog": "...",
  "update_available": true
}
```

Das Backend liest diese Ausgabe ein und uebernimmt sie in `app_state.ota`.

### Installation

`install` macht:

1. Release-JSON laden.
2. `.tar.gz` und `.tar.gz.minisig` aus dem GitHub Release laden.
3. Signatur mit `minisign.pub` pruefen.
4. Archiv nach `/opt/pumpe/releases/<tag>` entpacken.
5. Backend-Venv im Release erzeugen.
6. Python-Abhaengigkeiten aus `backend/requirements.txt` installieren.
7. `.env` vom aktuellen Release uebernehmen.
8. Symlink `/opt/pumpe/current` atomar auf das neue Release setzen.
9. `pumpe-backend.service` und `pumpe-frontend.service` neu starten.
10. Smoke-Test auf `http://127.0.0.1:8000/api/health`.
11. Bei Fehler Rollback.

## 8) Backend API fuer OTA

Die API sitzt in `pi/backend/app/api/routes.py`.

| Zweck | Endpoint |
|---|---|
| Status lesen | `GET /api/ota/status` |
| Token speichern | `POST /api/ota/token` |
| Token entfernen | `DELETE /api/ota/token` |
| Online pruefen | `POST /api/ota/check` |
| Update installieren | `POST /api/ota/install` |
| Rollback starten | `POST /api/ota/rollback` |
| Live-Log lesen | `GET /api/ota/log` |

Die API startet `update.sh` asynchron und speichert:

- `running`
- `log`
- `exit_code`
- `current_version`
- `latest_version`
- `latest_commit`
- `latest_date`
- `changelog`
- `update_available`
- `token_configured`
- `token_ok`
- `token_message`

## 9) Frontend UI

Die UI liegt in `pi/frontend/app/settings/page.tsx`.

Sichtbare Funktionen im Panel `System-Update`:

- installierte Version
- neueste Version
- Release-Commit
- GitHub Token speichern/pruefen/entfernen
- Online pruefen
- Installieren
- Rollback
- Fortschrittsanzeige
- Live-Log

Der API-Client liegt in `pi/frontend/lib/api.ts`:

- `api.otaStatus()`
- `api.otaCheck()`
- `api.otaInstall(tag?)`
- `api.otaRollback()`
- `api.otaTokenSet(token)`
- `api.otaTokenDelete()`
- `api.otaLog()`

Die Typen liegen in `pi/frontend/lib/types.ts`, Interface `OtaStatus`.

## 10) Aktueller Teststand

Auf dem Pi wurde geprueft:

- Token kann gespeichert werden.
- `/opt/pumpe/ota/.github_token` wird angelegt.
- Backend darf trotz `ProtectSystem=strict` nach `/opt/pumpe/ota` schreiben.
- `POST /api/ota/check` kann das private GitHub Release lesen.
- `GET /api/ota/status` zeigt:
  - `token_configured: true`
  - `token_ok: true`
  - `latest_version: v0.1.2`
  - `update_available: true`

Damit funktioniert der Versionscheck. Die eigentliche Installation haengt davon ab,
dass das Release signiert ist und `minisign.pub` auf dem Pi zum Release-Key passt.

## 11) Direkter Deploy vs. OTA Release

Direkter Deploy:

- gut fuer schnelles Testen
- kopiert gebaute Dateien direkt nach `/opt/pumpe/current`
- erzeugt kein neues GitHub Release
- aendert nicht automatisch `latest_version`

OTA Release:

- entsteht durch Push nach GitHub und Workflow-Lauf
- erzeugt reproduzierbares Release-Artefakt
- ist in der UI als neue Version sichtbar
- kann ueber `Installieren` aktiviert werden

Gewuenschter Ablauf fuer zukuenftige Arbeit:

1. Lokal implementieren.
2. `npm run typecheck` im Frontend.
3. `npm run build` im Frontend.
4. Backend-Syntax pruefen, wenn Python-Dateien geaendert wurden.
5. Commit erstellen.
6. Direkt auf den Pi deployen.
7. Auf dem Pi testen.
8. Push nach GitHub.
9. Release Workflow abwarten.
10. OTA-Status pruefen.

## 12) Typische Fehler

### Release-Info kann nicht geladen werden

Moegliche Ursachen:

- Token fehlt.
- Token hat keine `Contents: Read-only` Berechtigung.
- `GITHUB_REPO` in `/opt/pumpe/ota/config.env` ist falsch.
- GitHub Release existiert nicht.

Pruefen:

```bash
/opt/pumpe/ota/update.sh check
curl http://127.0.0.1:8000/api/ota/status
```

### Token kann nicht gespeichert werden

Moegliche Ursache:

- systemd macht `/opt` read-only.

Pruefen:

```bash
systemctl cat pumpe-backend.service | grep ReadWritePaths
```

Erwartet:

```text
ReadWritePaths=/var/lib/pumpe /opt/pumpe/ota
```

### Update wird angezeigt, Installation schlaegt aber fehl

Moegliche Ursachen:

- `.minisig` fehlt im Release.
- `minisign.pub` fehlt auf dem Pi.
- Public Key passt nicht zur Signatur.
- Release-Archiv enthaelt keinen Frontend-Standalone-Build.
- Backend-Venv oder `requirements.txt` fehlt.

Pruefen:

```bash
journalctl -u pumpe-backend.service -n 80 --no-pager
journalctl -u pumpe-ota.service -n 80 --no-pager
/opt/pumpe/ota/update.sh install vX.Y.Z
```

### UI zeigt Release im Log, aber nicht im Status

Das Backend muss die JSON-Ausgabe von `update.sh check` parsen.
Der Fix dafuer liegt in `pi/backend/app/api/routes.py` in `_apply_ota_json`.

## 13) Offene Verbesserungen

Nuetzlich fuer spaeter:

- Release-Workflow nach erfolgreichen Commits automatisch in der UI verlinken.
- OTA-Installation mit echter Prozentanzeige statt grober Fortschrittslogik.
- Nach erfolgreicher Installation automatisch reconnecten und UI neu laden.
- `/api/ota/status` beim Backend-Start optional einmal automatisch initialisieren.
- Signaturstatus in der UI explizit anzeigen.
- GitHub Actions Status in Settings anzeigen, wenn ein Release gerade gebaut wird.
