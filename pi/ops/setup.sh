#!/usr/bin/env bash
# pi/ops/setup.sh — Erstinstallation auf einem frischen Pi 3B+ (Raspbian Bookworm Lite).
#
# Voraussetzung: Pi gebootet, SSH erreichbar, Repo nach /tmp/modbus_logo geklont.
# Ausführen mit: sudo bash /tmp/modbus_logo/pi/ops/setup.sh
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
INSTALL_DIR="/opt/pumpe"
DATA_DIR="/var/lib/pumpe"
SSL_DIR="/etc/pumpe/ssl"
PI_USER="pumpe"

[[ $EUID -eq 0 ]] || { echo "Bitte als root ausführen (sudo)"; exit 1; }

echo "[1/9] System-Pakete installieren"
apt-get update
# Node 20 von NodeSource (Bookworm liefert nur Node 18, Next 15 braucht 20+).
# WICHTIG: NodeSource-Repo VOR apt-get install einrichten, sonst zieht Debians
# 'npm' libnode108 rein und kollidiert mit dem späteren nodesource-nodejs.
# nodesource-nodejs bringt npm bereits mit — kein separates npm-Paket nötig.
if ! command -v node >/dev/null 2>&1 || ! node -v | grep -qE "^v(20|22)\."; then
    echo "  NodeSource Node 20 Repo einrichten"
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
fi
apt-get install -y --no-install-recommends \
    python3 python3-venv python3-pip \
    nodejs \
    nginx \
    minisign jq curl \
    openssl \
    git

echo "[2/9] User '$PI_USER' anlegen"
id -u "$PI_USER" >/dev/null 2>&1 || useradd -r -s /usr/sbin/nologin -m -d /home/"$PI_USER" "$PI_USER"
usermod -aG dialout "$PI_USER"

echo "[3/9] Verzeichnisstruktur"
mkdir -p "$INSTALL_DIR"/{releases,ota} "$DATA_DIR"/data "$SSL_DIR"
chown -R "$PI_USER":"$PI_USER" "$INSTALL_DIR" "$DATA_DIR"

echo "[4/9] UART aktivieren (Bluetooth abschalten — TTL-Adapter an /dev/ttyAMA0)"
CONFIG_TXT=/boot/firmware/config.txt
[[ -f $CONFIG_TXT ]] || CONFIG_TXT=/boot/config.txt
grep -q "^enable_uart=1" "$CONFIG_TXT" || echo "enable_uart=1" >> "$CONFIG_TXT"
grep -q "^dtoverlay=disable-bt" "$CONFIG_TXT" || echo "dtoverlay=disable-bt" >> "$CONFIG_TXT"
systemctl disable hciuart 2>/dev/null || true
# Serial-Console abschalten (sonst belegt sie den UART)
sed -i 's/console=serial0,[0-9]\+ //g' /boot/firmware/cmdline.txt 2>/dev/null || \
sed -i 's/console=serial0,[0-9]\+ //g' /boot/cmdline.txt 2>/dev/null || true

echo "[5/9] Erst-Release aus dem geklonten Repo bauen (manuell, nicht aus GitHub)"
TAG="v0.1.0-bootstrap"
TARGET="$INSTALL_DIR/releases/$TAG"
mkdir -p "$TARGET"/{backend,frontend}

# Backend
cp -r "$REPO_DIR/pi/backend/app" "$TARGET/backend/"
cp "$REPO_DIR/pi/backend/pyproject.toml" "$TARGET/backend/"
cp "$REPO_DIR/pi/backend/.env.example" "$TARGET/backend/.env"
chown -R "$PI_USER":"$PI_USER" "$TARGET"
sudo -u "$PI_USER" python3 -m venv "$TARGET/backend/.venv"
sudo -u "$PI_USER" "$TARGET/backend/.venv/bin/pip" install --upgrade pip --quiet
sudo -u "$PI_USER" "$TARGET/backend/.venv/bin/pip" install -e "$TARGET/backend" --quiet

