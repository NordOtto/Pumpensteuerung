# OTA-Update-System — Wie es funktioniert

Dieses Dokument erklärt das vollständige Update-System der Störmeldeanlage:
Versionierung, automatische Bumps, CI-Pipeline, GitHub Releases und die
In-App-Update-Funktion (OTA). So gebaut, dass es sich auf andere Projekte
übertragen lässt.

---

## Überblick: Der komplette Weg eines Updates

```
Entwickler (lokal)
    │
    ├── bump_version.py patch       ← Version erhöhen
    ├── git add -A && git commit    ← Commit (hook erkennt, ob bump nötig)
    └── git push
              │
              ▼
    GitHub Actions (auto-release.yml)
              │
              ├── CI: ruff + pytest
              ├── VERSION prüfen: lokal gebumpt? → überspringen
              ├── sonst: auto-bump aus Commit-Messages
              ├── git tag vX.Y.Z
              └── GitHub Release mit stoermelder-update-X.Y.Z.tar.gz
                          │
                          ▼
              Pi (läuft 24/7)
                          │
                          ├── USBUpdateManager prüft alle 60s GitHub API
                          └── Update verfügbar → Badge in UI
                                      │
                                      ▼
                          Nutzer klickt "Installieren"
                                      │
                                      ├── Download + Fortschrittsanzeige
                                      ├── Backup der aktuellen Installation
                                      ├── Entpacken + Dateien überschreiben
                                      ├── pip install -e .
                                      └── systemctl restart
```

---

## Teil 1: Versionierung

### Die VERSION-Datei

```
1.19.45
```

Einzige Quelle der Wahrheit. Wird von `bump_version.py` und `pyproject.toml` gelesen.
Die App liest sie beim Start:

```python
# src/stoermeldeanlage/__init__.py
VERSION_FILE = BASE_DIR / "VERSION"
app.config["APP_VERSION"] = VERSION_FILE.read_text().strip()
```

### pyproject.toml — Version synchron halten

```toml
[project]
name = "stoermeldeanlage"
version = "1.19.45"   # wird von bump_version.py automatisch aktualisiert
```

`bump_version.py` aktualisiert **beide** Dateien gleichzeitig (VERSION + pyproject.toml).

### bump_version.py

```bash
python bump_version.py patch   # 1.2.3 → 1.2.4  (Bugfix)
python bump_version.py minor   # 1.2.3 → 1.3.0  (Feature)
python bump_version.py major   # 1.2.3 → 2.0.0  (Breaking Change)
python bump_version.py auto    # erkennt Typ aus Commit-Messages
```

**Auto-Erkennung** aus Conventional Commits:
- `feat!:` oder `BREAKING CHANGE` → major
- `feat:` → minor
- alles andere (`fix:`, `chore:`, …) → patch

```python
# Aus bump_version.py (vereinfacht)
def detect_bump_type() -> str:
    log = git log seit letztem Tag
    if "feat!" oder "BREAKING CHANGE" in log: return "major"
    if "feat:" in log: return "minor"
    return "patch"
```

### Pre-Commit Hook (optional, aber empfohlen)

Sorgt dafür, dass VERSION nie vergessen wird:

```bash
# .git/hooks/pre-commit
STAGED=$(git diff --cached --name-only | tr -d '\r')
if echo "$STAGED" | grep -q "^VERSION$"; then
    exit 0   # Version schon gestaged → kein Auto-Bump
fi
python bump_version.py patch
git add VERSION pyproject.toml
```

> **Windows-Gotcha:** `git diff --cached` gibt `\r\n` aus. `tr -d '\r'` ist zwingend,
> sonst erkennt grep `VERSION` nicht.

---

## Teil 2: GitHub Actions CI/CD

### ci.yml — Tests bei jedem Push

Läuft auf Python 3.9, 3.11, 3.12 (Matrix):

```yaml
- run: ruff check src/ tests/
- run: ruff format --check src/ tests/
- run: pytest --tb=short -q
```

Schlägt CI fehl → kein Release. Fehlschlag bei `ruff format --check` bedeutet:
Code wurde nicht mit `ruff format` formatiert. Vor dem Push immer `ruff format` ausführen.

### auto-release.yml — Automatisches Release bei Push auf master

**Ablauf:**

```
1. Checkout (fetch-depth: 0 — damit git log/tag funktioniert)
2. CI: ruff + pytest
3. Prüfen: Wurde VERSION im letzten Commit bereits geändert?
   → ja:  Version schon lokal gebumpt, Schritt überspringen
   → nein: Auto-Bump via bump_version.py auto
4. VERSION + pyproject.toml committen ([skip ci] verhindert Endlosschleife)
5. git tag vX.Y.Z erstellen (falls noch nicht vorhanden)
6. tar.gz Release-Archiv bauen
7. GitHub Release erstellen mit Asset
```

**[skip ci] Pattern — Endlosschleife verhindern:**

