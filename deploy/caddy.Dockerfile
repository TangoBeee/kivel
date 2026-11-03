FROM golang:1.27.3-alpine AS build
WORKDIR /src
ENV CGO_ENABLED=0 GOMAXPROCS=2
RUN go mod init socket.help/proxy \
    && go get github.com/caddyserver/caddy/v2/cmd/caddy@v2.11.7 golang.org/x/net@v0.60.0 github.com/go-jose/go-jose/v4@v4.1.6 \
    && go build -p 2 -trimpath -ldflags="-s -w" -o /out/caddy github.com/caddyserver/caddy/v2/cmd/caddy

FROM caddy:2-alpine AS runtime
# Changes daily in CI, so cached package layers pick up security fixes at least once a day.
ARG PACKAGES_DAY
RUN apk upgrade --no-cache
COPY --from=build /out/caddy /usr/bin/caddy
