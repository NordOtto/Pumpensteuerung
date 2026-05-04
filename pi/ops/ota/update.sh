#!/usr/bin/env bash
# OTA update for Pumpensteuerung.
# Layout:
#   /opt/pumpe/ota/update.sh
#   /opt/pumpe/ota/config.env
#   /opt/pumpe/releases/<tag>
#   /opt/pumpe/current -> releases/<tag>
#
# Usage:
#   update.sh status
#   update.sh check
#   update.sh install [tag]
#   update.sh check-and-apply
#   update.sh apply <tag>
#   update.sh rollback
set -euo pipefail

OTA_DIR="/opt/pumpe/ota"
RELEASES_DIR="/opt/pumpe/releases"
CURRENT_LINK="/opt/pumpe/current"
LOG_TAG="pumpe-ota"

# shellcheck disable=SC1091
source "${OTA_DIR}/config.env"

log() { logger -t "$LOG_TAG" -- "$*"; echo "[OTA] $*"; }
die() { log "FEHLER: $*"; exit 1; }

github_auth() {
    if [[ -f "${GITHUB_TOKEN_FILE:-}" ]]; then
        printf '%s\n' "-H" "Authorization: Bearer $(cat "$GITHUB_TOKEN_FILE")"
    fi
}

github_curl_args() {
    if [[ -f "${GITHUB_TOKEN_FILE:-}" ]]; then
        printf '%s\n' "-H" "Authorization: Bearer $(cat "$GITHUB_TOKEN_FILE")"
    fi
    printf '%s\n' "-H" "Accept: application/octet-stream"
    printf '%s\n' "-H" "X-GitHub-Api-Version: 2022-11-28"
}

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

release_json_for_tag() {
    local tag="$1"
    local auth=()
    if [[ -f "${GITHUB_TOKEN_FILE:-}" ]]; then
        auth=(-H "Authorization: Bearer $(cat "$GITHUB_TOKEN_FILE")")
    fi
    curl -sfL "${auth[@]}" "https://api.github.com/repos/${GITHUB_REPO}/releases/tags/${tag}"
}

cmd_status() {
    local cur; cur=$(current_tag)
    echo "Aktuell:    ${cur:-(keins)}"
    echo "Verfuegbar:"
    ls -1t "$RELEASES_DIR" 2>/dev/null | sed 's/^/  /' || echo "  (keine)"
}

cmd_check() {
    local cur; cur=$(current_tag)
    local json; json=$(latest_release_json) || die "Konnte Release-Info nicht laden (Repo: ${GITHUB_REPO}; pruefe config.env, GitHub Release und ggf. Token)"
    local tag commit published changelog
    tag=$(echo "$json" | jq -r '.tag_name')
    commit=$(echo "$json" | jq -r '.target_commitish // ""')
    published=$(echo "$json" | jq -r '.published_at // ""')
    changelog=$(echo "$json" | jq -r '.body // ""')
    [[ -n "$tag" && "$tag" != "null" ]] || die "Kein tag_name im API-Response"
    jq -n \
      --arg current "${cur:-}" \
      --arg latest "$tag" \
      --arg commit "$commit" \
      --arg published_at "$published" \
      --arg changelog "$changelog" \
      --argjson update_available "$([[ "$tag" != "$cur" ]] && echo true || echo false)" \
      '{current:$current, latest:$latest, commit:$commit, published_at:$published_at, changelog:$changelog, update_available:$update_available}'
}

