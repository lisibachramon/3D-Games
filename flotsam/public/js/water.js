import * as THREE from 'three';

// Gerstner-style sine waves shared between GPU (visual) and CPU (buoyancy).
// IMPORTANT: the GLSL below is GENERATED from this table, so the visual surface
// and the CPU waveHeight() used by controls/entities always stay in exact sync.
// Tuned as open-ocean swell: one long dominant wave + shorter cross-chop.
const W = [
  { dx: 1.0,   dz: 0.18,  len: 34.0, amp: 0.19,  spd: 0.85 },
  { dx: 0.62,  dz: 0.78,  len: 17.0, amp: 0.115, spd: 1.05 },
  { dx: -0.48, dz: 0.88,  len: 8.6,  amp: 0.058, spd: 1.35 },
  { dx: 0.92,  dz: -0.39, len: 4.3,  amp: 0.028, spd: 1.7 },
];
const AMP_SUM = W.reduce((s, w) => s + w.amp, 0);

export function waveHeight(x, z, t) {
  let y = 0;
  for (const w of W) {
    const k = (2 * Math.PI) / w.len;
    const il = 1 / Math.hypot(w.dx, w.dz);
    const d = (w.dx * il * x + w.dz * il * z);
    y += w.amp * Math.sin(d * k - t * w.spd * k * 2.0);
  }
  return y;
}

// GLSL is strict: every float literal needs a decimal point (1 -> 1.0).
const fl = (n) => { const s = String(n); return s.includes('.') || s.includes('e') ? s : s + '.0'; };
const N_WAVES = W.length;
const WAVE_SETUP = W.map((w, i) =>
  `D[${i}]=vec2(${fl(w.dx)},${fl(w.dz)}); L[${i}]=${fl(w.len)}; A[${i}]=${fl(w.amp)}; S[${i}]=${fl(w.spd)};`
).join('\n          ');

