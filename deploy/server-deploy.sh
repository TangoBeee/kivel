#!/bin/bash
# Runs on the production server: pulls one release's images from Docker Hub and swaps them in.
# The Deploy workflow copies this file, the compose files and deploy/ first; .env, volumes and
# backups are never touched. Usage: deploy/server-deploy.sh <release tag>
set -euo pipefail
umask 077
TAG=$1
[[ "$TAG" =~ ^[a-f0-9]{12}$ ]] || { echo 'Use a 12-character commit tag.' >&2; exit 2; }
REPOSITORY=${IMAGE_REPOSITORY:-tangobee/socket}
cd "${DEPLOY_DIRECTORY:-/opt/socket-help}"
compose() {
    if [ -f compose.smtp.yaml ] && [ -f .env ] && grep -q '^SMTP_CAPTURE_PORT=2465$' .env; then
        docker compose -f compose.yaml -f compose.production.yaml -f compose.smtp.yaml "$@"
    else
        docker compose -f compose.yaml -f compose.production.yaml "$@"
    fi
}
# grep must read all of compose's output: with pipefail, "grep -q" exiting early can fail the pipeline.
has_mail() { compose config --services | grep -x mail >/dev/null; }
use() {
    export APP_IMAGE=$REPOSITORY:app-$1 DATABASE_IMAGE=$REPOSITORY:postgres-$1 PROXY_IMAGE=$REPOSITORY:proxy-$1
    if has_mail; then export MAIL_IMAGE=$REPOSITORY:mail-$1; else unset MAIL_IMAGE; fi
}
start_release() {
    if [ "$sending_enabled" = true ] && has_mail && "$mail_available"; then
        compose up -d --no-build --wait --wait-timeout 120 mail || return 1
    fi
    compose up -d --no-build --remove-orphans --wait --wait-timeout 300 app proxy || return 1
    compose restart proxy || return 1
    compose up -d --no-build --wait --wait-timeout 300 app proxy || return 1
    if [ "$sending_enabled" != true ] && has_mail && "$mail_available"; then
        compose up -d --no-build mail || echo 'Optional mail relay could not start; sending is disabled.' >&2
    fi
}
previous=$(cat .release 2>/dev/null || true)

use "$TAG"
compose pull --quiet app database proxy
sending_enabled=$(compose config --environment | sed -n 's/^EMAIL_SENDING_ENABLED=//p')
mail_available=false
if has_mail; then
    if compose pull --quiet mail; then mail_available=true
    elif [ "$sending_enabled" = true ]; then echo 'Required mail image could not be pulled; keeping the current release.' >&2; exit 1
    else echo 'Optional mail image could not be pulled; sending is disabled.' >&2; fi
fi
release_mail_image=${MAIL_IMAGE:-}
previous_schema=

# A backup before every release; the newest seven are kept.
install -d -m 700 backups
if [ -n "$(compose ps -q database)" ]; then
    previous_schema=$(compose exec -T database psql -U socket_admin -d socket -Atc 'SELECT MAX(version) FROM schema_migrations' 2>/dev/null || true)
    compose exec -T database pg_dump -U socket_admin -d socket -Fc >"backups/pre-$TAG.dump.partial"
    mv "backups/pre-$TAG.dump.partial" "backups/pre-$TAG.dump"
    ls -1t backups/pre-*.dump | tail -n +8 | xargs -r rm --
fi

if ! start_release; then
    echo "Release $TAG did not become healthy." >&2
    compose logs --tail=50 app >&2 || true
    current_schema=$(compose exec -T database psql -U socket_admin -d socket -Atc 'SELECT MAX(version) FROM schema_migrations' 2>/dev/null || true)
    echo "Database schema before release: ${previous_schema:-unknown}; after failure: ${current_schema:-unknown}. The database will not be restored automatically." >&2
    if [[ "$previous" =~ ^[a-f0-9]{12}$ ]]; then
        use "$previous"
        if has_mail; then
            if ! docker manifest inspect "$MAIL_IMAGE" >/dev/null 2>&1 || ! compose pull --quiet mail; then
                export MAIL_IMAGE=$release_mail_image
                echo 'Previous mail image unavailable; retaining the current relay image.' >&2
            else mail_available=true; fi
        fi
        compose pull --quiet app database proxy || echo 'Previous image pull failed; attempting rollback with cached images.' >&2
        if start_release; then
            echo "Rolled back to healthy release $previous; the additive database migrations were kept." >&2
        else echo 'Rollback also failed. Inspect the app logs before changing the database.' >&2; fi
    else
        echo 'No previous release tag is available for container rollback.' >&2
    fi
    exit 1
fi
echo "$TAG" >.release
docker image prune -af --filter until=168h >/dev/null
compose ps --format '{{.Service}} {{.Status}}'
