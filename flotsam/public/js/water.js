import * as THREE from 'three';

// Three Gerstner waves shared between GPU (visual) and CPU (buoyancy).
const W = [
  { dx: 1.0, dz: 0.0,  len: 18.0, amp: 0.22, spd: 1.0 },
  { dx: 0.6, dz: 0.8,  len: 9.0,  amp: 0.12, spd: 1.3 },
  { dx: -0.8, dz: 0.4, len: 5.0,  amp: 0.06, spd: 1.7 },
];

export function waveHeight(x, z, t) {
  let y = 0;
  for (const w of W) {
    const k = (2 * Math.PI) / w.len;
    const d = (w.dx * x + w.dz * z);
    y += w.amp * Math.sin(d * k - t * w.spd * k * 2.0);
  }
  return y;
}

// GLSL is strict: every float literal needs a decimal point (1 -> 1.0).
const fl = (n) => { const s = String(n); return s.includes('.') || s.includes('e') ? s : s + '.0'; };

export class Ocean {
  constructor(scene) {
    const geo = new THREE.PlaneGeometry(600, 600, 220, 220);
    geo.rotateX(-Math.PI / 2);
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        sunDir: { value: new THREE.Vector3(0, 1, 0) },
        sunCol: { value: new THREE.Color(0xfff2cc) },
        deep: { value: new THREE.Color(0x0a3a5c) },
        shallow: { value: new THREE.Color(0x1b9fc4) },
        camPos: { value: new THREE.Vector3() },
        fogColor: { value: new THREE.Color(0x9fd0e8) },
        fogDensity: { value: 0.0042 },
      },
      vertexShader: `
        uniform float time;
        varying vec3 vWorld; varying vec3 vNormal;
        const int N=3;
        vec2 D[3]; float L[3]; float A[3]; float S[3];
        void setup(){
          D[0]=vec2(${fl(W[0].dx)},${fl(W[0].dz)}); L[0]=${fl(W[0].len)}; A[0]=${fl(W[0].amp)}; S[0]=${fl(W[0].spd)};
          D[1]=vec2(${fl(W[1].dx)},${fl(W[1].dz)}); L[1]=${fl(W[1].len)}; A[1]=${fl(W[1].amp)}; S[1]=${fl(W[1].spd)};
          D[2]=vec2(${fl(W[2].dx)},${fl(W[2].dz)}); L[2]=${fl(W[2].len)}; A[2]=${fl(W[2].amp)}; S[2]=${fl(W[2].spd)};
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
        uniform vec3 sunDir; uniform vec3 sunCol; uniform vec3 deep; uniform vec3 shallow;
        uniform vec3 camPos; uniform vec3 fogColor; uniform float fogDensity;
        varying vec3 vWorld; varying vec3 vNormal;
        void main(){
          vec3 V=normalize(camPos - vWorld);
          vec3 Nn=normalize(vNormal);
          float fres = pow(1.0 - max(dot(V,Nn),0.0), 3.0);
          vec3 base = mix(deep, shallow, clamp(Nn.y*0.5+0.5,0.0,1.0));
          // sun specular
          vec3 H = normalize(sunDir + V);
          float spec = pow(max(dot(Nn,H),0.0), 120.0);
          vec3 col = base + sunCol*spec*1.4 + fres*0.35*vec3(0.7,0.85,1.0);
          // crest foam
          float crest = smoothstep(0.16, 0.24, vWorld.y);
          col = mix(col, vec3(0.9,0.97,1.0), crest*0.5);
          // fog
          float dist = length(camPos - vWorld);
          float f = 1.0 - exp(-fogDensity*fogDensity*dist*dist);
          col = mix(col, fogColor, clamp(f,0.0,1.0));
          gl_FragColor = vec4(col, 0.92);
        }`,
      transparent: true,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
  }
  update(t, camera, stage, day) {
    this.mat.uniforms.time.value = t;
    this.mat.uniforms.camPos.value.copy(camera.position);
    this.mat.uniforms.sunDir.value.copy(stage.sun.position).normalize();
    this.mat.uniforms.sunCol.value.copy(stage.sun.color);
    this.mat.uniforms.fogColor.value.copy(stage.scene.fog.color);
    const d = THREE.MathUtils.clamp(day, 0, 1);
    this.mat.uniforms.deep.value.setHex(0x0a3a5c).multiplyScalar(0.25 + d * 0.85);
    this.mat.uniforms.shallow.value.setHex(0x1b9fc4).multiplyScalar(0.25 + d * 0.85);
    // follow camera so the ocean feels endless
    this.mesh.position.x = camera.position.x;
    this.mesh.position.z = camera.position.z;
  }
}
