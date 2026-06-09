// PULSAR — bot AI. Bots produce the same { dx, dz, dash, aimx, aimz } input
// a human would, so they flow through the exact same physics. Goal: feel alive
// and aggressive without being unfair.

import { C } from '../shared/constants.js';

const BOT_NAMES = [
  'Vex', 'Nova', 'Zap', 'Orbit', 'Glitch', 'Pulse', 'Rico', 'Echo',
  'Bolt', 'Riot', 'Nyx', 'Comet', 'Spark', 'Fizz', 'Halo', 'Dash',
];
let nameCursor = Math.floor(Math.random() * BOT_NAMES.length);

export function botName() {
  const n = BOT_NAMES[nameCursor % BOT_NAMES.length];
  nameCursor++;
  return n;
}

// Decide a bot's input for this tick.
export function botInput(bot, players, deathRadius) {
  const input = { dx: 0, dz: 0, dash: false, blast: false, aimx: 0, aimz: 0 };
  if (!bot.alive || bot.falling) return input;

  // Blast when crowded — clear some space (and maybe launch a few rivals).
  let near = 0;
  for (const o of players) {
    if (o === bot || !o.alive || o.falling) continue;
    if (Math.hypot(o.x - bot.x, o.z - bot.z) < C.BLAST_RADIUS * 0.85) near++;
  }
  if (near >= 2 && (bot.blastCooldown || 0) <= 0) input.blast = true;

  const distCenter = Math.hypot(bot.x, bot.z);
  const edgeDanger = distCenter > deathRadius - 4;

  // Survival first: if near the void, steer back toward center.
  if (edgeDanger) {
    const l = distCenter || 1;
    input.dx = -bot.x / l;
    input.dz = -bot.z / l;
    // Panic dash inward if right on the lip.
    if (distCenter > deathRadius - 1.5 && bot.dashCooldown <= 0) {
      input.dash = true;
      input.aimx = input.dx;
      input.aimz = input.dz;
    }
    return jitter(bot, input);
  }

  // Find nearest living opponent.
  let target = null, best = Infinity;
  for (const p of players) {
    if (p === bot || !p.alive || p.falling) continue;
    const dd = (p.x - bot.x) ** 2 + (p.z - bot.z) ** 2;
    if (dd < best) { best = dd; target = p; }
  }
  if (!target) return jitter(bot, input);

  const dx = target.x - bot.x, dz = target.z - bot.z;
  const dist = Math.hypot(dx, dz) || 1;
  const tx = dx / dist, tz = dz / dist;

  // Aim the shove toward the OUTSIDE so the target gets launched off-platform.
  const outLen = Math.hypot(target.x, target.z) || 1;
  const ox = target.x / outLen, oz = target.z / outLen;
  // Blend "toward target" with "push them outward".
  let ax = tx * 0.45 + ox * 0.55;
  let az = tz * 0.45 + oz * 0.55;
  const al = Math.hypot(ax, az) || 1;
  ax /= al; az /= al;

  input.dx = tx;
  input.dz = tz;

  // Dash when close, lined up, and target isn't dead center (so they fly out).
  const closing = dist < 6.5;
  if (closing && bot.dashCooldown <= 0 && outLen > 3) {
    input.dash = true;
    input.aimx = ax;
    input.aimz = az;
  }
  return jitter(bot, input);
}

// A little randomness so bots don't move in lockstep.
function jitter(bot, input) {
  bot._wob = (bot._wob || Math.random() * 6.28) + 0.15;
  input.dx += Math.cos(bot._wob) * 0.18;
  input.dz += Math.sin(bot._wob) * 0.18;
  return input;
}
