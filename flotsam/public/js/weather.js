import * as THREE from 'three';

// Weather visuals: rain, clouds, lightning, fog density driven by server.
export class Weather {
  constructor(stage) {
    this.stage = stage; this.scene = stage.scene;
    this.cur = 'clear'; this.rain = 0; this.targetFog = 0.0040; this.light = 1;
    this.flash = 0;

    // rain particle system
    const N = 4000; const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { pos[i*3] = (Math.random()-0.5)*120; pos[i*3+1] = Math.random()*40; pos[i*3+2] = (Math.random()-0.5)*120; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rainMat = new THREE.PointsMaterial({ color: 0xaaccee, size: 0.16, transparent: true, opacity: 0, depthWrite: false });
    this.rainPts = new THREE.Points(geo, this.rainMat); this.rainPts.visible = false; this.scene.add(this.rainPts);
    this.N = N;

    // clouds
    this.clouds = new THREE.Group();
    const cm = new THREE.MeshStandardMaterial({ color: 0xdfe8ef, transparent: true, opacity: 0.0, roughness: 1 });
    this.cloudMat = cm;
    for (let i = 0; i < 14; i++) { const c = new THREE.Mesh(new THREE.SphereGeometry(THREE.MathUtils.randFloat(8, 16), 8, 6), cm); c.position.set((Math.random()-0.5)*300, THREE.MathUtils.randFloat(60, 90), (Math.random()-0.5)*300); c.scale.y = 0.4; this.clouds.add(c); }
    this.scene.add(this.clouds);

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
    this.rainPts.visible = wantRain;
    this.rainMat.opacity += ((wantRain ? 0.55 : 0) - this.rainMat.opacity) * Math.min(1, dt * 2);
    if (wantRain) {
      this.rainPts.position.set(camPos.x, 0, camPos.z);
      const arr = this.rainPts.geometry.attributes.position.array;
      const speed = (40 + this.rain * 30) * dt;
      for (let i = 1; i < arr.length; i += 3) { arr[i] -= speed; if (arr[i] < 0) arr[i] = 40; }
      this.rainPts.geometry.attributes.position.needsUpdate = true;
    }
    // clouds
    this.cloudMat.opacity += (((this.cur === 'clear') ? 0.25 : 0.7) - this.cloudMat.opacity) * Math.min(1, dt);
    this.clouds.position.x = camPos.x; this.clouds.position.z = camPos.z;
    this.clouds.children.forEach((c, i) => { c.position.x += dt * (2 + i % 3); if (c.position.x > 160) c.position.x = -160; });
    // lightning flash
    if (this.flash > 0) { this.flash = Math.max(0, this.flash - dt * 3); this.bolt.intensity = this.flash * 8; this.bolt.position.set(camPos.x + (Math.random()-0.5)*100, 120, camPos.z + (Math.random()-0.5)*100); }
    else this.bolt.intensity = 0;
  }
}
