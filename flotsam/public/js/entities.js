import * as THREE from 'three';
import { GAME, DEBRIS, BUILDABLES, SHARK_TYPES, ISLANDS, SEABED } from './config.js';
import { waveHeight } from './water.js';

// ---- shared materials ----
const M = {
  wood: new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.9 }),
  woodDark: new THREE.MeshStandardMaterial({ color: 0x5d3a1a, roughness: 0.95 }),
  metal: new THREE.MeshStandardMaterial({ color: 0xb0bec5, roughness: 0.4, metalness: 0.7 }),
  rope: new THREE.MeshStandardMaterial({ color: 0xc2a76a, roughness: 1 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x9fd8ff, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.6 }),
  fire: new THREE.MeshBasicMaterial({ color: 0xff7a18 }),
  skin: new THREE.MeshStandardMaterial({ color: 0xe0a878, roughness: 0.8 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.9 }),
  sand: new THREE.MeshStandardMaterial({ color: 0xe8d8a0, roughness: 1 }),
  rock: new THREE.MeshStandardMaterial({ color: 0x808a90, roughness: 1 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xffd54f, roughness: 0.4, metalness: 0.5 }),
  cloth: new THREE.MeshStandardMaterial({ color: 0xf5f0e1, roughness: 0.9, side: THREE.DoubleSide }),
};

function nameSprite(text, color = '#ffe27a') {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.font = 'bold 30px Trebuchet MS'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = 'rgba(0,0,0,.5)'; x.fillRect(0, 14, 256, 36);
  x.fillStyle = color; x.fillText(text, 128, 33);
  const tex = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  s.scale.set(2.4, 0.6, 1); s.position.y = 2.4; s.renderOrder = 999;
  return s;
}
function emoteSprite(emoji) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const x = c.getContext('2d'); x.font = '90px serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(emoji, 64, 70);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
  s.scale.set(1.4, 1.4, 1); s.position.y = 3.0; s.renderOrder = 1000;
  return s;
}

export function makeAvatar(color, name) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.8, 4, 10), new THREE.MeshStandardMaterial({ color, roughness: 0.7 }));
  body.position.y = 0.9; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 12), M.skin);
  head.position.y = 1.62; head.castShadow = true; g.add(head);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.22), M.woodDark);
  pack.position.set(0, 0.95, -0.32); g.add(pack);
  g.add(nameSprite(name || 'Castaway'));
  g.userData.body = body;
  return g;
}

const CYL_DEBRIS = new Set(['barrel', 'buoy', 'fuelbarrel']);
export function makeDebris(type) {
  const d = DEBRIS[type] || DEBRIS.crate; const [w, h, l] = d.size; const g = new THREE.Group();
  let mesh;
  if (CYL_DEBRIS.has(type)) mesh = new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, h, 12), new THREE.MeshStandardMaterial({ color: d.color, roughness: 0.8 }));
  else if (type === 'seaweed' || type === 'palm') {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), new THREE.MeshStandardMaterial({ color: d.color, roughness: 1 }));
    for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.8, 5), M.leaf); b.position.set((Math.random() - 0.5) * w, 0.4, (Math.random() - 0.5) * l); g.add(b); }
  } else if (type === 'bottle') mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, h, 8), new THREE.MeshStandardMaterial({ color: d.color, transparent: true, opacity: 0.7 }));
  else mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), new THREE.MeshStandardMaterial({ color: d.color, roughness: 0.85 }));
  mesh.castShadow = true; g.add(mesh);
  if (type === 'treasure') { const lid = new THREE.Mesh(new THREE.BoxGeometry(w, 0.18, l), M.gold); lid.position.y = h / 2; g.add(lid); }
  return g;
}

