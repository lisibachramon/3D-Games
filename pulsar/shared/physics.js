// PULSAR — pure simulation helpers shared by server (authority) and client
// (prediction). No DOM, no Node APIs: keep it portable.

import { C } from './constants.js';

// Effective radius given active buffs.
export function effectiveRadius(p) {
  return C.ORB_RADIUS * (p.buffs && p.buffs.giant > 0 ? C.BUFF_GIANT_RADIUS : 1);
}

// Effective top speed given active buffs.
function maxSpeed(p) {
  let m = 1;
  if (p.buffs) {
    if (p.buffs.speed > 0) m *= C.BUFF_SPEED_MULT;
    if (p.buffs.phantom > 0) m *= C.BUFF_PHANTOM_MULT;
  }
  return (p.dashTime > 0 ? C.DASH_MAX_SPEED : C.MAX_SPEED) * m;
}

// Integrate a single orb forward by dt seconds from its input. This is the
// movement model both ends run, so the client can predict its own orb.
// `input` = { dx, dz, dash, aimx, aimz } where d* is desired move direction
// and aim* is the dash aim (world space, not required to be normalized).
export function integrate(p, input, dt, gMul = 1, friction = C.FRICTION) {
  if (!p.alive) return;

  // Tick down timers regardless of state.
  if (p.dashCooldown > 0) p.dashCooldown = Math.max(0, p.dashCooldown - dt);
  if (p.dashTime > 0) p.dashTime = Math.max(0, p.dashTime - dt);
  if (p.buffs) {
    for (const k of Object.keys(p.buffs)) {
      if (p.buffs[k] > 0) p.buffs[k] = Math.max(0, p.buffs[k] - dt);
    }
  }

  // Once you're over the edge you can't steer — just plummet. Feather softens
  // the fall so you can sometimes drift back over the floor.
  if (p.falling) {
    const fg = p.buffs && p.buffs.feather > 0 ? C.BUFF_FEATHER_GRAV : 1;
    p.vy -= C.GRAVITY * gMul * fg * dt;
    p.y += p.vy * dt;
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    return;
  }

  // Trigger a dash.
  if (input.dash && p.dashCooldown <= 0) {
    let ax = input.aimx || 0, az = input.aimz || 0;
    if (Math.hypot(ax, az) < 0.01) { ax = input.dx; az = input.dz; }
    if (Math.hypot(ax, az) < 0.01) { ax = p.vx; az = p.vz; }
    const l = Math.hypot(ax, az) || 1;
    p.vx += (ax / l) * C.DASH_IMPULSE;
    p.vz += (az / l) * C.DASH_IMPULSE;
    p.dashCooldown = C.DASH_COOLDOWN * (p.buffs && p.buffs.turbo > 0 ? C.BUFF_TURBO_CD : 1);
    p.dashTime = C.DASH_DURATION;
    p.didDash = true; // consumed by sfx layer, cleared after broadcast
  }

  // Steering acceleration.
  const il = Math.hypot(input.dx, input.dz);
  if (il > 0.01) {
    p.vx += (input.dx / il) * C.ACCEL * dt;
    p.vz += (input.dz / il) * C.ACCEL * dt;
  }

  // Damping (frame-rate independent; mutators can make the floor slippery).
  const damp = Math.pow(friction, dt * 60);
  p.vx *= damp;
  p.vz *= damp;

  // Speed clamp.
  const sp = Math.hypot(p.vx, p.vz);
  const cap = maxSpeed(p);
  if (sp > cap) { p.vx = (p.vx / sp) * cap; p.vz = (p.vz / sp) * cap; }

  // Integrate position.
  p.x += p.vx * dt;
  p.z += p.vz * dt;
}

