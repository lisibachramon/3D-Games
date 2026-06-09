// PULSAR — keyboard + mouse input. Produces a world-space move vector and a
// dash aim derived from the mouse position projected onto the arena plane.

import * as THREE from 'three';
import { TouchControls } from '/js/touch.js';

export class Input {
  constructor(canvas, camera) {
    this.canvas = canvas;
    this.camera = camera;
    this.keys = {};
    this.dashQueued = false;
    this.blastQueued = false;
    this.touch = new TouchControls();
    this.mouse = new THREE.Vector2();
    this.aimWorld = new THREE.Vector3(); // where on the plane the cursor points
    this._ray = new THREE.Raycaster();
    this._plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._self = null; // {x,z} of our orb, for aim origin

    addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'Space') { this.dashQueued = true; e.preventDefault(); }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyE') { this.blastQueued = true; e.preventDefault(); }
    });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    canvas.addEventListener('mousemove', (e) => {
      this.mouse.x = (e.clientX / innerWidth) * 2 - 1;
      this.mouse.y = -(e.clientY / innerHeight) * 2 + 1;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 2) this.blastQueued = true;   // right-click = shockwave
      else this.dashQueued = true;                    // left-click = dash
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    // Lose focus -> stop moving (prevents stuck keys on tab-out).
    addEventListener('blur', () => { this.keys = {}; });
  }

  setSelf(pos) { this._self = pos; }

  // Returns { dx, dz, dash, aimx, aimz } in world space. The camera is angled,
  // so we map WASD against the camera's forward/right projected onto the ground.
  sample() {
    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    fwd.y = 0; fwd.normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();

    let dx = 0, dz = 0;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) { dx += fwd.x; dz += fwd.z; }
    if (this.keys['KeyS'] || this.keys['ArrowDown']) { dx -= fwd.x; dz -= fwd.z; }
    if (this.keys['KeyD'] || this.keys['ArrowRight']) { dx -= right.x; dz -= right.z; }
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) { dx += right.x; dz += right.z; }

    // Mobile: virtual joystick overrides keyboard when engaged.
    const t = this.touch.sample();
    if (t.active) { dx = fwd.x * t.y - right.x * t.x; dz = fwd.z * t.y - right.z * t.x; }
    if (t.dash) this.dashQueued = true;

    const l = Math.hypot(dx, dz);
    if (l > 0) { dx /= l; dz /= l; }

    // Aim: cursor projected onto the ground, relative to our orb.
    let aimx = dx, aimz = dz;
    this._ray.setFromCamera(this.mouse, this.camera);
    const hit = new THREE.Vector3();
    if (this._ray.ray.intersectPlane(this._plane, hit) && this._self) {
      const ax = hit.x - this._self.x, az = hit.z - this._self.z;
      const al = Math.hypot(ax, az);
      if (al > 0.3) { aimx = ax / al; aimz = az / al; this.aimWorld.copy(hit); }
    }

    const dash = this.dashQueued;
    const blast = this.blastQueued;
    this.dashQueued = false;
    this.blastQueued = false;
    return { dx, dz, dash, blast, aimx, aimz };
  }
}
