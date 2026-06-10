# desktop/ — Electron shell for FLOTSAM & PULSAR

One Electron codebase, parameterized per game. `--game=flotsam|pulsar` (dev) or
the baked-in `resources/meta.json` (packaged) selects branding, icon, online URL
and which game folder is bundled. Produces separate installers per game
("FLOTSAM", "PULSAR").

## Modes

| Mode | What happens |
|---|---|
| **Online** (default) | Loads the public server — `https://flotsam.lisibach.xyz` / `https://pulsar.lisibach.xyz` — so desktop players share the live arena with browser players. Override with env `GAME_URL`. |
| **Local/LAN host** | Forks the bundled game server (`utilityProcess.fork`) on a free port and loads `http://127.0.0.1:<port>`. The server binds all interfaces, so friends on the LAN can join via `your-ip:<port>`. FLOTSAM saves go to `app.getPath('userData')/save.json` (per user, per game). |

Switching: **Game** menu → *Play Online* (Cmd/Ctrl+1) or *Host Local/LAN*
(Cmd/Ctrl+2). If the online URL fails to load (offline, DNS down), the shell
**automatically falls back** to local host mode.

Window: 1440×810, fullscreenable (F11 on Windows, Ctrl+Cmd+F on macOS). Menu
bar is auto-hidden on Windows (press Alt to reveal). Quitting kills the child
server.

## Dev

```sh
cd desktop
npm install

npm run start:flotsam     # run shell against the repo's flotsam/ folder
npm run start:pulsar

npm run smoke:flotsam     # headless check: boots local server, waits for
npm run smoke:pulsar      # HTTP 200 on /, prints "SMOKE OK", exits 0
                          # (exit 1 with error after a 30s timeout)
```

In dev the shell forks the game server straight out of the repo
(`../flotsam`, `../pulsar`), using each game's own `node_modules` — so run
`npm install` in the game folder first if you haven't.

## Build / packaging

```sh
npm run pack:flotsam      # unpacked dir only (fast; what CI smokes)
npm run pack:pulsar
npm run dist:flotsam      # full installers for the current platform
npm run dist:pulsar
```

`scripts/build.js <game> [--dir]` does three things:

1. **Icon** — `scripts/make-icons.js` renders `build/<game>/icon.png`
   (1024×1024, pure-Node PNG encoder, no native deps). electron-builder
   converts it to `.icns`/`.ico` automatically.
2. **Stage** — `scripts/stage-game.js` copies `server/ public/ shared/
   package.json package-lock.json` into `staging/<game>/game/` and runs
   `npm ci --omit=dev --ignore-scripts` there. The repo's game folders are
   never modified, and dev deps (e.g. flotsam's puppeteer) are never shipped.
   A `meta.json` (game id, product name, online URL) is written next to it.
3. **Package** — electron-builder maps `staging/<game>` into the app's
   resources dir (`extraResources`), so at runtime the packaged shell finds
   `resources/meta.json` and `resources/game/`.

Targets: Windows `nsis` + `portable` (x64) — the production priority; macOS
`dmg` + `zip` (arm64; universal is possible later by adding `'x64'` to the
arch lists and a `universal` target, skipped for now to keep builds fast).
Output lands in `dist/<game>/`.

**Code signing is disabled** (`identity: null` on mac, no cert config on win).
Windows builds will trip SmartScreen and mac builds need right-click → Open
until certs are added — see STEAM.md; Steam distribution does not require OS
code signing.

## CI

`.github/workflows/release.yml` builds the {macOS, Windows} × {flotsam, pulsar}
matrix on tag pushes (`v*`) and manual dispatch: installers built, the unpacked
binary is smoke-tested (`<exe> --smoke` must print `SMOKE OK` / exit 0),
artifacts uploaded, and on tag pushes everything is attached to a GitHub
Release.

## Notes / gotchas

- Both games declare `"type": "module"` in their package.json (verified) — the
  staged copy includes the game's package.json, so the forked server resolves
  as ESM with no shims.
- `userData` is set to `<appData>/<PRODUCT_NAME>` explicitly so FLOTSAM and
  PULSAR don't share a profile.
- `--smoke` never writes saves (`FLOTSAM_NOSAVE=1`).
- The free port is picked by the shell (bind `127.0.0.1:0`, read, close, pass
  as `PORT`) because the game servers log the env value, not the bound port.
