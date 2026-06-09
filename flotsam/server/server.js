// FLOTSAM — authoritative multiplayer server (v2 "Overkill").
import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GAME, WORLD, SURVIVAL, ITEMS, RECIPES, BUILDABLES, DEBRIS, FISH, SEABED,
  ISLANDS, WEATHER, SHARK, SHARK_TYPES, WILDLIFE, STARTER, clamp,
} from '../public/js/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8080;
const NOSAVE = !!process.env.FLOTSAM_NOSAVE;
const SAVE_FILE = process.env.FLOTSAM_SAVE || path.join(__dirname, '..', 'data', 'save.json');

const app = express();
app.use(express.static(path.join(__dirname, '..', 'public')));
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// ---------------------------------------------------------------------------
// STATE
// ---------------------------------------------------------------------------
let nextId = 1;
const id = () => `e${nextId++}`;
const clients = new Map();
const players = new Map();
const tiles = new Map();      // "gx,gz" -> {gx,gz,hp}
const props = new Map();      // "gx,gz" -> {gx,gz,type,hp,buf,acc,...}
const debris = new Map();
const storage = {};
let seabed = [];              // [{id,type,x,z,done,respawn}]
let islands = [];             // [{id,x,z,vx,vz,nodes:[{i,type,done}]}]
const sharkList = [];
let jellies = [];
let world = {
  time: GAME.DAY_LENGTH * 0.25, day: 1, endgame: null,
  weather: 'clear', weatherT: 60, lightning: false,
  sailUp: false, anchored: false, current: { ...WORLD.CURRENT },
  islandT: ISLANDS.SPAWN_EVERY,
};

const key = (gx, gz) => `${gx},${gz}`;
const rnd = (a, b) => a + Math.random() * (b - a);
const irnd = (a, b) => Math.floor(rnd(a, b + 1));
const dist2 = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; };
const isNight = () => { const t = world.time / GAME.DAY_LENGTH; return t < 0.22 || t > 0.78; };
const curSpeed = () => (world.anchored ? 0 : WORLD.CURRENT_SPEED * (world.sailUp ? (WORLD.SAIL_SPEED / WORLD.CURRENT_SPEED) : 1));

// tech gating: is there a built prop providing this station anywhere on the raft?
function hasStation(s) { for (const p of props.values()) if (BUILDABLES[p.type]?.station === s) return true; return false; }

// ---------------------------------------------------------------------------
// INVENTORY
// ---------------------------------------------------------------------------
function give(inv, item, qty = 1) { inv[item] = (inv[item] || 0) + qty; if (inv[item] <= 0) delete inv[item]; }
function has(inv, item, qty = 1) { return (inv[item] || 0) >= qty; }
function canAfford(inv, cost) { for (const k in cost) if (!has(inv, k, cost[k])) return false; return true; }
function pay(inv, cost) { for (const k in cost) give(inv, k, -cost[k]); }
function refund(inv, cost, frac = 0.5) { for (const k in cost) give(inv, k, Math.floor(cost[k] * frac)); }

// ---------------------------------------------------------------------------
// NET
// ---------------------------------------------------------------------------
function send(ws, obj) { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); }
function broadcast(obj) { const s = JSON.stringify(obj); for (const ws of clients.keys()) if (ws.readyState === 1) ws.send(s); }
function toPlayer(pid, obj) { for (const [ws, c] of clients) if (c.id === pid) return send(ws, obj); }
const tileList = () => [...tiles.values()];
const propList = () => [...props.values()].map(p => ({ gx: p.gx, gz: p.gz, type: p.type, hp: p.hp, n: p.buf ? Object.values(p.buf).reduce((a, b) => a + b, 0) : 0, grow: p.grow || 0, text: p.text || '' }));
const seabedList = () => seabed.map(n => ({ id: n.id, type: n.type, x: n.x, z: n.z, done: n.done }));
const islandList = () => islands.map(i => ({ id: i.id, x: i.x, z: i.z, ry: i.ry, nodes: i.nodes.map(n => ({ i: n.i, type: n.type, done: n.done, ox: n.ox, oz: n.oz })) }));
const pushStructures = () => { broadcast({ t: 'tiles', tiles: tileList() }); broadcast({ t: 'props', props: propList() }); };
const pushInv = (p) => toPlayer(p.id, { t: 'inv', inv: p.inventory, dur: p.toolDur });
const pushStorage = () => broadcast({ t: 'storage', storage });

// ---------------------------------------------------------------------------
// WORLD GEN
// ---------------------------------------------------------------------------
function buildStarterRaft() {
  for (let gx = -1; gx <= 1; gx++) for (let gz = -1; gz <= 1; gz++) tiles.set(key(gx, gz), { gx, gz, hp: BUILDABLES.foundation.hp });
  props.set(key(1, 1), { gx: 1, gz: 1, type: 'storage', hp: BUILDABLES.storage.hp, buf: {}, acc: 0 });
}
function genSeabed() {
  seabed = [];
  for (let i = 0; i < SEABED.NODE_COUNT; i++) {
    const def = SEABED.nodes[irnd(0, SEABED.nodes.length - 1)];
    const a = Math.random() * Math.PI * 2, r = rnd(18, SEABED.RADIUS);
    seabed.push({ id: id(), type: def.type, x: Math.cos(a) * r, z: Math.sin(a) * r, done: false, respawn: 0 });
  }
}
function nodeDef(type) { return SEABED.nodes.find(n => n.type === type); }

function raftCentroid() {
  if (tiles.size === 0) return { x: 0, z: 0 };
  let sx = 0, sz = 0; for (const t of tiles.values()) { sx += t.gx; sz += t.gz; }
  return { x: (sx / tiles.size) * GAME.GRID, z: (sz / tiles.size) * GAME.GRID };
}

