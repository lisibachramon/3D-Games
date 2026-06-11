import * as THREE from 'three';
import { GAME, ITEMS, WILDLIFE } from './config.js';
import { Net } from './net.js';
import { Stage } from './scene.js';
import { Ocean } from './water.js';
import { WorldView } from './entities.js';
import { Audio } from './audio.js';
import { HUD } from './hud.js';
import { Controller } from './controls.js';
import { Weather } from './weather.js';
import { Wildlife } from './wildlife.js';
import { Particles } from './particles.js';
import { Minimap } from './minimap.js';
import { Settings } from './settings.js';

const net = new Net();
const stage = new Stage();
const ocean = new Ocean(stage.scene);
const world = new WorldView(stage.scene);
const audio = new Audio();
const hud = new HUD(net, audio); hud.world = world;
const ctrl = new Controller(stage, net, world, audio, hud); hud.bind(ctrl);
const weather = new Weather(stage);
const wildlife = new Wildlife(stage.scene, WILDLIFE);
const particles = new Particles(stage.scene);
const minimap = new Minimap();
const settings = new Settings(stage, ctrl, audio);

// damage flash + screen shake
const flash = document.createElement('div');
Object.assign(flash.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: 40, boxShadow: 'inset 0 0 200px rgba(255,0,0,0)', transition: 'box-shadow .15s' });
document.getElementById('game').appendChild(flash);
let shake = 0;
function doFlash(strong) { flash.style.transition = 'none'; flash.style.boxShadow = `inset 0 0 ${strong ? 260 : 160}px rgba(255,0,0,${strong ? 0.8 : 0.4})`; if (strong) shake = 0.4; requestAnimationFrame(() => { flash.style.transition = 'box-shadow .5s'; flash.style.boxShadow = 'inset 0 0 200px rgba(255,0,0,0)'; }); }

// ping markers
const pings = [];
function addPing(x, z, color) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.6, 6), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }));
  m.rotation.x = Math.PI; m.position.set(x, 4, z); stage.scene.add(m); pings.push({ m, life: 8 });
}

let dayTime = GAME.DAY_LENGTH * 0.25, lastState = null, weatherLight = 1;

// Debug-only, presentation-only time-of-day override (?tod=night / ?tod=0.42).
// Server time stays authoritative for gameplay; this only pins the sky/lighting.
const TOD_OVERRIDE = (() => {
  const v = new URLSearchParams(location.search).get('tod');
  if (v == null) return null;
  const named = { midnight: 0.0, night: 0.02, sunrise: 0.28, morning: 0.36, day: 0.5, noon: 0.5, sunset: 0.72, dusk: 0.75 };
  if (v in named) return named[v];
  const f = parseFloat(v);
  return Number.isFinite(f) ? ((f % 1) + 1) % 1 : null;
})();

const nameInput = document.getElementById('nameInput');
nameInput.value = 'Castaway' + Math.floor(Math.random() * 99);
function play() {
  const name = nameInput.value.trim() || 'Castaway';
  audio.start(); audio.music(); net.connect();
  net.on('open', () => net.send({ t: 'join', name }));
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('game').classList.remove('hidden');
}
document.getElementById('playBtn').addEventListener('click', play);
nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') play(); });

stage.renderer.domElement.addEventListener('wheel', (e) => { if (hud.buildOpen) { hud.cycleBuild(Math.sign(e.deltaY)); e.preventDefault(); } }, { passive: false });