# Frontend
echo "  Frontend bauen (kann auf dem Pi 3B+ ein paar Minuten dauern)"
cp -r "$REPO_DIR/pi/frontend" "$TARGET/frontend.src"
( cd "$TARGET/frontend.src" && npm ci --legacy-peer-deps && npm run build )
mkdir -p "$TARGET/frontend/.next"
cp -r "$TARGET/frontend.src/.next/standalone" "$TARGET/frontend/.next/standalone"
cp -r "$TARGET/frontend.src/.next/static" "$TARGET/frontend/.next/standalone/.next/static"
cp "$TARGET/frontend.src/package.json" "$TARGET/frontend/"
rm -rf "$TARGET/frontend.src"

chown -R "$PI_USER":"$PI_USER" "$TARGET"
ln -sfn "$TARGET" "$INSTALL_DIR/current"

echo "[6/9] OTA-Skript installieren"
cp "$REPO_DIR/pi/ops/ota/update.sh" "$INSTALL_DIR/ota/update.sh"
chmod +x "$INSTALL_DIR/ota/update.sh"
[[ -f "$INSTALL_DIR/ota/config.env" ]] || cp "$REPO_DIR/pi/ops/ota/config.env.example" "$INSTALL_DIR/ota/config.env"
echo "  ⚠️  Pubkey nach $INSTALL_DIR/ota/minisign.pub legen — solange das fehlt, schlägt OTA fehl."

# sudo-Regel: User pumpe darf systemctl restart auf die zwei Services aufrufen (für update.sh)
cat >/etc/sudoers.d/pumpe-ota <<EOF
pumpe ALL=(root) NOPASSWD: /bin/systemctl restart pumpe-backend.service, /bin/systemctl restart pumpe-frontend.service
EOF
chmod 440 /etc/sudoers.d/pumpe-ota

echo "[7/9] systemd-Units installieren"
cp "$REPO_DIR/pi/ops/systemd/"*.service /etc/systemd/system/
cp "$REPO_DIR/pi/ops/systemd/"*.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable pumpe-backend.service pumpe-frontend.service pumpe-ota.timer

echo "[8/9] nginx + Self-Signed-TLS"
if [[ ! -f "$SSL_DIR/cert.pem" ]]; then
    openssl req -x509 -newkey rsa:2048 -nodes \
        -keyout "$SSL_DIR/key.pem" -out "$SSL_DIR/cert.pem" \
        -days 3650 -subj "/CN=pumpe.local" \
        -addext "subjectAltName=DNS:pumpe.local,IP:$(hostname -I | awk '{print $1}')"
fi
cp "$REPO_DIR/pi/ops/nginx/pumpe.conf" /etc/nginx/sites-available/pumpe
ln -sfn /etc/nginx/sites-available/pumpe /etc/nginx/sites-enabled/pumpe
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx

echo "[9/9] Services starten"
systemctl start pumpe-backend.service
systemctl start pumpe-frontend.service

cat <<EOF

╔════════════════════════════════════════════════════════════════╗
║  Pumpensteuerung-Setup abgeschlossen                          ║
╠════════════════════════════════════════════════════════════════╣
║  Frontend:   https://$(hostname -I | awk '{print $1}')/         ║
║  REST API:   /api/health                                       ║
║  WebSocket:  /ws                                               ║
╠════════════════════════════════════════════════════════════════╣
║  TODO:                                                         ║
║   1. .env editieren: $INSTALL_DIR/current/backend/.env         ║
║      → MQTT_USER / MQTT_PASS eintragen                         ║
║      → RTU_PORT prüfen (/dev/ttyAMA0)                          ║
║   2. minisign.pub nach $INSTALL_DIR/ota/ legen                 ║
║   3. LOGO Modbus-TCP-Ziel-IP auf diese Pi-IP umstellen         ║
║   4. systemctl restart pumpe-backend                           ║
║   5. journalctl -u pumpe-backend -f                            ║
║   6. REBOOT damit UART-Konfig greift                           ║
╚════════════════════════════════════════════════════════════════╝
EOF
