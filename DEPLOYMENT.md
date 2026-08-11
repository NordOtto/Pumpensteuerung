# Deployment Workflow — Schnell-Deploy auf den Pi & APK

Stand: 2026-05-09

Diese Datei beschreibt den **schnellen Entwicklungs-Deploy** vom lokalen Windows-Rechner direkt auf den Raspberry Pi sowie das Verteilen der Android-App. Der saubere OTA-Release-Pfad ist separat dokumentiert in [OTA-UPDATE-SYSTEM.md](OTA-UPDATE-SYSTEM.md) — dieser hier ist der **Iterations-Pfad** für UI- und Backend-Änderungen während der Entwicklung.

---

## 1. Ziel & Konventionen

- **Pi-Hostname:** `pumpe.local` (mDNS) — feste IP `192.168.20.156` (Stand 03.08.2026)
- **SSH-User:** `pi` — Zugang per SSH-Key, zusätzlich ist ein Passwort gesetzt
- **MQTT-Broker:** `192.168.20.136` (anderes Gerät, im selben Subnetz wie Pi/LOGO)
- **Service-User für Files:** `pumpe:pumpe`
- **Frontend-Verzeichnis (LIVE):** `/opt/pumpe/current/frontend/.next/standalone/`
- **Backend-Verzeichnis (LIVE):** `/opt/pumpe/current/backend/app/`
- **systemd-Services:** `pumpe-backend.service`, `pumpe-frontend.service`
- **APK-Auslieferung:** `https://pumpe.local/pumpe.apk` (via nginx)

> **Nach einem IP-Wechsel:** `pumpe.local` kann noch auf die alte Adresse zeigen,
> bis der mDNS-Cache abgelaufen ist — SSH läuft dann in einen Timeout. In dem Fall
> alle Befehle mit der IP statt dem Namen ausführen (`pi@192.168.20.156`).
>
> Der Pi bezieht seine Adresse aktuell **per DHCP über WLAN** (`wlan0`). Sie kann
> sich also erneut ändern. Für dauerhaft stabile Erreichbarkeit entweder im Router
> eine DHCP-Reservierung auf die MAC setzen oder die IP per `nmcli` fest vergeben
> (siehe [INSTALL.md](INSTALL.md), Abschnitt 2.2).

> **Wichtig:** Der Frontend-Service lädt `/opt/pumpe/current/frontend/.next/standalone/server.js`. Der **verschachtelte** Pfad (`.next/standalone/`) ist Pflicht — ein Deploy direkt nach `/opt/pumpe/current/frontend/` wird **nicht** geladen.

---

## 2. Frontend-only Deploy (UI-Änderung)

Wenn nur Next.js-Code geändert wurde:

```powershell
# 1) Build
cd c:\dev\modbus_logo\pi\frontend
npm run build

# 2) Tars packen
cd .next\standalone
tar czf /tmp/standalone.tar.gz .
cd c:\dev\modbus_logo\pi\frontend
tar czf /tmp/static.tar.gz .next/static public

# 3) Auf Pi kopieren
scp /tmp/standalone.tar.gz /tmp/static.tar.gz pi@pumpe.local:/tmp/

# 4) Auf Pi: stoppen, auspacken, neu starten
ssh pi@pumpe.local "
  sudo systemctl stop pumpe-frontend && \
  sudo rm -rf /opt/pumpe/current/frontend/.next/standalone && \
  sudo mkdir -p /opt/pumpe/current/frontend/.next/standalone && \
  sudo tar xzf /tmp/standalone.tar.gz -C /opt/pumpe/current/frontend/.next/standalone/ && \
  sudo tar xzf /tmp/static.tar.gz -C /opt/pumpe/current/frontend/.next/standalone/ && \
  sudo chown -R pumpe:pumpe /opt/pumpe/current/frontend && \
  sudo systemctl start pumpe-frontend && \
  sleep 4 && systemctl is-active pumpe-frontend
"
```

Erwartete Ausgabe: `active`

### Danach immer prüfen: liefert der Pi den Service Worker?

```bash
curl -sk -o /dev/null -w "%{http_code}\n" https://pumpe.local/sw.js   # muss 200 sein
```