// ---- network ----
net.on('welcome', (m) => {
  world.selfId = m.id; ctrl.spawn(m.you);
  world.setTiles(m.tiles); world.setProps(m.props); world.setSeabed(m.seabed); world.setIslands(m.islands);
  hud.setStorage(m.storage); dayTime = m.time;
  ctrl.joined = true; ctrl.enabled = true; ctrl.alive = true;
  hud.toast('Click to look around. Hook debris, build your raft, reach the beacon!');
  hud.addChat('SEA', 'B build · C craft · E use · dive with Ctrl · sleep to skip night.');
});
net.on('state', (m) => {
  lastState = m;
  world.setPlayers(m.players); world.setDebris(m.debris); world.setSharks(m.sharks); world.setJellies(m.jellies || []);
  dayTime = m.time; weatherLight = m.light ?? 1;
  weather.set(m.weather, m.rain, m.fog, m.light);
  const self = m.players.find(p => p.id === world.selfId); if (self) hud.updateSelf(self);
  let near = null; for (const s of m.sharks) { const d = Math.hypot(s.x - ctrl.pos.x, s.z - ctrl.pos.z); if (!near || d < near.d) near = { d, hp: s.hp, maxhp: s.maxhp, boss: s.kind === 'megalodon' }; }
  hud.updateTop(m, near);
});
net.on('tiles', (m) => world.setTiles(m.tiles));
net.on('props', (m) => world.setProps(m.props));
net.on('seabed', (m) => world.setSeabed(m.seabed));
net.on('islands', (m) => world.setIslands(m.islands));
net.on('inv', (m) => hud.setInventory(m.inv, m.dur));
net.on('storage', (m) => hud.setStorage(m.storage));
net.on('despawn', (m) => world.removeDebris(m.id));
net.on('leave', (m) => world.removePlayer(m.id));
net.on('chat', (m) => hud.addChat(m.name, m.msg));
net.on('toast', (m) => hud.toast(m.msg));
net.on('pickup', (m) => { audio.pickup(); const parts = Object.entries(m.got || {}).filter(([, q]) => q > 0).map(([k, q]) => `+${q} ${ITEMS[k]?.icon || ''}${ITEMS[k]?.name || k}`); if (parts.length) { hud.toast(parts.join('  ')); particles.sparkle(ctrl.pos.x, ctrl.pos.y + 1, ctrl.pos.z); } });
net.on('ping', (m) => { addPing(m.x, m.z, m.color || 0xffe27a); hud.toast(`📍 ${m.name} pinged a spot.`); });
net.on('emote', (m) => { if (m.id !== world.selfId) world.emote(m.id, m.e); });
net.on('died', () => hud.showDeath());
net.on('downed', () => hud.showDowned());
net.on('revived', () => { hud.clearDowned(); hud.toast('💚 Back on your feet!'); });
net.on('respawned', (m) => { hud.hideVeil(); hud.clearDowned(); ctrl.spawn(m.you); ctrl.alive = true; ctrl.enabled = true; });
net.on('event', (m) => {
  switch (m.kind) {
    case 'bite': { const me = m.player === world.selfId; doFlash(me); audio.bite(); if (m.x != null) particles.blood(m.x, 0.5, m.z); break; }
    case 'sharkhit': audio.hit(); if (m.x != null) particles.blood(m.x, 0.5, m.z); break;
    case 'sharkdead': audio.bite(); if (m.x != null) particles.blood(m.x, 1, m.z); hud.toast(m.boss ? '☠ THE MEGALODON IS DEAD!' : '🦈 Shark slain!'); break;
    case 'sting': { if (m.player === world.selfId) { doFlash(false); audio.sting(); } break; }
    case 'beacon_on': audio.alarm(); break;
    case 'lightning': weather.strike(); setTimeout(() => audio.thunder(), 300); break;
    case 'wake': hud.toast('☀️ A new day.'); break;
    case 'rescued': hud.showVictory(); break;
  }
});
net.on('close', () => hud.toast('⚠ Disconnected from server.'));

// debug helper for visual tooling: aim the camera (presentation only)
window.__look = (yaw, pitch) => { ctrl.yaw = yaw; ctrl.pitch = pitch; };

// ---- loop ----
const clock = new THREE.Clock();
let gameTime = 0, fpsT = 0, fpsN = 0;
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, clock.getDelta());
  gameTime += dt; dayTime = (dayTime + dt) % GAME.DAY_LENGTH;
  const tf = TOD_OVERRIDE ?? (dayTime / GAME.DAY_LENGTH);
  stage.weatherLight = weatherLight;
  let day = stage.updateSky(tf);
  // weather dimming
  stage.sun.intensity *= weatherLight; stage.hemi.intensity *= (0.6 + weatherLight * 0.4);
  const lightFactor = day * weatherLight;
  ocean.update(gameTime, stage.camera, stage, day);
  const moved = ctrl.update(dt, gameTime);
  world.update(dt, gameTime, lightFactor);
  weather.update(dt, stage.camera.position);
  const center = { x: ctrl.pos.x, z: ctrl.pos.z };
  wildlife.update(dt, gameTime, center);
  particles.update(dt);
  // ping markers
  for (let i = pings.length - 1; i >= 0; i--) { const p = pings[i]; p.life -= dt; p.m.position.y = 4 + Math.sin(gameTime * 3) * 0.3; p.m.material.opacity = Math.min(0.9, p.life / 2); if (p.life <= 0) { stage.scene.remove(p.m); pings.splice(i, 1); } }

  // underwater
  const underwater = stage.camera.position.y < -0.3;
  const uw = document.getElementById('underwater');
  if (underwater) { uw.classList.add('show'); const mask = hud.has('mask'); stage.scene.fog.color.setHex(mask ? 0x1d6fa0 : 0x0a3550); stage.scene.fog.density = mask ? 0.028 : 0.045; }
  else uw.classList.remove('show');

  // screen shake
  if (shake > 0) { shake = Math.max(0, shake - dt); stage.camera.position.x += (Math.random() - 0.5) * shake; stage.camera.position.y += (Math.random() - 0.5) * shake; }

  if (lastState) minimap.draw(world, ctrl, lastState);
  stage.render();

  fpsT += dt; fpsN++; if (fpsT >= 0.5) { settings.showFps(Math.round(fpsN / fpsT)); fpsT = 0; fpsN = 0; }
}
loop();
