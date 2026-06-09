# FLOTSAM — production image. Tiny Node server that serves the static client
# and runs the authoritative WebSocket game loop. Vendored Three.js → no CDN.
FROM node:20-alpine

WORKDIR /app

# Install only runtime deps (puppeteer is devDependency and is skipped).
COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force

COPY . .

# World saves persist here (mount a volume at this path in compose).
RUN mkdir -p /app/data

ENV NODE_ENV=production \
    PORT=8080
EXPOSE 8080

# nginx-proxy health: the root route serves index.html (200).
HEALTHCHECK --interval=15s --timeout=4s --retries=5 --start-period=8s \
  CMD wget -qO- "http://localhost:${PORT}/" >/dev/null 2>&1 || exit 1

CMD ["node", "server/server.js"]