export function makeShark(kind = 'great') {
  const st = SHARK_TYPES[kind] || SHARK_TYPES.great;
  const mat = new THREE.MeshStandardMaterial({ color: st.color, roughness: 0.7 });
  const belly = new THREE.MeshStandardMaterial({ color: 0xd8e2e8, roughness: 0.8 });
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.9, 3.2, 6, 12), mat); body.rotation.z = Math.PI / 2; body.scale.set(1, 0.8, 1); body.castShadow = true; g.add(body);
  const bel = new THREE.Mesh(new THREE.CapsuleGeometry(0.78, 3.0, 4, 10), belly); bel.rotation.z = Math.PI / 2; bel.position.y = -0.25; bel.scale.set(1, 0.55, 0.9); g.add(bel);
  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.6, 12), mat); snout.rotation.z = -Math.PI / 2; snout.position.x = 2.4; g.add(snout);
  const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.3, 4), mat); dorsal.position.set(-0.2, 0.95, 0); g.add(dorsal);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.6, 4), mat); tail.rotation.z = Math.PI / 2; tail.position.x = -2.6; tail.scale.set(1, 1.4, 0.3); g.add(tail);
  if (kind === 'hammerhead') { const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 2.6), mat); head.position.x = 2.6; g.add(head); }
  if (st.boss) { g.add(nameSprite('☠ MEGALODON ☠', '#ff5252')); }
  g.scale.setScalar(st.scale); g.userData.tail = tail;
  return g;
}

export function makeFoundation(kind = 'foundation') {
  const g = new THREE.Group(); const S = GAME.GRID;
  const isReinf = kind === 'reinforced';
  const topMat = isReinf ? M.metal : M.wood;
  const top = new THREE.Mesh(new THREE.BoxGeometry(S, 0.3, S), topMat); top.position.y = GAME.RAFT_Y - 0.15; top.receiveShadow = true; top.castShadow = true; g.add(top);
  if (!isReinf) for (let i = -1; i <= 1; i++) { const gr = new THREE.Mesh(new THREE.BoxGeometry(S, 0.32, 0.06), M.woodDark); gr.position.set(0, GAME.RAFT_Y - 0.14, i * (S / 3)); g.add(gr); }
  for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.9, 8), new THREE.MeshStandardMaterial({ color: 0x335, roughness: 0.9 })); b.rotation.x = Math.PI / 2; b.position.set(ox * S * 0.32, GAME.RAFT_Y - 0.55, oz * S * 0.32); g.add(b); }
  return g;
}

function addLight(g, color, intensity, dist, y) { const l = new THREE.PointLight(color, intensity, dist); l.position.y = y; g.add(l); g.userData.lamp = l; }

