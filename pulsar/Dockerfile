# PULSAR — production image. Tiny Node server that serves the static client
# (vendored Three.js → no CDN) and runs the authoritative WebSocket match loop.
FROM node:20-alpine

WORKDIR /app

# Install only runtime deps. PULSAR has no devDependencies, so this is just
# `ws` (+ the vendored-but-listed `three`). --omit=dev keeps it that way.
COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force

COPY . .

ENV NODE_ENV=production \
    PORT=8080
EXPOSE 8080

# nginx-proxy health: the root route serves index.html (200).
HEALTHCHECK --interval=15s --timeout=4s --retries=5 --start-period=8s \
  CMD wget -qO- "http://localhost:${PORT}/" >/dev/null 2>&1 || exit 1

CMD ["node", "server/server.js"]
