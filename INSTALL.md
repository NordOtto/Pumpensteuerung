# Installation — Pumpensteuerung auf Pi 3B+

Komplette Hardware- und Software-Anleitung für die Migration vom alten
Stack (ESP32 + Docker + LOGO + HA) auf einen Raspberry Pi 3B+ als
alleiniges Gehirn. Reihenfolge ist absichtlich konservativ: das alte
System läuft bis zum letzten Schritt parallel weiter.

> **Sicherheitshinweis vorab:** alle Arbeiten am V20 nur stromfrei.
> 230 V Netzteil und 24 V LOGO-Versorgung in der Schaltschranktür sauber
> abklemmen. Vorhandene Erdung **nicht trennen** — der RS485-Bus läuft
> nur stabil, wenn V20-PE und Pi-GND auf demselben Bezug liegen.

---

## Teil 1 — Hardware-Aufbau

### Stückliste

| Pos | Bauteil | Hinweis |
|---|---|---|
| 1 | Raspberry Pi 3B+ | mit 32 GB Micro-SD (Klasse A1, ≥100 MB/s) |
| 2 | Hutschienen-Netzteil 5 V / 3 A | z.B. MeanWell HDR-15-5; Pi mag 5 V ±5 % stabil |
| 3 | Aktiver Pi-Lüfter oder Heatsink | Schaltschrank wird im Sommer warm, sonst thermal-throttling |
| 4 | TTL-RS485-Adapter (vorhanden, MAX13487 vom ESP32) | bleibt erstmal, wird umgesteckt |
| 5 | Kurzes 4-adriges Kabel (TTL-Seite) | zum Verbinden Adapter ↔ Pi-GPIO |
| 6 | LAN-Patchkabel | Pi an denselben Switch wie LOGO |

> **Geplant für später, nicht für Phase 1 nötig:** Waveshare USB-to-RS485-B
> (galvanisch isoliert, ~25 €) — ersetzt den TTL-Adapter. Solange Phase 1
> läuft, bleibt der TTL-Adapter dran. Ein nicht-isolierter USB-Stick (CH340
> ohne Optokoppler) ist **keine** Verbesserung gegenüber dem TTL-Adapter.

### Verkabelung TTL-Adapter ↔ Pi

Der MAX13487-Adapter hängt aktuell an ESP32 GPIO16/17. Du steckst
denselben Adapter um an die Pi-GPIO-Leiste:

```
TTL-Adapter (vom ESP32 abziehen)        Pi 3B+ 40-Pin Header
┌──────────────┐                         ┌──────────────────────┐
│ VCC  (3.3V)  ├─────────────────────────┤ Pin 1   3.3V         │
│ GND          ├─────────────────────────┤ Pin 6   GND          │
│ RXD  (TTL)   ├─────────────────────────┤ Pin 8   GPIO14 / TXD │  Pi → Adapter
│ TXD  (TTL)   ├─────────────────────────┤ Pin 10  GPIO15 / RXD │  Pi ← Adapter
│ A (D+) ──────┼──── unverändert zum V20 P+ (Klemme 6)
│ B (D−) ──────┼──── unverändert zum V20 N− (Klemme 5)
└──────────────┘
```

**Wichtig — drei häufige Fehler:**
1. **RX/TX kreuzen.** Adapter-RXD ist Eingang am Adapter, gehört an
   Pi-GPIO14 (TX). Adapter-TXD an Pi-GPIO15 (RX).
2. **3.3 V, nicht 5 V.** Wenn der Adapter ein Jumper-Modul mit 5V/3.3V
   ist, auf 3.3 V stellen. Pi-GPIOs vertragen kein 5 V.
3. **Abschlusswiderstand 120 Ω** zwischen A und B am Bus-Ende. V20 hat
   einen DIP-Schalter dafür (`R3` aktivieren) — wenn der Pi am Anfang
   des Buses sitzt, reicht der V20-Abschluss am Ende.

### Verkabelung LOGO ↔ Pi (Modbus TCP über LAN)

LOGO bleibt physisch unverändert. Nur die **Ziel-IP im LOGO-Programm**
wird später (Schritt 7 unten) von ESP32-IP auf Pi-IP umgestellt.

```
LOGO 8.4 ──── Switch/Router ──── Pi3B+ (eth0, statische IP)
```

Empfohlene IPs:
- LOGO: 192.168.1.40
- Pi:   192.168.1.50
- alter Heimserver mit MQTT-Broker: 192.168.1.136 (bleibt!)

### Verkabelungs-Übersicht