function makeShark(kind = 'great') {
  const st = SHARK_TYPES[kind]; const c = raftCentroid();
  return { id: id(), kind, x: c.x + rnd(-30, 30), z: c.z + rnd(-30, 30), ry: 0, hp: st.hp, maxhp: st.hp,
    state: 'circle', chargeT: 0, biteCd: 0, angle: Math.random() * Math.PI * 2 };
}
function spawnIsland() {
  const c = raftCentroid(); const cs = world.current, cl = Math.hypot(cs.x, cs.z) || 1;
  const ux = -cs.x / cl, uz = -cs.z / cl; const r = 150;
  const nodes = []; const n = irnd(3, 5);
  for (let i = 0; i < n; i++) {
    const def = ISLANDS.harvest[irnd(0, ISLANDS.harvest.length - 1)];
    nodes.push({ i, type: def.type, done: false, ox: rnd(-5, 5), oz: rnd(-5, 5) });
  }
  islands.push({ id: id(), x: c.x + ux * r + rnd(-30, 30), z: c.z + uz * r + rnd(-30, 30), ry: Math.random() * 6.28,
    vx: cs.x / cl, vz: cs.z / cl, nodes });
}

// ---------------------------------------------------------------------------
// SAVE / LOAD
// ---------------------------------------------------------------------------
function saveWorld() {
  if (NOSAVE) return;
  try {
    fs.mkdirSync(path.dirname(SAVE_FILE), { recursive: true });
    const data = { tiles: tileList(), props: [...props.values()], storage,
      world: { time: world.time, day: world.day, weather: world.weather }, seabed, nextId };
    fs.writeFileSync(SAVE_FILE, JSON.stringify(data));
  } catch (e) { /* ignore */ }
}
function loadWorld() {
  if (NOSAVE) return false;
  try {
    if (!fs.existsSync(SAVE_FILE)) return false;
    const d = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8'));
    if (!d.tiles?.length) return false;
    for (const t of d.tiles) tiles.set(key(t.gx, t.gz), t);
    for (const p of d.props) { p.buf = p.buf || {}; p.acc = p.acc || 0; props.set(key(p.gx, p.gz), p); }
    Object.assign(storage, d.storage || {});
    if (d.world) { world.time = d.world.time ?? world.time; world.day = d.world.day ?? 1; world.weather = d.world.weather || 'clear'; }
    seabed = d.seabed?.length ? d.seabed : []; nextId = d.nextId || nextId;
    return true;
  } catch (e) { return false; }
}

if (!loadWorld()) buildStarterRaft();
if (!seabed.length) genSeabed();
sharkList.push(makeShark('great'));
for (let i = 0; i < WILDLIFE.JELLYFISH; i++) jellies.push({ x: rnd(-80, 80), z: rnd(-80, 80), vx: 0, vz: 0 });

// ---------------------------------------------------------------------------
// CONNECTION
// ---------------------------------------------------------------------------
wss.on('connection', (ws) => {
  const pid = id();
  clients.set(ws, { id: pid, ws });
  ws.on('message', (raw) => { let m; try { m = JSON.parse(raw); } catch { return; } handle(ws, pid, m); });
  ws.on('close', () => { clients.delete(ws); players.delete(pid); broadcast({ t: 'leave', id: pid }); });
});

const COLORS = [0xffc107, 0xff5722, 0x4caf50, 0x2196f3, 0xe91e63, 0x9c27b0, 0x00bcd4, 0xcddc39];
let colorIdx = 0;