export function makeProp(type) {
  const g = new THREE.Group(); const y = GAME.RAFT_Y; const S = GAME.GRID;
  switch (type) {
    case 'wall': { const w = new THREE.Mesh(new THREE.BoxGeometry(S, 2.2, 0.3), M.wood); w.position.y = y + 1.1; w.castShadow = true; g.add(w); for (let i = -1; i <= 1; i++) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.34, 2.2, 0.34), M.woodDark); p.position.set(i * S * 0.32, y + 1.1, 0); g.add(p); } break; }
    case 'floor': { const f = new THREE.Mesh(new THREE.BoxGeometry(S * 0.98, 0.12, S * 0.98), M.wood); f.position.y = y + 0.06; f.receiveShadow = true; g.add(f); break; }
    case 'railing': { const top = new THREE.Mesh(new THREE.BoxGeometry(S, 0.12, 0.12), M.wood); top.position.y = y + 1.0; g.add(top); for (let i = -1; i <= 1; i++) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1), M.wood); p.position.set(i * S * 0.4, y + 0.5, 0); g.add(p); } break; }
    case 'door': { const fr = new THREE.Mesh(new THREE.BoxGeometry(S, 2.2, 0.2), M.woodDark); fr.position.y = y + 1.1; g.add(fr); const hole = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.8, 0.4), new THREE.MeshStandardMaterial({ color: 0x111, transparent: true, opacity: 0.25 })); hole.position.y = y + 0.9; g.add(hole); break; }
    case 'ramp': { const r = new THREE.Mesh(new THREE.BoxGeometry(S, 0.15, S * 1.2), M.wood); r.rotation.x = -0.5; r.position.y = y + 0.5; g.add(r); break; }
    case 'ladder': { const a = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2), M.wood); a.position.set(-0.3, y + 1.1, 0); const b = a.clone(); b.position.x = 0.3; g.add(a, b); for (let i = 0; i < 5; i++) { const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.7), M.woodDark); rung.rotation.z = Math.PI / 2; rung.position.set(0, y + 0.2 + i * 0.45, 0); g.add(rung); } break; }
    case 'storage': case 'bigstorage': { const sc = type === 'bigstorage' ? 1.4 : 1; const b = new THREE.Mesh(new THREE.BoxGeometry(1.4 * sc, 1 * sc, 1 * sc), M.woodDark); b.position.y = y + 0.5 * sc; b.castShadow = true; g.add(b); const lid = new THREE.Mesh(new THREE.BoxGeometry(1.5 * sc, 0.15, 1.1 * sc), M.wood); lid.position.y = y + 1.05 * sc; g.add(lid); break; }
    case 'grill': { const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 1.2), M.metal); base.position.y = y + 0.4; base.castShadow = true; g.add(base); const fire = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.8, 8), M.fire); fire.position.y = y + 1.1; g.add(fire); g.userData.fire = fire; break; }
    case 'campfire': { for (let i = 0; i < 5; i++) { const log = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.2), M.woodDark); log.rotation.set(Math.PI / 2, i * 1.2, 0); log.position.y = y + 0.15; g.add(log); } const fire = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.1, 8), M.fire); fire.position.y = y + 0.7; g.add(fire); g.userData.fire = fire; addLight(g, 0xff7a18, 1.6, 12, y + 1); break; }
    case 'cookpot': { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 0.6, 12), M.metal); leg.position.y = y + 0.5; g.add(leg); const fire = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.6, 8), M.fire); fire.position.y = y + 0.2; g.add(fire); g.userData.fire = fire; break; }
    case 'furnace': { const b = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.6, 1.4), M.rock); b.position.y = y + 0.8; b.castShadow = true; g.add(b); const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.2), M.fire); mouth.position.set(0, y + 0.6, 0.71); g.add(mouth); addLight(g, 0xff5a18, 1.0, 9, y + 0.8); break; }
    case 'anvil': { const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 1), M.metal); base.position.y = y + 0.5; g.add(base); const top = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, 1.3), M.metal); top.position.y = y + 0.9; g.add(top); break; }
    case 'workbench': { const top = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.18, 1), M.wood); top.position.y = y + 0.9; g.add(top); for (const [ox, oz] of [[-0.7, -0.4], [0.7, -0.4], [-0.7, 0.4], [0.7, 0.4]]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), M.woodDark); leg.position.set(ox, y + 0.45, oz); g.add(leg); } break; }
    case 'research': { const top = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.18, 1), M.metal); top.position.y = y + 0.95; g.add(top); const screen = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.06), new THREE.MeshStandardMaterial({ color: 0x1de9b6, emissive: 0x0a8, emissiveIntensity: 0.6 })); screen.position.set(0, y + 1.4, -0.3); g.add(screen); break; }
    case 'purifier': { const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.4, 12), M.glass); tank.position.y = y + 0.9; g.add(tank); const base = new THREE.Mesh(new THREE.BoxGeometry(1, 0.4, 1), M.metal); base.position.y = y + 0.2; g.add(base); break; }
    case 'raincatcher': { const cone = new THREE.Mesh(new THREE.ConeGeometry(0.9, 0.5, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0x4aa3c7, side: THREE.DoubleSide })); cone.rotation.x = Math.PI; cone.position.y = y + 1.2; g.add(cone); const jug = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.9, 10), M.glass); jug.position.y = y + 0.5; g.add(jug); break; }
    case 'net': { const frame = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.08, 8, 16), M.wood); frame.rotation.x = Math.PI / 2; frame.position.y = y + 1.4; g.add(frame); const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.4), M.woodDark); pole.position.y = y + 0.7; g.add(pole); const mesh = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0xddccaa, wireframe: true })); mesh.position.y = y + 1; g.add(mesh); break; }
    case 'planter': { const box = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 1.6), M.woodDark); box.position.y = y + 0.25; g.add(box); const soil = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 1.4), new THREE.MeshStandardMaterial({ color: 0x4a3520 })); soil.position.y = y + 0.5; g.add(soil); const sprout = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 6), M.leaf); sprout.position.y = y + 0.7; sprout.visible = false; g.add(sprout); g.userData.sprout = sprout; break; }
    case 'bed': { const frame = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 2), M.woodDark); frame.position.y = y + 0.2; g.add(frame); const mat = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.25, 1.9), new THREE.MeshStandardMaterial({ color: 0xe57373 })); mat.position.y = y + 0.5; g.add(mat); break; }
    case 'torchpost': { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2), M.wood); pole.position.y = y + 1; g.add(pole); const flame = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 8), M.fire); flame.position.y = y + 2.1; g.add(flame); g.userData.fire = flame; addLight(g, 0xffa040, 1.0, 10, y + 2.1); break; }
    case 'lantern': { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6), M.metal); pole.position.y = y + 0.8; g.add(pole); const glass = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.4), new THREE.MeshStandardMaterial({ color: 0xfff3b0, emissive: 0xffcf3f, emissiveIntensity: 0.8, transparent: true, opacity: 0.8 })); glass.position.y = y + 1.7; g.add(glass); addLight(g, 0xffd56b, 1.6, 14, y + 1.7); break; }
    case 'spikes': { for (let i = 0; i < 5; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.12, 1, 6), M.metal); sp.position.set((Math.random() - 0.5) * 2.5, y + 0.5, (Math.random() - 0.5) * 2.5); g.add(sp); } break; }
    case 'sail': { const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 5), M.wood); mast.position.y = y + 2.5; g.add(mast); const sail = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.2), M.cloth); sail.position.set(0, y + 3, 0); g.add(sail); g.userData.sail = sail; break; }
    case 'wheel': { const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.2), M.wood); stand.position.y = y + 0.6; g.add(stand); const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.08, 8, 16), M.woodDark); wheel.position.y = y + 1.3; g.add(wheel); for (let i = 0; i < 6; i++) { const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2), M.woodDark); sp.rotation.z = i * Math.PI / 3; sp.position.y = y + 1.3; g.add(sp); } g.userData.wheel = wheel; break; }
    case 'anchor': { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.4), M.metal); post.position.y = y + 0.7; g.add(post); const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.06, 8, 12), M.metal); ring.position.y = y + 1.3; g.add(ring); const fl = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.07, 8, 12, Math.PI), M.metal); fl.position.y = y + 0.2; g.add(fl); break; }
    case 'flag': { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3), M.wood); pole.position.y = y + 1.5; g.add(pole); const flag = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.6), new THREE.MeshStandardMaterial({ color: 0xff5252, side: THREE.DoubleSide })); flag.position.set(0.5, y + 2.6, 0); g.add(flag); g.userData.sail = flag; break; }
    case 'chair': { const seat = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.6), M.wood); seat.position.y = y + 0.5; g.add(seat); const back = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.1), M.wood); back.position.set(0, y + 0.8, -0.25); g.add(back); break; }
    case 'sign': { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1), M.wood); post.position.y = y + 0.5; g.add(post); const board = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 0.08), M.wood); board.position.y = y + 1.1; g.add(board); break; }
    case 'beacon': { const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 3.2, 8), M.metal); tower.position.y = y + 1.6; tower.castShadow = true; g.add(tower); const dish = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8, 0, Math.PI), M.metal); dish.rotation.x = -Math.PI / 3; dish.position.y = y + 3.2; g.add(dish); const light = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff3030 })); light.position.y = y + 3.4; g.add(light); g.userData.light = light; addLight(g, 0xff3030, 1.2, 16, y + 3.4); break; }
    default: { const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), M.wood); b.position.y = y + 0.5; g.add(b); }
  }
  return g;
}