```
230 V ─┬─ Hutschienen-NT 5V/3A ─── Pi3B+ (USB-C)
       └─ V20 FU L/N

Pi GPIO 1/6/8/10 ─── TTL-Adapter (TTL-Seite)
                     TTL-Adapter (RS485-Seite) ─── V20 P+/N−/0V

Pi eth0 ─── Switch ─── LOGO LAN
                  └── Heimnetz (DHCP, Heimserver mit MQTT-Broker)

LOGO Sensoren     (24 V / 4–20 mA an LOGO Analog-Eingängen, unverändert)
```

---

## Teil 2 — Pi-Software-Installation

### 2.1 SD-Karte vorbereiten

Auf dem Dev-Rechner mit dem **Raspberry Pi Imager**:

1. Image: **Raspberry Pi OS Lite (64-bit) Bookworm**
2. Vor dem Schreiben das Zahnrad öffnen:
   - Hostname: `pumpe`
   - SSH aktivieren, Public Key hinterlegen
   - Benutzer/Passwort setzen (Default `pi` ist deaktiviert in neueren Images — eigenen User anlegen)
   - WLAN: am besten **nicht**, sondern Kabel; Ethernet auf statische IP
3. Schreiben, einsetzen, Pi booten.

### 2.2 Erstes Login + Grundkonfiguration

```bash
ssh deinuser@192.168.1.50

# Statische IP setzen (Bookworm: NetworkManager)
sudo nmcli connection modify "Wired connection 1" \
    ipv4.method manual \
    ipv4.addresses 192.168.1.50/24 \
    ipv4.gateway 192.168.1.1 \
    ipv4.dns "192.168.1.1 1.1.1.1"
sudo nmcli connection up "Wired connection 1"

# System aktuell
sudo apt update && sudo apt upgrade -y

# Optional: Hostname-Auflösung im LAN
sudo apt install -y avahi-daemon   # → pumpe.local funktioniert
```

### 2.3 Repo klonen + Setup-Skript ausführen

```bash
sudo apt update && sudo apt install git -y

# Token setzen und klonen
export GH_TOKEN=ghp_xxxxxxxxxxxx
git clone -b pi-migration https://${GH_TOKEN}@github.com/NordOtto/Pumpensteuerung.git /tmp/pumpensteuerung

# Setup ausführen
sudo bash /tmp/pumpensteuerung/pi/ops/setup.sh
```

Das Skript macht in einem Rutsch (~15 min):
1. APT-Pakete: Python 3, Node 20, nginx, minisign, jq, curl, openssl, git
2. User `pumpe` anlegen, in `dialout`-Gruppe (für `/dev/ttyAMA0`)
3. Verzeichnisstruktur in `/opt/pumpe/` und `/var/lib/pumpe/data/`
4. **UART aktivieren + Bluetooth abschalten** (sonst belegt BT den primären UART)
5. Erst-Release lokal aus dem geklonten Repo bauen (Backend venv + Frontend `npm run build`)
6. OTA-Skript installieren
7. systemd-Units einrichten und enablen
8. nginx mit Self-Signed-TLS konfigurieren
9. Backend + Frontend starten

Am Ende zeigt das Skript einen TODO-Block mit den nächsten manuellen
Schritten an.

### 2.4 .env mit Zugangsdaten füllen

```bash
sudo -u pumpe nano /opt/pumpe/current/backend/.env
```

Mindestens setzen:
```ini
MQTT_BROKER=192.168.1.136
MQTT_PORT=1883
MQTT_USER=<aus deinem alten ESP32-secrets.h oder Heimserver>
MQTT_PASS=<aus deinem alten ESP32-secrets.h oder Heimserver>

# RTU-Pfad — primärer Pi-UART nach disable-bt
RTU_PORT=/dev/ttyAMA0
RTU_BAUD=9600
RTU_SLAVE=1

TZ=Europe/Berlin
```

> **Falls du später auf USB-RS485 umstellst:** `RTU_PORT=/dev/ttyUSB0`

Backend neu starten:
```bash
sudo systemctl restart pumpe-backend.service
```

### 2.5 Bestehende Configs migrieren (optional, empfohlen)

Damit Presets, Zeitfenster, Bewässerungs-Programme nicht neu eingerichtet
werden müssen:

```bash
# Auf dem alten Heimserver
docker cp pumpe-backend:/data ./old-data

# Auf den Pi rüber
scp -r old-data/* pumpe@pumpe.local:/var/lib/pumpe/data/

# Backend neu starten — beim nächsten Start migriert es
# irrigation_history.json automatisch nach SQLite
sudo systemctl restart pumpe-backend
```

### 2.6 UART-Reboot + Smoke-Test

```bash
sudo reboot
```