Der Bump-Commit muss mit `[skip ci]` markiert sein:
```bash
git commit -m "chore: bump version to 1.19.45 [skip ci]"
```
Das Workflow-`if` prüft: `!contains(github.event.head_commit.message, '[skip ci]')`

**Lokal gebumpt erkennen:**
```yaml
- name: Check if version already bumped locally
  run: |
    if git diff HEAD~1 --name-only | grep -q "^VERSION$"; then
      echo "skipped=true" >> "$GITHUB_OUTPUT"
    fi
```
→ Wenn der Entwickler Version schon lokal erhöht hat, springt CI direkt zu Tag + Release.

**Tag-Duplikat-Schutz:**
```bash
if git ls-remote --tags origin | grep -q "refs/tags/v${VERSION}$"; then
  echo "Tag already exists, skipping"
else
  git tag -a "v${VERSION}" -m "Release v${VERSION}"
  git push origin "v${VERSION}"
fi
```

**Release-Archiv-Format:**

Das Archiv heißt **exakt** `stoermelder-update-X.Y.Z.tar.gz` und enthält:
```
stoermeldeanlage/
├── VERSION
├── pyproject.toml
├── requirements.txt
├── factory-defaults.json
├── src/
├── templates/
└── static/
```

> Das Dateinamens-Pattern ist kritisch: `USBUpdateManager` erkennt nur
> `stoermelder-update-*.tar.gz` und extrahiert die Version per Regex daraus.

---

## Teil 3: In-App OTA-Update (USBUpdateManager)

### Wie die App die GitHub API abfragt

```python
# Alle 60 Sekunden (im Hintergrund-Thread)
url = "https://api.github.com/repos/NordOtto/stoermeldeanlage/releases/latest"
req.add_header("Authorization", f"token {self._github_token}")

data = json.loads(response.read())
tag = data["tag_name"]        # z.B. "v1.19.45"
version = tag.lstrip("v")     # "1.19.45"

if version > self.app_version:  # Versionsvergleich per int-Tupel
    # Speichert Download-URL des .tar.gz Assets
```

**Warum ein GitHub-Token?**
- Private Repos brauchen Authentifizierung
- Auch bei public Repos: Rate-Limit ohne Token = 60 Req/h, mit Token = 5000 Req/h
- Token wird **nicht** in config.json gespeichert, sondern in `.github_token` (nicht im Backup, nicht im Git)

### Versionsvergleich

```python
def _is_newer(self, new_version, current_version):
    new_parts = [int(x) for x in new_version.split(".")]
    cur_parts = [int(x) for x in current_version.split(".")]
    return new_parts > cur_parts  # Python-Tuple-Vergleich: [1,19,45] > [1,19,44]
```

### Install-Ablauf (wenn Nutzer auf "Installieren" klickt)

```
1. Download tar.gz von GitHub API (mit Authorization-Header + Accept: application/octet-stream)
   → Fortschritt in Prozent per /api/update/progress
2. Backup: aktuelles INSTALL_DIR als tar.gz in backups/
   → Geschützte Dateien (config.json, users.json, db) bleiben immer erhalten
3. Entpacken nach /tmp/stoermelder-update/
4. rsync/copy: neue Dateien → INSTALL_DIR
   → PROTECTED_FILES und PROTECTED_DIRS nie überschreiben
5. pip install -e . (im venv)
6. systemctl restart stoermeldeanlage (via subprocess)
7. Laufende Verbindung bricht ab → UI zeigt "Neustart..." Overlay
   → UI pollt /api/version bis neue Version antwortet
   → Automatisches location.reload()
```

**Geschützte Dateien** (werden bei Update nie überschrieben):
```python
PROTECTED_FILES = {"config.json", "users.json", "stoermelder.db"}
PROTECTED_DIRS  = {"logs", "audio", "backups", "venv", ".baresip", ".linphone"}
```

### Fortschritts-Anzeige (Polling)

Die UI pollt `/api/update/progress` alle 800ms:

```json
{"phase": "download", "percent": 45, "detail": "234 / 512 KB", "installing": true}
{"phase": "install",  "percent": 70, "detail": "Entpacke...",   "installing": true}
{"phase": "done",     "percent": 100, "detail": "Neustart...",  "installing": false}
{"phase": "error",    "percent": 0,   "detail": "Fehlermeldung","installing": false}
```

Nach `phase: done` zeigt die UI ein Overlay und pollt `/api/version` bis die neue Version antwortet.

---

## Teil 4: USB-Update (Offline-Variante)

Identischer Install-Pfad wie OTA, aber Erkennung läuft lokal:

```
USB-Stick mit stoermelder-update-X.Y.Z.tar.gz einstecken
→ udev-Rule triggert usb-mount@.service → Stick wird unter /media/<name> gemountet
→ USBUpdateManager._scan_loop() findet die Datei alle 10s
→ Update-Badge erscheint in UI
→ Nutzer klickt "Installieren" → gleicher Ablauf wie OTA
```

Jumper-Alternative: GPIO 27 Low → automatische Installation ohne UI-Klick (Fabrik-Setup).