export function makeIsland(data) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(7, 9, 2.4, 18), M.sand); base.position.y = -0.6; base.receiveShadow = true; g.add(base);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(6.6, 16, 10), M.sand); dome.scale.y = 0.3; dome.position.y = 0.3; g.add(dome);
  for (const n of data.nodes) {
    const sub = new THREE.Group(); sub.position.set(n.ox, 0.4, n.oz);
    sub.userData.islandNode = true; sub.userData.node = n.i;
    if (n.type === 'palm') { const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, 3), M.wood); trunk.position.y = 1.5; sub.add(trunk); for (let i = 0; i < 5; i++) { const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.3, 2, 4), M.leaf); leaf.position.y = 3; leaf.rotation.set(0.9, i * 1.25, 0); sub.add(leaf); } }
    else if (n.type === 'rock') { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9), M.rock); r.position.y = 0.6; sub.add(r); }
    else if (n.type === 'bush') { const b = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), M.leaf); b.position.y = 0.6; sub.add(b); }
    else if (n.type === 'chest') { const c = new THREE.Mesh(new THREE.BoxGeometry(1, 0.7, 0.7), M.gold); c.position.y = 0.45; sub.add(c); }
    sub.visible = !n.done;
    g.add(sub); g.userData['n' + n.i] = sub;
  }
  return g;
}

