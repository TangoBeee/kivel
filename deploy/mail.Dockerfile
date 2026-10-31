FROM alpine:3.24@sha256:be2656061b536c1883c4034790e21d0a09c5aaaf51968b89368a3c0371ea2c9a
RUN apk upgrade --no-cache && apk add --no-cache postfix postfix-doc opendkim opendkim-utils openssl ca-certificates supervisor bash
COPY deploy/mail-entrypoint.sh /usr/local/bin/mail-entrypoint
COPY deploy/mail-supervisor.conf /etc/supervisord.conf
RUN chmod 755 /usr/local/bin/mail-entrypoint
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s CMD nc -z 127.0.0.1 587
ENTRYPOINT ["/usr/local/bin/mail-entrypoint"]