Nach dem Reboot:
```bash
# Services laufen?
systemctl status pumpe-backend pumpe-frontend nginx

# Backend antwortet?
curl -s http://127.0.0.1:8000/api/health
# → {"ok":true,"uptime":...,"fw":"pi-backend-0.1.0"}

# RTU sieht V20? (wichtig: V20 muss eingeschaltet sein)
sudo -u pumpe /opt/pumpe/current/backend/.venv/bin/python -c "
from pymodbus.client import ModbusSerialClient
c = ModbusSerialClient('/dev/ttyAMA0', baudrate=9600, parity='N', stopbits=1, bytesize=8)
c.connect()
r = c.read_holding_registers(109, count=2, slave=1)
print('ZSW=0x%04X HIW=0x%04X' % (r.registers[0], r.registers[1]) if not r.isError() else 'Fehler')
"
```

Wenn `ZSW=0x...` kommt → RTU-Bus ist sauber, V20 antwortet. Falls nicht:
- Verkabelung A/B vertauscht? → tauschen
- Adapter VCC nicht 3.3 V? → Jumper prüfen
- Ist V20 auf Adresse 1, 9600 8N1? → V20 P-Parameter P2010=8, P2011=1, P2012=2

### 2.7 LOGO umschalten

Erst wenn der RTU-Smoke-Test grün ist:

1. **LOGO-Soft Comfort** öffnen, dein bestehendes Programm laden
2. Modbus-TCP-Block finden (schreibt in HR 3/4/5 = Druck/Flow/Wassertemp)
3. **Ziel-IP** ändern: ESP32-IP → Pi-IP (192.168.1.50)
4. Programm in die LOGO laden
5. Pi-Logs beobachten:
   ```bash
   journalctl -u pumpe-backend -f
   ```
   Du solltest Druck/Flow/Wassertemp jetzt im Live-WebSocket sehen
   (Frontend `https://pumpe.local/dashboard` → KPIs leben).

### 2.8 ESP32 stilllegen (oder umfunktionieren)

Du hast jetzt **zwei Optionen**:

**Option A — komplett abschalten:**
ESP32 Stromversorgung trennen. V20-RTU-Bus läuft direkt am Pi.

**Option B — als Lüfter-Sub-Node weiternutzen:**
ESP32 bleibt am Strom, hängt nur noch die LOGO-TCP-Logik in der Luft
(weil LOGO jetzt zum Pi schreibt). Dafür ESP32-Firmware aktualisieren
oder so lassen — Lüfter+DS18B20 publishen weiter auf MQTT, das Pi-Backend
empfängt sie über die `raw/temperature` und `raw/fan/*` Topics.

Empfehlung Phase 1: **Option A** — eine Komponente weniger zum Warten.

---

## Teil 3 — Home Assistant (optional)

Wenn du deinen bestehenden HA weiterhin als zweite Bedienoberfläche nutzen
willst, **musst du nichts mehr konfigurieren**: das Pi-Backend feuert beim
ersten MQTT-Connect die Auto-Discovery-Topics, identisch zum alten
Backend. Alle Entitäten erscheinen automatisch unter dem Gerät
"Pumpensteuerung".

Wenn HA bereits Entitäten vom alten Backend hat: einfach Discovery laufen
lassen, identische `uniq_id` → HA aktualisiert in-place.

**Wenn HA wegfallen soll**: nichts zu tun. Pi-Backend ist nicht von HA
abhängig — alle Steuerung läuft über das eingebaute Frontend
`https://pumpe.local/`.

---

## Teil 4 — OTA-Updates einrichten

### 4.1 Minisign-Schlüsselpaar erzeugen (einmalig, auf Dev-Rechner)

```bash
minisign -G -p minisign.pub -s minisign.key
# Passwort merken!
```

### 4.2 Pubkey auf den Pi

```bash
scp minisign.pub pumpe@pumpe.local:/tmp/
ssh pumpe@pumpe.local "sudo install -o pumpe -g pumpe -m 0644 /tmp/minisign.pub /opt/pumpe/ota/minisign.pub"
```

### 4.3 OTA-Config anpassen

```bash
ssh pumpe@pumpe.local
sudo -u pumpe nano /opt/pumpe/ota/config.env
```
```ini
GITHUB_REPO=NordOtto/Pumpensteuerung
MINISIGN_PUBKEY=/opt/pumpe/ota/minisign.pub
```

Timer aktivieren:
```bash
sudo systemctl enable --now pumpe-ota.timer
```

### 4.4 Privaten Schlüssel als GitHub-Secret hinterlegen

GitHub Repo → Settings → Secrets → Actions:
- `MINISIGN_KEY`: Inhalt von `minisign.key`
- `MINISIGN_PASSWORD`: dein Passwort

### 4.5 Erstes Release auslösen