function handle(ws, pid, m) {
  const p = players.get(pid);
  switch (m.t) {
    case 'join': {
      const c = raftCentroid();
      const np = {
        id: pid, name: String(m.name || 'Castaway').slice(0, 16),
        x: c.x, y: GAME.RAFT_Y + 1, z: c.z, ry: 0, anim: 'idle',
        hp: SURVIVAL.MAX, hunger: SURVIVAL.MAX, thirst: SURVIVAL.MAX,
        oxygen: SURVIVAL.OXYGEN_MAX, stamina: SURVIVAL.STAMINA_MAX, temp: SURVIVAL.TEMP_COMFORT,
        inWater: false, alive: true, downed: false, downT: 0, held: 'hook', sprint: false,
        color: COLORS[(colorIdx++) % COLORS.length], inventory: { ...STARTER.inventory }, toolDur: {}, spawn: null, fishCd: 0,
      };
      players.set(pid, np);
      send(ws, { t: 'welcome', id: pid, you: np, tiles: tileList(), props: propList(), storage,
        seabed: seabedList(), islands: islandList(), time: world.time, day: world.day, weather: world.weather });
      pushInv(np);
      broadcast({ t: 'chat', name: 'SEA', msg: `${np.name} washed ashore.` });
      break;
    }
    case 'input': {
      if (!p || !p.alive) break;
      if (Number.isFinite(m.x)) p.x = m.x; if (Number.isFinite(m.y)) p.y = m.y;
      if (Number.isFinite(m.z)) p.z = m.z; if (Number.isFinite(m.ry)) p.ry = m.ry;
      p.inWater = !!m.inWater; p.anim = m.anim || 'idle'; p.sprint = !!m.sprint;
      if (typeof m.held === 'string') p.held = m.held;
      break;
    }
    case 'collect': {
      if (!p || !p.alive) break;
      const d = debris.get(m.id); if (!d) break;
      if (dist2(p.x, p.z, d.x, d.z) > (GAME.REACH + 2) ** 2) break;
      const got = grant(p, DEBRIS[d.type].loot);
      if (DEBRIS[d.type].special === 'bottle') { toPlayer(pid, { t: 'chat', name: 'BOTTLE', msg: bottleMsg() }); give(p.inventory, 'rations', 1); got.rations = (got.rations || 0) + 1; }
      debris.delete(m.id); broadcast({ t: 'despawn', id: m.id });
      toPlayer(pid, { t: 'pickup', got }); pushInv(p);
      break;
    }
    case 'fish': {
      if (!p || !p.alive) break;
      const now = Date.now(); if (p.fishCd && now < p.fishCd) break;
      const net = p.held === 'fishnet'; p.fishCd = now + (net ? 2200 : 3200);
      useTool(p, p.held);
      setTimeout(() => { const pp = players.get(pid); if (!pp || !pp.alive) return; doFish(pp, net); }, net ? 1800 : 2600);
      break;
    }
    case 'craft': {
      if (!p || !p.alive) break;
      const r = RECIPES[m.recipe]; if (!r) break;
      if (r.req && !hasStation(r.req)) { toPlayer(pid, { t: 'toast', msg: `Need a ${stationName(r.req)}.` }); break; }
      if (!canAfford(p.inventory, r.in)) { toPlayer(pid, { t: 'toast', msg: 'Not enough materials.' }); break; }
      pay(p.inventory, r.in);
      for (const k in r.out) { give(p.inventory, k, r.out[k]); if (ITEMS[k]?.dur) p.toolDur[k] = ITEMS[k].dur; }
      pushInv(p); toPlayer(pid, { t: 'toast', msg: `Crafted ${ITEMS[Object.keys(r.out)[0]].name}.` });
      break;
    }
    case 'build': { if (p && p.alive) placeBuild(p, m.kind, m.gx | 0, m.gz | 0); break; }
    case 'remove': { if (p && p.alive) removeBuild(p, m.gx | 0, m.gz | 0); break; }
    case 'repair': { if (p && p.alive) repair(p, m.gx | 0, m.gz | 0); break; }
    case 'consume': { if (p && p.alive) consume(p, m.item); break; }
    case 'drinksea': {
      if (!p || !p.alive) break;
      if (!has(p.inventory, 'bucket')) { toast(p, 'Need a Bucket.'); break; }
      p.thirst = clamp(p.thirst + 14, 0, SURVIVAL.MAX); p.hp = clamp(p.hp - 5, 0, SURVIVAL.MAX);
      toast(p, 'Ugh — salt water. Thirst eased, but it hurts. Build a Purifier!');
      break;
    }
    case 'station': { if (p && p.alive) station(p, m.gx | 0, m.gz | 0, m.action, m); break; }
    case 'mine': { if (p && p.alive) mine(p, m); break; }
    case 'hitshark': {
      if (!p || !p.alive) break;
      const w = p.held === 'metalspear' ? 'metalspear' : 'spear';
      if (!has(p.inventory, w)) { toPlayer(pid, { t: 'toast', msg: 'Need a Spear.' }); break; }
      attackShark(p, ITEMS[w].power, GAME.REACH + 2, w);
      break;
    }
    case 'shoot': {
      if (!p || !p.alive) break;
      if (!has(p.inventory, 'bow')) { toPlayer(pid, { t: 'toast', msg: 'Need a Bow.' }); break; }
      if (!has(p.inventory, 'arrow')) { toPlayer(pid, { t: 'toast', msg: 'Out of arrows.' }); break; }
      give(p.inventory, 'arrow', -1); useTool(p, 'bow');
      attackShark(p, ITEMS.bow.power, 40, null); pushInv(p);
      break;
    }
    case 'sleep': { if (p && p.alive) doSleep(p, m.gx | 0, m.gz | 0); break; }
    case 'revive': { if (p && p.alive) revive(p, m.id); break; }
    case 'ping': { if (p) broadcast({ t: 'ping', name: p.name, x: m.x, z: m.z, color: p.color }); break; }
    case 'emote': { if (p) broadcast({ t: 'emote', id: pid, e: String(m.e || '👋').slice(0, 4) }); break; }
    case 'chat': { if (p) broadcast({ t: 'chat', name: p.name, msg: String(m.msg || '').slice(0, 140) }); break; }
    case 'respawn': {
      if (!p) break;
      const sp = p.spawn && tiles.has(key(p.spawn.gx, p.spawn.gz)) ? { x: p.spawn.gx * GAME.GRID, z: p.spawn.gz * GAME.GRID } : raftCentroid();
      Object.assign(p, { hp: SURVIVAL.MAX, hunger: 60, thirst: 60, oxygen: SURVIVAL.OXYGEN_MAX, stamina: SURVIVAL.STAMINA_MAX, temp: SURVIVAL.TEMP_COMFORT, alive: true, downed: false, x: sp.x, y: GAME.RAFT_Y + 1, z: sp.z });
      toPlayer(pid, { t: 'respawned', you: p }); pushInv(p);
      break;
    }
  }
}

function grant(p, loot) {
  const got = {};
  for (const [item, lo, hi] of loot) { const q = irnd(lo, hi); if (q > 0) { give(p.inventory, item, q); got[item] = (got[item] || 0) + q; } }
  return got;
}
function stationName(s) { const b = Object.values(BUILDABLES).find(x => x.station === s); return b ? b.name : s; }
const BOTTLES = ['"…still adrift. The shark took Marco. Trust the metal." — found a ration.', '"If you read this, build the beacon. It works." — a ration inside.', '"The megalodon comes when you call for help. Be ready."', '"Pearls below. Dive deep, breathe deeper."'];
function bottleMsg() { return BOTTLES[irnd(0, BOTTLES.length - 1)]; }

// tool durability
function useTool(p, item) {
  const it = ITEMS[item]; if (!it || !it.dur || it.dur >= 999) return;
  if (p.toolDur[item] == null) p.toolDur[item] = it.dur;
  p.toolDur[item] -= 1;
  if (p.toolDur[item] <= 0) {
    give(p.inventory, item, -1);
    if (has(p.inventory, item)) p.toolDur[item] = it.dur; else { delete p.toolDur[item]; toPlayer(p.id, { t: 'toast', msg: `${it.name} broke!` }); }
    pushInv(p);
  }
}

function doFish(p, net) {
  const total = FISH.reduce((a, f) => a + f.w, 0); let r = Math.random() * total; let pick = FISH[0];
  for (const f of FISH) { r -= f.w; if (r <= 0) { pick = f; break; } }
  const qty = (pick.qty || 1) * (net ? 2 : 1);
  give(p.inventory, pick.item, qty);
  if (pick.dmg) p.hp = clamp(p.hp - pick.dmg, 0, SURVIVAL.MAX);
  toPlayer(p.id, { t: 'pickup', got: { [pick.item]: qty } });
  toPlayer(p.id, { t: 'toast', msg: `🎣 ${pick.name}!` + (pick.dmg ? ' Ouch — poisonous!' : '') });
  pushInv(p);
}

