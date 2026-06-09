// PULSAR — authoritative match. Owns every orb (human + bot), runs the fixed
// tick, drives the round/intermission loop, and emits state + events.

import { C, PHASE, POWERUP_TYPES } from '../shared/constants.js';
import { integrate, resolveCollisions, applyVoid, applyBlast, applyMagnets, applyWell, applyBumpers, effectiveRadius } from '../shared/physics.js';
import { botInput, botName } from './bots.js';

const COLORS = [
  '#00f0ff', '#ff2bd6', '#7cff00', '#ffd000', '#ff5e3a',
  '#9b5cff', '#22ff9b', '#ff8a00', '#4d7bff', '#ff4d7d',
];

// Each round rolls a random mutator that bends the rules. Round 1 is always
// STANDARD so newcomers learn the basics first.
const MUTATORS = [
  { id: 'standard', name: 'STANDARD', color: '#00f0ff', blurb: 'Pure knockout.' },
  { id: 'lowgrav', name: 'LOW GRAVITY', color: '#9b5cff', blurb: 'Floaty falls — recover off the edge!', gravity: 0.38 },
  { id: 'giants', name: 'GIANT BRAWL', color: '#ff2bd6', blurb: 'Everyone is HUGE.', giant: true },
  { id: 'overdrive', name: 'OVERDRIVE', color: '#ffd000', blurb: 'Everyone is FAST.', speed: true },
  { id: 'sudden', name: 'SUDDEN DEATH', color: '#ff5e3a', blurb: 'Tiny ring, closing fast.', startFrac: 0.55, shrinkMult: 1.7, grace: 2 },
  { id: 'pinball', name: 'PINBALL', color: '#22ff9b', blurb: 'Hyper-bouncy chaos.', rest: 1.7 },
  { id: 'ice', name: 'ICE RINK', color: '#7fd4ff', blurb: 'The floor is ice — no brakes!', friction: C.ICE_FRICTION },
  { id: 'swarm', name: 'SWARM', color: '#ffd000', blurb: 'Power-up frenzy!', powerupMult: 3 },
  { id: 'ninelives', name: 'NINE LIVES', color: '#22ff9b', blurb: 'Everyone revives once.', lives: 1 },
  { id: 'tiny', name: 'TINY TITANS', color: '#ff8a00', blurb: 'Small, speedy, slippery.', small: true, speed: true },
  { id: 'bumpers', name: 'BUMPER CITY', color: '#4d7bff', blurb: 'Bounce off the pillars.', bumpers: true },
  { id: 'blackhole', name: 'BLACK HOLE', color: '#9b5cff', blurb: 'The center pulls you in.', well: true },
];

// Bumper pillar layout for the BUMPER CITY mutator.
function makeBumpers() {
  const out = [];
  const ring = C.ARENA_RADIUS * 0.5;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    out.push({ x: Math.cos(a) * ring, z: Math.sin(a) * ring, r: 1.8 });
  }
  out.push({ x: 0, z: 0, r: 2.4 });
  return out;
}

let nextId = 1;
const uid = () => nextId++;

export class Game {
  constructor(emit) {
    this.emit = emit; // (type, payload, targetId?) => void
    this.players = new Map(); // id -> orb
    this.powerups = [];
    this.phase = PHASE.COUNTDOWN;
    this.phaseTime = C.COUNTDOWN;
    this.deathRadius = C.ARENA_RADIUS;
    this.roundClock = C.ROUND_TIME;
    this.powerupClock = C.POWERUP_INTERVAL;
    this.tick = 0;
    this.winnerId = null;
    this.colorCursor = Math.floor(Math.random() * COLORS.length);
  }

  // ---- membership --------------------------------------------------------

  addHuman(name, color) {
    const wasEmpty = [...this.players.values()].every((p) => p.bot);
    const p = this.makeOrb({ bot: false, name: (name || 'Player').slice(0, 14) });
    if (color) p.color = color;
    this.players.set(p.id, p);
    this.syncBots();
    // First human to show up gets a clean round seeded around them. Defer the
    // actual start one tick so the caller can register their socket first —
    // otherwise they'd miss the round_start (mutator) event. Reset the round
    // counter so their first round is always the STANDARD ruleset.
    if (wasEmpty) { this.roundNum = 0; this.pendingRestart = true; }
    return p;
  }

  removeHuman(id) {
    this.players.delete(id);
    this.syncBots();
  }

