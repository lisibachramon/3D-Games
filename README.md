# 🎮 3D-Games

A small monorepo of self-hosted, browser-based 3D multiplayer games. Each game
lives in its own folder and ships as one container. Deployment mirrors the
existing infra: the **external** `jwilder/nginx-proxy` + `acme/letsencrypt-companion`
stack routes each game's vhost over the shared `proxy_default` network — this
repo does **not** run its own proxy.

## Games

| Folder | Game | Stack | Container port | Local port |
|--------|------|-------|----------------|------------|
| [`flotsam/`](flotsam/) | **FLOTSAM** — co-op ocean survival (build a raft, fight the shark, call for rescue) | Node + `ws` + Three.js | 8080 | 8080 |
| [`pulsar/`](pulsar/) | **PULSAR** — neon multiplayer knockout arena (dash, smash, survive) | Node + `ws` + Three.js | 8080 | 8081 |

Every game listens on `PORT` (the proxy talks to each container on `:8080`),
serves a vendored copy of Three.js (no CDN), and runs an authoritative Node +
WebSocket server. WebSocket upgrades are handled by `nginx-proxy` automatically.

## Deploy

Prereqs on the host: the proxy stack's `proxy_default` network is up, and DNS A
records point each `*_VHOST` at this host.

```bash
cp .env.example .env      # set LETSENCRYPT_EMAIL + *_VHOST
docker compose up -d --build
```

`nginx-proxy` auto-discovers each service via `VIRTUAL_HOST`, the ACME companion
issues certs via `LETSENCRYPT_HOST`/`LETSENCRYPT_EMAIL`, and WebSocket upgrades
are proxied automatically — nothing else to configure.

## Local dev (no proxy)

```bash
docker compose up --build        # FLOTSAM -> http://localhost:8080
                                 # PULSAR  -> http://localhost:8081
```

Or run a single game directly (Node ≥18):

```bash
cd flotsam && npm install && npm start    # http://localhost:8080
cd pulsar  && npm install && npm start    # http://localhost:3000 (PORT overridable)
```

## Tests / CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push/PR:

- **FLOTSAM** — `npm test` (integration test that drives the real WebSocket
  server) and `npm run test:browser` (headless-Chromium smoke test that proves
  WebGL renders and the networked world initialises).
- **PULSAR** — boots the server and checks it serves the client, vendored
  Three.js, the shared modules, and `/health`.
- **Docker** — validates `docker-compose.yml`, builds both images, asserts the
  production images contain **no** dev-only deps (e.g. `puppeteer`), and
  smoke-runs each container the way the proxy would.

Run the FLOTSAM tests locally (start the server first, in another shell):

```bash
cd flotsam && npm install
PORT=8091 FLOTSAM_NOSAVE=1 npm start &   # integration test connects to :8091
npm test
PORT=8092 FLOTSAM_NOSAVE=1 npm start &   # browser test connects to :8092
npm run test:browser
```

## Adding a game

1. Create a new folder (e.g. `mygame/`) with the game + a `Dockerfile`
   (`node:20-alpine`, `npm install --omit=dev`, `EXPOSE` its port, a
   `HEALTHCHECK` on `/`). Have the server listen on `PORT` (default `8080`).
2. Copy the commented service block in [`docker-compose.yml`](docker-compose.yml),
   point `build:` at the folder, give it its own `*_VHOST` (+ a distinct
   `*_PORT` for local dev), and add it to [`.env.example`](.env.example).
3. Add the game to the table above and to the CI matrix in
   [`.github/workflows/ci.yml`](.github/workflows/ci.yml).
4. Add a DNS A record for the new vhost. Redeploy.
