import * as THREE from 'three';

// ---------------------------------------------------------------------------
// procedural sprite textures (built once)
// ---------------------------------------------------------------------------
function canvas2d(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }

function glowTexture(size, stops) {
  const [c, x] = canvas2d(size, size);
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) g.addColorStop(o, col);
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function moonTexture(size = 128) {
  const [c, x] = canvas2d(size, size);
  const r = size / 2;
  const g = x.createRadialGradient(r, r, r * 0.2, r, r, r);
  g.addColorStop(0, '#f4f6ff'); g.addColorStop(0.72, '#d8e0f4'); g.addColorStop(0.88, '#aab8d8'); g.addColorStop(1, 'rgba(120,140,180,0)');
  x.fillStyle = g; x.beginPath(); x.arc(r, r, r, 0, 7); x.fill();
  // craters
  x.globalAlpha = 0.16; x.fillStyle = '#7c8cb0';
  const craters = [[0.38, 0.4, 0.13], [0.62, 0.58, 0.09], [0.5, 0.72, 0.07], [0.66, 0.32, 0.06], [0.3, 0.62, 0.05]];
  for (const [cx, cy, cr] of craters) { x.beginPath(); x.arc(cx * size, cy * size, cr * size, 0, 7); x.fill(); }
  x.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// vertical light-shaft + horizontal glint cross (for the sun "god-ray" fake)
function shaftTexture(size = 256) {
  const [c, x] = canvas2d(size, size);
  const v = x.createLinearGradient(0, 0, size, 0);
  v.addColorStop(0, 'rgba(255,240,210,0)'); v.addColorStop(0.5, 'rgba(255,240,210,0.55)'); v.addColorStop(1, 'rgba(255,240,210,0)');
  x.fillStyle = v; x.fillRect(size * 0.42, 0, size * 0.16, size);
  const hgrad = x.createLinearGradient(0, 0, 0, size);
  hgrad.addColorStop(0, 'rgba(255,244,220,0)'); hgrad.addColorStop(0.5, 'rgba(255,244,220,0.5)'); hgrad.addColorStop(1, 'rgba(255,244,220,0)');
  x.fillStyle = hgrad; x.fillRect(0, size * 0.46, size, size * 0.08);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------------------------------------------------------------------------
// palette (day / dusk / night) — everything blends between these
// ---------------------------------------------------------------------------
const PAL = {
  dayTop: 0x23568f, dayHor: 0xb8d4e2,
  duskTop: 0x3b3f6e, duskHor: 0xff8946,
  nightTop: 0x040a16, nightHor: 0x0f2236,
  sunDay: 0xfff2d2, sunDusk: 0xff7a32, moonlight: 0x8fa6cc,
  hemiGroundDay: 0x1d4252, hemiGroundNight: 0x080f18,
};

export class Stage {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('game').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x9fc4d8, 0.0042);

    this.camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 2000);
    this.camera.position.set(0, 3, 8);

    // ---- lights ----
    this.hemi = new THREE.HemisphereLight(0xbfe3ff, PAL.hemiGroundDay, 0.9);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(PAL.sunDay, 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const s = 60; const cam = this.sun.shadow.camera;
    cam.left = -s; cam.right = s; cam.top = s; cam.bottom = -s; cam.near = 1; cam.far = 400;
    this.sun.shadow.bias = -0.0004;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.amb = new THREE.AmbientLight(0x335577, 0.35);
    this.scene.add(this.amb);

    // ---- celestial group: sky dome + stars, follows the camera ----
    this.celestial = new THREE.Group();
    this.scene.add(this.celestial);

    const skyGeo = new THREE.SphereGeometry(1000, 32, 24);
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        cTop: { value: new THREE.Color(PAL.dayTop) },
        cHor: { value: new THREE.Color(PAL.dayHor) },
        sunDir: { value: new THREE.Vector3(0, 1, 0) },
        glowCol: { value: new THREE.Color(0xffd9a0) },
        glowI: { value: 0.8 },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `
        varying vec3 vDir;
        uniform vec3 cTop; uniform vec3 cHor; uniform vec3 sunDir; uniform vec3 glowCol; uniform float glowI;
        void main(){
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = mix(cHor, cTop, pow(clamp(h, 0.0, 1.0), 0.55));
          if (h < 0.0) col = cHor * (1.0 + h * 0.35);           // below horizon: hazy floor
          float hz = pow(1.0 - abs(h), 9.0);                    // bright haze band on the horizon line
          col += cHor * hz * 0.25;
          float sAmt = max(dot(d, sunDir), 0.0);                // analytic sun scatter
          col += glowCol * glowI * (0.16 * pow(sAmt, 5.0) + 0.42 * pow(sAmt, 40.0));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.skyMesh = new THREE.Mesh(skyGeo, this.skyMat);
    this.skyMesh.renderOrder = -10;
    this.celestial.add(this.skyMesh);

    // ---- stars: two layers (dim dust + bright sparkles), slight color variety ----
    const mkStars = (count, rMin, rMax, size) => {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
      const c = new THREE.Color();
      for (let i = 0; i < count; i++) {
        const r = 940, th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 0.98);
        pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
        pos[i * 3 + 1] = r * Math.abs(Math.cos(ph)) + 6;
        pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
        const warm = Math.random();
        c.setHSL(warm < 0.12 ? 0.07 : warm > 0.85 ? 0.6 : 0.58, warm < 0.12 || warm > 0.85 ? 0.5 : 0.12, THREE.MathUtils.randFloat(rMin, rMax));
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const mat = new THREE.PointsMaterial({ size, vertexColors: true, transparent: true, opacity: 0, sizeAttenuation: false, depthWrite: false, fog: false });
      const pts = new THREE.Points(geo, mat);
      this.celestial.add(pts);
      return mat;
    };
    this.starMatDim = mkStars(1700, 0.35, 0.7, 1.5);
    this.starMatBright = mkStars(260, 0.7, 1.0, 2.6);

    // ---- sun: layered glow sprites + god-ray shaft ----
    const sunCoreTex = glowTexture(256, [[0, 'rgba(255,252,240,1)'], [0.18, 'rgba(255,244,214,1)'], [0.32, 'rgba(255,224,170,0.55)'], [0.6, 'rgba(255,190,120,0.16)'], [1, 'rgba(255,170,90,0)']]);
    const sunHaloTex = glowTexture(256, [[0, 'rgba(255,230,180,0.5)'], [0.4, 'rgba(255,200,130,0.18)'], [1, 'rgba(255,170,90,0)']]);
    this.sunCore = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunCoreTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunHaloTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0.85 }));
    this.sunShaft = new THREE.Sprite(new THREE.SpriteMaterial({ map: shaftTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0 }));
    this.sunCore.scale.setScalar(110); this.sunHalo.scale.setScalar(330); this.sunShaft.scale.set(220, 480, 1);
    this.scene.add(this.sunCore, this.sunHalo, this.sunShaft);

    // ---- moon: textured sprite + soft glow ----
    this.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTexture(), transparent: true, depthWrite: false, fog: false }));
    this.moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(128, [[0, 'rgba(190,210,255,0.4)'], [0.5, 'rgba(160,190,240,0.12)'], [1, 'rgba(140,170,230,0)']]), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.moon.scale.setScalar(56); this.moonGlow.scale.setScalar(170);
    this.scene.add(this.moon, this.moonGlow);

    // ---- preallocated scratch (no per-frame allocation) ----
    this._dir = new THREE.Vector3();
    this._lightDir = new THREE.Vector3();
    this._camF = new THREE.Vector3();
    this._toSun = new THREE.Vector3();
    this._ca = new THREE.Color(); this._cb = new THREE.Color();
    this._top = new THREE.Color(); this._hor = new THREE.Color();
    this.horizonColor = new THREE.Color(PAL.dayHor);   // read by water
    this.cloudTint = new THREE.Color(0xffffff);        // read by weather
    this.dayFactor = 1; this.duskFactor = 0;
    this.weatherLight = 1;                             // set by main each frame

    addEventListener('resize', () => this.resize());
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }

  // tf in [0,1) across a full day. 0.25 = sunrise, 0.5 = noon, 0.75 = sunset.
  updateSky(tf) {
    const ang = (tf - 0.25) * Math.PI * 2;
    const sx = Math.cos(ang), sy = Math.sin(ang);
    const dir = this._dir.set(sx, sy, 0.35).normalize();

    // smooth day factor + dusk band peaking when the sun grazes the horizon
    const day = THREE.MathUtils.smoothstep(sy, -0.14, 0.32);
    const dusk = Math.pow(THREE.MathUtils.clamp(1 - Math.abs(sy) * 2.8, 0, 1), 1.2);
    this.dayFactor = day; this.duskFactor = dusk;

    // ---- sky colors ----
    const top = this._top.setHex(PAL.nightTop).lerp(this._ca.setHex(PAL.dayTop), day);
    top.lerp(this._ca.setHex(PAL.duskTop), dusk * 0.45);
    const hor = this._hor.setHex(PAL.nightHor).lerp(this._cb.setHex(PAL.dayHor), day);
    hor.lerp(this._cb.setHex(PAL.duskHor), dusk * 0.78);
    this.skyMat.uniforms.cTop.value.copy(top);
    this.skyMat.uniforms.cHor.value.copy(hor);
    this.skyMat.uniforms.sunDir.value.copy(dir);
    this.skyMat.uniforms.glowCol.value.setHex(0xffd9a0).lerp(this._ca.setHex(0xff6a28), dusk * 0.7);
    this.skyMat.uniforms.glowI.value = (sy > -0.25 ? 1 : THREE.MathUtils.clamp(1 + (sy + 0.25) * 4, 0, 1)) * (0.55 + dusk * 1.2) * (0.45 + day * 0.55);
    this.horizonColor.copy(hor);

    // ---- key light: sun by day, moon by night ----
    const night = sy < -0.06;
    const ld = this._lightDir.copy(dir); if (night) ld.multiplyScalar(-1);
    this.sun.position.copy(ld).multiplyScalar(120);
    this.sun.color.setHex(PAL.sunDay).lerp(this._ca.setHex(PAL.sunDusk), dusk * 0.6);
    if (night) this.sun.color.setHex(PAL.moonlight);
    this.sun.intensity = night ? 0.32 : 0.18 + day * 2.1;

    this.hemi.color.copy(top).lerp(this._ca.setHex(0xffffff), 0.35);
    this.hemi.groundColor.setHex(PAL.hemiGroundNight).lerp(this._ca.setHex(PAL.hemiGroundDay), day);
    this.hemi.intensity = 0.22 + day * 0.62;
    this.amb.intensity = 0.1 + day * 0.22;
    this.renderer.toneMappingExposure = 0.95 + day * 0.25;

    // ---- fog matches horizon so sea fades into sky ----
    this.scene.fog.color.copy(hor);

    // ---- stars ----
    const starAmt = THREE.MathUtils.clamp(1 - day * 1.9, 0, 1);
    this.starMatDim.opacity = starAmt * 0.75;
    this.starMatBright.opacity = starAmt * 0.95;
    this.celestial.position.copy(this.camera.position);

    // ---- sun sprites ----
    const camP = this.camera.position;
    const horizonGrow = 1 + (1 - THREE.MathUtils.clamp(sy, 0, 1)) * 0.6; // bigger near horizon
    this.sunCore.position.copy(camP).addScaledVector(dir, 880);
    this.sunHalo.position.copy(this.sunCore.position);
    this.sunShaft.position.copy(this.sunCore.position);
    this.sunCore.scale.setScalar(95 * horizonGrow);
    this.sunHalo.scale.setScalar(300 * horizonGrow);
    const sunVis = THREE.MathUtils.clamp((sy + 0.09) * 9, 0, 1);
    this.sunCore.material.opacity = sunVis;
    this.sunHalo.material.opacity = sunVis * (0.5 + dusk * 0.5) * 0.85;
    this.sunCore.material.color.setHex(0xffffff).lerp(this._ca.setHex(0xff8a40), dusk * 0.55);
    this.sunHalo.material.color.copy(this.sunCore.material.color);

    // god-ray shaft / lens glint: fades in when you look toward the sun
    this.camera.getWorldDirection(this._camF);
    const toSun = this._toSun.copy(dir);
    const align = Math.max(this._camF.dot(toSun), 0);
    this.sunShaft.material.opacity = Math.pow(align, 5) * sunVis * (0.22 + dusk * 0.22) * this.weatherLight;
    this.sunShaft.material.color.copy(this.sunCore.material.color);
    this.sunShaft.scale.set(200 * horizonGrow, (sy < 0.35 ? 470 : 330) * horizonGrow, 1);

    // ---- moon (opposite the sun) ----
    this.moon.position.copy(camP).addScaledVector(dir, -880);
    this.moonGlow.position.copy(this.moon.position);
    const moonVis = THREE.MathUtils.clamp((-sy + 0.12) * 6, 0, 1);
    this.moon.material.opacity = moonVis;
    this.moonGlow.material.opacity = moonVis * 0.8;

    // tint clouds: bright by day, warm at dusk, near-black at night
    this.cloudTint.setHex(0xf5f9fc).multiplyScalar(0.12 + day * 0.88);
    this.cloudTint.lerp(this._ca.setHex(0xff9a58), dusk * 0.45);

    return day;
  }

  render() { this.renderer.render(this.scene, this.camera); }
}