---

## Teil 5: API-Endpunkte

| Endpunkt | Methode | Funktion |
|----------|---------|----------|
| `/api/update/check` | GET | Aktuellen Update-Status abfragen |
| `/api/update/install` | POST | Update (USB) installieren |
| `/api/update/ota/check` | POST | GitHub sofort abfragen |
| `/api/update/ota/install` | POST | OTA-Update herunterladen + installieren |
| `/api/update/progress` | GET | Fortschritt während Installation |
| `/api/update/log` | GET | Installations-Log |
| `/api/update/rollback` | POST | Zum letzten Backup zurückrollen |
| `/api/update/ota/token` | POST/GET | GitHub-Token setzen / Status prüfen |
| `/api/version` | GET | Aktuelle Version (für UI-Reload nach Update) |

---

## In ein anderes Projekt übertragen — Checkliste

### Dateien übertragen

- [ ] `bump_version.py` — anpassen: Projektname im Docstring, Pfad zu pyproject.toml
- [ ] `VERSION` — mit `0.1.0` initialisieren
- [ ] `.github/workflows/auto-release.yml` — anpassen:
  - Release-Archiv-Name (`stoermelder-update-*.tar.gz` → `meinprojekt-update-*.tar.gz`)
  - Inhalt des Archivs (welche Verzeichnisse?)
  - `[skip ci]` Pattern beibehalten
- [ ] `.github/workflows/ci.yml` — anpassen: Linter, Test-Runner
- [ ] `src/.../usb_updater.py` — anpassen:
  - `_github_repo` → eigenes Repo
  - `UPDATE_PATTERN` → eigenes Dateinamens-Pattern
  - `PROTECTED_FILES` / `PROTECTED_DIRS` → projektspezifisch
  - `install_dir` → wo die App liegt

### pyproject.toml

```toml
[project]
name = "meinprojekt"
version = "0.1.0"   # bump_version.py aktualisiert diese Zeile
```

`bump_version.py` sucht nach `version = "..."` mit Regex — Zeile muss genau so aussehen.

### GitHub Token (Laufzeit)

Ein **Fine-grained Personal Access Token** mit:
- Repository: Read access zu `contents` (für releases/latest API)
- Ablauf: 1 Jahr (Kalender-Erinnerung setzen!)

Token in App hinterlegen über UI oder direkt:
```bash
echo "ghp_xxxx" > /opt/meinprojekt/.github_token
chmod 600 /opt/meinprojekt/.github_token
```

### Kritische Details

**Dateiname des Release-Assets muss dem Pattern entsprechen:**
```
meinprojekt-update-1.2.3.tar.gz
               └──────┘ Versionsnummer muss per Regex extrahierbar sein
```

**fetch-depth: 0 im Checkout ist Pflicht:**
```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0   # sonst kann git describe --tags nicht den letzten Tag finden
```

**git config vor git tag (nicht im konditionalen Schritt!):**
```yaml
- name: Configure git          # ← eigener Step, IMMER ausgeführt
  run: |
    git config user.name "github-actions[bot]"
    git config user.email "github-actions[bot]@users.noreply.github.com"

- name: Create tag             # ← nach git config
  run: git tag -a "v..." -m "..."
```
Wenn `git config` im selben Step wie der konditionalen Bump-Commit steht, schlägt
`git tag` fehl mit „Committer identity unknown" weil der git-Config-Step übersprungen wurde.

**systemctl restart nach Update:**
Der Service läuft als root. Subprocess-Aufruf aus dem laufenden Prozess:
```python
subprocess.run(["sudo", "systemctl", "restart", "meinprojekt"], ...)
```
Der Service bricht die eigene TCP-Verbindung ab — das ist gewollt. Die UI zeigt
ein "Neustart..."-Overlay und pollt bis der neue Prozess antwortet.

---

## Bekannte Fallstricke

| Problem | Ursache | Lösung |
|---------|---------|--------|
| CI Endlosschleife | Bump-Commit triggert wieder CI | `[skip ci]` in Commit-Message |
| „Committer identity unknown" bei git tag | `git config` im übersprungenen Schritt | Eigenen unbedingten Step für `git config` |
| Tag existiert bereits, Push schlägt fehl | Manuell und CI bumpen gleichzeitig | Tag-Existenz prüfen vor `git tag` |
| GitHub API 401 | Token abgelaufen oder falsch | Neues Token in UI hinterlegen |
| GitHub API 403 | Rate-Limit (ohne Token) oder fehlendes Scope | Token mit `contents: read` verwenden |
| Versionsvergleich falsch | String-Vergleich: "1.9" > "1.10" | Int-Tupel-Vergleich (siehe `_is_newer`) |
| Update überschreibt Config | PROTECTED_FILES fehlt | Konfigurationsdateien in `PROTECTED_FILES` eintragen |
| `ruff format --check` schlägt fehl | Code vor Push nicht formatiert | `ruff format src/ tests/` vor jedem Commit |