// ---------------------------------------------------------------------------
// BUILD
// ---------------------------------------------------------------------------
function placeBuild(p, kind, gx, gz) {
  const b = BUILDABLES[kind]; if (!b) return;
  if (b.req && !hasStation(b.req)) { toPlayer(p.id, { t: 'toast', msg: `Need a ${stationName(b.req)} first.` }); return; }
  const cx = gx * GAME.GRID, cz = gz * GAME.GRID;
  if (dist2(p.x, p.z, cx, cz) > (GAME.REACH + GAME.GRID) ** 2) { toPlayer(p.id, { t: 'toast', msg: 'Too far.' }); return; }
  if (!canAfford(p.inventory, b.in)) { toPlayer(p.id, { t: 'toast', msg: 'Not enough materials.' }); return; }
  if (b.shape === 'tile') {
    if (tiles.has(key(gx, gz))) { toPlayer(p.id, { t: 'toast', msg: 'Already a tile here.' }); return; }
    const adj = tiles.has(key(gx + 1, gz)) || tiles.has(key(gx - 1, gz)) || tiles.has(key(gx, gz + 1)) || tiles.has(key(gx, gz - 1));
    if (!adj) { toPlayer(p.id, { t: 'toast', msg: 'Must connect to the raft.' }); return; }
    tiles.set(key(gx, gz), { gx, gz, hp: b.hp, kind });
  } else {
    if (!tiles.has(key(gx, gz))) { toPlayer(p.id, { t: 'toast', msg: 'Needs a foundation.' }); return; }
    if (props.has(key(gx, gz))) { toPlayer(p.id, { t: 'toast', msg: 'Cell is occupied.' }); return; }
    props.set(key(gx, gz), { gx, gz, type: kind, hp: b.hp, buf: {}, acc: 0 });
    if (kind === 'beacon') broadcast({ t: 'chat', name: 'SEA', msg: `${p.name} built a RESCUE BEACON. Activate it (E) to call for help!` });
  }
  pay(p.inventory, b.in); pushInv(p); pushStructures();
}
function removeBuild(p, gx, gz) {
  const cx = gx * GAME.GRID, cz = gz * GAME.GRID;
  if (dist2(p.x, p.z, cx, cz) > (GAME.REACH + GAME.GRID) ** 2) return;
  const pr = props.get(key(gx, gz));
  if (pr) { refund(p.inventory, BUILDABLES[pr.type].in); props.delete(key(gx, gz)); pushInv(p); pushStructures(); return; }
  const tl = tiles.get(key(gx, gz));
  if (tl) {
    const n = ['1,0', '-1,0', '0,1', '0,-1'].reduce((a, o) => { const [dx, dz] = o.split(',').map(Number); return a + (tiles.has(key(gx + dx, gz + dz)) ? 1 : 0); }, 0);
    if (tiles.size > 1 && n > 1) { toPlayer(p.id, { t: 'toast', msg: 'Remove edge tiles first.' }); return; }
    refund(p.inventory, BUILDABLES[tl.kind || 'foundation'].in);
    tiles.delete(key(gx, gz)); pushInv(p); pushStructures();
  }
}
function repair(p, gx, gz) {
  if (!has(p.inventory, 'wood', 1)) { toPlayer(p.id, { t: 'toast', msg: 'Need Wood to repair.' }); return; }
  const pr = props.get(key(gx, gz)); const tl = tiles.get(key(gx, gz));
  const target = pr || tl; if (!target) return;
  const maxHp = pr ? BUILDABLES[pr.type].hp : BUILDABLES[tl.kind || 'foundation'].hp;
  if (target.hp >= maxHp) { toPlayer(p.id, { t: 'toast', msg: 'Already fixed.' }); return; }
  give(p.inventory, 'wood', -1); target.hp = clamp(target.hp + 30, 0, maxHp);
  pushInv(p); pushStructures();
}

function consume(p, item) {
  const it = ITEMS[item];
  if (!it || (it.kind !== 'food' && it.kind !== 'drink')) return;
  if (!has(p.inventory, item)) return;
  give(p.inventory, item, -1);
  if (it.hunger) p.hunger = clamp(p.hunger + it.hunger, 0, SURVIVAL.MAX);
  if (it.thirst) p.thirst = clamp(p.thirst + it.thirst, 0, SURVIVAL.MAX);
  if (it.health) p.hp = clamp(p.hp + it.health, 0, SURVIVAL.MAX);
  pushInv(p);
}

