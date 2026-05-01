#!/usr/bin/env bash
# /opt/pumpe/ota/update.sh
#
# OTA-Update für Pumpensteuerung. Pi pullt Releases aus einem GitHub-Repo,
# verifiziert Signatur (minisign), atomarer Symlink-Swap, restartet Services.
#
# Layout:
#   /opt/pumpe/
#   ├── ota/
#   │   ├── update.sh         (dieses Skript)
#   │   ├── config.env        (Repo, Pubkey, Token-Path)
#   │   └── minisign.pub
#   ├── releases/
#   │   ├── v1.2.3/
#   │   ├── v1.2.4/           ← aktuell
#   │   └── ...
#   └── current → releases/v1.2.4
#
# Usage:
#   update.sh check-and-apply    Prüft auf Update, installiert wenn neu
#   update.sh apply <tag>        Installiert ein bestimmtes Release
#   update.sh rollback           Schaltet auf vorheriges Release
#   update.sh status             Zeigt aktuelle Version + verfügbare
set -euo pipefail

OTA_DIR="/opt/pumpe/ota"
RELEASES_DIR="/opt/pumpe/releases"
CURRENT_LINK="/opt/pumpe/current"
LOG_TAG="pumpe-ota"

# shellcheck disable=SC1091
source "${OTA_DIR}/config.env"

# Erforderliche Variablen aus config.env:
#   GITHUB_REPO=nordotto/modbus_logo
#   MINISIGN_PUBKEY=/opt/pumpe/ota/minisign.pub
#   GITHUB_TOKEN_FILE=/opt/pumpe/ota/.github_token   (optional, für private Repos)

log() { logger -t "$LOG_TAG" -- "$*"; echo "[OTA] $*"; }
die() { log "FEHLER: $*"; exit 1; }

current_tag() {
    [[ -L "$CURRENT_LINK" ]] || { echo ""; return; }
    basename "$(readlink -f "$CURRENT_LINK")"
}

latest_release_json() {
    local auth=()
    if [[ -f "${GITHUB_TOKEN_FILE:-}" ]]; then
        auth=(-H "Authorization: Bearer $(cat "$GITHUB_TOKEN_FILE")")
    fi
    curl -sfL "${auth[@]}" "https://api.github.com/repos/${GITHUB_REPO}/releases/latest"
}

cmd_status() {
    local cur; cur=$(current_tag)
    echo "Aktuell:    ${cur:-(keins)}"
    echo "Verfügbar:"
    ls -1t "$RELEASES_DIR" 2>/dev/null | sed 's/^/  /' || echo "  (keine)"
}

cmd_apply() {
    local tag="$1"
    local target="${RELEASES_DIR}/${tag}"
    [[ -d "$target" ]] || die "Release ${tag} nicht installiert (${target})"
    [[ -x "${target}/backend/.venv/bin/uvicorn" ]] || die "${tag}: venv fehlt"
    [[ -d "${target}/frontend/.next/standalone" ]] || die "${tag}: frontend-build fehlt"

    log "Aktiviere Release ${tag}"
    ln -sfn "$target" "${CURRENT_LINK}.new"
    mv -Tf "${CURRENT_LINK}.new" "$CURRENT_LINK"

    sudo systemctl restart pumpe-backend.service
    sudo systemctl restart pumpe-frontend.service

    # Smoke-Test: warte 5 s, dann /api/health prüfen
    sleep 5
    if ! curl -fsS http://127.0.0.1:8000/api/health >/dev/null; then
        log "Smoke-Test fehlgeschlagen — Rollback"
        cmd_rollback
        exit 1
    fi
    log "Release ${tag} aktiv"
}

cmd_rollback() {
    local prev
    prev=$(ls -1t "$RELEASES_DIR" 2>/dev/null | grep -v "^$(current_tag)\$" | head -1 || true)
    [[ -n "$prev" ]] || die "Kein vorheriges Release vorhanden"
    log "Rollback auf ${prev}"
    cmd_apply "$prev"
}

cmd_check_and_apply() {
    local cur; cur=$(current_tag)
    local json; json=$(latest_release_json) || die "Konnte Release-Info nicht laden"
    local tag; tag=$(echo "$json" | jq -r '.tag_name')
    [[ -n "$tag" && "$tag" != "null" ]] || die "Kein tag_name im API-Response"

    if [[ "$tag" == "$cur" ]]; then
        log "Bereits aktuell (${cur})"
        return 0
    fi
    log "Neue Version: ${tag} (aktuell ${cur:-keins})"

    local tarball_url sig_url
    tarball_url=$(echo "$json" | jq -r '.assets[] | select(.name | endswith(".tar.gz")) | .browser_download_url' | head -1)
    sig_url=$(echo "$json" | jq -r '.assets[] | select(.name | endswith(".tar.gz.minisig")) | .browser_download_url' | head -1)
    [[ -n "$tarball_url" && "$tarball_url" != "null" ]] || die "Kein .tar.gz im Release"
    [[ -n "$sig_url" && "$sig_url" != "null" ]] || die "Keine Signatur im Release"

    local tmp; tmp=$(mktemp -d)
    trap 'rm -rf "$tmp"' EXIT

    log "Lade Tarball + Signatur"
    curl -fsSL -o "${tmp}/pkg.tar.gz" "$tarball_url"
    curl -fsSL -o "${tmp}/pkg.tar.gz.minisig" "$sig_url"

    log "Verifiziere Signatur"
    minisign -V -p "$MINISIGN_PUBKEY" -m "${tmp}/pkg.tar.gz" || die "Signatur ungültig"

    local target="${RELEASES_DIR}/${tag}"
    mkdir -p "$target"
    log "Entpacke nach ${target}"
    tar -xzf "${tmp}/pkg.tar.gz" -C "$target"

    log "Installiere venv-Dependencies"
    python3 -m venv "${target}/backend/.venv"
    "${target}/backend/.venv/bin/pip" install --upgrade pip --quiet
    "${target}/backend/.venv/bin/pip" install -r "${target}/backend/requirements.txt" --quiet

    # .env vom aktuellen Release übernehmen
    if [[ -L "$CURRENT_LINK" ]]; then
        cp -n "${CURRENT_LINK}/backend/.env" "${target}/backend/.env" 2>/dev/null || true
    fi

    cmd_apply "$tag"

    # Alte Releases aufräumen (behält die letzten 3)
    ls -1t "$RELEASES_DIR" | tail -n +4 | while read -r old; do
        log "Lösche altes Release ${old}"
        rm -rf "${RELEASES_DIR:?}/${old}"
    done
}

case "${1:-check-and-apply}" in
    status)            cmd_status ;;
    check-and-apply)   cmd_check_and_apply ;;
    apply)             [[ -n "${2:-}" ]] || die "Usage: apply <tag>"; cmd_apply "$2" ;;
    rollback)          cmd_rollback ;;
    *) echo "Usage: $0 {status|check-and-apply|apply <tag>|rollback}"; exit 1 ;;
esac
