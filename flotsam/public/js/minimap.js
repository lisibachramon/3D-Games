import { GAME } from './config.js';

// Top-down radar of the area around the player.
export class Minimap {
  constructor() {
    this.cv = document.getElementById('minimap');
    this.ctx = this.cv.getContext('2d');
    this.compass = document.getElementById('compass');
    this.range = 120;
  }
  draw(world, ctrl, state) {
    const ctx = this.ctx, W = this.cv.width, H = this.cv.height, cx = W / 2, cy = H / 2;
    const px = ctrl.pos.x, pz = ctrl.pos.z, scale = (W / 2) / this.range;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(6,26,40,.85)'; ctx.beginPath(); ctx.arc(cx, cy, W / 2 - 1, 0, 7); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, W / 2 - 1, 0, 7); ctx.clip();
    const wx = (x, z) => [cx + (x - px) * scale, cy + (z - pz) * scale];

    // tiles (raft)
    ctx.fillStyle = '#8a5a2b';
    for (const e of world.tiles.values()) { const [x, y] = wx(e.position.x, e.position.z); ctx.fillRect(x - GAME.GRID * scale / 2, y - GAME.GRID * scale / 2, GAME.GRID * scale, GAME.GRID * scale); }
    // props (light dots)
    ctx.fillStyle = '#cddc39';
    for (const e of world.props.values()) { const [x, y] = wx(e.position.x, e.position.z); ctx.fillRect(x - 1.5, y - 1.5, 3, 3); }
    // debris
    ctx.fillStyle = '#7fd9ff';
    for (const e of world.debris.values()) { const [x, y] = wx(e.position.x, e.position.z); ctx.fillRect(x - 1, y - 1, 2, 2); }
    // islands
    ctx.fillStyle = '#e8d8a0';
    for (const e of world.islands.values()) { const [x, y] = wx(e.position.x, e.position.z); ctx.beginPath(); ctx.arc(x, y, 7 * scale, 0, 7); ctx.fill(); }
    // sharks
    for (const m of world.sharks) { if (!m.visible) continue; const [x, y] = wx(m.position.x, m.position.z); ctx.fillStyle = m.userData.kind === 'megalodon' ? '#ff1744' : '#ff7043'; ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill(); }
    // other players
    if (state) for (const p of state.players) { if (p.id === world.selfId) continue; const [x, y] = wx(p.x, p.z); ctx.fillStyle = '#' + (p.color || 0xffffff).toString(16).padStart(6, '0'); ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill(); }
    ctx.restore();

    // self arrow
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(ctrl.yaw);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4, 5); ctx.lineTo(-4, 5); ctx.closePath(); ctx.fill();
    ctx.restore();

    // compass
    const deg = ((-ctrl.yaw * 180 / Math.PI) % 360 + 360) % 360;
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    this.compass.textContent = dirs[Math.round(deg / 45) % 8] + ' ' + Math.round(deg) + '°';
  }
}
