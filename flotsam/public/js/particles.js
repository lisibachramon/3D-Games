import * as THREE from 'three';

// Lightweight pooled particle bursts: splashes, blood, sparkles, build poofs.
export class Particles {
  constructor(scene) {
    this.scene = scene; this.pool = []; this.active = [];
    const geo = new THREE.SphereGeometry(0.12, 6, 5);
    for (let i = 0; i < 240; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
      m.visible = false; scene.add(m); this.pool.push(m);
    }
  }
  burst(x, y, z, color, count = 12, opts = {}) {
    const spread = opts.spread ?? 3, up = opts.up ?? 3, size = opts.size ?? 1, life = opts.life ?? 0.8;
    for (let i = 0; i < count; i++) {
      const m = this.pool.pop(); if (!m) break;
      m.visible = true; m.material.color.setHex(color); m.material.opacity = 1; m.scale.setScalar(size);
      m.position.set(x, y, z);
      m.userData = { vx: (Math.random()-0.5)*spread, vy: Math.random()*up + 1, vz: (Math.random()-0.5)*spread, life, max: life, grav: opts.grav ?? 9 };
      this.active.push(m);
    }
  }
  splash(x, z) { this.burst(x, 0.2, z, 0xbfe6ff, 14, { spread: 3, up: 4 }); }
  blood(x, y, z) { this.burst(x, y, z, 0xb71c1c, 16, { spread: 4, up: 3 }); }
  build(x, z) { this.burst(x, 1, z, 0xd9b382, 14, { spread: 2.5, up: 3 }); }
  sparkle(x, y, z) { this.burst(x, y, z, 0xffd54f, 10, { spread: 2, up: 3, grav: 3, life: 1 }); }
  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const m = this.active[i], u = m.userData;
      u.life -= dt; if (u.life <= 0) { m.visible = false; this.active.splice(i, 1); this.pool.push(m); continue; }
      u.vy -= u.grav * dt;
      m.position.x += u.vx * dt; m.position.y += u.vy * dt; m.position.z += u.vz * dt;
      m.material.opacity = u.life / u.max;
    }
  }
}
