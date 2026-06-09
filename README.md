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

## Auto-deploy (home server)

On every push to `main`, once all test/build jobs pass, the `deploy` job in
[`ci.yml`](.github/workflows/ci.yml) SSHes into the home server, syncs the
checkout to `origin/main`, and runs `docker compose up -d --build`. It's a
green no-op (with a warning) until the secrets below are set.

**One-time on the server** (where Docker + the `proxy_default` proxy stack already run):

```bash
sudo git clone https://github.com/lisibachramon/3D-Games.git /opt/3D-Games
cd /opt/3D-Games
cp .env.example .env        # set LETSENCRYPT_EMAIL + FLOTSAM_VHOST/PULSAR_VHOST
```

**One-time, from your laptop** — create a deploy key and set the repo secrets
([`gh`](https://cli.github.com/) authenticated as the repo owner):

```bash
# 1. dedicated deploy key (no passphrase, used only by CI)
ssh-keygen -t ed25519 -f ~/.ssh/3dgames_deploy -C "gha-deploy@3d-games" -N ""

# 2. authorise it on the server (lets CI log in as this user)
ssh-copy-id -i ~/.ssh/3dgames_deploy.pub  USER@YOUR_HOST
#   ...or append ~/.ssh/3dgames_deploy.pub to that user's ~/.ssh/authorized_keys

# 3. set the repo secrets the deploy job reads
gh secret set DEPLOY_SSH_KEY --repo lisibachramon/3D-Games < ~/.ssh/3dgames_deploy
gh secret set DEPLOY_HOST    --repo lisibachramon/3D-Games --body "YOUR_HOST"      # IP or DDNS
gh secret set DEPLOY_USER    --repo lisibachramon/3D-Games --body "USER"
gh secret set DEPLOY_PATH    --repo lisibachramon/3D-Games --body "/opt/3D-Games"
gh secret set DEPLOY_PORT    --repo lisibachramon/3D-Games --body "22"             # omit if 22
```

| Secret | Meaning | Default if unset |
|--------|---------|------------------|
| `DEPLOY_HOST` | server IP / hostname (also the on/off switch) | — (deploy skipped) |
| `DEPLOY_USER` | SSH user with Docker access | — |
| `DEPLOY_SSH_KEY` | **private** key matching the authorised public key | — |
| `DEPLOY_PATH` | repo location on the server | `/opt/3D-Games` |
| `DEPLOY_PORT` | SSH port | `22` |

That's it — push to `main` (or hit **Run workflow**) and CI builds, tests, and
deploys. The server's `.env` is gitignored, so deploys never clobber it.

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