// ---------------------------------------------------------------------------
// STATIONS
// ---------------------------------------------------------------------------
function near(p, gx, gz, range = GAME.REACH + 1) { return dist2(p.x, p.z, gx * GAME.GRID, gz * GAME.GRID) <= range ** 2; }
function station(p, gx, gz, action, m) {
  const pr = props.get(key(gx, gz)); if (!pr) return;
  if (!near(p, gx, gz)) { toPlayer(p.id, { t: 'toast', msg: 'Get closer.' }); return; }
  const st = BUILDABLES[pr.type].station;
  switch (st) {
    case 'grill': {
      if (has(p.inventory, 'rawmeat')) { give(p.inventory, 'rawmeat', -1); give(p.inventory, 'steak', 1); toast(p, 'Grilled a shark steak! 🍖'); }
      else if (has(p.inventory, 'crabmeat')) { give(p.inventory, 'crabmeat', -1); give(p.inventory, 'grilledcrab', 1); toast(p, 'Grilled crab! 🦐'); }
      else if (has(p.inventory, 'rawfish')) { give(p.inventory, 'rawfish', -1); give(p.inventory, 'cookedfish', 1); toast(p, 'Cooked a fish. 🍤'); }
      else { toast(p, 'Nothing to cook.'); return; }
      pushInv(p); break;
    }
    case 'cookpot': {
      if (has(p.inventory, 'rawfish', 2) && has(p.inventory, 'seaweedsnack')) { give(p.inventory, 'rawfish', -2); give(p.inventory, 'seaweedsnack', -1); give(p.inventory, 'sushi', 1); toast(p, 'Rolled sushi! 🍣'); }
      else if (has(p.inventory, 'rawfish') && has(p.inventory, 'seaweedsnack')) { give(p.inventory, 'rawfish', -1); give(p.inventory, 'seaweedsnack', -1); give(p.inventory, 'soup', 1); toast(p, 'Cooked fish soup! 🍲'); }
      else if (has(p.inventory, 'fruit')) { give(p.inventory, 'fruit', -1); give(p.inventory, 'juice', 1); toast(p, 'Pressed fruit juice. 🧃'); }
      else { toast(p, 'Need fish + seaweed (soup/sushi) or fruit (juice).'); return; }
      pushInv(p); break;
    }
    case 'furnace': {
      if (has(p.inventory, 'scrap', 3)) { give(p.inventory, 'scrap', -3); give(p.inventory, 'metal', 1); toast(p, 'Smelted metal. ⛓️'); }
      else if (has(p.inventory, 'sand', 2)) { give(p.inventory, 'sand', -2); give(p.inventory, 'glass', 1); toast(p, 'Made glass. 🪟'); }
      else { toast(p, 'Smelt: 3 scrap → metal, or 2 sand → glass.'); return; }
      pushInv(p); break;
    }
    case 'anvil': case 'workbench': case 'research': { toast(p, `${BUILDABLES[pr.type].name} ready — open Craft (C).`); break; }
    case 'purifier': case 'net': case 'raincatcher': {
      let any = false; for (const k in pr.buf) if (pr.buf[k] > 0) { give(p.inventory, k, pr.buf[k]); any = true; }
      pr.buf = {}; pr.acc = 0;
      if (any) { pushInv(p); pushStructures(); toast(p, 'Collected.'); } else toast(p, 'Nothing yet.');
      break;
    }
    case 'planter': {
      if (pr.grow >= 100) { give(p.inventory, 'potato', irnd(2, 3)); pr.grow = 0; pr.planted = false; toast(p, 'Harvested potatoes! 🥔'); pushInv(p); pushStructures(); }
      else if (!pr.planted) { if (has(p.inventory, 'potato_seed')) { give(p.inventory, 'potato_seed', -1); pr.planted = true; pr.grow = 0.001; toast(p, 'Planted. Come back later. 🌱'); pushInv(p); pushStructures(); } else toast(p, 'Need a Potato Seed (craft from a potato).'); }
      else toast(p, `Growing… ${Math.floor(pr.grow)}%`);
      break;
    }
    case 'bed': { doSleep(p, gx, gz); break; }
    case 'sail': { world.sailUp = !world.sailUp; broadcast({ t: 'chat', name: 'SEA', msg: world.sailUp ? '⛵ Sail raised — the sea races past!' : 'Sail lowered.' }); break; }
    case 'anchor': { world.anchored = !world.anchored; broadcast({ t: 'chat', name: 'SEA', msg: world.anchored ? '⚓ Anchored — holding position.' : 'Anchor up.' }); break; }
    case 'wheel': { const a = Math.atan2(world.current.z, world.current.x) + (m.dir || 0.4); world.current = { x: Math.cos(a), z: Math.sin(a) }; toast(p, 'Adjusted heading. 🧭'); break; }
    case 'sign': { if (typeof m.text === 'string') { pr.text = m.text.slice(0, 40); pushStructures(); } break; }
    case 'chair': { p.sitting = !p.sitting; break; }
    case 'storage': {
      if (action === 'deposit' && m.item) { const q = Math.min(p.inventory[m.item] || 0, m.qty || 1e9); if (q > 0) { give(p.inventory, m.item, -q); give(storage, m.item, q); } }
      else if (action === 'withdraw' && m.item) { const q = Math.min(storage[m.item] || 0, m.qty || 1e9); if (q > 0) { give(storage, m.item, -q); give(p.inventory, m.item, q); } }
      else if (action === 'depositResources') { for (const k in { ...p.inventory }) if (ITEMS[k] && ['resource', 'material'].includes(ITEMS[k].kind)) { const q = p.inventory[k]; give(p.inventory, k, -q); give(storage, k, q); } }
      pushInv(p); pushStorage(); break;
    }
    case 'beacon': {
      if (world.endgame && world.endgame.active) { toast(p, 'Beacon already transmitting!'); return; }
      world.endgame = { active: true, timer: 100, won: false };
      broadcast({ t: 'event', kind: 'beacon_on' });
      broadcast({ t: 'chat', name: 'BEACON', msg: '⚠ DISTRESS SENT. Rescue in 100s. The MEGALODON is coming. SURVIVE.' });
      sharkList.length = 0; sharkList.push(makeShark('megalodon'), makeShark('reef'), makeShark('reef'));
      break;
    }
  }
}
function toast(p, msg) { toPlayer(p.id, { t: 'toast', msg }); }

function mine(p, m) {
  if (m.kind === 'seabed') {
    const node = seabed.find(n => n.id === m.id); if (!node || node.done) return;
    if (dist2(p.x, p.z, node.x, node.z) > 7 ** 2 || p.y > GAME.SEABED_Y + 4) { toast(p, 'Dive down to the node.'); return; }
    const got = grant(p, nodeDef(node.type).loot);
    useTool(p, p.held); node.done = true; node.respawn = 30;
    toPlayer(p.id, { t: 'pickup', got }); pushInv(p);
    broadcast({ t: 'seabed', seabed: seabedList() });
  } else if (m.kind === 'island') {
    const isl = islands.find(i => i.id === m.island); if (!isl) return;
    const node = isl.nodes.find(n => n.i === m.node); if (!node || node.done) return;
    const nx = isl.x + node.ox, nz = isl.z + node.oz;
    if (dist2(p.x, p.z, nx, nz) > 8 ** 2) { toast(p, 'Get onto the island.'); return; }
    const def = ISLANDS.harvest.find(h => h.type === node.type);
    const got = grant(p, def.loot); useTool(p, p.held);
    node.done = true; toPlayer(p.id, { t: 'pickup', got }); pushInv(p);
    broadcast({ t: 'islands', islands: islandList() });
  }
}

function doSleep(p, gx, gz) {
  if (!near(p, gx, gz, GAME.REACH + 2)) { toast(p, 'Get into bed.'); return; }
  p.spawn = { gx, gz };
  toast(p, '🛏️ Spawn point set.');
  if (isNight()) {
    world.time = GAME.DAY_LENGTH * 0.25; world.day++;
    for (const q of players.values()) if (q.alive) q.hp = clamp(q.hp + 25, 0, SURVIVAL.MAX);
    broadcast({ t: 'chat', name: 'SEA', msg: `${p.name} slept. A new day breaks. ☀️` });
    broadcast({ t: 'event', kind: 'wake' });
  } else toast(p, 'You can only sleep at night.');
}