export class Ocean {
  constructor(scene) {
    const geo = new THREE.PlaneGeometry(600, 600, 220, 220);
    geo.rotateX(-Math.PI / 2);
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        sunDir: { value: new THREE.Vector3(0, 1, 0) },
        sunCol: { value: new THREE.Color(0xfff2cc) },
        deep: { value: new THREE.Color(0x062a3d) },
        crest: { value: new THREE.Color(0x16707c) },
        sssCol: { value: new THREE.Color(0x35c2a0) },
        foamCol: { value: new THREE.Color(0xe8f4f2) },
        skyCol: { value: new THREE.Color(0xb8d4e2) },
        camPos: { value: new THREE.Vector3() },
        fogColor: { value: new THREE.Color(0x9fc4d8) },
        fogDensity: { value: 0.0042 },
        dayAmt: { value: 1 },
        nightAmt: { value: 0 },
      },
      vertexShader: `
        uniform float time;
        varying vec3 vWorld; varying vec3 vNormal;
        const int N=${N_WAVES};
        vec2 D[${N_WAVES}]; float L[${N_WAVES}]; float A[${N_WAVES}]; float S[${N_WAVES}];
        void setup(){
          ${WAVE_SETUP}
        }
        void main(){
          setup();
          vec3 p = (modelMatrix*vec4(position,1.0)).xyz;
          float h=0.0; vec3 n=vec3(0.0,1.0,0.0);
          for(int i=0;i<N;i++){
            float k=6.2831853/L[i];
            vec2 d=normalize(D[i]);
            float ph=dot(d,p.xz)*k - time*S[i]*k*2.0;
            h += A[i]*sin(ph);
            float c=A[i]*k*cos(ph);
            n.x -= d.x*c; n.z -= d.y*c;
          }
          p.y += h;
          vWorld=p; vNormal=normalize(n);
          gl_Position = projectionMatrix*viewMatrix*vec4(p,1.0);
        }`,
      fragmentShader: `
        precision highp float;
        uniform float time;
        uniform vec3 sunDir; uniform vec3 sunCol;
        uniform vec3 deep; uniform vec3 crest; uniform vec3 sssCol; uniform vec3 foamCol; uniform vec3 skyCol;
        uniform vec3 camPos; uniform vec3 fogColor; uniform float fogDensity;
        uniform float dayAmt; uniform float nightAmt;
        varying vec3 vWorld; varying vec3 vNormal;
        const float AMP = ${fl(Math.round(AMP_SUM * 1000) / 1000)};

        float hash(vec2 q){ return fract(sin(dot(q, vec2(127.1,311.7)))*43758.5453); }
        float vnoise(vec2 q){
          vec2 i=floor(q); vec2 f=fract(q); f=f*f*(3.0-2.0*f);
          float a=hash(i), b=hash(i+vec2(1.0,0.0)), c=hash(i+vec2(0.0,1.0)), d=hash(i+vec2(1.0,1.0));
          return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
        }

        void main(){
          vec3 V = normalize(camPos - vWorld);
          vec3 Nn = normalize(vNormal);
          // fine ripple detail (normal-only -> sparkle, no height change)
          float r1 = sin(vWorld.x*2.3 + time*2.1) * cos(vWorld.z*1.9 + time*1.6);
          float r2 = sin((vWorld.x + vWorld.z)*3.6 - time*2.6);
          float r3 = sin(vWorld.x*5.1 - vWorld.z*4.3 + time*3.2);
          Nn = normalize(Nn + vec3((r1 + r3*0.5)*0.05, 0.0, (r2 - r3*0.4)*0.05));
          if (!gl_FrontFacing) Nn = -Nn;

          // depth gradient: dark troughs, lifted teal crests
          float hN = clamp(vWorld.y/AMP*0.5 + 0.5, 0.0, 1.0);
          vec3 col = mix(deep, crest, pow(hN, 1.6));

          // fresnel: mirror the sky toward grazing angles / horizon
          float ct = max(dot(V, Nn), 0.0);
          float F = 0.024 + 0.976*pow(1.0 - ct, 5.0);
          col = mix(col, skyCol, clamp(F*0.9, 0.0, 1.0));

          // sun specular: tight highlight + broad sheen + sparse glitter cells
          vec3 R = reflect(-V, Nn);
          float rs = max(dot(R, sunDir), 0.0);
          float spec = pow(rs, 240.0)*2.4 + pow(rs, 32.0)*0.30;
          vec2 cell = floor(vWorld.xz*5.0);
          float g = hash(cell);
          spec += step(0.984, fract(g*13.7 + time*(0.35 + g*0.7))) * pow(rs, 12.0) * 1.5;
          col += sunCol * spec;

          // fake subsurface scatter: backlit crests glow teal toward the sun
          float sss = pow(max(dot(V, -sunDir), 0.0), 3.0) * pow(hN, 2.0);
          col += sssCol * sss * (0.25 + 0.75*dayAmt) * 0.85;

          // foam: crests only, broken up by drifting noise
          float crestMask = smoothstep(0.62, 0.95, hN);
          float fn = vnoise(vWorld.xz*0.85 + vec2(time*0.18, -time*0.13))*0.6
                   + vnoise(vWorld.xz*2.6  - vec2(time*0.26,  time*0.20))*0.4;
          float foam = crestMask * smoothstep(0.46, 0.72, fn);
          col = mix(col, foamCol, foam*0.7);

          float dist = length(camPos - vWorld);

          // night: bioluminescent plankton sparks near the player
          vec2 bc = floor(vWorld.xz*7.0 + 13.7);
          float bg = hash(bc);
          float btw = step(0.992, fract(bg*7.31 + time*(0.22 + bg*0.5)));
          col += vec3(0.12, 0.9, 0.74) * btw * exp(-dist*0.06) * nightAmt * 0.85;

          // exponential fog -> melts into the sky at the horizon
          float f = 1.0 - exp(-fogDensity*fogDensity*dist*dist);
          col = mix(col, fogColor, clamp(f, 0.0, 1.0));
          gl_FragColor = vec4(col, 0.94);
        }`,
      transparent: true,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
  }

  update(t, camera, stage, day) {
    const u = this.mat.uniforms;
    u.time.value = t;
    u.camPos.value.copy(camera.position);
    u.sunDir.value.copy(stage.sun.position).normalize();
    u.sunCol.value.copy(stage.sun.color).multiplyScalar(0.55 + stage.sun.intensity * 0.3);
    u.fogColor.value.copy(stage.scene.fog.color);
    u.fogDensity.value = stage.scene.fog.density;
    u.skyCol.value.copy(stage.horizonColor);
    const d = THREE.MathUtils.clamp(day, 0, 1);
    const lum = 0.16 + d * 0.9;
    u.deep.value.setHex(0x062a3d).multiplyScalar(lum);
    u.crest.value.setHex(0x16707c).multiplyScalar(lum);
    u.foamCol.value.setHex(0xe8f4f2).multiplyScalar(0.22 + d * 0.78);
    u.sssCol.value.setHex(0x35c2a0).multiplyScalar(0.3 + d * 0.7);
    u.dayAmt.value = d;
    u.nightAmt.value = THREE.MathUtils.clamp(1 - d * 1.8, 0, 1);
    // follow camera so the ocean feels endless
    this.mesh.position.x = camera.position.x;
    this.mesh.position.z = camera.position.z;
  }
}
