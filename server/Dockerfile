# Bagerikoll's server: the app itself + sync, data in SQLite under /data.
# Built by .github/workflows/server.yml → ghcr.io/pixelandi/bagerikoll-server.
# The app is built once, natively (it is the same files on every platform); only the runtime below
# is made per platform. Building it under emulation for arm64 was slow and could hang.
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data PUBLIC_DIR=/app/public TZ=Europe/Stockholm
RUN apk add --no-cache tzdata && mkdir -p /data && chown 568:568 /data
WORKDIR /app
COPY server/server.mjs server/store.mjs ./server/
COPY --from=build /src/dist ./public
USER 568:568
EXPOSE 8080
VOLUME /data
HEALTHCHECK --interval=60s --timeout=5s CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
CMD ["node", "--no-warnings", "server/server.mjs"]
