import * as THREE from 'three';

// ---------------------------------------------------------------------------
// procedural textures (built once)
// ---------------------------------------------------------------------------
function cloudTexture(w = 256, h = 128) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  // a puffy cumulus: many soft overlapping blobs, flatter on the bottom
  const blobs = 16;
  for (let i = 0; i < blobs; i++) {
    const bx = w * (0.18 + Math.random() * 0.64);
    const by = h * (0.38 + Math.random() * 0.26);
    const br = (h * 0.16) + Math.random() * h * 0.22;
    const g = x.createRadialGradient(bx, by, 0, bx, by, br);
    const a = 0.10 + Math.random() * 0.14;
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(0.6, `rgba(255,255,255,${a * 0.55})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.beginPath(); x.arc(bx, by, br, 0, 7); x.fill();
  }
  // soft flat base
  const base = x.createLinearGradient(0, h * 0.55, 0, h);
  base.addColorStop(0, 'rgba(255,255,255,0)');
  base.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = base; x.fillRect(0, 0, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function rainStreakTexture() {
  const c = document.createElement('canvas'); c.width = 16; c.height = 48;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 48);
  g.addColorStop(0, 'rgba(200,225,245,0)');
  g.addColorStop(0.35, 'rgba(200,225,245,0.85)');
  g.addColorStop(1, 'rgba(200,225,245,0)');
  x.fillStyle = g; x.fillRect(6, 0, 4, 48);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Weather visuals: rain, clouds, lightning, fog density driven by server.
export class Weather {
  constructor(stage) {
    this.stage = stage; this.scene = stage.scene;
    this.cur = 'clear'; this.rain = 0; this.targetFog = 0.0040; this.light = 1;
    this.flash = 0;

    // ---- rain: streak particles ----
    const N = 4000; const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { pos[i*3] = (Math.random()-0.5)*120; pos[i*3+1] = Math.random()*40; pos[i*3+2] = (Math.random()-0.5)*120; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rainMat = new THREE.PointsMaterial({
      map: rainStreakTexture(), color: 0xbdd7ea, size: 0.7,
      transparent: true, opacity: 0, depthWrite: false,
    });
    this.rainPts = new THREE.Points(geo, this.rainMat); this.rainPts.visible = false; this.scene.add(this.rainPts);
    this.N = N;

    // ---- clouds: big soft billboard sprites drifting high above ----
    this.clouds = new THREE.Group();
    const ctex = [cloudTexture(), cloudTexture(), cloudTexture()];
    this.cloudSprites = [];
    for (let i = 0; i < 13; i++) {
      const mat = new THREE.SpriteMaterial({
        map: ctex[i % 3], transparent: true, opacity: 0, depthWrite: false, fog: false,
        rotation: (Math.random() - 0.5) * 0.16,
      });
      const sp = new THREE.Sprite(mat);
      const wScale = THREE.MathUtils.randFloat(90, 190);
      sp.scale.set(wScale, wScale * THREE.MathUtils.randFloat(0.28, 0.42), 1);
      sp.position.set((Math.random() - 0.5) * 560, THREE.MathUtils.randFloat(75, 130), (Math.random() - 0.5) * 560);
      sp.userData = { base: THREE.MathUtils.randFloat(0.5, 0.95), drift: THREE.MathUtils.randFloat(1.2, 3.2) };
      this.clouds.add(sp); this.cloudSprites.push(sp);
    }
    this.scene.add(this.clouds);
    this._cloudOp = 0;

    // lightning flash light
    this.bolt = new THREE.PointLight(0xcfe6ff, 0, 600); this.bolt.position.set(0, 120, 0); this.scene.add(this.bolt);
  }
  set(name, rain, fog, light) { this.cur = name; this.rain = rain; this.targetFog = fog; this.light = light; }
  strike() { this.flash = 1; }

  update(dt, camPos) {
    // fog easing
    const f = this.scene.fog; if (f) f.density += (this.targetFog - f.density) * Math.min(1, dt * 1.5);
    // rain
    const wantRain = this.rain > 0;
    this.rainPts.visible = wantRain || this.rainMat.opacity > 0.02;
    this.rainMat.opacity += ((wantRain ? 0.6 : 0) - this.rainMat.opacity) * Math.min(1, dt * 2);
    if (this.rainPts.visible) {
      this.rainPts.position.set(camPos.x, 0, camPos.z);
      const arr = this.rainPts.geometry.attributes.position.array;
      const speed = (40 + this.rain * 30) * dt;
      for (let i = 1; i < arr.length; i += 3) { arr[i] -= speed; if (arr[i] < 0) arr[i] = 40; }
      this.rainPts.geometry.attributes.position.needsUpdate = true;
    }
    // clouds: ease coverage, drift, tint by time-of-day (stage.cloudTint)
    const cover = this.cur === 'clear' ? 0.38 : this.cur === 'cloudy' ? 0.8 : this.cur === 'rain' ? 0.9 : 1.0;
    this._cloudOp += (cover - this._cloudOp) * Math.min(1, dt * 0.8);
    const dark = this.cur === 'storm' ? 0.45 : this.cur === 'rain' ? 0.7 : 1.0;
    this.clouds.position.x = camPos.x; this.clouds.position.z = camPos.z;
    for (let i = 0; i < this.cloudSprites.length; i++) {
      const sp = this.cloudSprites[i];
      sp.material.opacity = this._cloudOp * sp.userData.base;
      sp.material.color.copy(this.stage.cloudTint).multiplyScalar(dark);
      sp.position.x += dt * sp.userData.drift;
      if (sp.position.x > 300) sp.position.x = -300;
    }
    // lightning flash
    if (this.flash > 0) { this.flash = Math.max(0, this.flash - dt * 3); this.bolt.intensity = this.flash * 8; this.bolt.position.set(camPos.x + (Math.random()-0.5)*100, 120, camPos.z + (Math.random()-0.5)*100); }
    else this.bolt.intensity = 0;
  }
}