```bash
git tag v1.0.0
git push origin v1.0.0
# → GitHub Actions baut + signiert + publisht das Release
```

Pi pullt beim nächsten Timer-Tick (≤60 min) automatisch. Sofort erzwingen:
```bash
ssh pumpe@pumpe.local
sudo systemctl start pumpe-ota.service
journalctl -u pumpe-ota -n 50
```

Rollback wenn nötig:
```bash
sudo -u pumpe /opt/pumpe/ota/update.sh rollback
```

---

## Teil 5 — Hardening (vor Produktivbetrieb)

### Firewall — Frontend nur im LAN

```bash
sudo apt install -y ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow from 192.168.0.0/16 to any port 443
sudo ufw allow from 192.168.0.0/16 to any port 502 comment "Modbus TCP von LOGO"
sudo ufw enable
```

### Auto-Update Linux-Pakete

```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

### Backup-Strategie

```bash
# Wöchentliches Backup von Configs + SQLite
sudo crontab -e
# Eintrag:
# 0 3 * * 0 tar -czf /var/lib/pumpe/backup-$(date +\%Y\%m\%d).tar.gz /var/lib/pumpe/data /var/lib/pumpe/state.db
```

---

## Teil 6 — Wartung-Cheat-Sheet

| Aufgabe | Befehl |
|---|---|
| Status alle Services | `systemctl status 'pumpe-*'` |
| Backend-Log live | `journalctl -u pumpe-backend -f` |
| Frontend-Log live | `journalctl -u pumpe-frontend -f` |
| OTA-Log letzter Lauf | `journalctl -u pumpe-ota -n 50` |
| Aktuelle Version | `/opt/pumpe/ota/update.sh status` |
| OTA jetzt prüfen | `sudo systemctl start pumpe-ota.service` |
| Rollback | `sudo -u pumpe /opt/pumpe/ota/update.sh rollback` |
| nginx neu laden | `sudo systemctl reload nginx` |
| RTU testen | `python -c "..."` (siehe 2.6) |
| SQLite öffnen | `sqlite3 /var/lib/pumpe/state.db ".tables"` |

---

## Teil 7 — Troubleshooting

### "RTU getrennt" im Frontend / im Log

- V20 stromlos? → V20 prüfen
- Verkabelung A/B vertauscht? → tauschen
- Adapter-VCC auf 5 V statt 3.3 V? → Jumper prüfen, Pi-GPIO kann 5 V grillen
- BT abschalten hat nicht gegriffen? → `dmesg | grep -i uart`, ggf. `/boot/firmware/config.txt` prüfen
- User pumpe nicht in `dialout`? → `groups pumpe`, ggf. `sudo usermod -aG dialout pumpe`

### LOGO schreibt nicht zum Pi

- LOGO-Programm noch alte ESP32-IP? → in LOGO-Soft Comfort umstellen und reuploaden
- Firewall blockiert Port 502? → siehe Teil 5
- LOGO-IP/Pi-IP im selben Subnetz? → `ping` prüfen

### MQTT "nicht verbunden" im Frontend

- Broker-IP/Credentials in `.env` falsch? → korrigieren, `systemctl restart pumpe-backend`
- Broker-User hat keine ACL für `pumpensteuerung/#`? → Mosquitto-ACL prüfen

### "Trockenlauf-Sperre" obwohl alles ok

Wenn die Sperre nach Pumpentausch / Wartung stehen bleibt:
- Frontend → Settings → "Trockenlauf-Sperre zurücksetzen"
- Oder: `curl -X POST http://127.0.0.1:8000/api/pressure/reset_dryrun`

### Frontend zeigt nur "Verbinde mit Steuerung…"

WebSocket kommt nicht durch:
- Backend down? → `systemctl status pumpe-backend`
- nginx-Konfiguration kaputt? → `sudo nginx -t`, `journalctl -u nginx -n 50`
- Browser-Console öffnen, dort steht der WS-Fehler

---

## Teil 8 — Migration aus dem alten Stack (Cheat-Sheet)

```bash
# 1. Alten Backend-Container stoppen (NICHT löschen — Rollback-Backup)
ssh heimserver "docker stop pumpe-backend pumpe-nginx"

# 2. Watchtower pausieren, damit alte Container nicht wieder aktualisiert werden
ssh heimserver "docker pause watchtower"

# 3. Pi übernimmt — eine Woche beobachten
ssh pumpe@pumpe.local "journalctl -u pumpe-backend -f"

# 4. Wenn alles stabil: alten Stack endgültig entfernen
ssh heimserver "docker rm pumpe-backend pumpe-nginx; docker volume prune"
```

Das war's. Pumpe läuft jetzt auf dem Pi.