download_release() {
    local json="$1"
    local tag="$2"
    local tarball_url sig_url sha_url
    tarball_url=$(echo "$json" | jq -r '.assets[] | select(.name | endswith(".tar.gz")) | .url' | head -1)
    sig_url=$(echo "$json" | jq -r '.assets[] | select(.name | endswith(".tar.gz.minisig")) | .url' | head -1)
    sha_url=$(echo "$json" | jq -r '.assets[] | select(.name | endswith(".tar.gz.sha256")) | .url' | head -1)
    [[ -n "$tarball_url" && "$tarball_url" != "null" ]] || die "Kein .tar.gz im Release"

    local tmp; tmp=$(mktemp -d)
    trap "rm -rf '$tmp'" EXIT
    local auth=()
    mapfile -t auth < <(github_curl_args)

    log "Lade Tarball"
    curl -fsSL "${auth[@]}" -o "${tmp}/pkg.tar.gz" "$tarball_url"

    if [[ -n "$sig_url" && "$sig_url" != "null" && -f "${MINISIGN_PUBKEY:-}" ]]; then
        log "Lade und verifiziere Minisign-Signatur"
        curl -fsSL "${auth[@]}" -o "${tmp}/pkg.tar.gz.minisig" "$sig_url"
        minisign -V -p "$MINISIGN_PUBKEY" -m "${tmp}/pkg.tar.gz" || die "Signatur ungueltig"
    elif [[ -n "$sha_url" && "$sha_url" != "null" ]]; then
        log "Keine Signatur verfuegbar, pruefe SHA256"
        curl -fsSL "${auth[@]}" -o "${tmp}/pkg.tar.gz.sha256" "$sha_url"
        (cd "$tmp" && awk '{print $1 "  pkg.tar.gz"}' pkg.tar.gz.sha256 | sha256sum -c -) || die "SHA256-Pruefung fehlgeschlagen"
    else
        die "Weder Signatur noch SHA256 im Release gefunden"
    fi

    local target="${RELEASES_DIR}/${tag}"
    local staging="${target}.tmp.$$"
    trap "rm -rf '$tmp' '$staging'" EXIT
    rm -rf "$staging"
    mkdir -p "$staging"
    log "Entpacke nach ${staging}"
    tar -xzf "${tmp}/pkg.tar.gz" -C "$staging"

    if [[ -L "$CURRENT_LINK" ]]; then
        cp -n "${CURRENT_LINK}/backend/.env" "${staging}/backend/.env" 2>/dev/null || true
    fi

    [[ "$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)" != "$target" ]] || die "Aktives Release ${tag} wird nicht ueberschrieben"
    rm -rf "$target"
    mv "$staging" "$target"

    log "Installiere venv-Dependencies"
    if ! python3 -m venv --clear "${target}/backend/.venv" ||
       ! "${target}/backend/.venv/bin/python" -m pip install --no-cache-dir -r "${target}/backend/requirements.txt" --quiet; then
        rm -rf "$target"
        die "${tag}: venv-Setup fehlgeschlagen"
    fi
    if [[ ! -x "${target}/backend/.venv/bin/uvicorn" ]]; then
        rm -rf "$target"
        die "${tag}: uvicorn fehlt nach venv-Setup"
    fi
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

    sudo systemctl restart pumpe-frontend.service
    sudo systemctl restart pumpe-backend.service

    local healthy=0
    for _ in $(seq 1 30); do
        if curl -fsS http://127.0.0.1:8000/api/health >/dev/null; then
            healthy=1
            break
        fi
        sleep 1
    done
    if [[ "$healthy" != "1" ]]; then
        log "Smoke-Test fehlgeschlagen, Rollback"
        cmd_rollback
        exit 1
    fi
    log "Release ${tag} aktiv"
}

cmd_install() {
    local tag="${1:-}"
    local json
    if [[ -n "$tag" ]]; then
        json=$(release_json_for_tag "$tag") || die "Konnte Release ${tag} nicht laden (Repo: ${GITHUB_REPO}; pruefe config.env, GitHub Release und ggf. Token)"
    else
        json=$(latest_release_json) || die "Konnte latest Release nicht laden (Repo: ${GITHUB_REPO}; pruefe config.env, GitHub Release und ggf. Token)"
        tag=$(echo "$json" | jq -r '.tag_name')
    fi
    [[ -n "$tag" && "$tag" != "null" ]] || die "Kein Release-Tag gefunden"
    download_release "$json" "$tag"
    cmd_apply "$tag"
    ls -1t "$RELEASES_DIR" 2>/dev/null | tail -n +4 | while read -r old; do
        log "Loesche altes Release ${old}"
        rm -rf "${RELEASES_DIR:?}/${old}" || log "Konnte altes Release ${old} nicht loeschen"
    done
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
    local json; json=$(latest_release_json) || die "Konnte Release-Info nicht laden (Repo: ${GITHUB_REPO}; pruefe config.env, GitHub Release und ggf. Token)"
    local tag; tag=$(echo "$json" | jq -r '.tag_name')
    [[ -n "$tag" && "$tag" != "null" ]] || die "Kein tag_name im API-Response"
    if [[ "$tag" == "$cur" ]]; then
        log "Bereits aktuell (${cur})"
        return 0
    fi
    log "Neue Version: ${tag} (aktuell ${cur:-keins})"
    download_release "$json" "$tag"
    cmd_apply "$tag"
}

case "${1:-check-and-apply}" in
    status)          cmd_status ;;
    check)           cmd_check ;;
    install)         cmd_install "${2:-}" ;;
    check-and-apply) cmd_check_and_apply ;;
    apply)           [[ -n "${2:-}" ]] || die "Usage: apply <tag>"; cmd_apply "$2" ;;
    rollback)        cmd_rollback ;;
    *) echo "Usage: $0 {status|check|install [tag]|check-and-apply|apply <tag>|rollback}"; exit 1 ;;
esac
