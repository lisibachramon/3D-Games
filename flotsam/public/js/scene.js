import * as THREE from 'three';

export class Stage {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('game').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x9fd0e8, 0.0042);

    this.camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 2000);
    this.camera.position.set(0, 3, 8);

    // lights
    this.hemi = new THREE.HemisphereLight(0xbfe3ff, 0x224455, 0.9);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2cc, 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const s = 60; const cam = this.sun.shadow.camera;
    cam.left = -s; cam.right = s; cam.top = s; cam.bottom = -s; cam.near = 1; cam.far = 400;
    this.sun.shadow.bias = -0.0004;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.amb = new THREE.AmbientLight(0x335577, 0.4);
    this.scene.add(this.amb);

    // sky dome (gradient via shader)
    const skyGeo = new THREE.SphereGeometry(1000, 32, 16);
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { top: { value: new THREE.Color(0x2a6fb0) }, bot: { value: new THREE.Color(0xcfeefe) }, off: { value: 0.0 } },
      vertexShader: `varying vec3 v; void main(){ v=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
      fragmentShader: `varying vec3 v; uniform vec3 top; uniform vec3 bot; uniform float off;
        void main(){ float h=normalize(v).y*0.5+0.5; h=clamp(h+off,0.0,1.0); gl_FragColor=vec4(mix(bot,top,pow(h,0.8)),1.0);} `,
    });
    this.scene.add(new THREE.Mesh(skyGeo, this.skyMat));

    // stars (visible at night)
    const starGeo = new THREE.BufferGeometry();
    const N = 1200, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r = 900, th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random());
      pos[i*3] = r*Math.sin(ph)*Math.cos(th); pos[i*3+1] = r*Math.abs(Math.cos(ph)); pos[i*3+2] = r*Math.sin(ph)*Math.sin(th);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.5, transparent: true, opacity: 0, sizeAttenuation: false });
    this.stars = new THREE.Points(starGeo, this.starMat);
    this.scene.add(this.stars);

    // sun & moon billboards
    this.sunDisc = new THREE.Mesh(new THREE.SphereGeometry(18, 16, 16), new THREE.MeshBasicMaterial({ color: 0xfff4d0, fog: false }));
    this.moonDisc = new THREE.Mesh(new THREE.SphereGeometry(12, 16, 16), new THREE.MeshBasicMaterial({ color: 0xdfe8ff, fog: false }));
    this.scene.add(this.sunDisc, this.moonDisc);

    addEventListener('resize', () => this.resize());
  }
  resize() {
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }
  // tf in [0,1) across a full day. 0.25 = sunrise-ish noon mapping below.
  updateSky(tf) {
    // sun angle: peak at tf=0.5 (noon), below horizon near 0 and 1
    const ang = (tf - 0.25) * Math.PI * 2;          // tf .25 -> 0 (east), .5 -> up
    const sx = Math.cos(ang), sy = Math.sin(ang);
    const dir = new THREE.Vector3(sx, sy, 0.35).normalize();
    this.sun.position.copy(dir).multiplyScalar(120);
    this.sunDisc.position.copy(dir).multiplyScalar(700);
    this.moonDisc.position.copy(dir).multiplyScalar(-700);

    const day = THREE.MathUtils.clamp(sy * 1.4 + 0.2, 0, 1);       // 0 night, 1 day
    const dusk = THREE.MathUtils.clamp(1 - Math.abs(sy) * 3, 0, 1); // peaks near horizon

    // colors
    const dayTop = new THREE.Color(0x2a6fb0), nightTop = new THREE.Color(0x05101f);
    const dayBot = new THREE.Color(0xcfeefe), nightBot = new THREE.Color(0x0a1f33);
    const duskC = new THREE.Color(0xff7a3d);
    const top = nightTop.clone().lerp(dayTop, day);
    const bot = nightBot.clone().lerp(dayBot, day).lerp(duskC, dusk * 0.6);
    this.skyMat.uniforms.top.value.copy(top);
    this.skyMat.uniforms.bot.value.copy(bot);

    this.sun.intensity = 0.15 + day * 2.3;
    this.sun.color.setHex(0xfff2cc).lerp(duskC, dusk * 0.5);
    this.hemi.intensity = 0.25 + day * 0.8;
    this.amb.intensity = 0.18 + day * 0.3;
    this.starMat.opacity = THREE.MathUtils.clamp(1 - day * 2.2, 0, 0.9);
    this.scene.fog.color.copy(bot);
    this.moonDisc.visible = day < 0.5;

    return day;
  }
  render() { this.renderer.render(this.scene, this.camera); }
}
