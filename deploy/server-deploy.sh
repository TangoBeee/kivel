#!/bin/bash
# Runs on the production server: pulls one release's images from Docker Hub and swaps them in.
# The Deploy workflow copies this file, the compose files and deploy/ first; .env, volumes and
# backups are never touched. Usage: deploy/server-deploy.sh <release tag>
set -euo pipefail
TAG=$1
REPOSITORY=${IMAGE_REPOSITORY:-tangobee/socket}
cd /opt/socket-help
compose() { docker compose -f compose.yaml -f compose.production.yaml "$@"; }
use() { export APP_IMAGE=$REPOSITORY:app-$1 DATABASE_IMAGE=$REPOSITORY:postgres-$1 PROXY_IMAGE=$REPOSITORY:proxy-$1; }
previous=$(cat .release 2>/dev/null || true)

use "$TAG"
compose pull --quiet

# A backup before every release; the newest seven are kept.
install -d -m 700 backups
if [ -n "$(compose ps -q database)" ]; then
    compose exec -T database pg_dump -U socket_admin -d socket -Fc >"backups/pre-$TAG.dump.partial"
    mv "backups/pre-$TAG.dump.partial" "backups/pre-$TAG.dump"
    ls -1t backups/pre-*.dump | tail -n +8 | xargs -r rm --
fi

if ! compose up -d --no-build --remove-orphans --wait --wait-timeout 300; then
    echo "Release $TAG did not become healthy." >&2
    compose logs --tail=50 app >&2 || true
    if [ -n "$previous" ]; then
        # Migrations only move forward, so the previous release must accept the newer schema.
        use "$previous"
        compose up -d --no-build --wait --wait-timeout 300 || true
        echo "Rolled back to $previous." >&2
    fi
    exit 1
fi
# The proxy bind-mounts the Caddyfile, which this release may have replaced.
compose restart proxy
echo "$TAG" >.release
docker image prune -af --filter until=168h >/dev/null
compose ps --format '{{.Service}} {{.Status}}'