// SERVER ONLY: resolve orb-vs-orb collisions with momentum transfer plus a
// dash/giant knockback bonus. Records last attacker for kill credit.
export function resolveCollisions(players, now, restMul = 1) {
  const list = players.filter((p) => p.alive && !p.falling);
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      // Phantom orbs phase through everyone.
      if ((a.buffs && a.buffs.phantom > 0) || (b.buffs && b.buffs.phantom > 0)) continue;
      const ra = effectiveRadius(a), rb = effectiveRadius(b);
      const dx = b.x - a.x, dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      const min = ra + rb;
      if (d >= min || d === 0) continue;

      const nx = dx / d, nz = dz / d;
      const pen = min - d;
      // Push apart.
      a.x -= nx * pen * 0.5; a.z -= nz * pen * 0.5;
      b.x += nx * pen * 0.5; b.z += nz * pen * 0.5;

      // Relative velocity along the normal.
      const vn = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
      if (vn < 0) {
        const jImp = (-(1 + C.RESTITUTION * restMul) * vn) / 2;
        a.vx -= jImp * nx; a.vz -= jImp * nz;
        b.vx += jImp * nx; b.vz += jImp * nz;
      }

      // Dash bonus: a charged orb shoves the other hard (giant + trident stack).
      const knockMul = (o) => (o.buffs && o.buffs.giant > 0 ? C.BUFF_GIANT_KNOCK : 1) * (o.buffs && o.buffs.trident > 0 ? C.BUFF_TRIDENT_KNOCK : 1);
      const aKnock = (a.dashTime > 0 ? 1 : 0) * knockMul(a);
      const bKnock = (b.dashTime > 0 ? 1 : 0) * knockMul(b);
      if (aKnock > 0 && !(b.buffs && b.buffs.shield > 0)) {
        b.vx += nx * C.DASH_KNOCKBACK * aKnock; b.vz += nz * C.DASH_KNOCKBACK * aKnock;
        b.lastHitBy = a.id; b.lastHitAt = now; a.didHit = true;
      }
      if (bKnock > 0 && !(a.buffs && a.buffs.shield > 0)) {
        a.vx -= nx * C.DASH_KNOCKBACK * bKnock; a.vz -= nz * C.DASH_KNOCKBACK * bKnock;
        a.lastHitBy = b.id; a.lastHitAt = now; b.didHit = true;
      }
    }
  }
}

// SERVER ONLY: radial shockwave from a blaster — shoves nearby orbs outward
// with distance falloff. Shielded orbs are immune. Credits the blaster.
export function applyBlast(blaster, players, now) {
  for (const t of players) {
    if (t === blaster || !t.alive || t.falling) continue;
    if (t.buffs && (t.buffs.shield > 0 || t.buffs.phantom > 0)) continue;
    const dx = t.x - blaster.x, dz = t.z - blaster.z;
    const d = Math.hypot(dx, dz);
    if (d > C.BLAST_RADIUS || d === 0) continue;
    const nx = dx / d, nz = dz / d;
    const f = C.BLAST_FORCE * (1 - d / C.BLAST_RADIUS);
    t.vx += nx * f; t.vz += nz * f;
    t.lastHitBy = blaster.id; t.lastHitAt = now;
  }
}

// SERVER ONLY: orbs holding MAGNET drag nearby rivals toward them.
export function applyMagnets(players, dt) {
  for (const m of players) {
    if (!m.alive || m.falling || !(m.buffs && m.buffs.magnet > 0)) continue;
    for (const t of players) {
      if (t === m || !t.alive || t.falling) continue;
      if (t.buffs && t.buffs.phantom > 0) continue;
      const dx = m.x - t.x, dz = m.z - t.z;
      const d = Math.hypot(dx, dz);
      if (d > C.MAGNET_RADIUS || d < 0.6) continue;
      const f = C.MAGNET_FORCE * (1 - d / C.MAGNET_RADIUS);
      t.vx += (dx / d) * f * dt; t.vz += (dz / d) * f * dt;
    }
  }
}

// SERVER ONLY: BLACK HOLE mutator — a steady pull toward the arena center.
export function applyWell(players, dt) {
  for (const p of players) {
    if (!p.alive || p.falling) continue;
    const d = Math.hypot(p.x, p.z);
    if (d < 0.6 || d > C.WELL_RADIUS) continue;
    const f = C.WELL_FORCE * (d / C.WELL_RADIUS);
    p.vx -= (p.x / d) * f * dt; p.vz -= (p.z / d) * f * dt;
  }
}

// SERVER ONLY: bounce orbs off static bumper pillars (BUMPER CITY mutator).
export function applyBumpers(players, bumpers, now) {
  for (const p of players) {
    if (!p.alive || p.falling) continue;
    const pr = effectiveRadius(p);
    for (const bm of bumpers) {
      const dx = p.x - bm.x, dz = p.z - bm.z;
      const d = Math.hypot(dx, dz);
      const min = pr + bm.r;
      if (d >= min || d === 0) continue;
      const nx = dx / d, nz = dz / d;
      p.x = bm.x + nx * min; p.z = bm.z + nz * min;
      const vn = p.vx * nx + p.vz * nz;
      if (vn < 0) {
        const j = -(1 + C.BUMPER_RESTITUTION) * vn;
        p.vx += j * nx; p.vz += j * nz;
        p.bumped = now;
      }
    }
  }
}

// SERVER ONLY: anyone outside the shrinking ring starts to fall.
export function applyVoid(players, deathRadius) {
  for (const p of players) {
    if (!p.alive || p.falling) continue;
    if (Math.hypot(p.x, p.z) > deathRadius + effectiveRadius(p) * 0.4) {
      p.falling = true;
      p.vy = 1.5; // tiny pop as the floor vanishes
      p.justFell = true;
    }
  }
}