function revive(p, targetId) {
  const t = players.get(targetId); if (!t || !t.downed) return;
  if (dist2(p.x, p.z, t.x, t.z) > 4 ** 2) { toast(p, 'Get next to your downed crewmate.'); return; }
  t.reviveBy = p.id; t.reviveT = (t.reviveT || 0);
}

// ---------------------------------------------------------------------------
// SHARK COMBAT
// ---------------------------------------------------------------------------
function attackShark(p, dmg, range, toolItem) {
  let best = null, bd = range ** 2;
  for (const s of sharkList) { const d = dist2(p.x, p.z, s.x, s.z); if (d < bd) { bd = d; best = s; } }
  if (!best) { toast(p, 'No shark in range.'); return; }
  if (toolItem) useTool(p, toolItem);
  best.hp -= dmg; best.state = 'flee'; best.fleeT = 2.5;
  broadcast({ t: 'event', kind: 'sharkhit', x: best.x, z: best.z });
  if (best.hp <= 0) killShark(best, p);
}
function killShark(s, p) {
  const st = SHARK_TYPES[s.kind];
  broadcast({ t: 'event', kind: 'sharkdead', x: s.x, z: s.z, boss: !!st.boss });
  broadcast({ t: 'chat', name: 'SEA', msg: `${p.name} slew the ${st.name}! 🩸` });
  if (p) { const got = grant(p, st.loot); toPlayer(p.id, { t: 'pickup', got }); pushInv(p); }
  const i = sharkList.indexOf(s); if (i >= 0) sharkList.splice(i, 1);
  if (st.boss && world.endgame?.active) { winGame(); return; }
  if (!world.endgame?.active && sharkList.length === 0) setTimeout(() => { if (sharkList.length === 0) sharkList.push(makeShark(Math.random() < 0.4 ? 'reef' : (Math.random() < 0.5 ? 'hammerhead' : 'great'))); }, 22000);
}
function moveToward(s, tx, tz, step) {
  const dx = tx - s.x, dz = tz - s.z, d = Math.hypot(dx, dz);
  if (d < 0.001) return true; s.ry = Math.atan2(dz, dx);
  if (d <= step) { s.x = tx; s.z = tz; return true; } s.x += dx / d * step; s.z += dz / d * step; return false;
}
function tickShark(s, dt, c, aggro) {
  const st = SHARK_TYPES[s.kind];
  if (s.biteCd > 0) s.biteCd -= dt;
  if (s.state === 'flee') {
    s.fleeT -= dt; const a = Math.atan2(s.z - c.z, s.x - c.x);
    s.x += Math.cos(a) * st.speed * dt; s.z += Math.sin(a) * st.speed * dt; s.ry = a;
    if (s.fleeT <= 0) s.state = 'circle'; return;
  }
  let target = null, isPlayer = false;
  for (const pl of players.values()) if (pl.alive && pl.inWater) { target = { x: pl.x, z: pl.z, ref: pl }; isPlayer = true; break; }
  if (!target) {
    let bestT = null, bd = Infinity;
    for (const t of tiles.values()) {
      const perim = !(tiles.has(key(t.gx + 1, t.gz)) && tiles.has(key(t.gx - 1, t.gz)) && tiles.has(key(t.gx, t.gz + 1)) && tiles.has(key(t.gx, t.gz - 1)));
      if (!perim) continue;
      const pt = props.get(key(t.gx, t.gz)); const wall = pt?.type === 'wall' || pt?.type === 'spikes';
      const wx = t.gx * GAME.GRID, wz = t.gz * GAME.GRID;
      let d = dist2(s.x, s.z, wx, wz); if (wall) d *= 2.5;
      if (d < bd) { bd = d; bestT = { x: wx, z: wz, ref: t, k: key(t.gx, t.gz), pt }; }
    }
    target = bestT;
  }
  if (s.state === 'circle') {
    s.angle += (dt * st.speed / SHARK.CIRCLE_RADIUS) * aggro;
    moveToward(s, c.x + Math.cos(s.angle) * SHARK.CIRCLE_RADIUS, c.z + Math.sin(s.angle) * SHARK.CIRCLE_RADIUS, st.speed * dt);
    s.chargeT += dt;
    if (s.chargeT > rnd(3, 6) / aggro && target) { s.state = 'charge'; s.chargeT = 0; s.target = target; s.isPlayer = isPlayer; }
  } else if (s.state === 'charge' && s.target) {
    const reached = moveToward(s, s.target.x, s.target.z, st.charge * dt);
    if (reached || dist2(s.x, s.z, s.target.x, s.target.z) < 9) {
      if (s.biteCd <= 0) {
        s.biteCd = 1.2;
        if (s.isPlayer && s.target.ref && s.target.ref.alive) {
          hurtPlayer(s.target.ref, st.bitePlayer); broadcast({ t: 'event', kind: 'bite', x: s.x, z: s.z, player: s.target.ref.id });
        } else if (s.target.ref) {
          const tk = s.target.k, prop = props.get(tk);
          if (prop?.type === 'spikes') { s.hp -= 20; broadcast({ t: 'event', kind: 'sharkhit', x: s.x, z: s.z }); if (s.hp <= 0) return killShark(s, null); }
          const dmg = (prop?.type === 'wall' || prop?.type === 'spikes') ? st.biteTile * 0.4 : st.biteTile;
          if (prop?.type === 'wall') { prop.hp -= dmg; if (prop.hp <= 0) props.delete(tk); }
          else { s.target.ref.hp -= dmg; if (s.target.ref.hp <= 0) tiles.delete(tk); }
          broadcast({ t: 'event', kind: 'bite', x: s.x, z: s.z }); pushStructures();
        }
      }
      s.state = 'circle';
    }
  }
}
function hurtPlayer(p, dmg) {
  if (p.downed) return;
  p.hp = clamp(p.hp - dmg, 0, SURVIVAL.MAX);
  if (p.hp <= 0) downPlayer(p);
}
function downPlayer(p) {
  // co-op: solo players die outright; with crew you go "downed" and can be revived
  const others = [...players.values()].filter(q => q !== p && q.alive && !q.downed).length;
  if (others > 0) { p.downed = true; p.downT = SURVIVAL.DOWN_TIME; p.hp = 0; toPlayer(p.id, { t: 'downed' }); broadcast({ t: 'chat', name: 'SEA', msg: `${p.name} is DOWN — revive them!` }); }
  else killPlayer(p);
}
function killPlayer(p) { p.alive = false; p.downed = false; toPlayer(p.id, { t: 'died' }); broadcast({ t: 'chat', name: 'SEA', msg: `${p.name} succumbed to the sea.` }); }
function winGame() {
  if (world.endgame) { world.endgame.won = true; world.endgame.active = false; }
  broadcast({ t: 'event', kind: 'rescued' });
  broadcast({ t: 'chat', name: 'BEACON', msg: '🚁 RESCUE ARRIVED. You survived FLOTSAM. LEGENDS. ⛵' });
  sharkList.length = 0; sharkList.push(makeShark('great'));
}

