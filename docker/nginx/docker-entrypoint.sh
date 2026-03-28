#!/bin/sh
set -e

CERT=/etc/nginx/ssl/cert.pem
KEY=/etc/nginx/ssl/key.pem

if [ ! -f "$CERT" ] || [ ! -f "$KEY" ]; then
    echo "[nginx-entrypoint] Generiere Self-signed SSL-Zertifikat ..."
    openssl req -x509 -nodes -days 3650 \
        -newkey rsa:2048 \
        -keyout "$KEY" \
        -out "$CERT" \
        -subj "/C=DE/ST=Local/L=Home/O=Pumpensteuerung/CN=pumpe.local" \
        -addext "subjectAltName=DNS:pumpe.local,DNS:localhost"
    echo "[nginx-entrypoint] Zertifikat erstellt."
else
    echo "[nginx-entrypoint] SSL-Zertifikat bereits vorhanden, kein Neuerstellen nötig."
fi

exec "$@"
