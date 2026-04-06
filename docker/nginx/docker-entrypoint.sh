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
    # Add all non-loopback IPv4 addresses (busybox-compatible)
    for ip in $(ip -4 addr show | sed -n 's/.*inet \([0-9.]*\).*/\1/p' | grep -v '^127\.'); do
        SANS="${SANS},IP:${ip}"
    done
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
    # Force re-creation of server cert when CA changes
    rm -f "$CERT" "$KEY"
fi

if [ ! -f "$CERT" ] || [ ! -f "$KEY" ]; then
    SAN=$(get_san_entries)
    echo "[nginx-entrypoint] Erstelle Server-Zertifikat mit SAN: $SAN"

    # Generate server key + CSR
    openssl req -nodes -newkey rsa:2048 \
        -keyout "$KEY" \
        -out "$SSL_DIR/server.csr" \
        -subj "/C=DE/ST=Local/L=Home/O=Pumpensteuerung/CN=pumpe.local"

    # Write extension file (no bash process substitution needed)
    cat > "$SSL_DIR/ext.cnf" <<EOF
subjectAltName=$SAN
basicConstraints=CA:FALSE
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
EOF

    # Sign with our CA
    openssl x509 -req -days 3650 \
        -in "$SSL_DIR/server.csr" \
        -CA "$CA_CERT" \
        -CAkey "$CA_KEY" \
        -CAcreateserial \
        -out "$CERT" \
        -extfile "$SSL_DIR/ext.cnf"

    rm -f "$SSL_DIR/server.csr" "$SSL_DIR/ca.srl" "$SSL_DIR/ext.cnf"
    echo "[nginx-entrypoint] Server-Zertifikat erstellt und von CA signiert."
else
    echo "[nginx-entrypoint] SSL-Zertifikate bereits vorhanden."
fi

# Copy CA cert to web root for easy download
cp "$CA_CERT" /usr/share/nginx/html/ca.pem

exec "$@"
