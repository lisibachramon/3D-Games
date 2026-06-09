// PULSAR — the 3D presentation layer. Builds the neon arena, manages orb/
// power-up meshes, trails, particles, and the chase camera. Glow is faked with
// emissive materials + additive halos so we ship zero post-processing deps.

import * as THREE from 'three';
import { EffectComposer } from '/vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '/vendor/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '/vendor/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '/vendor/jsm/postprocessing/OutputPass.js';

const TMP = new THREE.Vector3();

export class Scene {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setClearColor(0x05010f, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x05010f, 0.016);

    this.camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 600);
    this.camera.position.set(0, 30, 26);
    this.camera.lookAt(0, 0, 0);
    this.camTarget = new THREE.Vector3();
    this.camPos = new THREE.Vector3(0, 30, 26);
    this.zoom = 0;       // transient camera punch (pulls in on impacts)
    this.shakeAmt = 0;   // transient screen shake magnitude

    // ---- bloom post-processing pipeline (this is what makes neon glow) ----
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.62, 0.45, 0.72);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.composer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.composer.setSize(innerWidth, innerHeight);

    this._lights();
    this._stars();
    this._arena();
    this._ripples();
    this._aim();

    this.orbs = new Map();   // id -> { group, mesh, halo, trail, trailPts, label, shield }
    this.pickups = new Map(); // id -> mesh
    this.particles = [];     // active bursts
    this.selfId = null;

    addEventListener('resize', () => this.onResize());
  }

  // ---- static world ----
  _lights() {
    this.scene.add(new THREE.AmbientLight(0x223355, 1.1));
    const hemi = new THREE.HemisphereLight(0x88aaff, 0x110022, 0.6);
    this.scene.add(hemi);
    const key = new THREE.PointLight(0x66ccff, 1.2, 200);
    key.position.set(0, 40, 0);
    this.scene.add(key);
  }

  _stars() {
    const N = 1400, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r = 120 + Math.random() * 220;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = Math.abs(r * Math.cos(ph)) * 0.5 - 20;
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color: 0x88bbff, size: 1.1, transparent: true, opacity: 0.8 });
    this.scene.add(new THREE.Points(g, m));
  }

  _arena() {
    this.arena = new THREE.Group();
    this.scene.add(this.arena);

    // Solid dark disc (scaled at runtime to the death radius).
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(1, 96),
      new THREE.MeshStandardMaterial({ color: 0x0a0a24, metalness: 0.4, roughness: 0.6,
        emissive: 0x0a0030, emissiveIntensity: 0.5 })
    );
    disc.rotation.x = -Math.PI / 2;
    this.disc = disc;
    this.arena.add(disc);

    // Concentric neon rings drawn on a canvas texture for that grid look.
    const tex = this._gridTexture();
    const grid = new THREE.Mesh(
      new THREE.CircleGeometry(1, 96),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending })
    );
    grid.rotation.x = -Math.PI / 2;
    grid.position.y = 0.02;
    this.grid = grid;
    this.arena.add(grid);

    // Glowing rim that marks the deadly edge.
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.06, 12, 96),
      new THREE.MeshBasicMaterial({ color: 0x00f0ff })
    );
    rim.rotation.x = -Math.PI / 2;
    this.rim = rim;
    this.arena.add(rim);
  }

  _gridTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const x = c.getContext('2d');
    x.clearRect(0, 0, 512, 512);
    x.strokeStyle = 'rgba(0,240,255,0.55)'; x.lineWidth = 2;
    for (let i = 1; i <= 6; i++) { x.beginPath(); x.arc(256, 256, (256 / 6) * i, 0, Math.PI * 2); x.stroke(); }
    x.strokeStyle = 'rgba(255,43,214,0.4)';
    for (let a = 0; a < 12; a++) {
      const an = (a / 12) * Math.PI * 2;
      x.beginPath(); x.moveTo(256, 256);
      x.lineTo(256 + Math.cos(an) * 256, 256 + Math.sin(an) * 256); x.stroke();
    }
    const t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t;
  }

  _aim() {
    this.aimRing = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.8, 24),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
    );
    this.aimRing.rotation.x = -Math.PI / 2;
    this.aimRing.visible = false;
    this.scene.add(this.aimRing);
  }

  // Pool of expanding floor rings used for impact / dash / shockwave shock fronts.
  _ripples() {
    this.ripplePool = [];
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(
        new THREE.RingGeometry(0.86, 1, 48),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0,
          side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      m.userData = { life: 0, max: 14 };
      this.scene.add(m);
      this.ripplePool.push(m);
    }
  }

  // Spawn a shock front at a point. `max` controls how wide it grows.
  ripple(x, z, color = 0xffffff, max = 14) {
    const m = this.ripplePool.find((r) => !r.visible) || this.ripplePool[0];
    m.visible = true;
    m.position.set(x, 0.06, z);
    m.scale.setScalar(1);
    m.material.color.set(color);
    m.material.opacity = 0.95;
    m.userData.life = 1;
    m.userData.max = max;
  }

  _stepRipples(dt) {
    for (const m of this.ripplePool) {
      if (!m.visible) continue;
      m.userData.life -= dt * 1.7;
      const s = 1 + (1 - m.userData.life) * m.userData.max;
      m.scale.setScalar(s);
      m.material.opacity = Math.max(0, m.userData.life * 0.85);
      if (m.userData.life <= 0) m.visible = false;
    }
  }

  // Transient camera juice (scaled by the reduce-motion / shake setting).
  shake(a) { this.shakeAmt = Math.min(2.6, this.shakeAmt + a * (this.motionScale ?? 1)); }
  punch(a) { this.zoom = Math.min(9, this.zoom + a * (this.motionScale ?? 1)); }

  _haloTexture() {
    if (Scene._halo) return Scene._halo;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    Scene._halo = new THREE.CanvasTexture(c);
    return Scene._halo;
  }

  // ---- orbs ----
  _makeOrb(p) {
    const col = new THREE.Color(p.c);
    const group = new THREE.Group();

    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 24),
      new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.3,
        metalness: 0.3, roughness: 0.25, transparent: true })
    );
    group.add(mesh);

    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this._haloTexture(), color: col, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.6,
    }));
    halo.scale.set(3.2, 3.2, 1);
    group.add(halo);

    // Shield bubble (toggled by buff).
    const shield = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 18, 18),
      new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.18,
        blending: THREE.AdditiveBlending })
    );
    shield.visible = false;
    group.add(shield);

    this.scene.add(group);

    // Trail.
    const trailPts = [];
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(20 * 3), 3));
    const trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ color: col,
      transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending }));
    trail.frustumCulled = false;
    this.scene.add(trail);

    const label = this._label(p.n, p.b);
    label.scale.set(6, 1.5, 1);
    group.add(label);

    const o = { group, mesh, halo, shield, trail, trailPts, label, color: col, popT: 0 };
    this.orbs.set(p.id, o);
    return o;
  }

  // A quick squash-pop on an orb when it gets hit.
  hitPop(id) { const o = this.orbs.get(id); if (o) o.popT = 1; }

  // Build/refresh hazard meshes (bumper pillars + gravity-well visual) only
  // when the hazard set changes, then animate them.
  _syncHazards(haz, t) {
    if (!this.hazardGroup) { this.hazardGroup = new THREE.Group(); this.scene.add(this.hazardGroup); }
    const sig = haz ? `${(haz.bumpers || []).length}|${haz.well ? 1 : 0}` : '0|0';
    if (sig !== this._hazSig) {
      this._hazSig = sig;
      while (this.hazardGroup.children.length) {
        const c = this.hazardGroup.children.pop();
        c.geometry?.dispose?.(); this.hazardGroup.remove(c);
      }
      this.well = null;
      if (haz) {
        for (const bm of haz.bumpers || []) {
          const mesh = new THREE.Mesh(
            new THREE.CylinderGeometry(bm.r, bm.r, 2.4, 24),
            new THREE.MeshStandardMaterial({ color: 0x4d7bff, emissive: 0x2244ff, emissiveIntensity: 1.1, metalness: 0.4, roughness: 0.3 })
          );
          mesh.position.set(bm.x, 1.2, bm.z);
          this.hazardGroup.add(mesh);
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(bm.r + 0.1, 0.08, 8, 32),
            new THREE.MeshBasicMaterial({ color: 0x66aaff })
          );
          ring.rotation.x = -Math.PI / 2; ring.position.set(bm.x, 0.1, bm.z);
          this.hazardGroup.add(ring);
        }
        if (haz.well) {
          const w = new THREE.Mesh(
            new THREE.TorusGeometry(2.2, 0.5, 16, 40),
            new THREE.MeshBasicMaterial({ color: 0x9b5cff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending })
          );
          w.rotation.x = -Math.PI / 2; w.position.y = 0.2;
          this.hazardGroup.add(w); this.well = w;
        }
      }
    }
    if (this.well) { this.well.rotation.z = t * 1.5; this.well.scale.setScalar(1 + Math.sin(t * 4) * 0.08); }
  }

  _label(name, bot) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const x = c.getContext('2d');
    x.font = 'bold 30px Segoe UI, sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = bot ? 'rgba(150,170,210,0.9)' : '#ffffff';
    x.shadowColor = '#00f0ff'; x.shadowBlur = 8;
    x.fillText((bot ? '· ' : '') + name, 128, 32);
    const t = new THREE.CanvasTexture(c);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }));
    s.position.y = 2.4;
    return s;
  }

  // ---- per-frame sync from interpolated state ----
  sync(players, pickups, deathRadius, t, haz, mutColor) {
    // Arena scaling to the live death radius.
    const r = deathRadius;
    this.disc.scale.set(r, r, 1);
    this.grid.scale.set(r, r, 1);
    this.rim.scale.set(r, r, 1);
    // Rim/grid take on the mutator's color for instant readability.
    const tint = new THREE.Color(mutColor || '#00f0ff');
    this.rim.material.color.copy(tint).offsetHSL(0, 0, Math.sin(t * 2) * 0.06);
    this.grid.material.color.copy(tint).lerp(new THREE.Color(0xffffff), 0.25);
    this._syncHazards(haz, t);

    const cb = this._colorblind;
    const seen = new Set();
    for (const p of players) {
      seen.add(p.id);
      let o = this.orbs.get(p.id);
      if (!o) o = this._makeOrb(p);

      o.group.position.set(p.x, p.y, p.z);
      // Scale straight from the authoritative effective radius (giant/tiny).
      let s = (p.sc || 1.05);
      if (o.popT > 0) { o.popT = Math.max(0, o.popT - 0.06); s *= 1 + o.popT * 0.35; }
      o.group.scale.setScalar(s);
      o.group.visible = true;

      // Phantom = translucent; dead = dim.
      o.mesh.material.opacity = !p.a ? 0.5 : (p.bp ? 0.32 : 1);

      // Dash flare / alive dimming.
      const dashing = p.dt > 0;
      o.mesh.material.emissiveIntensity = dashing ? 2.4 : (cb ? 1.7 : 1.25);
      o.halo.scale.setScalar(dashing ? 4.6 : 3.2);
      o.halo.material.opacity = p.a ? (dashing ? 0.9 : (cb ? 0.7 : 0.55)) : 0.22;
      o.shield.visible = !!p.bh;
      if (p.bh) o.shield.rotation.y = t * 2;
      o.label.visible = this.showNames !== false;

      // Tint the halo toward whichever standout buff is active.
      o.halo.material.color.copy(o.color);
      if (p.bs) o.halo.material.color.lerp(new THREE.Color(0xffd000), 0.5);
      if (p.bt) o.halo.material.color.lerp(new THREE.Color(0x22ff9b), 0.5);
      if (p.bu) o.halo.material.color.lerp(new THREE.Color(0xff8a00), 0.5);
      if (p.bm) o.halo.material.color.lerp(new THREE.Color(0xff4d7d), 0.5);

      // Trail update.
      o.trailPts.unshift(new THREE.Vector3(p.x, p.y, p.z));
      if (o.trailPts.length > 20) o.trailPts.pop();
      const arr = o.trail.geometry.attributes.position.array;
      for (let i = 0; i < 20; i++) {
        const pt = o.trailPts[Math.min(i, o.trailPts.length - 1)];
        arr[i * 3] = pt.x; arr[i * 3 + 1] = pt.y; arr[i * 3 + 2] = pt.z;
      }
      o.trail.geometry.attributes.position.needsUpdate = true;
      o.trail.material.opacity = p.a ? 0.6 : 0.15;
    }

    // Remove orbs that left.
    for (const [id, o] of this.orbs) {
      if (!seen.has(id)) {
        this.scene.remove(o.group); this.scene.remove(o.trail);
        this.orbs.delete(id);
      }
    }

    // Power-ups.
    const seenPU = new Set();
    for (const pu of pickups) {
      seenPU.add(pu.id);
      let m = this.pickups.get(pu.id);
      if (!m) { m = this._makePickup(pu.t); this.pickups.set(pu.id, m); this.scene.add(m); }
      m.position.set(pu.x, 1.2 + Math.sin(t * 3 + pu.x) * 0.3, pu.z);
      m.rotation.y = t * 2; m.rotation.x = t * 1.3;
    }
    for (const [id, m] of this.pickups) {
      if (!seenPU.has(id)) { this.scene.remove(m); this.pickups.delete(id); }
    }
  }

  _makePickup(type) {
    const colors = {
      bolt: 0xffd000, shield: 0x00f0ff, giant: 0xff2bd6, feather: 0x9b5cff,
      phantom: 0xb6c2ff, trident: 0x22ff9b, turbo: 0xff8a00, magnet: 0xff4d7d, life: 0x7cff00,
    };
    const col = colors[type] || 0xffffff;
    const g = new THREE.Group();
    // A few types get distinct silhouettes so they read at a glance.
    let geo;
    if (type === 'life') geo = new THREE.IcosahedronGeometry(0.72);
    else if (type === 'giant') geo = new THREE.BoxGeometry(1, 1, 1);
    else if (type === 'trident') geo = new THREE.TetrahedronGeometry(0.85);
    else if (type === 'turbo' || type === 'bolt') geo = new THREE.ConeGeometry(0.6, 1.2, 6);
    else geo = new THREE.OctahedronGeometry(0.7);
    const core = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.6 })
    );
    g.add(core);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._haloTexture(), color: col,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.7 }));
    halo.scale.set(3.5, 3.5, 1);
    g.add(halo);
    return g;
  }

  // ---- particle bursts ----
  burst(x, z, color, count = 26) {
    const col = new THREE.Color(color);
    const pos = new Float32Array(count * 3);
    const vel = [];
    for (let i = 0; i < count; i++) {
      pos[i * 3] = x; pos[i * 3 + 1] = 1; pos[i * 3 + 2] = z;
      const a = Math.random() * Math.PI * 2, sp = 6 + Math.random() * 14;
      vel.push(new THREE.Vector3(Math.cos(a) * sp, 4 + Math.random() * 8, Math.sin(a) * sp));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: col, size: 0.9,
      map: this._haloTexture(), transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, sizeAttenuation: true }));
    this.scene.add(pts);
    this.particles.push({ pts, vel, life: 1 });
  }

  _stepParticles(dt) {
    for (const pr of this.particles) {
      pr.life -= dt * 1.4;
      const arr = pr.pts.geometry.attributes.position.array;
      for (let i = 0; i < pr.vel.length; i++) {
        pr.vel[i].y -= 22 * dt;
        arr[i * 3] += pr.vel[i].x * dt;
        arr[i * 3 + 1] += pr.vel[i].y * dt;
        arr[i * 3 + 2] += pr.vel[i].z * dt;
      }
      pr.pts.geometry.attributes.position.needsUpdate = true;
      pr.pts.material.opacity = Math.max(0, pr.life);
    }
    this.particles = this.particles.filter((pr) => {
      if (pr.life <= 0) { this.scene.remove(pr.pts); return false; }
      return true;
    });
  }

  setAim(vec, visible) {
    this.aimRing.visible = visible;
    if (visible && vec) this.aimRing.position.set(vec.x, 0.05, vec.z);
  }

  // Multi-colored celebratory shower (victory).
  confetti(x, z) {
    const palette = [0x00f0ff, 0xff2bd6, 0x7cff00, 0xffd000, 0xff8a00, 0x9b5cff];
    for (let k = 0; k < 5; k++) this.burst(x + (Math.random() * 4 - 2), z + (Math.random() * 4 - 2), palette[k % palette.length], 30);
  }

  // A floating world-space text popup that rises and fades (KO/combo callouts).
  popup(x, z, text, color = '#ffffff') {
    const c = document.createElement('canvas'); c.width = 256; c.height = 80;
    const g = c.getContext('2d');
    g.font = 'bold 44px Segoe UI, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = color; g.shadowColor = color; g.shadowBlur = 14;
    g.fillText(text, 128, 40);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false, blending: THREE.AdditiveBlending }));
    spr.position.set(x, 2.5, z); spr.scale.set(5, 1.6, 1);
    this.scene.add(spr);
    if (!this.popups) this.popups = [];
    this.popups.push({ spr, life: 1 });
  }

  // A vertical light beam over the winner.
  spotlight(x, z, color = '#ffffff') {
    if (!this._spot) {
      this._spot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 3.4, 26, 24, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      this.scene.add(this._spot);
    }
    this._spot.material.color.set(color);
    this._spot.position.set(x, 13, z);
    this._spotT = 1;
  }

  // Apply user settings (called on change).
  applySettings(s) {
    this.bloom.enabled = !!s.bloom;
    this.bloom.strength = s.bloomStrength != null ? s.bloomStrength : 0.62;
    this.motionScale = s.reduceMotion ? 0.25 : (s.screenShake != null ? s.screenShake : 1);
    this._colorblind = !!s.colorblind;
    if (s.fov) { this.camera.fov = s.fov; this.camera.updateProjectionMatrix(); }
    const pr = s.quality === 'low' ? 1 : s.quality === 'medium' ? 1.5 : Math.min(devicePixelRatio, 2);
    this.renderer.setPixelRatio(pr); this.composer.setPixelRatio(pr);
    this.onResize();
  }

  // Follow the self orb (or whatever we hand it), with punch-zoom + shake.
  follow(pos, dt) {
    if (pos) this.camTarget.lerp(pos, Math.min(1, dt * 6));
    const dist = 22 - this.zoom;
    const height = 30 - this.zoom * 0.6;
    const desired = TMP.set(this.camTarget.x, height, this.camTarget.z + dist);
    this.camPos.lerp(desired, Math.min(1, dt * 4));
    const s = this.shakeAmt;
    this.camera.position.set(
      this.camPos.x + (Math.random() * 2 - 1) * s,
      this.camPos.y + (Math.random() * 2 - 1) * s,
      this.camPos.z + (Math.random() * 2 - 1) * s,
    );
    this.camera.lookAt(this.camTarget.x, 1, this.camTarget.z);
  }

  render(dt) {
    this._stepParticles(dt);
    this._stepRipples(dt);
    this._stepPopups(dt);
    // Decay the transient camera effects (frame-rate independent).
    this.shakeAmt *= Math.pow(0.0025, dt);
    this.zoom *= Math.pow(0.05, dt);
    if (this._spotT > 0 && this._spot) {
      this._spotT = Math.max(0, this._spotT - dt * 0.5);
      this._spot.material.opacity = this._spotT * 0.5;
      this._spot.rotation.y += dt;
    }
    this.composer.render();
  }

  _stepPopups(dt) {
    if (!this.popups) return;
    for (const p of this.popups) {
      p.life -= dt * 0.8;
      p.spr.position.y += dt * 2.2;
      p.spr.material.opacity = Math.max(0, p.life);
    }
    this.popups = this.popups.filter((p) => {
      if (p.life <= 0) { this.scene.remove(p.spr); p.spr.material.map.dispose(); return false; }
      return true;
    });
  }

  onResize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.composer.setSize(innerWidth, innerHeight);
    this.bloom.setSize(innerWidth, innerHeight);
  }
}
