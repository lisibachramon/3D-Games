# 🌀 PULSAR — Neon Knockout Arena

A fast, 3D, **multiplayer** physics brawler. You're a glowing orb in a neon void.
**Dash into your rivals to launch them off the platform.** Last orb standing wins
the round. The void keeps closing in, power-ups keep dropping, and **bots fill any
empty seats** so it's a party the second you hit play.

Runs in the browser on **macOS and Windows** (and Linux) — nothing to compile.

```
┌────────────────────────────────────────────────────────┐
│  Dash. Blast. Survive.                                   │
│  WASD move · Space/Click dash · Shift/R-Click shockwave  │
│  Mouse aim · M mute · 📱 touch supported                 │
└────────────────────────────────────────────────────────┘
```

## ▶ Play it

```bash
npm install
npm start
```

Then open **http://localhost:3000**. Pick a name, pick a color, enter the arena.
Solo? The arena auto-fills with bots. They're aggressive — watch the edges.

## 👥 Play with friends

The server you just started **is** the multiplayer server. To play together on the
same Wi‑Fi/LAN:

1. Find your machine's local IP (e.g. macOS: `ipconfig getifaddr en0`,
   Windows: `ipconfig`).
2. Have friends open `http://YOUR_IP:3000` in their browser.
3. Everyone shares one live arena. Bots top it up to a full lobby.

> Want internet play beyond your LAN? Point a tunnel (e.g. `ngrok http 3000`) or
> deploy `server/` to any Node host and serve the same port.

## 🎮 How it plays

- **Dash** (Space / left-click) is your main weapon. Time it: a charged dash that
  connects *launches* the other orb. Whiff it off the edge and you're the one in
  the void.
- **Shockwave** (Shift / right-click) is your panic button: a radial blast that
  shoves everyone nearby away from you. Longer cooldown — use it to escape a pile-up,
  break a chase, or punt a clustered pack toward the edge.
- **The void closes in** after a few seconds — no camping. Sudden death by geometry.
- **9 power-ups** drop mid-round:
  - ⚡ **BOLT** — speed surge + instant dash recharge
  - ⬡ **SHIELD** — immune to knockback (dashes *and* shockwaves)
  - ◆ **GIANT** — bigger, heavier, hits way harder
  - 🪶 **FEATHER** — personal low-gravity; drift back from the edge
  - 👻 **PHANTOM** — phase through everyone + a speed burst
  - 🔱 **TRIDENT** — tripled dash knockback
  - 🚀 **TURBO** — dash on a near-instant cooldown
  - 🧲 **MAGNET** — drag rivals toward you to set up combos
  - ❤ **LIFE** — a revive token; pop back in once when knocked out
- **12 round mutators** — every round (after the first) rolls a wildcard ruleset:
  Low Gravity, Giant Brawl, Overdrive, Sudden Death, Pinball, **Ice Rink**,
  **Swarm**, **Nine Lives**, **Tiny Titans**, **Bumper City** (bouncy pillars),
  **Black Hole** (center pulls you in).
- **Combos** — chain knockouts for **DOUBLE / TRIPLE / MEGA KO** callouts.
- **Progression** — earn XP, level up, and unlock rank titles (saved locally).
- **Win rounds** to climb the leaderboard. The match runs forever — drop in, drop out.

> ⚙ In-game **settings** (gear, top-left) tune audio, bloom, FOV, quality, screen
> shake, minimap, FPS, reduced-motion and a colorblind boost. Press **H** for help,
> **1–6** for emotes, **F** for fullscreen, **M** to mute. See **FEATURES.md** for
> the full 100-feature list.

## 🧱 How it's built

```
pulsar/
├── server/
│   ├── server.js   # HTTP static host + WebSocket server + 30Hz tick loop
│   ├── game.js     # authoritative match: rounds, void, power-ups, scoring
│   └── bots.js     # bot AI (produces the same inputs a human sends)
├── shared/
│   ├── constants.js# all gameplay tunables (balance lives here)
│   └── physics.js  # the simulation — runs on BOTH server and client
├── public/
│   ├── index.html  # lobby + HUD shell, importmap for Three.js
│   ├── css/style.css
│   └── js/
│       ├── main.js       # bootstrap / lobby
│       ├── game.js       # client loop: interpolation + client-side prediction
│       ├── scene.js      # Three.js: arena, orbs, trails, particles, BLOOM, camera
│       ├── input.js      # WASD + mouse-aimed dash/shockwave (+ touch)
│       ├── net.js        # WebSocket client (auto-reconnect, ping)
│       ├── hud.js        # leaderboard, dash/shockwave meters, banners, kill feed
│       ├── audio.js      # all SFX synthesized at runtime (no audio assets)
│       ├── music.js      # procedural synthwave soundtrack (Web Audio)
│       └── touch.js      # mobile virtual joystick + dash button
├── public/js/three.module.js  # Three.js core, vendored → fully offline
└── public/vendor/jsm/         # Three.js post-processing (bloom), vendored
```

**Networking model:** the server owns the simulation and broadcasts state at
30Hz. Clients **interpolate** other players ~100ms in the past for buttery
movement, and **predict their own orb** with the shared physics for zero-lag
control, gently reconciling to the server. Bots are just inputs flowing through
the exact same physics, so they obey identical rules.

## 🔧 Make it yours (it's built to extend)

- **Rebalance anything** in `shared/constants.js` — dash power, friction, void
  speed, buff durations, lobby size (`TARGET_PLAYERS`). Both ends pick it up.
- **New power-up?** Add a type to `POWERUP_TYPES`, handle it in
  `Game.collectPowerups()`, give it a color/mesh in `Scene._makePickup()`.
- **New round mutator?** Add an entry to the `MUTATORS` array in
  `server/game.js` (gravity / shrink / restitution / giant / speed / start-radius
  knobs are already wired through `startRound()` and `step()`).
- **New game mode?** The match loop is one `step(dt)` in `game.js` with clear
  phases — fork it for team play, capture-the-core, last-team-standing, etc.
- **New arena look?** It's all in `scene.js` (`_arena`, `_gridTexture`).
- **Smarter bots?** All the AI lives in `bots.js`.

## 🛠 Tech

Three.js + UnrealBloom post-processing (vendored, offline-ready) · Node `ws`
WebSockets · procedural Web Audio music & SFX (no media assets) · zero build step ·
pure ES modules. `npm run dev` runs with `--watch` for auto-reload.

---

Built to be picked up, hacked on, and played with friends. Have fun out there. 🌌