  makeOrb({ bot, name }) {
    const color = COLORS[this.colorCursor % COLORS.length];
    this.colorCursor++;
    return {
      id: uid(), name, bot, color,
      x: 0, y: C.ORB_RADIUS, z: 0, vx: 0, vy: 0, vz: 0,
      alive: false, falling: false, scaleMul: 1, lives: 0,
      dashCooldown: 0, dashTime: 0, blastCooldown: 0,
      buffs: { speed: 0, shield: 0, giant: 0, feather: 0, phantom: 0, trident: 0, turbo: 0, magnet: 0 },
      wins: 0, kos: 0, combo: 0, lastKoTick: 0,
      lastHitBy: null, lastHitAt: 0,
      input: { dx: 0, dz: 0, dash: false, blast: false, aimx: 0, aimz: 0 },
      seq: 0,
    };
  }

  // Keep total population at TARGET_PLAYERS by adding/removing bots.
  syncBots() {
    const humans = [...this.players.values()].filter((p) => !p.bot);
    const bots = [...this.players.values()].filter((p) => p.bot);
    if (humans.length === 0) {
      // Idle: clear bots, no one watching.
      for (const b of bots) this.players.delete(b.id);
      return;
    }
    const want = Math.max(0, C.TARGET_PLAYERS - humans.length);
    let have = bots.length;
    while (have < want) {
      const b = this.makeOrb({ bot: true, name: botName() });
      // Mid-round joiners spawn as spectators until next round.
      this.players.set(b.id, b);
      have++;
    }
    while (have > want) {
      const victim = bots[bots.length - (have - want)];
      if (victim) this.players.delete(victim.id);
      have--;
    }
  }

  setInput(id, input) {
    const p = this.players.get(id);
    if (!p || p.bot) return;
    p.input.dx = clampUnit(input.dx);
    p.input.dz = clampUnit(input.dz);
    p.input.aimx = input.aimx || 0;
    p.input.aimz = input.aimz || 0;
    // Edge-trigger dash + blast so a held key doesn't auto-repeat.
    if (input.dash && !p._dashHeld) p.input.dash = true;
    p._dashHeld = !!input.dash;
    if (input.blast && !p._blastHeld) p.input.blast = true;
    p._blastHeld = !!input.blast;
    if (typeof input.seq === 'number') p.seq = input.seq;
  }

  // ---- round flow --------------------------------------------------------

  startRound() {
    this.syncBots();
    this.roundNum = (this.roundNum || 0) + 1;
    // Roll a mutator (round 1 always STANDARD).
    const mut = this.roundNum === 1
      ? MUTATORS[0]
      : MUTATORS[1 + Math.floor(Math.random() * (MUTATORS.length - 1))];
    this.mutator = mut;
    this.gravityMul = mut.gravity || 1;
    this.shrinkMul = mut.shrinkMult || 1;
    this.restMul = mut.rest || 1;
    this.grace = mut.grace != null ? mut.grace : C.SHRINK_GRACE;
    this.friction = mut.friction || C.FRICTION;
    this.bumpers = mut.bumpers ? makeBumpers() : [];
    this.well = !!mut.well;
    this.powerupMax = mut.powerupMult ? C.POWERUP_MAX * 2 : C.POWERUP_MAX;
    this.powerupInterval = C.POWERUP_INTERVAL / (mut.powerupMult || 1);

    const orbs = [...this.players.values()];
    const n = orbs.length;
    orbs.forEach((p, i) => {
      const a = (i / Math.max(1, n)) * Math.PI * 2;
      const r = C.ARENA_RADIUS * 0.6;
      p.x = Math.cos(a) * r;
      p.z = Math.sin(a) * r;
      p.y = C.ORB_RADIUS;
      p.vx = p.vy = p.vz = 0;
      p.alive = true;
      p.falling = false;
      p.dashCooldown = 0;
      p.dashTime = 0;
      p.blastCooldown = 0;
      p.combo = 0;
      p.lastKoTick = 0;
      p.scaleMul = mut.small ? 0.62 : 1;
      p.lives = mut.lives || 0;
      // Mutator-wide buffs persist all round (huge timers, refreshed in step()).
      p.buffs = { speed: mut.speed ? 1e9 : 0, shield: 0, giant: mut.giant ? 1e9 : 0, feather: 0, phantom: 0, trident: 0, turbo: 0, magnet: 0 };
      p.lastHitBy = null;
    });
    this.powerups = [];
    this.deathRadius = C.ARENA_RADIUS * (mut.startFrac || 1);
    this.roundClock = C.ROUND_TIME;
    this.powerupClock = this.powerupInterval;
    this.winnerId = null;
    this.startAlive = orbs.filter((p) => p.alive).length;
    this.phase = PHASE.COUNTDOWN;
    this.phaseTime = C.COUNTDOWN;
    this.emit('event', { kind: 'round_start', mut: { id: mut.id, name: mut.name, color: mut.color, blurb: mut.blurb } });
  }

