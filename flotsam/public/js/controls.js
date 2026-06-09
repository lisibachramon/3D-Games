import * as THREE from 'three';
import { GAME, ITEMS, BUILDABLES, DEBRIS, SURVIVAL } from './config.js';
import { waveHeight } from './water.js';

const STATION_LABEL = {
  storage: 'open Storage', bigstorage: 'open Storage', grill: 'cook', campfire: 'cook / warm up',
  cookpot: 'brew soup/sushi', furnace: 'smelt', anvil: 'forge (use Craft)', workbench: 'craft tier-2 (use Craft)',
  research: 'research (use Craft)', purifier: 'collect Fresh Water', raincatcher: 'collect Rain Water',
  net: 'empty the Net', planter: 'plant / harvest', bed: 'sleep & set spawn', sail: 'raise/lower Sail',
  wheel: 'steer', anchor: 'drop/raise Anchor', chair: 'sit', sign: 'write', beacon: 'ACTIVATE BEACON',
};

export class Controller {
  constructor(stage, net, world, audio, hud) {
    this.stage = stage; this.net = net; this.world = world; this.audio = audio; this.hud = hud;
    this.cam = stage.camera;
    this.pos = new THREE.Vector3(0, GAME.RAFT_Y, 0);
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0; this.sens = 0.0022;
    this.onGround = true; this.inWater = false; this.diving = false;
    this.joined = false; this.enabled = false; this.alive = true;
    this.keys = new Set();
    this.held = 'hook'; this.buildKind = null;
    this.fishCd = 0; this.shootCd = 0; this.sendT = 0; this.bob = 0;
    this.raycaster = new THREE.Raycaster(); this.center = new THREE.Vector2(0, 0);
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -GAME.RAFT_Y);
    this.seaPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.torchLight = new THREE.PointLight(0xffa040, 0, 14); this.stage.scene.add(this.torchLight);
    this._makeGhost(); this._bind();
  }
  spawn(p) { this.pos.set(p.x, p.y, p.z); this.vel.set(0, 0, 0); this.alive = true; }

  _makeGhost() {
    this.ghost = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(GAME.GRID * 0.96, 0.4, GAME.GRID * 0.96), new THREE.MeshBasicMaterial({ color: 0x4cff7a, transparent: true, opacity: 0.4 }));
    box.position.y = GAME.RAFT_Y; this.ghost.add(box); this.ghostBox = box; this.ghost.visible = false;
    this.stage.scene.add(this.ghost);
  }
  _bind() {
    const dom = this.stage.renderer.domElement;
    dom.addEventListener('click', () => { if (this.enabled && !document.pointerLockElement && !this.hud.panelOpen) dom.requestPointerLock(); });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === dom; });
    document.addEventListener('mousemove', (e) => { if (!this.locked) return; this.yaw -= e.movementX * this.sens; this.pitch -= e.movementY * this.sens; this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch)); });
    document.addEventListener('mousedown', (e) => { if (!this.locked || !this.enabled) return; if (e.button === 0) this.primary(); else if (e.button === 1) this.placePing(); else if (e.button === 2) this.secondary(); });
    addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('keydown', (e) => this.onKey(e, true));
    addEventListener('keyup', (e) => this.onKey(e, false));
  }
  onKey(e, down) {
    if (!this.joined || this.hud.typing) return;
    const k = e.code;
    if (down) {
      if (k === 'KeyB') return this.hud.toggleBuild();
      if (k === 'KeyC' || k === 'Tab') { e.preventDefault(); return this.hud.toggleCraft(); }
      if (k === 'KeyT' || k === 'Enter') return this.hud.openChat();
      if (k === 'KeyV') return this.hud.toggleEmote();
      if (k === 'Escape') { this.buildKind = null; this.hud.closeAll(); document.exitPointerLock?.(); return; }
      if (!this.enabled) return;
      if (/^Digit[1-9]$/.test(k)) this.selectTool(+k.slice(5) - 1);
      if (k === 'KeyE') this.interact();
      if (k === 'KeyF') this.hud.quickEat();
      if (k === 'KeyG') this.hud.quickDrink();
      if (k === 'KeyX') this.removeTargeted();
      if (k === 'KeyR') this.repairTargeted();
    }
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ControlLeft'].includes(k)) { if (down) this.keys.add(k); else this.keys.delete(k); }
  }
  selectTool(i) {
    if (this.hud.buildOpen) return this.hud.selectBuild(i);
    const tool = (this.hud.hotbar || [])[i]; if (!tool) return;
    if (!this.hud.has(tool)) { this.hud.toast(`No ${ITEMS[tool].name} yet.`); return; }
    this.held = tool; this.buildKind = null; this.hud.setActiveSlot(i);
  }
  setBuildKind(kind) { this.buildKind = kind; this.held = 'hammer'; }

  // ---- picking ----
  rayList(groups) { this.raycaster.setFromCamera(this.center, this.cam); return this.raycaster.intersectObjects(groups, true); }
  rootIn(obj, set) { let o = obj; while (o) { if (set.has(o)) return o; o = o.parent; } return null; }
  pick(arr, extra = 1.5) { const set = new Set(arr); for (const h of this.rayList(arr)) { const r = this.rootIn(h.object, set); if (r && h.distance <= GAME.REACH + extra) return r; } return null; }
  targetedDebris() { return this.pick([...this.world.debris.values()]); }
  targetedProp() { return this.pick([...this.world.props.values()]); }
  targetedStructure() { return this.pick([...this.world.props.values(), ...this.world.tiles.values()]); }
  targetedShark() { return this.pick(this.world.sharks.filter(s => s.visible), 2); }
  targetedSeabed() { return this.pick([...this.world.seabed.values()], 3); }
  targetedDownedPlayer() {
    const arr = [...this.world.players.values()].filter(e => e.userData.downed);
    const r = this.pick(arr, 1); return r ? r.userData.pid : null;
  }
  targetedIslandNode() {
    for (const isl of this.world.islands.values()) {
      const subs = []; isl.traverse(o => { if (o.userData?.islandNode && o.visible) subs.push(o); });
      const hit = this.pick(subs, 4); if (hit) return { island: isl.userData.id, node: hit.userData.node };
    }
    return null;
  }
  targetCell() {
    this.raycaster.setFromCamera(this.center, this.cam); const pt = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, pt)) return null;
    if (pt.distanceTo(this.pos) > GAME.REACH + GAME.GRID) return null;
    return { gx: Math.round(pt.x / GAME.GRID), gz: Math.round(pt.z / GAME.GRID), pt };
  }

  // ---- actions ----
  primary() {
    if (!this.alive) return;
    if (this.buildKind) { const c = this.targetCell(); if (c) this.net.send({ t: 'build', kind: this.buildKind, gx: c.gx, gz: c.gz }); return; }
    const slot = ITEMS[this.held]?.slot;
    if (this.held === 'hook') { const d = this.targetedDebris(); if (d) this.net.send({ t: 'collect', id: d.userData.id }); else this.hud.toast('Aim your hook at floating debris.'); }
    else if (slot === 'spear') { this.audio.hit(); this.net.send({ t: 'hitshark' }); }
    else if (this.held === 'bow') { if (this.shootCd > 0) return; this.shootCd = 0.6; this.audio.hit(); this.net.send({ t: 'shoot' }); }
    else if (slot === 'axe') { const isl = this.targetedIslandNode(); if (isl) return this.net.send({ t: 'mine', kind: 'island', island: isl.island, node: isl.node }); const sb = this.targetedSeabed(); if (sb) return this.net.send({ t: 'mine', kind: 'seabed', id: sb.userData.id }); this.hud.toast('Aim at an island feature or dive to a seabed node.'); }
    else if (slot === 'rod') { if (this.fishCd > 0) return; const c = this.targetCell(); const overWater = !c || !this.world.tiles.has(`${c.gx},${c.gz}`); if (overWater) { this.fishCd = this.held === 'fishnet' ? 2.4 : 3.4; this.hud.toast('Casting…'); this.net.send({ t: 'fish' }); this.audio.splash(); } else this.hud.toast('Cast toward open water.'); }
    else if (this.held === 'bucket') { this.net.send({ t: 'drinksea' }); }
    else if (this.held === 'hammer') { this.repairTargeted(); }
  }
  secondary() { if (this.buildKind) { const c = this.targetCell(); if (c) this.net.send({ t: 'remove', gx: c.gx, gz: c.gz }); } }
  interact() {
    const downed = this.targetedDownedPlayer();
    if (downed) { this.net.send({ t: 'revive', id: downed }); this.hud.toast('Reviving…'); return; }
    const p = this.targetedProp(); if (!p) { this.hud.toast('Nothing to use here.'); return; }
    const { type, gx, gz } = p.userData;
    if (type === 'storage' || type === 'bigstorage') this.hud.openStorage(gx, gz);
    else if (type === 'sign') { const text = prompt('Sign text:', p.userData.text || ''); if (text != null) this.net.send({ t: 'station', gx, gz, action: 'sign', text }); }
    else if (type === 'wheel') this.net.send({ t: 'station', gx, gz, action: 'steer', dir: 0.5 });
    else this.net.send({ t: 'station', gx, gz, action: 'use' });
  }
  placePing() {
    this.raycaster.setFromCamera(this.center, this.cam); const pt = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.seaPlane, pt) || this.raycaster.ray.intersectPlane(this.groundPlane, pt)) this.net.send({ t: 'ping', x: pt.x, z: pt.z });
  }
  removeTargeted() { const s = this.targetedStructure(); if (!s) return; this.net.send({ t: 'remove', gx: s.userData.gx ?? Math.round(s.position.x / GAME.GRID), gz: s.userData.gz ?? Math.round(s.position.z / GAME.GRID) }); }
  repairTargeted() { const s = this.targetedStructure(); if (!s) return; this.net.send({ t: 'repair', gx: s.userData.gx ?? Math.round(s.position.x / GAME.GRID), gz: s.userData.gz ?? Math.round(s.position.z / GAME.GRID) }); }

  groundAt(x, z) { const gx = Math.round(x / GAME.GRID), gz = Math.round(z / GAME.GRID); return this.world.tiles.has(`${gx},${gz}`) ? GAME.RAFT_Y : null; }

  update(dt, time) {
    if (this.fishCd > 0) this.fishCd -= dt; if (this.shootCd > 0) this.shootCd -= dt;
    let mx = 0, mz = 0;
    if (this.enabled && this.alive) { if (this.keys.has('KeyW')) mz -= 1; if (this.keys.has('KeyS')) mz += 1; if (this.keys.has('KeyA')) mx -= 1; if (this.keys.has('KeyD')) mx += 1; }
    const moving = mx || mz;
    const wantSprint = this.keys.has('ShiftLeft') && moving && (this.hud.stamina ?? 100) > 5;
    let speed = this.inWater ? GAME.SWIM_SPEED : GAME.PLAYER_SPEED;
    if (wantSprint) speed *= GAME.SPRINT_MULT;
    if (this.held === 'flippers' || this.hud.has?.('flippers')) { if (this.inWater) speed *= 1.3; }
    if (moving) { const len = Math.hypot(mx, mz); mx /= len; mz /= len; const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw); this.pos.x += (mx * cos - mz * sin) * speed * dt; this.pos.z += (mx * sin + mz * cos) * speed * dt; }

    // vertical
    this.diving = this.keys.has('ControlLeft') && this.inWater;
    this.vel.y -= GAME.GRAVITY * dt; this.pos.y += this.vel.y * dt;
    const g = this.groundAt(this.pos.x, this.pos.z); this.inWater = false;
    if (g != null && this.pos.y <= g) { this.pos.y = g; this.vel.y = 0; this.onGround = true; } else this.onGround = false;
    if (g == null) {
      const wy = waveHeight(this.pos.x, this.pos.z, time); const floatLine = wy - 0.9;
      if (this.pos.y < floatLine) {
        if (!this.inWater && this.vel.y < -4) this.audio.splash();
        this.inWater = true;
        if (this.diving) { this.vel.y -= GAME.DIVE_SPEED * dt * 3; this.vel.y = Math.max(this.vel.y, -GAME.DIVE_SPEED); if (this.pos.y < GAME.SEABED_Y) this.pos.y = GAME.SEABED_Y; }
        else { this.vel.y += GAME.GRAVITY * 1.5 * dt; this.vel.y *= 0.82; if (this.pos.y < wy - 2.2) this.pos.y = wy - 2.2; }
      }
    }
    if (this.keys.has('Space')) { if (this.onGround) { this.vel.y = GAME.JUMP_V; this.onGround = false; } else if (this.inWater) this.vel.y = GAME.SWIM_SPEED; }

    // camera + head bob
    this.bob += (moving && this.onGround ? dt * (wantSprint ? 14 : 9) : 0);
    const bobY = (moving && this.onGround) ? Math.sin(this.bob) * 0.06 : 0;
    this.cam.position.set(this.pos.x, this.pos.y + 1.62 + bobY, this.pos.z);
    this.cam.rotation.order = 'YXZ'; this.cam.rotation.y = this.yaw; this.cam.rotation.x = this.pitch;
    this.torchLight.position.copy(this.cam.position); this.torchLight.intensity = this.held === 'torch' ? 1.4 : 0;

    // build ghost
    if (this.buildKind && this.alive) {
      const c = this.targetCell();
      if (c) {
        this.ghost.visible = true; this.ghost.position.set(c.gx * GAME.GRID, 0, c.gz * GAME.GRID);
        const b = BUILDABLES[this.buildKind]; const has = this.world.tiles.has(`${c.gx},${c.gz}`); const prop = this.world.props.has(`${c.gx},${c.gz}`);
        let ok; if (b.shape === 'tile') { const adj = ['1,0', '-1,0', '0,1', '0,-1'].some(o => { const [dx, dz] = o.split(',').map(Number); return this.world.tiles.has(`${c.gx + dx},${c.gz + dz}`); }); ok = !has && adj; } else ok = has && !prop;
        ok = ok && this.hud.canAfford(b.in);
        this.ghostBox.material.color.setHex(ok ? 0x4cff7a : 0xff4c4c); this.ghostBox.scale.y = b.shape === 'tile' ? 1 : 4;
      } else this.ghost.visible = false;
    } else this.ghost.visible = false;

    this._hint();

    this.sendT += dt;
    if (this.sendT > 0.066 && this.net.ready) {
      this.sendT = 0;
      this.net.send({ t: 'input', x: this.pos.x, y: this.pos.y, z: this.pos.z, ry: this.yaw, inWater: this.inWater, held: this.held, sprint: wantSprint, anim: this.inWater ? 'swim' : (moving ? (wantSprint ? 'sprint' : 'walk') : 'idle') });
    }
    return { moving, bobY };
  }
  _hint() {
    if (!this.alive || this.buildKind) { this.hud.hint(''); return; }
    if (this.targetedDownedPlayer()) { this.hud.hint('<b>E</b> to revive crewmate'); return; }
    if (this.held === 'hook') { const d = this.targetedDebris(); if (d) { this.hud.hint(`<b>Click</b> to hook ${DEBRIS[d.userData.dtype].name}`); return; } }
    if (ITEMS[this.held]?.slot === 'axe') { if (this.targetedIslandNode() || this.targetedSeabed()) { this.hud.hint('<b>Click</b> to harvest'); return; } }
    const p = this.targetedProp();
    if (p) { const lbl = STATION_LABEL[p.userData.type]; if (lbl) { this.hud.hint(`<b>E</b> to ${lbl}` + (p.userData.n ? ` (${p.userData.n})` : '') + (p.userData.text ? ` — “${p.userData.text}”` : '')); return; } }
    if (ITEMS[this.held]?.slot === 'spear' && this.targetedShark()) { this.hud.hint('<b>Click</b> to strike!'); return; }
    this.hud.hint('');
  }
}