export function makeSeabedNode(type) {
  const def = SEABED.nodes.find(n => n.type === type) || SEABED.nodes[0];
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: def.color, roughness: 1 });
  if (type === 'coral') { for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1.5, 6), mat); c.position.set((Math.random() - 0.5) * 1.5, 0.7, (Math.random() - 0.5) * 1.5); g.add(c); } }
  else if (type === 'oyster') { const s = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), mat); s.scale.y = 0.5; g.add(s); }
  else if (type === 'wreck') { const b = new THREE.Mesh(new THREE.BoxGeometry(2, 0.8, 1.2), mat); b.rotation.z = 0.3; g.add(b); }
  else g.add(new THREE.Mesh(new THREE.DodecahedronGeometry(1), mat));
  return g;
}

export function makeOceanFloor() {
  const g = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x1a3a4a, roughness: 1 }));
  g.rotation.x = -Math.PI / 2; g.position.y = GAME.SEABED_Y - 1; g.receiveShadow = true;
  return g;
}

export function makeJelly() {
  const g = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe57bff, transparent: true, opacity: 0.6, emissive: 0x7a1f9c, emissiveIntensity: 0.5 }));
  g.add(dome);
  for (let i = 0; i < 6; i++) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.01, 1), new THREE.MeshStandardMaterial({ color: 0xe57bff, transparent: true, opacity: 0.5 })); const a = i / 6 * Math.PI * 2; t.position.set(Math.cos(a) * 0.25, -0.5, Math.sin(a) * 0.25); g.add(t); }
  return g;
}

// ---------------------------------------------------------------------------
// WORLD VIEW
// ---------------------------------------------------------------------------
export class WorldView {
  constructor(scene) {
    this.scene = scene;
    this.players = new Map(); this.debris = new Map(); this.tiles = new Map(); this.props = new Map();
    this.seabed = new Map(); this.islands = new Map(); this.jellies = [];
    this.sharks = []; this.selfId = null;
    this.scene.add(makeOceanFloor());
  }
  key(gx, gz) { return `${gx},${gz}`; }

  setPlayers(list) {
    const seen = new Set();
    for (const p of list) {
      if (p.id === this.selfId) continue; seen.add(p.id);
      let e = this.players.get(p.id);
      if (!e) { e = makeAvatar(p.color, p.name); this.scene.add(e); this.players.set(p.id, e); }
      Object.assign(e.userData, { pid: p.id, tx: p.x, ty: p.y, tz: p.z, try: p.ry, alive: p.alive, downed: p.downed });
      e.visible = p.alive;
    }
    for (const [id, e] of this.players) if (!seen.has(id)) { this.scene.remove(e); this.players.delete(id); }
  }
  removePlayer(id) { const e = this.players.get(id); if (e) { this.scene.remove(e); this.players.delete(id); } }
  emote(id, em) { const e = this.players.get(id); if (!e) return; if (e.userData.emote) e.remove(e.userData.emote); const s = emoteSprite(em); e.userData.emote = s; e.userData.emoteT = 3; e.add(s); }

