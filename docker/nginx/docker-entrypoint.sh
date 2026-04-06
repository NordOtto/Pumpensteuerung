#!/bin/sh
set -e

SSL_DIR=/etc/nginx/ssl
CA_CERT=$SSL_DIR/ca.pem
CA_KEY=$SSL_DIR/ca-key.pem
CERT=$SSL_DIR/cert.pem
KEY=$SSL_DIR/key.pem

# ── Detect all local IPs for SAN ──
get_san_entries() {
    SANS="DNS:pumpe.local,DNS:localhost,IP:127.0.0.1"
    # Add all non-loopback IPv4 addresses
    for ip in $(ip -4 addr show | grep -oP 'inet \K[\d.]+' | grep -v '^127\.'); do
        SANS="${SANS},IP:${ip}"
    done
    # Add hostname
    SANS="${SANS},DNS:$(hostname)"
    echo "$SANS"
}

if [ ! -f "$CA_CERT" ] || [ ! -f "$CA_KEY" ]; then
    echo "[nginx-entrypoint] Erstelle lokale CA ..."
    openssl req -x509 -nodes -days 3650 \
        -newkey rsa:2048 \
        -keyout "$CA_KEY" \
        -out "$CA_CERT" \
        -subj "/C=DE/ST=Local/L=Home/O=Pumpensteuerung CA/CN=Pumpensteuerung Root CA"
    echo "[nginx-entrypoint] CA erstellt: $CA_CERT"
fi

if [ ! -f "$CERT" ] || [ ! -f "$KEY" ]; then
    SAN=$(get_san_entries)
    echo "[nginx-entrypoint] Erstelle Server-Zertifikat mit SAN: $SAN"

    # Generate server key + CSR
    openssl req -nodes -newkey rsa:2048 \
        -keyout "$KEY" \
        -out "$SSL_DIR/server.csr" \
        -subj "/C=DE/ST=Local/L=Home/O=Pumpensteuerung/CN=pumpe.local"

    # Sign with our CA
    openssl x509 -req -days 3650 \
        -in "$SSL_DIR/server.csr" \
        -CA "$CA_CERT" \
        -CAkey "$CA_KEY" \
        -CAcreateserial \
        -out "$CERT" \
        -extfile <(printf "subjectAltName=%s\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth" "$SAN")

    rm -f "$SSL_DIR/server.csr" "$SSL_DIR/ca.srl"
    echo "[nginx-entrypoint] Server-Zertifikat erstellt und von CA signiert."
else
    echo "[nginx-entrypoint] SSL-Zertifikate bereits vorhanden."
fi

# Copy CA cert to web root for easy download
cp "$CA_CERT" /usr/share/nginx/html/ca.pem

exec "$@"
