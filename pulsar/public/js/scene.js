// PULSAR — the 3D presentation layer. A floating obsidian coliseum in a nebula:
// glossy reflective floor, hex energy grid, a storm-wall that marks the closing
// void, glassy orbs with hot cores + fresnel rims + ribbon trails, and pooled
// impact FX. Bloom does the neon; everything else is shader/canvas-procedural.

import * as THREE from 'three';
import { EffectComposer } from '/vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '/vendor/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '/vendor/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '/vendor/jsm/postprocessing/OutputPass.js';

const TMP = new THREE.Vector3();
const TMP2 = new THREE.Vector3();
const TRAIL_LEN = 26;          // ribbon segments per orb
const WALL_HEIGHT = 9;         // storm wall height

export class Scene {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setClearColor(0x040110, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x060214, 0.011);

    this.camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 900);
    this.camera.position.set(0, 27, 25);
    this.camera.lookAt(0, 0, 0);
    this.camTarget = new THREE.Vector3();
    this.camPos = new THREE.Vector3(0, 27, 25);
    this.zoom = 0;       // transient camera punch (pulls in on impacts)
    this.shakeAmt = 0;   // transient screen shake magnitude
    this.clock = 0;

    // ---- bloom post-processing pipeline (this is what makes neon glow) ----
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.75, 0.5, 0.62);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.composer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.composer.setSize(innerWidth, innerHeight);

    this._environment();   // IBL so metal/clearcoat materials have something to reflect
    this._lights();
    this._sky();
    this._arena();
    this._ripples();
    this._beams();
    this._ghosts();
    this._aim();

    this.orbs = new Map();    // id -> orb visual bundle
    this.pickups = new Map(); // id -> mesh
    this.particles = [];      // active bursts
    this.selfId = null;       // set by game.js on welcome (self ground-ring)
    this.orbLights = true;    // per-orb point lights (quality-gated)

    addEventListener('resize', () => this.onResize());
  }

  // ---- image-based lighting: a tiny gradient "studio" baked through PMREM ----
  _environment() {
    const env = new THREE.Scene();
    const c = document.createElement('canvas'); c.width = 64; c.height = 256;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0.0, '#3a2a6a');
    g.addColorStop(0.45, '#120a2e');
    g.addColorStop(0.55, '#0a0620');
    g.addColorStop(1.0, '#02010a');
    x.fillStyle = g; x.fillRect(0, 0, 64, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(10, 16, 16),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide })
    );
    env.add(sphere);
    // Two bright cards act as soft "studio lights" for glints.
    const card = (color, x_, y_, z_) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.4),
        new THREE.MeshBasicMaterial({ color }));
      m.position.set(x_, y_, z_); m.lookAt(0, 0, 0); env.add(m);
    };
    card(0x66e0ff, 5, 6, 2);
    card(0xff3bd6, -5, 4, -3);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(env, 0.06).texture;
    pmrem.dispose();
  }

  _lights() {
    this.scene.add(new THREE.AmbientLight(0x1c1c40, 0.9));
    const hemi = new THREE.HemisphereLight(0x7788ff, 0x0a0118, 0.5);
    this.scene.add(hemi);
    const key = new THREE.PointLight(0x55ccff, 1.4, 220, 1.6);
    key.position.set(0, 42, 0);
    this.scene.add(key);
    const fill = new THREE.PointLight(0xff2bd6, 0.7, 160, 1.8);
    fill.position.set(-30, 8, -26);
    this.scene.add(fill);
  }

  // ---- nebula dome + layered stars + a distant glow "planet" ----
  _sky() {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
    const x = c.getContext('2d');
    x.fillStyle = '#050112'; x.fillRect(0, 0, 1024, 512);
    const blob = (cx, cy, r, col, a) => {
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, col.replace('A', String(a)));
      g.addColorStop(1, col.replace('A', '0'));
      x.fillStyle = g; x.fillRect(cx - r, cy - r, r * 2, r * 2);
    };
    // Hand-placed nebula clouds — magenta/indigo/cyan over near-black.
    blob(220, 160, 260, 'rgba(110,40,190,A)', 0.32);
    blob(700, 110, 300, 'rgba(40,60,200,A)', 0.26);
    blob(520, 300, 240, 'rgba(190,30,160,A)', 0.18);
    blob(880, 290, 220, 'rgba(20,160,220,A)', 0.16);
    blob(80, 330, 200, 'rgba(30,180,200,A)', 0.14);
    blob(400, 60, 180, 'rgba(220,60,220,A)', 0.12);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(420, 32, 24),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false })
    );
    this.scene.add(dome);

    // Far stars (tiny, dense) + near stars (bigger, tinted, twinkle).
    const mkStars = (n, rMin, rMax, size, color, opacity) => {
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const r = rMin + Math.random() * (rMax - rMin);
        const th = Math.random() * Math.PI * 2;
        const ph = Math.acos(2 * Math.random() - 1);
        pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
        pos[i * 3 + 1] = Math.abs(r * Math.cos(ph)) * 0.6 - 24;
        pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const m = new THREE.PointsMaterial({ color, size, transparent: true, opacity,
        map: this._haloTexture(), blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      const pts = new THREE.Points(g, m);
      this.scene.add(pts);
      return pts;
    };
    mkStars(1600, 200, 400, 1.6, 0xbBccff, 0.65);
    this.nearStars = mkStars(220, 120, 260, 3.4, 0xffe9ff, 0.5);

    // A soft distant "planet" glow low on the horizon for depth.
    const planet = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this._haloTexture(), color: 0x7a3bff, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55, fog: false }));
    planet.scale.set(170, 170, 1);
    planet.position.set(-180, 6, -260);
    this.scene.add(planet);

    // Slow ambient debris rocks drifting below the arena — parallax + scale cue.
    this.rocks = [];
    const rockGeo = new THREE.IcosahedronGeometry(1, 0);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x14122e, roughness: 0.8, metalness: 0.3,
      emissive: 0x0a0828, emissiveIntensity: 0.6 });
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(rockGeo, rockMat);
      const a = Math.random() * Math.PI * 2, r = 42 + Math.random() * 60;
      m.position.set(Math.cos(a) * r, -8 - Math.random() * 26, Math.sin(a) * r);
      m.scale.setScalar(0.8 + Math.random() * 2.6);
      m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      m.userData = { spin: (Math.random() - 0.5) * 0.3, bob: Math.random() * Math.PI * 2 };
      this.scene.add(m);
      this.rocks.push(m);
    }
  }

  // ---- the coliseum: glossy floor, hex grid, glowing flank, storm wall ----
  _arena() {
    this.arena = new THREE.Group();
    this.scene.add(this.arena);

    // Glossy obsidian floor — IBL reflections make it read as polished stone.
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(1, 128),
      new THREE.MeshStandardMaterial({ color: 0x0b0b22, metalness: 0.85, roughness: 0.32,
        envMapIntensity: 1.2, emissive: 0x07002a, emissiveIntensity: 0.45 })
    );
    disc.rotation.x = -Math.PI / 2;
    this.disc = disc;
    this.arena.add(disc);

    // Hex energy lattice, tinted by the round's mutator color.
    const grid = new THREE.Mesh(
      new THREE.CircleGeometry(1, 128),
      new THREE.MeshBasicMaterial({ map: this._hexTexture(), transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false })
    );
    grid.rotation.x = -Math.PI / 2;
    grid.position.y = 0.02;
    this.grid = grid;
    this.arena.add(grid);

    // Bright edge ring at the live death radius.
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.035, 10, 128),
      new THREE.MeshBasicMaterial({ color: 0x00f0ff })
    );
    rim.rotation.x = -Math.PI / 2;
    this.rim = rim;
    this.arena.add(rim);

    // Side flank: a short cylinder skirt with scrolling circuit lines.
    const skirtTex = this._circuitTexture();
    const skirt = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 0.96, 2.6, 96, 1, true),
      new THREE.MeshBasicMaterial({ map: skirtTex, transparent: true, opacity: 0.85,
        side: THREE.DoubleSide, depthWrite: false })
    );
    skirt.position.y = -1.3;
    this.skirt = skirt;
    this.skirtTex = skirtTex;
    this.arena.add(skirt);

    // Under-cone so the platform reads as a floating monolith from low angles.
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.96, 7, 64, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x070716, metalness: 0.7, roughness: 0.5,
        emissive: 0x05001c, emissiveIntensity: 0.5, side: THREE.DoubleSide })
    );
    cone.rotation.x = Math.PI;
    cone.position.y = -6.1;
    this.arena.add(cone);

    // Under-glow halo beneath the whole structure.
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this._haloTexture(), color: 0x3322aa, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.38 }));
    glow.scale.set(4.2, 4.2, 1);
    glow.position.y = -7;
    this.underGlow = glow;
    this.arena.add(glow);

    // The STORM WALL — a vertical energy curtain at the death radius. This is
    // the single biggest readability cue: inside = safe, through it = void.
    this.wallUniforms = {
      uColor: { value: new THREE.Color(0x00f0ff) },
      uTime: { value: 0 },
      uOpacity: { value: 1 },
    };
    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, WALL_HEIGHT, 128, 1, true),
      new THREE.ShaderMaterial({
        uniforms: this.wallUniforms,
        vertexShader: `
          varying vec2 vUv;
          void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `
          uniform vec3 uColor; uniform float uTime; uniform float uOpacity;
          varying vec2 vUv;
          void main() {
            float vert = pow(1.0 - vUv.y, 2.6);                          // hugs the floor
            float stripes = 0.5 + 0.5 * sin((vUv.x * 22.0 - uTime * 0.18) * 6.2831);
            float rise = 0.5 + 0.5 * sin((vUv.y * 5.0 - uTime * 1.1) * 6.2831);
            float a = vert * (0.10 + 0.10 * stripes + 0.07 * rise) * uOpacity;
            gl_FragColor = vec4(uColor, a);
          }`,
        transparent: true, blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide, depthWrite: false,
      })
    );
    wall.position.y = WALL_HEIGHT / 2;
    wall.renderOrder = 5;
    this.wall = wall;
    this.scene.add(wall);
  }

  _hexTexture() {
    const S = 1024;
    const c = document.createElement('canvas'); c.width = c.height = S;
    const x = c.getContext('2d');
    x.clearRect(0, 0, S, S);
    const hexR = 34;
    x.lineWidth = 1.6;
    for (let row = 0, j = 0; row * hexR * 1.5 < S + hexR * 2; row++, j++) {
      for (let col = 0; col * hexR * Math.sqrt(3) < S + hexR * 2; col++) {
        const cx = col * hexR * Math.sqrt(3) + (row % 2 ? hexR * Math.sqrt(3) / 2 : 0);
        const cy = row * hexR * 1.5;
        // Radial falloff: bright toward center, fading at the edge.
        const d = Math.hypot(cx - S / 2, cy - S / 2) / (S / 2);
        if (d > 1) continue;
        const a = 0.5 * (1 - d * d * 0.85);
        x.strokeStyle = `rgba(160,235,255,${a.toFixed(3)})`;
        x.beginPath();
        for (let k = 0; k <= 6; k++) {
          const an = (k / 6) * Math.PI * 2 + Math.PI / 6;
          const px = cx + Math.cos(an) * hexR, py = cy + Math.sin(an) * hexR;
          k === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
        }
        x.stroke();
      }
    }
    // Center emblem ring.
    x.strokeStyle = 'rgba(220,250,255,0.8)'; x.lineWidth = 3;
    x.beginPath(); x.arc(S / 2, S / 2, 60, 0, Math.PI * 2); x.stroke();
    x.strokeStyle = 'rgba(160,235,255,0.35)'; x.lineWidth = 2;
    x.beginPath(); x.arc(S / 2, S / 2, 80, 0, Math.PI * 2); x.stroke();
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    return t;
  }

  _circuitTexture() {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = 'rgba(6,6,22,0.95)'; x.fillRect(0, 0, 512, 128);
    // Neon traces: horizontal runs with right-angle jogs, like a circuit board.
    for (let i = 0; i < 22; i++) {
      const hue = Math.random() < 0.6 ? '0,220,255' : '255,60,210';
      x.strokeStyle = `rgba(${hue},${0.25 + Math.random() * 0.5})`;
      x.lineWidth = 1 + Math.random() * 1.5;
      let px = 0, py = Math.random() * 128;
      x.beginPath(); x.moveTo(px, py);
      while (px < 512) {
        px += 20 + Math.random() * 60; x.lineTo(px, py);
        if (Math.random() < 0.5) { py = Math.max(4, Math.min(124, py + (Math.random() - 0.5) * 40)); x.lineTo(px, py); }
      }
      x.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping; t.repeat.x = 3;
    return t;
  }

  _aim() {
    this.aimRing = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.62, 32),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.42,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false })
    );
    this.aimRing.rotation.x = -Math.PI / 2;
    this.aimRing.visible = false;
    this.scene.add(this.aimRing);
    const dot = new THREE.Mesh(
      new THREE.CircleGeometry(0.12, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8,
        blending: THREE.AdditiveBlending, depthWrite: false })
    );
    dot.rotation.x = -Math.PI / 2; dot.position.y = 0.01;
    this.aimRing.add(dot);
  }

  // Pool of expanding floor rings used for impact / dash / shockwave fronts.
  _ripples() {
    this.ripplePool = [];
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(
        new THREE.RingGeometry(0.96, 1, 64),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0,
          side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      m.userData = { life: 0, max: 10 };
      this.scene.add(m);
      this.ripplePool.push(m);
    }
  }

  ripple(x, z, color = 0xffffff, max = 10) {
    const m = this.ripplePool.find((r) => !r.visible) || this.ripplePool[0];
    m.visible = true;
    m.position.set(x, 0.07, z);
    m.scale.setScalar(1);
    m.material.color.set(color);
    m.material.opacity = 0.6;
    m.userData.life = 1;
    m.userData.max = max;
  }

  _stepRipples(dt) {
    for (const m of this.ripplePool) {
      if (!m.visible) continue;
      m.userData.life -= dt * 2.8;
      const s = 1 + (1 - m.userData.life) * m.userData.max;
      m.scale.setScalar(s);
      m.material.opacity = Math.max(0, m.userData.life * 0.42);
      if (m.userData.life <= 0) m.visible = false;
    }
  }

  // Pool of vertical light pillars (KO markers, winner spotlight).
  _beams() {
    this.beamPool = [];
    const geo = new THREE.CylinderGeometry(0.5, 1.6, 30, 20, 1, true);
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false;
      m.userData = { life: 0, decay: 1.6 };
      this.scene.add(m);
      this.beamPool.push(m);
    }
  }

  beam(x, z, color = '#ffffff', decay = 1.6) {
    const m = this.beamPool.find((b) => !b.visible) || this.beamPool[0];
    m.visible = true;
    m.position.set(x, 15, z);
    m.material.color.set(color);
    m.userData.life = 1;
    m.userData.decay = decay;
  }

  _stepBeams(dt) {
    for (const m of this.beamPool) {
      if (!m.visible) continue;
      m.userData.life -= dt * m.userData.decay;
      m.material.opacity = Math.max(0, m.userData.life * 0.5);
      m.rotation.y += dt * 1.5;
      m.scale.x = m.scale.z = 0.6 + (1 - m.userData.life) * 0.8;
      if (m.userData.life <= 0) m.visible = false;
    }
  }

  // Pool of dash afterimage "ghosts".
  _ghosts() {
    this.ghostPool = [];
    const geo = new THREE.SphereGeometry(1, 16, 16);
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false;
      m.userData = { life: 0 };
      this.scene.add(m);
      this.ghostPool.push(m);
    }
  }

  // Drop fading clones along an orb's recent path (called on dash).
  dashFx(id) {
    const o = this.orbs.get(id);
    if (!o) return;
    for (let k = 0; k < 3; k++) {
      const pt = o.trailPts[Math.min(k * 2 + 1, o.trailPts.length - 1)];
      if (!pt) break;
      const g = this.ghostPool.find((m) => !m.visible);
      if (!g) break;
      g.visible = true;
      g.position.set(pt.x, pt.y, pt.z);
      g.scale.setScalar(o.group.scale.x * (0.9 - k * 0.15));
      g.material.color.copy(o.color);
      g.userData.life = 0.55 - k * 0.12;
    }
  }

  _stepGhosts(dt) {
    for (const m of this.ghostPool) {
      if (!m.visible) continue;
      m.userData.life -= dt * 2.2;
      m.material.opacity = Math.max(0, m.userData.life * 0.5);
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

  _fresnelMaterial(col) {
    return new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(col) }, uPow: { value: 2.4 }, uBoost: { value: 1 } },
      vertexShader: `
        varying vec3 vN; varying vec3 vV;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vN = normalize(mat3(modelMatrix) * normal);
          vV = normalize(cameraPosition - wp.xyz);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        uniform vec3 uColor; uniform float uPow; uniform float uBoost;
        varying vec3 vN; varying vec3 vV;
        void main() {
          float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), uPow);
          gl_FragColor = vec4(uColor * uBoost, f);
        }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
  }

  // ---- orbs ----
  _makeOrb(p) {
    const col = new THREE.Color(p.c);
    const group = new THREE.Group();

    // `deform` carries squash & stretch so labels/rings stay unscaled.
    const deform = new THREE.Group();
    group.add(deform);

    // Glassy colored shell.
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 32),
      new THREE.MeshPhysicalMaterial({ color: col, emissive: col, emissiveIntensity: 0.55,
        metalness: 0.1, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.15,
        transparent: true, opacity: 0.92, envMapIntensity: 1.1 })
    );
    deform.add(mesh);

    // White-hot core.
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.48, 20, 20),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    deform.add(core);

    // Fresnel rim glow.
    const rim = new THREE.Mesh(new THREE.SphereGeometry(1.07, 24, 24), this._fresnelMaterial(p.c));
    deform.add(rim);

    // Soft halo sprite (subtle now; bloom carries the glow).
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this._haloTexture(), color: col, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.35,
    }));
    halo.scale.set(3.0, 3.0, 1);
    group.add(halo);

    // Per-orb light so each fighter throws color onto the glossy floor.
    let light = null;
    if (this.orbLights) {
      light = new THREE.PointLight(col, 5, 11, 2);
      light.position.y = 0.4;
      group.add(light);
    }

    // Ground ring: anchors the orb to the floor (crucial depth cue).
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.95, 1.18, 40),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.4,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    this.scene.add(ring); // world-space: stays on the floor even when orb is airborne

    // Shield bubble (toggled by buff).
    const shield = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.16,
        blending: THREE.AdditiveBlending, depthWrite: false })
    );
    shield.visible = false;
    group.add(shield);
    const shieldRim = new THREE.Mesh(new THREE.SphereGeometry(1.52, 24, 24), this._fresnelMaterial(0x66f6ff));
    shieldRim.visible = false;
    group.add(shieldRim);

    this.scene.add(group);

    // Ribbon trail: a tapering strip laid along the recent path.
    const trail = this._makeTrail(col);
    this.scene.add(trail.mesh);

    const label = this._label(p.n, p.b);
    label.scale.set(6, 1.5, 1);
    group.add(label);

    const o = { group, deform, mesh, core, rim, halo, light, ring, shield, shieldRim,
      trail: trail.mesh, trailGeo: trail.geo, trailPts: [], label, color: col, popT: 0 };
    this.orbs.set(p.id, o);
    return o;
  }

  _makeTrail(col) {
    const geo = new THREE.BufferGeometry();
    const verts = new Float32Array(TRAIL_LEN * 2 * 3);
    const colors = new Float32Array(TRAIL_LEN * 2 * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const idx = [];
    for (let i = 0; i < TRAIL_LEN - 1; i++) {
      const a = i * 2, b = i * 2 + 1, c2 = i * 2 + 2, d = i * 2 + 3;
      idx.push(a, b, c2, b, d, c2);
    }
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    mesh.frustumCulled = false;
    return { mesh, geo };
  }

  // Rebuild an orb's ribbon from its recent points; width follows speed.
  _updateTrail(o, alive) {
    const pts = o.trailPts;
    const pos = o.trailGeo.attributes.position.array;
    const col = o.trailGeo.attributes.color.array;
    const base = o.color;
    for (let i = 0; i < TRAIL_LEN; i++) {
      const p = pts[Math.min(i, pts.length - 1)] || { x: 0, y: -100, z: 0, w: 0 };
      const q = pts[Math.min(i + 1, pts.length - 1)] || p;
      let dx = q.x - p.x, dz = q.z - p.z;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l; dz /= l;
      // Perpendicular on the floor plane; width tapers down the tail.
      const w = (p.w || 0.2) * (1 - i / TRAIL_LEN);
      const px = -dz * w, pz = dx * w;
      pos[i * 6] = p.x + px; pos[i * 6 + 1] = p.y; pos[i * 6 + 2] = p.z + pz;
      pos[i * 6 + 3] = p.x - px; pos[i * 6 + 4] = p.y; pos[i * 6 + 5] = p.z - pz;
      // Additive: fade by darkening toward the tail.
      const f = Math.pow(1 - i / TRAIL_LEN, 1.6) * (alive ? 0.55 : 0.1);
      col[i * 6] = base.r * f; col[i * 6 + 1] = base.g * f; col[i * 6 + 2] = base.b * f;
      col[i * 6 + 3] = base.r * f; col[i * 6 + 4] = base.g * f; col[i * 6 + 5] = base.b * f;
    }
    o.trailGeo.attributes.position.needsUpdate = true;
    o.trailGeo.attributes.color.needsUpdate = true;
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
            new THREE.CylinderGeometry(bm.r, bm.r * 1.08, 2.6, 28),
            new THREE.MeshPhysicalMaterial({ color: 0x21214a, emissive: 0x2244ff,
              emissiveIntensity: 0.9, metalness: 0.6, roughness: 0.3, clearcoat: 0.8 })
          );
          mesh.position.set(bm.x, 1.3, bm.z);
          this.hazardGroup.add(mesh);
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(bm.r + 0.12, 0.06, 8, 40),
            new THREE.MeshBasicMaterial({ color: 0x77bbff })
          );
          ring.rotation.x = -Math.PI / 2; ring.position.set(bm.x, 0.12, bm.z);
          this.hazardGroup.add(ring);
          const band = new THREE.Mesh(
            new THREE.TorusGeometry(bm.r + 0.04, 0.05, 8, 40),
            new THREE.MeshBasicMaterial({ color: 0xaaddff, transparent: true, opacity: 0.9,
              blending: THREE.AdditiveBlending, depthWrite: false })
          );
          band.rotation.x = -Math.PI / 2; band.position.set(bm.x, 2.0, bm.z);
          this.hazardGroup.add(band);
        }
        if (haz.well) {
          const w = new THREE.Mesh(
            new THREE.TorusGeometry(2.2, 0.5, 16, 48),
            new THREE.MeshBasicMaterial({ color: 0x9b5cff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })
          );
          w.rotation.x = -Math.PI / 2; w.position.y = 0.2;
          this.hazardGroup.add(w); this.well = w;
          const w2 = new THREE.Mesh(
            new THREE.TorusGeometry(3.4, 0.18, 12, 48),
            new THREE.MeshBasicMaterial({ color: 0xc09bff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false })
          );
          w2.rotation.x = -Math.PI / 2; w2.position.y = 0.32;
          this.hazardGroup.add(w2); this.well2 = w2;
        }
      }
    }
    if (this.well) {
      this.well.rotation.z = t * 1.5; this.well.scale.setScalar(1 + Math.sin(t * 4) * 0.08);
      if (this.well2) this.well2.rotation.z = -t * 0.9;
    }
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
    const r = deathRadius;
    this.disc.scale.set(r, r, 1);
    this.grid.scale.set(r, r, 1);
    this.rim.scale.set(r, r, 1);
    this.skirt.scale.set(r, 1, r);
    this.wall.scale.set(r, 1, r);
    this.skirtTex.offset.x = t * 0.015;
    this.underGlow.scale.set(r * 2.2, r * 2.2, 1);

    // Rim/grid/wall take on the mutator's color for instant readability.
    const tint = new THREE.Color(mutColor || '#00f0ff');
    this.rim.material.color.copy(tint).offsetHSL(0, 0, Math.sin(t * 2) * 0.06);
    this.grid.material.color.copy(tint).lerp(new THREE.Color(0xffffff), 0.35);
    this.wallUniforms.uColor.value.copy(tint);
    this.wallUniforms.uTime.value = t;
    this.underGlow.material.color.copy(tint).multiplyScalar(0.5);
    this._syncHazards(haz, t);

    // Subtle star twinkle.
    if (this.nearStars) this.nearStars.material.opacity = 0.4 + 0.15 * Math.sin(t * 1.7);
    for (const m of this.rocks) {
      m.rotation.y += m.userData.spin * 0.016;
      m.position.y += Math.sin(t * 0.6 + m.userData.bob) * 0.004;
    }

    const cb = this._colorblind;
    const seen = new Set();
    for (const p of players) {
      seen.add(p.id);
      let o = this.orbs.get(p.id);
      if (!o) o = this._makeOrb(p);

      o.group.position.set(p.x, p.y, p.z);
      let s = (p.sc || 1.05);
      if (o.popT > 0) { o.popT = Math.max(0, o.popT - 0.06); }
      o.group.scale.setScalar(s);
      o.group.visible = true;

      // Squash & stretch: stretch along velocity when moving fast, squash on hit.
      const spd = Math.hypot(p.vx || 0, p.vz || 0);
      const stretch = Math.min(0.32, spd * 0.011) - o.popT * 0.3;
      o.deform.scale.set(1 + stretch, 1 - stretch * 0.5 + o.popT * 0.18, 1 - stretch * 0.35);
      if (spd > 0.5) o.deform.rotation.y = Math.atan2(-(p.vz || 0), p.vx || 1);

      // Phantom = translucent; dead = dim.
      o.mesh.material.opacity = !p.a ? 0.4 : (p.bp ? 0.3 : 0.92);
      o.core.material.color.setScalar(p.a ? 1 : 0.25);

      // Dash flare / alive dimming.
      const dashing = p.dt > 0;
      o.mesh.material.emissiveIntensity = dashing ? 1.8 : (cb ? 1.0 : 0.55);
      o.rim.material.uniforms.uBoost.value = dashing ? 2.2 : 1;
      o.halo.scale.setScalar(dashing ? 4.4 : 3.0);
      o.halo.material.opacity = p.a ? (dashing ? 0.7 : (cb ? 0.5 : 0.32)) : 0.12;
      if (o.light) o.light.intensity = p.a ? (dashing ? 9 : 5) : 0.5;
      o.shield.visible = !!p.bh;
      o.shieldRim.visible = !!p.bh;
      if (p.bh) o.shield.rotation.y = t * 2;
      o.label.visible = this.showNames !== false;

      // Ground ring pinned to the floor under the orb.
      o.ring.position.set(p.x, 0.06, p.z);
      const isSelf = p.id === this.selfId;
      o.ring.scale.setScalar(s * (isSelf ? 1.25 : 1));
      o.ring.material.opacity = p.a ? (isSelf ? 0.6 + 0.2 * Math.sin(t * 5) : 0.3) : 0.05;
      if (isSelf) o.ring.rotation.z = t * 1.2;

      // Tint halo + rim toward whichever standout buff is active.
      o.halo.material.color.copy(o.color);
      o.rim.material.uniforms.uColor.value.copy(o.color);
      const tintBuff = (hex) => {
        o.halo.material.color.lerp(new THREE.Color(hex), 0.5);
        o.rim.material.uniforms.uColor.value.lerp(new THREE.Color(hex), 0.45);
      };
      if (p.bs) tintBuff(0xffd000);
      if (p.bt) tintBuff(0x22ff9b);
      if (p.bu) tintBuff(0xff8a00);
      if (p.bm) tintBuff(0xff4d7d);

      // Trail points (width follows speed; remembered per point). Falling or
      // dead orbs get a thin faint thread instead of a wide ribbon.
      const grounded = p.a && !p.f;
      o.trailPts.unshift({ x: p.x, y: Math.max(0.25, p.y), z: p.z,
        w: (grounded ? Math.min(0.5, 0.14 + spd * 0.016) : 0.08) * s });
      if (o.trailPts.length > TRAIL_LEN + 1) o.trailPts.pop();
      this._updateTrail(o, grounded);
    }

    // Remove orbs that left.
    for (const [id, o] of this.orbs) {
      if (!seen.has(id)) {
        this.scene.remove(o.group); this.scene.remove(o.trail); this.scene.remove(o.ring);
        this.orbs.delete(id);
      }
    }

    // Power-ups.
    const seenPU = new Set();
    for (const pu of pickups) {
      seenPU.add(pu.id);
      let m = this.pickups.get(pu.id);
      if (!m) { m = this._makePickup(pu.t); this.pickups.set(pu.id, m); this.scene.add(m); }
      m.position.set(pu.x, 1.25 + Math.sin(t * 3 + pu.x) * 0.3, pu.z);
      m.rotation.y = t * 2; m.rotation.x = t * 1.3;
      const pulse = 1 + Math.sin(t * 5 + pu.x * 2) * 0.08;
      m.scale.setScalar(pulse);
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
    let geo;
    if (type === 'life') geo = new THREE.IcosahedronGeometry(0.72);
    else if (type === 'giant') geo = new THREE.BoxGeometry(1, 1, 1);
    else if (type === 'trident') geo = new THREE.TetrahedronGeometry(0.85);
    else if (type === 'turbo' || type === 'bolt') geo = new THREE.ConeGeometry(0.6, 1.2, 6);
    else geo = new THREE.OctahedronGeometry(0.7);
    const core = new THREE.Mesh(
      geo,
      new THREE.MeshPhysicalMaterial({ color: col, emissive: col, emissiveIntensity: 1.2,
        metalness: 0.4, roughness: 0.2, clearcoat: 1 })
    );
    g.add(core);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._haloTexture(), color: col,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55 }));
    halo.scale.set(3.2, 3.2, 1);
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
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: col, size: 0.65,
      map: this._haloTexture(), transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, sizeAttenuation: true }));
    this.scene.add(pts);
    this.particles.push({ pts, vel, life: 1 });
  }

  _stepParticles(dt) {
    for (const pr of this.particles) {
      pr.life -= dt * 1.8;
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
      if (pr.life <= 0) { this.scene.remove(pr.pts); pr.pts.geometry.dispose(); return false; }
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
    this.beam(x, z, color, 0.5);
  }

  // Apply user settings (called on change).
  applySettings(s) {
    this.bloom.enabled = !!s.bloom;
    this.bloom.strength = s.bloomStrength != null ? s.bloomStrength : 0.75;
    this.motionScale = s.reduceMotion ? 0.25 : (s.screenShake != null ? s.screenShake : 1);
    this._colorblind = !!s.colorblind;
    if (s.fov) { this.camera.fov = s.fov; this.camera.updateProjectionMatrix(); }
    const pr = s.quality === 'low' ? 1 : s.quality === 'medium' ? 1.5 : Math.min(devicePixelRatio, 2);
    this.renderer.setPixelRatio(pr); this.composer.setPixelRatio(pr);
    // Per-orb lights are the priciest extra — drop them below high quality.
    const wantLights = s.quality !== 'low' && s.quality !== 'medium';
    if (wantLights !== this.orbLights) {
      this.orbLights = wantLights;
      for (const [, o] of this.orbs) {
        if (!wantLights && o.light) { o.group.remove(o.light); o.light = null; }
        else if (wantLights && !o.light) {
          o.light = new THREE.PointLight(o.color, 5, 11, 2);
          o.light.position.y = 0.4;
          o.group.add(o.light);
        }
      }
    }
    this.onResize();
  }

  // Follow the self orb (or whatever we hand it), with punch-zoom + shake.
  follow(pos, dt) {
    if (pos) this.camTarget.lerp(pos, Math.min(1, dt * 6));
    const dist = 23 - this.zoom;
    const height = 26.5 - this.zoom * 0.6;
    const desired = TMP.set(this.camTarget.x * 0.92, height, this.camTarget.z * 0.92 + dist);
    this.camPos.lerp(desired, Math.min(1, dt * 4));
    const s = this.shakeAmt;
    this.camera.position.set(
      this.camPos.x + (Math.random() * 2 - 1) * s,
      this.camPos.y + (Math.random() * 2 - 1) * s,
      this.camPos.z + (Math.random() * 2 - 1) * s,
    );
    this.camera.lookAt(this.camTarget.x, 0.8, this.camTarget.z);
  }

  render(dt) {
    this.clock += dt;
    this._stepParticles(dt);
    this._stepRipples(dt);
    this._stepBeams(dt);
    this._stepGhosts(dt);
    this._stepPopups(dt);
    // Decay the transient camera effects (frame-rate independent).
    this.shakeAmt *= Math.pow(0.0025, dt);
    this.zoom *= Math.pow(0.05, dt);
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