  setDebris(list) {
    const seen = new Set();
    for (const d of list) { seen.add(d.id); let e = this.debris.get(d.id); if (!e) { e = makeDebris(d.type); e.userData.id = d.id; e.userData.dtype = d.type; this.scene.add(e); this.debris.set(d.id, e); } e.userData.tx = d.x; e.userData.tz = d.z; e.rotation.y = d.ry; }
    for (const [id, e] of this.debris) if (!seen.has(id)) { this.scene.remove(e); this.debris.delete(id); }
  }
  removeDebris(id) { const e = this.debris.get(id); if (e) { this.scene.remove(e); this.debris.delete(id); } }

  setTiles(list) {
    const seen = new Set();
    for (const t of list) { const k = this.key(t.gx, t.gz); seen.add(k); let e = this.tiles.get(k); if (!e || e.userData.kind !== (t.kind || 'foundation')) { if (e) this.scene.remove(e); e = makeFoundation(t.kind || 'foundation'); e.userData.kind = t.kind || 'foundation'; e.position.set(t.gx * GAME.GRID, 0, t.gz * GAME.GRID); this.scene.add(e); this.tiles.set(k, e); } e.userData.hp = t.hp; }
    for (const [k, e] of this.tiles) if (!seen.has(k)) { this.scene.remove(e); this.tiles.delete(k); }
  }
  setProps(list) {
    const seen = new Set();
    for (const p of list) { const k = this.key(p.gx, p.gz); seen.add(k); let e = this.props.get(k); if (!e || e.userData.type !== p.type) { if (e) this.scene.remove(e); e = makeProp(p.type); e.userData.type = p.type; e.position.set(p.gx * GAME.GRID, 0, p.gz * GAME.GRID); this.scene.add(e); this.props.set(k, e); } Object.assign(e.userData, { hp: p.hp, n: p.n, gx: p.gx, gz: p.gz, grow: p.grow, text: p.text }); if (e.userData.sprout) e.userData.sprout.visible = p.grow > 5; }
    for (const [k, e] of this.props) if (!seen.has(k)) { this.scene.remove(e); this.props.delete(k); }
  }
  setSeabed(list) {
    const seen = new Set();
    for (const n of list) { seen.add(n.id); let e = this.seabed.get(n.id); if (!e || e.userData.stype !== n.type) { if (e) this.scene.remove(e); e = makeSeabedNode(n.type); e.userData.stype = n.type; e.userData.id = n.id; e.position.set(n.x, GAME.SEABED_Y, n.z); this.scene.add(e); this.seabed.set(n.id, e); } e.visible = !n.done; }
    for (const [id, e] of this.seabed) if (!seen.has(id)) { this.scene.remove(e); this.seabed.delete(id); }
  }
  setIslands(list) {
    const seen = new Set();
    for (const isl of list) { seen.add(isl.id); let e = this.islands.get(isl.id); if (!e) { e = makeIsland(isl); e.userData.id = isl.id; this.scene.add(e); this.islands.set(isl.id, e); } e.userData.tx = isl.x; e.userData.tz = isl.z; e.rotation.y = isl.ry; for (const n of isl.nodes) { const sub = e.userData['n' + n.i]; if (sub) sub.visible = !n.done; } }
    for (const [id, e] of this.islands) if (!seen.has(id)) { this.scene.remove(e); this.islands.delete(id); }
  }
  setJellies(list) {
    while (this.jellies.length < list.length) { const j = makeJelly(); this.scene.add(j); this.jellies.push(j); }
    for (let i = 0; i < this.jellies.length; i++) { const j = this.jellies[i], d = list[i]; if (!d) { j.visible = false; continue; } j.visible = true; j.userData.tx = d.x; j.userData.tz = d.z; }
  }
  setSharks(list) {
    for (let i = 0; i < this.sharks.length; i++) { if (list[i] && this.sharks[i].userData.kind !== list[i].kind) { this.scene.remove(this.sharks[i]); this.sharks[i] = null; } }
    this.sharks = this.sharks.filter(Boolean);
    while (this.sharks.length < list.length) { const k = list[this.sharks.length]?.kind || 'great'; const s = makeShark(k); s.userData.kind = k; this.scene.add(s); this.sharks.push(s); }
    for (let i = 0; i < this.sharks.length; i++) { const m = this.sharks[i], d = list[i]; if (!d) { m.visible = false; continue; } m.visible = true; Object.assign(m.userData, { tx: d.x, tz: d.z, try: d.ry, state: d.state, kind: d.kind }); }
  }