**404 heißt: `public/` wurde nicht mitdeployt.** Der Service Worker liegt in
`public/`, und `npm run build` kopiert dieses Verzeichnis **nicht** in
`.next/standalone`. Fehlt es, behalten installierte Apps ihren alten
Service Worker — sie laden dann zwar die neue HTML-Seite, aber weiter die
**alten JS-Chunks** aus dessen Precache. Symptom: Änderungen erscheinen auf
dem Handy nicht, obwohl der Pi sie korrekt ausliefert.

Gegenprobe, ob der ausgelieferte SW zum aktuellen Build passt:

```bash
curl -sk https://pumpe.local/sw.js | grep -o 'layout-[a-f0-9]*\.js' | sort -u
curl -sk https://pumpe.local/dashboard | grep -o 'layout-[a-f0-9]*\.js' | sort -u
```

Beide Hashes müssen identisch sein.

### Verifikation

```powershell
curl -sk https://pumpe.local/dashboard | grep -oE "<charakteristischer-string>"
```

Wenn alter Inhalt zurückkommt: meistens ist der Service noch aus alten standalone-Dateien gestartet — den `rm -rf` Schritt wirklich ausführen.

---

## 3. Backend-only Deploy (Python-Änderung)

```powershell
scp c:/dev/modbus_logo/pi/backend/app/<datei>.py pi@pumpe.local:/tmp/
ssh pi@pumpe.local "
  sudo cp /tmp/<datei>.py /opt/pumpe/current/backend/app/<datei>.py && \
  sudo systemctl restart pumpe-backend && \
  sleep 5 && systemctl is-active pumpe-backend
"
```

Bei Schema-Änderungen (z.B. `irrigation.py`): unbedingt das systemd-Log nach Restart prüfen — alte JSON-Daten könnten Migration verursachen:

```powershell
ssh pi@pumpe.local "sudo journalctl -u pumpe-backend -n 30 --no-pager"
```

---

## 4. Full Deploy (Frontend + Backend)

```powershell
# Build
cd c:\dev\modbus_logo\pi\frontend; npm run build

# Tars + Backend in einem Rutsch
cd .next\standalone; tar czf /tmp/standalone.tar.gz .
cd c:\dev\modbus_logo\pi\frontend; tar czf /tmp/static.tar.gz .next/static public
scp /tmp/standalone.tar.gz /tmp/static.tar.gz `
    c:/dev/modbus_logo/pi/backend/app/irrigation.py `
    pi@pumpe.local:/tmp/

# Pi: alles neu starten
ssh pi@pumpe.local "
  sudo cp /tmp/irrigation.py /opt/pumpe/current/backend/app/ && \
  sudo systemctl restart pumpe-backend && \
  sudo systemctl stop pumpe-frontend && \
  sudo rm -rf /opt/pumpe/current/frontend/.next/standalone && \
  sudo mkdir -p /opt/pumpe/current/frontend/.next/standalone && \
  sudo tar xzf /tmp/standalone.tar.gz -C /opt/pumpe/current/frontend/.next/standalone/ && \
  sudo tar xzf /tmp/static.tar.gz -C /opt/pumpe/current/frontend/.next/standalone/ && \
  sudo chown -R pumpe:pumpe /opt/pumpe/current/frontend && \
  sudo systemctl start pumpe-frontend && \
  sleep 5 && systemctl is-active pumpe-frontend pumpe-backend
"
```

---

## 5. Android-App (Capacitor APK)

Die App ist ein **Wrapper im Remote-URL-Modus** — sie lädt die UI live von `https://pumpe.local`. **UI-Änderungen brauchen keine neue APK** — das Service-Worker-PWA-Setup zieht das automatisch.

### Wann eine neue APK nötig ist

- Pi-Cert wurde getauscht (Cert-Pinning in der APK schlägt sonst fehl)
- `capacitor.config.ts` geändert (z.B. andere Pi-IP/URL)
- Capacitor selbst auf neue Major-Version
- Native Android-Permissions ergänzt

### APK bauen + verteilen

```powershell
cd c:\dev\modbus_logo\pi\frontend\android
.\gradlew.bat assembleRelease --no-daemon

# APK auf Pi schieben (überschreibt die alte)
scp app\build\outputs\apk\release\app-release.apk `
    pi@pumpe.local:/tmp/pumpe.apk
