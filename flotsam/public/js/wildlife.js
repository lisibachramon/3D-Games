import * as THREE from 'three';

// Ambient, client-only wildlife: seagulls, dolphins, a whale. Pure decoration.
export class Wildlife {
  constructor(scene, counts) {
    this.scene = scene;
    this.gulls = []; this.dolphins = [];
    const gullMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, side: THREE.DoubleSide });
    for (let i = 0; i < (counts.GULLS || 8); i++) {
      const g = new THREE.Group();
      const wing = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.3), gullMat); g.add(wing);
      g.userData = { a: Math.random() * 6.28, r: THREE.MathUtils.randFloat(40, 90), h: THREE.MathUtils.randFloat(28, 45), spd: THREE.MathUtils.randFloat(0.1, 0.25), wing };
      this.scene.add(g); this.gulls.push(g);
    }
    const dMat = new THREE.MeshStandardMaterial({ color: 0x5b7a8c, roughness: 0.6 });
    for (let i = 0; i < (counts.DOLPHINS || 3); i++) {
      const d = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 2, 4, 8), dMat); d.rotation.z = Math.PI / 2;
      d.userData = { a: Math.random() * 6.28, r: THREE.MathUtils.randFloat(30, 70), spd: THREE.MathUtils.randFloat(0.15, 0.3), ph: Math.random() * 6.28 };
      this.scene.add(d); this.dolphins.push(d);
    }
    // whale
    this.whale = new THREE.Mesh(new THREE.CapsuleGeometry(2.2, 9, 6, 10), new THREE.MeshStandardMaterial({ color: 0x37474f, roughness: 0.7 }));
    this.whale.rotation.z = Math.PI / 2; this.whale.userData = { a: Math.random() * 6.28, r: 120, spd: 0.04 };
    this.scene.add(this.whale);
  }
  update(dt, t, center) {
    for (const g of this.gulls) {
      g.userData.a += g.userData.spd * dt;
      g.position.set(center.x + Math.cos(g.userData.a) * g.userData.r, g.userData.h + Math.sin(t + g.userData.a) * 2, center.z + Math.sin(g.userData.a) * g.userData.r);
      g.rotation.y = -g.userData.a; g.userData.wing.rotation.x = Math.sin(t * 8 + g.userData.a) * 0.6;
    }
    for (const d of this.dolphins) {
      d.userData.a += d.userData.spd * dt;
      const arc = Math.sin(t * 2 + d.userData.ph);
      d.position.set(center.x + Math.cos(d.userData.a) * d.userData.r, arc > 0 ? arc * 1.5 - 0.3 : -1.2, center.z + Math.sin(d.userData.a) * d.userData.r);
      d.rotation.y = -d.userData.a + Math.PI / 2; d.rotation.x = Math.cos(t * 2 + d.userData.ph) * 0.6;
    }
    const w = this.whale.userData; w.a += w.spd * dt;
    this.whale.position.set(center.x + Math.cos(w.a) * w.r, -2 + Math.sin(t * 0.3) * 1.2, center.z + Math.sin(w.a) * w.r);
    this.whale.rotation.y = -w.a + Math.PI / 2;
  }
}