  update(dt, t, lightFactor = 1) {
    const lerp = 1 - Math.pow(0.001, dt);
    for (const e of this.players.values()) {
      e.position.x += (e.userData.tx - e.position.x) * lerp; e.position.z += (e.userData.tz - e.position.z) * lerp;
      const fy = e.userData.ty; e.position.y += (fy - e.position.y) * lerp;
      let dr = e.userData.try - e.rotation.y; while (dr > Math.PI) dr -= 6.283; while (dr < -Math.PI) dr += 6.283; e.rotation.y += dr * lerp;
      if (e.userData.body) e.userData.body.rotation.z = e.userData.downed ? 1.4 : 0;
      if (e.userData.emote) { e.userData.emoteT -= dt; if (e.userData.emoteT <= 0) { e.remove(e.userData.emote); e.userData.emote = null; } }
    }
    for (const e of this.debris.values()) { e.position.x += (e.userData.tx - e.position.x) * lerp; e.position.z += (e.userData.tz - e.position.z) * lerp; e.position.y = waveHeight(e.position.x, e.position.z, t); e.rotation.z = Math.sin(t * 0.8 + e.position.x) * 0.08; }
    for (const e of this.islands.values()) { e.position.x += (e.userData.tx - e.position.x) * lerp; e.position.z += (e.userData.tz - e.position.z) * lerp; e.position.y = waveHeight(e.position.x, e.position.z, t) - 0.2; }
    for (const j of this.jellies) { if (!j.visible) continue; j.position.x += (j.userData.tx - j.position.x) * lerp; j.position.z += (j.userData.tz - j.position.z) * lerp; j.position.y = -1.5 + Math.sin(t * 1.5 + j.position.x) * 0.5; }
    for (const m of this.sharks) { if (!m.visible) continue; m.position.x += (m.userData.tx - m.position.x) * lerp; m.position.z += (m.userData.tz - m.position.z) * lerp; m.position.y = waveHeight(m.position.x, m.position.z, t) - 0.3 + (m.userData.state === 'charge' ? 0.2 : 0); let dr = m.userData.try - m.rotation.y; while (dr > Math.PI) dr -= 6.283; while (dr < -Math.PI) dr += 6.283; m.rotation.y += dr * lerp; if (m.userData.tail) m.userData.tail.rotation.y = Math.sin(t * 8) * 0.5; }
    for (const e of this.props.values()) {
      if (e.userData.fire) e.userData.fire.scale.y = 1 + Math.sin(t * 12) * 0.2;
      if (e.userData.type === 'beacon' && e.userData.light) e.userData.light.visible = Math.sin(t * 6) > 0;
      if (e.userData.sail) e.userData.sail.rotation.y = Math.sin(t * 1.5) * 0.15;
      if (e.userData.wheel) e.userData.wheel.rotation.x += dt * 0.2;
      if (e.userData.lamp) e.userData.lamp.intensity = (e.userData.lamp.userData?.base || 1.2) * (1.2 - lightFactor * 0.8);
    }
  }
}
