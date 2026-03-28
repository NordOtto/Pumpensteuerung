#!/bin/bash
set -e

# .env laden falls vorhanden
if [ -f .env ]; then
    set -a; source .env; set +a
fi

STACK_NAME=${STACK_NAME:-pumpe}
IMAGE_TAG=${IMAGE_TAG:-latest}

echo "==> Baue Images ..."
docker compose -f docker-compose.yml build

echo "==> Initialisiere Swarm (falls noch nicht aktiv) ..."
docker swarm init 2>/dev/null || echo "  (Swarm bereits aktiv)"

echo "==> Deploye Stack '${STACK_NAME}' ..."
docker stack deploy -c docker-stack.yml "${STACK_NAME}"

echo ""
echo "==> Stack Services:"
docker stack services "${STACK_NAME}"

echo ""
echo "==> Deploy abgeschlossen."
echo "    Dashboard:  https://$(hostname -I | awk '{print $1}')"
echo "    Logs:       docker service logs ${STACK_NAME}_backend --tail 50"