// ---------------------------------------------------------------------------
// DEBRIS
// ---------------------------------------------------------------------------
const debrisTypes = Object.entries(DEBRIS);
const totalWeight = debrisTypes.reduce((a, [, d]) => a + d.weight, 0);
function rollDebrisType() { let r = Math.random() * totalWeight; for (const [n, d] of debrisTypes) { r -= d.weight; if (r <= 0) return n; } return debrisTypes[0][0]; }
function spawnDebris() {
  const c = raftCentroid(); const cur = world.current; const cl = Math.hypot(cur.x, cur.z) || 1;
  const ux = -cur.x / cl, uz = -cur.z / cl; const spread = rnd(-1, 1);
  const px = ux + (-uz) * spread, pz = uz + ux * spread; const pl = Math.hypot(px, pz) || 1;
  const r = WORLD.DEBRIS_SPAWN_RADIUS;
  const did = id();
  debris.set(did, { id: did, type: rollDebrisType(), x: c.x + px / pl * r, z: c.z + pz / pl * r, ry: Math.random() * 6.28 });
}

// ---------------------------------------------------------------------------
// MAIN LOOP
// ---------------------------------------------------------------------------
let last = Date.now();
function tick() {
  const now = Date.now(); const dt = Math.min(0.25, (now - last) / 1000); last = now;
  const c = raftCentroid();
  world.time += dt; if (world.time >= GAME.DAY_LENGTH) { world.time -= GAME.DAY_LENGTH; world.day++; }
  const night = isNight(); const aggro = night ? SHARK.AGGRO_NIGHT : 1;
  const wx = WEATHER[world.weather];

  // weather machine
  world.weatherT -= dt; world.lightning = false;
  if (world.weatherT <= 0) {
    const nx = wx.next; let r = Math.random(), pick = world.weather;
    for (const k in nx) { r -= nx[k]; if (r <= 0) { pick = k; break; } }
    world.weather = pick; world.weatherT = rnd(WEATHER.MIN_DURATION, WEATHER.MAX_DURATION);
    broadcast({ t: 'chat', name: 'SEA', msg: `The weather turns ${WEATHER[pick].name.toLowerCase()}.` });
  }
  if (wx.lightning && Math.random() < dt * 0.4) { world.lightning = true; broadcast({ t: 'event', kind: 'lightning' }); }

  // current heading drift toward configured + apply island/debris drift speed
  const spd = curSpeed();

  // survival per player
  for (const p of players.values()) {
    if (!p.alive) continue;
    const submerged = p.y < -1.2;
    // oxygen
    if (submerged) { const slow = has(p.inventory, 'oxytank') ? 0.25 : 1; p.oxygen = clamp(p.oxygen - SURVIVAL.OXYGEN_DRAIN * slow * dt, 0, SURVIVAL.OXYGEN_MAX); if (p.oxygen <= 0) hurtPlayer(p, SURVIVAL.DROWN_DMG * dt); }
    else p.oxygen = clamp(p.oxygen + SURVIVAL.OXYGEN_REGEN * dt, 0, SURVIVAL.OXYGEN_MAX);
    // stamina
    if (p.sprint && p.anim !== 'idle') p.stamina = clamp(p.stamina - SURVIVAL.STAMINA_DRAIN * dt, 0, SURVIVAL.STAMINA_MAX);
    else p.stamina = clamp(p.stamina + SURVIVAL.STAMINA_REGEN * dt, 0, SURVIVAL.STAMINA_MAX);
    // temperature
    let warm = false; for (const pr of props.values()) { if (BUILDABLES[pr.type].warm && near(p, pr.gx, pr.gz, 7)) { warm = true; break; } }
    const stormCold = world.weather === 'storm' || world.weather === 'rain';
    if (warm) p.temp = clamp(p.temp + SURVIVAL.TEMP_WARM * dt, 0, SURVIVAL.TEMP_MAX);
    else if (night || stormCold || submerged) p.temp = clamp(p.temp - SURVIVAL.TEMP_NIGHT_DROP * dt, 0, SURVIVAL.TEMP_MAX);
    else p.temp = clamp(p.temp + SURVIVAL.TEMP_DAY_WARM * dt, 0, SURVIVAL.TEMP_COMFORT);
    if (p.temp <= 0) hurtPlayer(p, SURVIVAL.COLD_DMG * dt);
    // hunger/thirst
    p.hunger = clamp(p.hunger - SURVIVAL.HUNGER_DRAIN * dt, 0, SURVIVAL.MAX);
    p.thirst = clamp(p.thirst - SURVIVAL.THIRST_DRAIN * dt, 0, SURVIVAL.MAX);
    if (p.hunger <= 0) hurtPlayer(p, SURVIVAL.STARVE_DMG * dt);
    if (p.thirst <= 0) hurtPlayer(p, SURVIVAL.DEHYDRATE_DMG * dt);
    if (!p.downed && p.hunger > 40 && p.thirst > 40 && p.temp > 20 && p.hp < SURVIVAL.MAX) p.hp = clamp(p.hp + SURVIVAL.REGEN * dt, 0, SURVIVAL.MAX);
    // downed countdown / revive
    if (p.downed) {
      if (p.reviveBy != null) { p.reviveT += dt; if (p.reviveT >= SURVIVAL.REVIVE_TIME) { p.downed = false; p.hp = 35; p.reviveT = 0; p.reviveBy = null; toPlayer(p.id, { t: 'revived' }); broadcast({ t: 'chat', name: 'SEA', msg: `${p.name} was revived!` }); } }
      else { p.reviveT = 0; p.downT -= dt; if (p.downT <= 0) killPlayer(p); }
      // clear revive flag each tick unless renewed
      p.reviveBy = null;
    }
  }

  // debris
  for (const d of debris.values()) { d.x += world.current.x / (Math.hypot(world.current.x, world.current.z) || 1) * spd * dt; d.z += world.current.z / (Math.hypot(world.current.x, world.current.z) || 1) * spd * dt; if (dist2(d.x, d.z, c.x, c.z) > WORLD.DEBRIS_DESPAWN ** 2) { debris.delete(d.id); broadcast({ t: 'despawn', id: d.id }); } }
  if (debris.size < WORLD.DEBRIS_MAX && Math.random() < 0.5 + (world.sailUp ? 0.4 : 0)) spawnDebris();

  // islands drift + spawn
  world.islandT -= dt;
  if (world.islandT <= 0 && islands.length < ISLANDS.MAX) { spawnIsland(); world.islandT = ISLANDS.SPAWN_EVERY; broadcast({ t: 'chat', name: 'SEA', msg: 'Land ho! An island drifts near. 🏝️' }); broadcast({ t: 'islands', islands: islandList() }); }
  let islandsDirty = false;
  for (const isl of islands) { isl.x += isl.vx * spd * 0.4 * dt; isl.z += isl.vz * spd * 0.4 * dt; }
  islands = islands.filter(i => { const keep = dist2(i.x, i.z, c.x, c.z) < 220 ** 2 && i.nodes.some(n => !n.done); if (!keep) islandsDirty = true; return keep; });
  if (islandsDirty) broadcast({ t: 'islands', islands: islandList() });

  // seabed respawn
  for (const n of seabed) if (n.done) { n.respawn -= dt; if (n.respawn <= 0) { n.done = false; const def = SEABED.nodes[irnd(0, SEABED.nodes.length - 1)]; n.type = def.type; broadcast({ t: 'seabed', seabed: seabedList() }); } }

  // jellyfish drift + sting
  for (const j of jellies) {
    j.x += (world.current.x * 0.3 + Math.sin(now / 1000 + j.x)) * 0.3 * dt; j.z += (world.current.z * 0.3) * 0.3 * dt;
    if (dist2(j.x, j.z, c.x, c.z) > 140 ** 2) { j.x = c.x + rnd(-80, 80); j.z = c.z + rnd(-80, 80); }
    for (const p of players.values()) if (p.alive && p.inWater && dist2(p.x, p.z, j.x, j.z) < 3 ** 2 && !p.downed) { if (!p.jellyCd || now > p.jellyCd) { p.jellyCd = now + 1500; hurtPlayer(p, 8); broadcast({ t: 'event', kind: 'sting', player: p.id }); } }
  }

  // stations production
  let structDirty = false;
  for (const pr of props.values()) {
    const st = BUILDABLES[pr.type].station;
    if (st === 'purifier') { pr.acc = (pr.acc || 0) + dt; const have = Object.values(pr.buf).reduce((a, b) => a + b, 0); if (pr.acc >= 7 && have < 6) { pr.acc = 0; give(pr.buf, 'freshwater', 1); structDirty = true; } }
    else if (st === 'raincatcher' && wx.rain > 0) { pr.acc = (pr.acc || 0) + dt * wx.rain; const have = Object.values(pr.buf).reduce((a, b) => a + b, 0); if (pr.acc >= 4 && have < 8) { pr.acc = 0; give(pr.buf, 'freshwater', 1); structDirty = true; } }
    else if (st === 'net') { const nx = pr.gx * GAME.GRID, nz = pr.gz * GAME.GRID; const have = Object.values(pr.buf).reduce((a, b) => a + b, 0); if (have < 12) for (const d of debris.values()) if (dist2(d.x, d.z, nx, nz) < 9) { for (const [it, lo, hi] of DEBRIS[d.type].loot) { const q = irnd(lo, hi); if (q > 0) give(pr.buf, it, q); } debris.delete(d.id); broadcast({ t: 'despawn', id: d.id }); structDirty = true; break; } }
    else if (st === 'planter' && pr.planted && pr.grow < 100) { pr.grow = clamp(pr.grow + dt * 3, 0, 100); }
  }
  if (structDirty) broadcast({ t: 'props', props: propList() });

  // sharks
  for (const s of sharkList) tickShark(s, dt, c, aggro);
  // night ambient extra shark
  if (!world.endgame?.active && night && sharkList.length < 2 && Math.random() < dt * 0.04) sharkList.push(makeShark('reef'));

  // endgame
  if (world.endgame?.active) { world.endgame.timer -= dt; if (world.endgame.timer <= 0 && !world.endgame.won) winGame(); }

  // broadcast
  broadcast({
    t: 'state',
    players: [...players.values()].map(p => ({ id: p.id, name: p.name, x: p.x, y: p.y, z: p.z, ry: p.ry, anim: p.anim, hp: p.hp, hunger: p.hunger, thirst: p.thirst, oxygen: p.oxygen, stamina: p.stamina, temp: p.temp, alive: p.alive, downed: p.downed, color: p.color, held: p.held })),
    debris: [...debris.values()].map(d => ({ id: d.id, type: d.type, x: d.x, z: d.z, ry: d.ry })),
    sharks: sharkList.map(s => ({ x: s.x, z: s.z, ry: s.ry, hp: s.hp, maxhp: s.maxhp, kind: s.kind, state: s.state })),
    jellies: jellies.map(j => ({ x: j.x, z: j.z })),
    weather: world.weather, rain: wx.rain, fog: wx.fog, wave: wx.wave, light: wx.light, lightning: world.lightning,
    sail: world.sailUp, anchored: world.anchored, current: world.current,
    time: world.time, day: world.day, night,
    endgame: world.endgame?.active ? Math.ceil(world.endgame.timer) : null,
  });
}
setInterval(tick, 1000 / GAME.TICK_RATE);
setInterval(saveWorld, 15000);

server.listen(PORT, () => {
  console.log(`\n  🌊 FLOTSAM server running (v2)`);
  console.log(`  ▶ Local:   http://localhost:${PORT}`);
  console.log(`  ▶ Share on your LAN or tunnel the port to play with friends.\n`);
});
