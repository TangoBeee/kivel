FROM node:22-alpine AS build
WORKDIR /app
ARG SITE_URL=https://socket.help
ARG BILLING_ENABLED=false
ENV NEXT_TELEMETRY_DISABLED=1 SITE_URL=$SITE_URL BILLING_ENABLED=$BILLING_ENABLED
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY packages/tools/package.json packages/tools/package.json
COPY packages/sdk/package.json packages/sdk/package.json
COPY packages/cli/package.json packages/cli/package.json
COPY packages/cli/bin packages/cli/bin
RUN pnpm install --frozen-lockfile
COPY packages packages
COPY backend backend
COPY frontend frontend
RUN pnpm build && pnpm --filter backend deploy --prod --legacy /release/backend

FROM node:22-alpine AS runtime
RUN apk add --no-cache ffmpeg font-dejavu
RUN mkdir -p /app/state && chown node:node /app/state
RUN rm -rf /usr/local/lib/node_modules /opt/yarn-* \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
    /usr/local/bin/yarn /usr/local/bin/yarnpkg
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /release/backend ./backend
COPY --from=build --chown=node:node /app/frontend/out ./frontend/out
USER node
EXPOSE 3000 2222
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "backend/dist/index.js"]
