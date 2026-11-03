FROM postgres:18-alpine
# Changes daily in CI, so cached package layers pick up security fixes at least once a day.
ARG PACKAGES_DAY
RUN apk upgrade --no-cache && apk add --no-cache su-exec \
    && grep -q 'exec gosu postgres' /usr/local/bin/docker-entrypoint.sh \
    && sed -i 's/exec gosu postgres/exec su-exec postgres/' /usr/local/bin/docker-entrypoint.sh \
    && rm /usr/local/bin/gosu
