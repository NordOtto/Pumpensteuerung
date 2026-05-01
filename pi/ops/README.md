# Ops — Pi-Deployment & OTA

Alles, um die Pumpensteuerung auf einem Raspberry Pi 3B+ zu installieren
und am Laufen zu halten.

## Layout auf dem Pi

```
/opt/pumpe/
├── current → releases/v1.x.y    # Symlink (atomarer Swap)
├── releases/
│   ├── v0.1.0-bootstrap/        # erster lokaler Build aus dem Repo
│   ├── v1.0.0/                  # OTA-gezogen
│   └── ...
└── ota/
    ├── update.sh
    ├── config.env               # Repo-Name + Pubkey-Pfad
    └── minisign.pub             # Pubkey aus GitHub-Secret abgeleitet

/var/lib/pumpe/data/             # Persistente JSON-Configs (presets, timeguard, …)
/etc/pumpe/ssl/{cert,key}.pem    # Self-Signed TLS
/etc/nginx/sites-enabled/pumpe   # nginx vhost
/etc/systemd/system/pumpe-*.{service,timer}
```

## Erstinstallation (~15 min)

```bash
# 1) Pi vorbereiten: Raspbian Bookworm Lite, statische IP, SSH+Schlüssel.

# 2) Repo aufs Pi:
git clone -b pi-migration https://github.com/NordOtto/Pumpensteuerung.git /tmp/pumpensteuerung

# 3) Setup-Skript:
sudo bash /tmp/pumpensteuerung/pi/ops/setup.sh

# 4) .env anpassen (MQTT-Credentials, ggf. RTU_PORT):
sudo -u pumpe nano /opt/pumpe/current/backend/.env

# 5) Backend neu starten:
sudo systemctl restart pumpe-backend.service

# 6) Logs verfolgen:
journalctl -u pumpe-backend -f

# 7) Reboot, damit die UART-Umschaltung greift:
sudo reboot
```

Nach dem Reboot ist das Frontend unter `https://<pi-ip>/` erreichbar
(Self-Signed-Cert akzeptieren).

## OTA-Updates

### Auf dem Pi einrichten

```bash
# 1) Minisign-Pubkey hinterlegen (kommt aus dem GitHub-Build-Secret)
sudo -u pumpe cp minisign.pub /opt/pumpe/ota/minisign.pub

# 2) config.env anpassen:
sudo -u pumpe nano /opt/pumpe/ota/config.env
# GITHUB_REPO=NordOtto/Pumpensteuerung

# 3) Timer aktivieren:
sudo systemctl enable --now pumpe-ota.timer

# 4) Manuell prüfen:
sudo -u pumpe /opt/pumpe/ota/update.sh status
sudo -u pumpe /opt/pumpe/ota/update.sh check-and-apply
```

### Release publishen (vom Dev-Rechner)

```bash
# Minisign-Schlüsselpaar erzeugen (einmalig):
minisign -G -p minisign.pub -s minisign.key
# → minisign.pub auf den Pi, minisign.key + Passwort als
#   GitHub-Secrets MINISIGN_KEY und MINISIGN_PASSWORD hinterlegen

# Release auslösen:
git tag v1.0.0
git push origin v1.0.0
# → GitHub Actions baut & signiert das Tarball, hängt es ans Release.

# Pi pullt beim nächsten Timer-Tick (≤60 min) automatisch.
# Oder sofort:
sudo systemctl start pumpe-ota.service
```

### Rollback

```bash
sudo -u pumpe /opt/pumpe/ota/update.sh rollback
```
Schaltet den `current`-Symlink zurück auf das vorherige Release und
restartet die Services. Der OTA-Smoke-Test (HTTP 200 auf `/api/health`)
löst Rollback automatisch aus, wenn ein Release nicht hochkommt.

## Migration vom alten Docker-Stack

Die JSON-Configs sind kompatibel — einfach rüberkopieren:

```bash
# Auf altem Heimserver:
docker cp pumpe-backend:/data ./old-data

# Auf den Pi:
scp -r old-data/* pumpe@pi:/var/lib/pumpe/data/
sudo systemctl restart pumpe-backend
```

## Wartungs-Cheat-Sheet

| Aufgabe | Befehl |
|---|---|
| Status alle Services | `systemctl status 'pumpe-*'` |
| Backend-Log live | `journalctl -u pumpe-backend -f` |
| Frontend-Log live | `journalctl -u pumpe-frontend -f` |
| OTA-Log letzter Lauf | `journalctl -u pumpe-ota -n 50` |
| Aktuelle Version | `/opt/pumpe/ota/update.sh status` |
| nginx neu laden | `sudo systemctl reload nginx` |
| TLS-Cert erneuern | Skript-Schritt 8 in `setup.sh` |
| Modbus-RTU testen | `python3 -c "from pymodbus.client import ModbusSerialClient; c=ModbusSerialClient('/dev/ttyAMA0',baudrate=9600); c.connect(); print(c.read_holding_registers(109,2,slave=1).registers)"` |

## Sicherheits-Hinweise

- nginx hört auf 0.0.0.0:443 — per `ufw` auf das LAN beschränken:
  ```
  sudo ufw default deny incoming
  sudo ufw allow from 192.168.0.0/16 to any port 443
  sudo ufw allow ssh
  sudo ufw enable
  ```
- Default-Login admin/admin sobald `auth.py` portiert ist — beim ersten
  Login wird Passwortwechsel erzwungen.
- Bestehender MQTT-Broker `192.168.1.136:1883` — Pi-Backend authentisiert
  mit den Credentials aus `.env`. Kein lokaler Mosquitto.