ssh pi@pumpe.local "sudo mv /tmp/pumpe.apk /var/www/pumpe/downloads/pumpe.apk"
```

Auf dem Handy: Browser → `https://pumpe.local/pumpe.apk` → Download → über die alte App drüber installieren (gleiche Signatur → kein Deinstallieren nötig).

### Cert-Setup in der APK

Das Pi-Cert ist gepinnt in `pi/frontend/android/app/src/main/res/raw/pumpe.crt` und durch `network_security_config.xml` als Trust-Anchor verknüpft. Bei Cert-Wechsel auf dem Pi:

```powershell
# Neues Cert vom Pi exportieren
openssl s_client -connect pumpe.local:443 -showcerts </dev/null 2>NUL | `
  openssl x509 -outform DER -out c:\dev\modbus_logo\pi\frontend\android\app\src\main\res\raw\pumpe.crt
# Dann APK neu bauen (siehe oben)
```

> Beim initialen Pi-Cert immer `-days 3650` setzen, damit man nicht alle 90 Tage die APK rebuilden muss.

---

## 6. Häufige Fehler & Fixes

| Symptom | Ursache | Fix |
|---|---|---|
| `curl https://pumpe.local/dashboard` zeigt alten Inhalt trotz Deploy | Standalone-Dir wurde nur überschrieben statt geleert | `sudo rm -rf .../.next/standalone` vor `tar xzf` |
| `pumpe-frontend` startet, lädt aber alten Build | Mehrere `BUILD_ID`s in `.next/static`, alte Chunks blockieren | `rm -rf .next/standalone` UND beide Tars frisch entpacken |
| Backend startet nicht nach Schema-Migration | `KeyError: 'days'` o.ä. weil alte JSON-Datei | Migration in `_normalize_program()` ergänzen, dann Service neu starten |
| App auf Handy zeigt alte UI obwohl Pi neue liefert | Service-Worker-Cache | App aus Switcher wegwischen + neu öffnen (ggf. 2×). Seit SW-Fix (`skipWaiting`+`NetworkFirst` in `next.config.mjs`) zieht die App neue Builds automatisch. **Einmaliger** Altlast-SW: Android → Apps → App/Chrome → Speicher → Cache leeren. Fully Kiosk: Menü (7-Finger-Tipp) → Advanced Web Settings → Clear Cache, oder Android → Apps → Fully Kiosk → Speicher → Cache leeren |
| `Host key verification failed` beim ersten SSH | `~/.ssh/known_hosts` kennt Pi noch nicht | `ssh-keyscan -H pumpe.local >> ~/.ssh/known_hosts` |

---

## 7. Verzeichnis-Layout auf dem Pi (Referenz)

```
/opt/pumpe/
├── current/                            ← Symlink auf aktive Release
│   ├── backend/
│   │   ├── app/                        ← Python-Module (Hot-deployed via scp)
│   │   ├── data/                       ← Persistente JSONs (presets, programs)
│   │   └── .venv/
│   └── frontend/
│       └── .next/
│           ├── server/                 ← Pre-rendered HTML (read-only)
│           ├── static/                 ← Static Chunks (read-only)
│           └── standalone/             ← Next.js Standalone-Server (LIVE)
│               ├── server.js           ← systemd ExecStart-Ziel
│               ├── public/
│               └── .next/static/       ← In Standalone gespiegelt
└── releases/
    └── v0.1.X/                         ← Vergangene OTA-Releases (zum Rollback)

/var/www/pumpe/downloads/
└── pumpe.apk                           ← APK-Download für Handy

/etc/nginx/sites-available/
└── pumpe                               ← HTTPS Proxy + APK-Location
```

---

## 8. Release-Pfad (sauber, nachvollziehbar)

Wenn ein Stand stabil ist und in den OTA-Pfad soll:

```bash
git tag v0.1.34
git push origin v0.1.34
# GitHub Actions baut Release-Tarball, signiert, lädt nach GitHub Releases
# Pi-OTA-Timer (≤60 min) zieht es automatisch
```

Details siehe [OTA-UPDATE-SYSTEM.md](OTA-UPDATE-SYSTEM.md).
