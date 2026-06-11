// PULSAR — single-process server: serves the client AND runs the realtime
// match over WebSockets. Run with `npm start`, open the printed URL.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { C } from '../shared/constants.js';
import { Game } from './game.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const PORT = process.env.PORT || 3000;

// Optional environment overrides (mutate the shared constants before play).
if (process.env.TARGET_PLAYERS) C.TARGET_PLAYERS = Math.max(2, Math.min(16, +process.env.TARGET_PLAYERS));
if (process.env.ROUND_TIME) C.ROUND_TIME = Math.max(20, +process.env.ROUND_TIME);
if (process.env.TICK_RATE) C.TICK_RATE = Math.max(15, Math.min(60, +process.env.TICK_RATE));

// ---- static file server ---------------------------------------------------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// Allow the client to import the shared modules directly from /shared.
function resolveFile(urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel === '/') rel = '/index.html';
  let base = PUBLIC;
  if (rel.startsWith('/shared/')) { base = ROOT; }
  const full = path.join(base, rel);
  // Prevent path traversal outside the allowed roots.
  if (!full.startsWith(PUBLIC) && !full.startsWith(path.join(ROOT, 'shared'))) return null;
  return full;
}

const server = http.createServer((req, res) => {
  // Lightweight health/status endpoint (handy for deploys & uptime checks).
  // Aggregates across rooms; the public room's state is reported for back-compat.
  if (req.url === '/health') {
    const pub = rooms.get(PUBLIC_ROOM);
    let players = 0;
    for (const r of rooms.values()) players += r.sockets.size;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      ok: true, players, rooms: rooms.size,
      tick: pub ? pub.game.tick : 0,
      phase: pub ? pub.game.phase : 'idle',
      mutator: pub && pub.game.mutator ? pub.game.mutator.id : null,
      uptime: Math.round(process.uptime()),
    }));
  }
  const file = resolveFile(req.url);
  if (!file) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    const ext = path.extname(file);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

// ---- realtime layer --------------------------------------------------------
//
// Rooms: every arena is an independent Game instance keyed by a short code.
// The default PUBLIC room is the drop-in party arena; private rooms are
// created on demand when someone joins with an invite code (?room=XYZ12) and
// are torn down when the last human leaves. Bots fill every room the same way.

const wss = new WebSocketServer({ server });

const PUBLIC_ROOM = 'PUBLIC';
const MAX_ROOMS = Math.max(4, +(process.env.MAX_ROOMS || 64));
const rooms = new Map(); // code -> { code, game, sockets: Map<playerId, ws> }

// Invite codes: 4-8 chars, A-Z + digits (client generates unambiguous ones).
function normalizeRoom(code) {
  const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  return c.length >= 4 ? c : PUBLIC_ROOM;
}

function getRoom(code) {
  let room = rooms.get(code);
  if (room) return room;
  if (rooms.size >= MAX_ROOMS) return rooms.get(PUBLIC_ROOM) || makeRoom(PUBLIC_ROOM);
  return makeRoom(code);
}

function makeRoom(code) {
  const room = { code, sockets: new Map() };
  room.game = new Game((type, payload) => {
    const msg = JSON.stringify({ t: type, ...payload });
    for (const ws of room.sockets.values()) if (ws.readyState === ws.OPEN) ws.send(msg);
  });
  room.game.startRound();
  rooms.set(code, room);
  return room;
}

// The public arena always exists (keeps /health stable and joins instant).
makeRoom(PUBLIC_ROOM);

function send(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

wss.on('connection', (ws) => {
  let playerId = null;
  let room = null;
  let msgWindow = 0, msgCount = 0; // crude per-second message rate limiter
  let lastEmote = 0;

  ws.on('message', (raw) => {
    // Rate limit: ~120 msgs/sec/client is plenty (input is 30Hz).
    const sec = (Date.now() / 1000) | 0;
    if (sec !== msgWindow) { msgWindow = sec; msgCount = 0; }
    if (++msgCount > 120) return;
    if (raw.length > 2048) return; // reject oversized payloads

    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.t === 'join' && playerId == null) {
      room = getRoom(normalizeRoom(msg.room));
      const p = room.game.addHuman(msg.name, msg.color);
      playerId = p.id;
      room.sockets.set(playerId, ws);
      send(ws, {
        t: 'welcome',
        id: p.id,
        room: room.code,
        arena: { radius: C.ARENA_RADIUS, minRadius: C.ARENA_MIN_RADIUS },
        constants: C,
      });
      return;
    }

    if (msg.t === 'input' && playerId != null) {
      room.game.setInput(playerId, msg);
    }

    if (msg.t === 'emote' && playerId != null) {
      const now = Date.now();
      if (now - lastEmote < 700) return; // anti-spam
      lastEmote = now;
      const e = Math.max(0, Math.min(5, msg.e | 0));
      const emoteMsg = JSON.stringify({ t: 'event', kind: 'emote', id: playerId, e });
      for (const s of room.sockets.values()) if (s.readyState === s.OPEN) s.send(emoteMsg);
    }

    if (msg.t === 'ping') send(ws, { t: 'pong', s: msg.s });
  });

  ws.on('close', () => {
    if (playerId != null && room) {
      room.game.removeHuman(playerId);
      room.sockets.delete(playerId);
      // Private rooms evaporate when the last human leaves.
      if (room.code !== PUBLIC_ROOM && room.sockets.size === 0) rooms.delete(room.code);
    }
  });
});

// ---- fixed-step simulation loop -------------------------------------------

const STEP = 1 / C.TICK_RATE;
let last = Date.now();
let acc = 0;
setInterval(() => {
  const now = Date.now();
  acc += (now - last) / 1000;
  last = now;
  // Catch up but never spiral if the host stalls.
  let guard = 0;
  let steps = 0;
  while (acc >= STEP && steps < 5) { steps++; acc -= STEP; }
  for (const room of rooms.values()) {
    for (let i = 0; i < steps; i++) room.game.step(STEP);
    if (room.sockets.size > 0) {
      const snap = JSON.stringify(room.game.snapshot());
      for (const ws of room.sockets.values()) if (ws.readyState === ws.OPEN) ws.send(snap);
    }
  }
}, 1000 / C.TICK_RATE);

server.listen(PORT, () => {
  const line = '═'.repeat(46);
  console.log(`\n${line}`);
  console.log('   PULSAR — Neon Knockout Arena');
  console.log(`   ▶  Play:   http://localhost:${PORT}`);
  console.log(`   ▶  LAN:    share your local IP:${PORT} with friends`);
  console.log(`   ▶  Tick:   ${C.TICK_RATE}Hz   Bots fill to ${C.TARGET_PLAYERS}`);
  console.log(`${line}\n`);
});

// Graceful shutdown so the port frees cleanly on Ctrl-C / container stop.
let closing = false;
function shutdown() {
  if (closing) return; closing = true;
  console.log('\n  PULSAR shutting down…');
  for (const room of rooms.values()) {
    for (const ws of room.sockets.values()) { try { ws.close(); } catch {} }
  }
  wss.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