  spawnPowerup() {
    if (this.powerups.length >= (this.powerupMax || C.POWERUP_MAX)) return;
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * Math.max(2, this.deathRadius - 3);
    this.powerups.push({
      id: uid(),
      type: POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)],
      x: Math.cos(a) * r, z: Math.sin(a) * r,
    });
  }

  collectPowerups() {
    for (const pu of this.powerups) {
      for (const p of this.players.values()) {
        if (!p.alive || p.falling) continue;
        const d = Math.hypot(p.x - pu.x, p.z - pu.z);
        if (d < effectiveRadius(p) + C.POWERUP_RADIUS) {
          const T = C.BUFF_TIME;
          switch (pu.type) {
            case 'bolt': p.buffs.speed = T; p.dashCooldown = 0; break;
            case 'shield': p.buffs.shield = T; break;
            case 'giant': p.buffs.giant = T; break;
            case 'feather': p.buffs.feather = T; break;
            case 'phantom': p.buffs.phantom = T * 0.7; break;
            case 'trident': p.buffs.trident = T; break;
            case 'turbo': p.buffs.turbo = T; break;
            case 'magnet': p.buffs.magnet = T * 0.8; break;
            case 'life': p.lives += 1; break;
          }
          pu.dead = true;
          this.emit('event', { kind: 'pickup', type: pu.type, id: p.id });
          break;
        }
      }
    }
    this.powerups = this.powerups.filter((pu) => !pu.dead);
  }

  // ---- the tick ----------------------------------------------------------

  step(dt) {
    // Deferred first-round start (see addHuman): now that sockets are wired up,
    // the round_start event will actually reach the player.
    if (this.pendingRestart) { this.pendingRestart = false; this.startRound(); }
    this.tick++;
    this.phaseTime -= dt;

    if (this.phase === PHASE.COUNTDOWN) {
      if (this.phaseTime <= 0) {
        this.phase = PHASE.PLAYING;
        this.emit('event', { kind: 'go' });
      }
      return; // frozen during countdown
    }

    if (this.phase === PHASE.ROUND_END) {
      if (this.phaseTime <= 0) this.startRound();
      else this.simulatePassive(dt); // let knocked orbs keep falling for show
      return;
    }

    // ---- PLAYING ----
    this.roundClock -= dt;

    // Drive bots.
    const all = [...this.players.values()];
    for (const p of all) {
      if (p.bot) p.input = botInput(p, all, this.deathRadius);
    }

    // Integrate everyone, then clear one-shot dash request.
    for (const p of all) {
      integrate(p, p.input, dt, this.gravityMul, this.friction);
      if (p.input.dash && p.didDash) this.emit('event', { kind: 'dash', id: p.id });
      p.input.dash = false;
      p.didDash = false;
    }

    // Field forces: magnets, gravity well, bumper pillars.
    applyMagnets(all, dt);
    if (this.well) applyWell(all, dt);
    if (this.bumpers.length) applyBumpers(all, this.bumpers, this.tick);

    // Shockwave ability.
    for (const p of all) {
      if (p.blastCooldown > 0) p.blastCooldown = Math.max(0, p.blastCooldown - dt);
      if (p.input.blast && p.blastCooldown <= 0 && p.alive && !p.falling) {
        applyBlast(p, all, this.tick);
        p.blastCooldown = C.BLAST_COOLDOWN;
        this.emit('event', { kind: 'blast', id: p.id, x: round(p.x), z: round(p.z) });
      }
      p.input.blast = false;
    }

    resolveCollisions(all, this.tick, this.restMul);
    for (const p of all) {
      if (p.didHit) { this.emit('event', { kind: 'hit', id: p.id }); p.didHit = false; }
    }

    // Shrink the void after the grace period (mutator-tuned).
    if (this.roundClock < C.ROUND_TIME - this.grace) {
      this.deathRadius = Math.max(C.ARENA_MIN_RADIUS, this.deathRadius - C.SHRINK_RATE * this.shrinkMul * dt);
    }
    applyVoid(all, this.deathRadius);

    // Power-ups.
    this.powerupClock -= dt;
    if (this.powerupClock <= 0) { this.spawnPowerup(); this.powerupClock = this.powerupInterval || C.POWERUP_INTERVAL; }
    this.collectPowerups();

    // Eliminations.
    for (const p of all) {
      if (p.justFell) { this.emit('event', { kind: 'fall', id: p.id }); p.justFell = false; }
      if (p.alive && p.y < C.FALL_DEATH_Y) {
        // Revive token? Pop back into the center with a brief shield.
        if (p.lives > 0) {
          p.lives -= 1;
          p.x = 0; p.z = 0; p.y = C.ORB_RADIUS;
          p.vx = p.vy = p.vz = 0;
          p.falling = false;
          p.buffs.shield = Math.max(p.buffs.shield, 2.2);
          this.emit('event', { kind: 'revive', id: p.id });
          continue;
        }
        p.alive = false;
        const killer = p.lastHitBy && this.players.get(p.lastHitBy);
        let credited = null;
        if (killer && killer !== p && killer.alive && (this.tick - p.lastHitAt) < C.TICK_RATE * 4) {
          killer.kos++;
          if (this.tick - killer.lastKoTick < C.TICK_RATE * C.COMBO_WINDOW) killer.combo++;
          else killer.combo = 1;
          killer.lastKoTick = this.tick;
          credited = killer;
          if (killer.combo >= 2) this.emit('event', { kind: 'multi', id: killer.id, n: killer.combo });
        }
        this.emit('event', { kind: 'ko', id: p.id, by: credited ? credited.id : null });
      }
    }

    // Win condition. Only meaningful if the round actually had a field.
    const alive = all.filter((p) => p.alive);
    if (this.startAlive >= 2 && alive.length <= 1) {
      const w = alive[0];
      if (w) { w.wins++; this.winnerId = w.id; }
      this.phase = PHASE.ROUND_END;
      this.phaseTime = C.INTERMISSION;
      this.emit('event', { kind: 'round_end', winner: w ? w.id : null });
    } else if (this.roundClock <= 0) {
      // Time up: closest-to-center survivor wins.
      const w = alive.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
      if (w) { w.wins++; this.winnerId = w.id; }
      this.phase = PHASE.ROUND_END;
      this.phaseTime = C.INTERMISSION;
      this.emit('event', { kind: 'round_end', winner: w ? w.id : null });
    }
  }

  // Keep eliminated/falling orbs moving during the win screen.
  simulatePassive(dt) {
    for (const p of this.players.values()) {
      if (p.falling) integrate(p, { dx: 0, dz: 0, dash: false }, dt);
    }
  }

  // ---- snapshot for the wire --------------------------------------------

  snapshot() {
    const players = [];
    for (const p of this.players.values()) {
      players.push({
        id: p.id, n: p.name, c: p.color, b: p.bot ? 1 : 0,
        x: round(p.x), y: round(p.y), z: round(p.z),
        vx: round(p.vx), vz: round(p.vz),
        a: p.alive ? 1 : 0, f: p.falling ? 1 : 0,
        dc: round(p.dashCooldown), dt: round(p.dashTime), bc: round(p.blastCooldown),
        bs: p.buffs.speed > 0 ? 1 : 0,
        bh: p.buffs.shield > 0 ? 1 : 0,
        bg: p.buffs.giant > 0 ? 1 : 0,
        bf: p.buffs.feather > 0 ? 1 : 0,
        bp: p.buffs.phantom > 0 ? 1 : 0,
        bt: p.buffs.trident > 0 ? 1 : 0,
        bu: p.buffs.turbo > 0 ? 1 : 0,
        bm: p.buffs.magnet > 0 ? 1 : 0,
        sc: round(effectiveRadius(p)),
        lv: p.lives,
        w: p.wins, k: p.kos, seq: p.seq,
      });
    }
    return {
      t: 'state',
      tick: this.tick,
      phase: this.phase,
      pt: round(Math.max(0, this.phaseTime)),
      rc: round(Math.max(0, this.roundClock)),
      dr: round(this.deathRadius),
      win: this.winnerId,
      mut: this.mutator ? { id: this.mutator.id, name: this.mutator.name, color: this.mutator.color } : null,
      haz: { bumpers: this.bumpers || [], well: !!this.well },
      players,
      pu: this.powerups.map((p) => ({ id: p.id, t: p.type, x: round(p.x), z: round(p.z) })),
    };
  }
}

function round(n) { return Math.round(n * 100) / 100; }
function clampUnit(v) { v = +v || 0; return v < -1 ? -1 : v > 1 ? 1 : v; }
