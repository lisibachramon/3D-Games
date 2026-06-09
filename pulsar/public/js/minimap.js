// PULSAR — minimap.js
// Self-contained 2D-canvas minimap for the top-down neon arena.
// Pure ES module, no imports. Creates its own canvas + style and draws
// synchronously from update() (called once per game frame).

const SIZE = 150;            // CSS pixels (square)
const FILL_FRAC = 0.46;      // arenaRadius maps to this fraction of canvas size
const CYAN = '#00f0ff';

export class Minimap {
  constructor() {
    // Inject scoped styles once.
    if (!document.getElementById('pulsar-minimap-style')) {
      const style = document.createElement('style');
      style.id = 'pulsar-minimap-style';
      style.textContent = `
        #pulsar-minimap {
          position: fixed;
          left: 16px;
          bottom: 16px;
          width: ${SIZE}px;
          height: ${SIZE}px;
          z-index: 5;
          border-radius: 50%;
          background: rgba(4, 8, 16, 0.55);
          border: 1px solid rgba(0, 240, 255, 0.35);
          box-shadow: 0 0 12px rgba(0, 240, 255, 0.25),
                      inset 0 0 18px rgba(0, 240, 255, 0.08);
          pointer-events: none;
          display: none;
        }`;
      document.head.appendChild(style);
    }

    this.canvas = document.createElement('canvas');
    this.canvas.id = 'pulsar-minimap';
    this.ctx = this.canvas.getContext('2d');

    // Handle HiDPI: backing store scaled by devicePixelRatio, drawn in CSS px.
    this.dpr = Math.max(1, window.devicePixelRatio || 1);
    this.canvas.width = SIZE * this.dpr;
    this.canvas.height = SIZE * this.dpr;
    this.ctx.scale(this.dpr, this.dpr);

    document.body.appendChild(this.canvas);
    this._visible = false; // hidden until first update()
  }

  // Map a world coordinate (x or z) to a canvas pixel coordinate.
  // World range [-arenaRadius, arenaRadius] -> [center - r, center + r],
  // where r = SIZE * FILL_FRAC. Returns canvas px (post-dpr-scale space).
  _project(world, arenaRadius) {
    const center = SIZE / 2;
    const r = SIZE * FILL_FRAC;
    return center + (world / arenaRadius) * r;
  }

  // players: [{ id, x, z, c, a, b }], selfId, deathRadius, arenaRadius (world units)
  update(players, selfId, deathRadius, arenaRadius) {
    if (!this._visible) this.setVisible(true);
    const ctx = this.ctx;
    const center = SIZE / 2;
    const r = SIZE * FILL_FRAC;

    ctx.clearRect(0, 0, SIZE, SIZE);

    // Arena base disc (faint).
    ctx.beginPath();
    ctx.arc(center, center, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 240, 255, 0.05)';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.20)';
    ctx.stroke();

    // Shrinking death ring (glowing cyan circle).
    if (arenaRadius > 0 && deathRadius > 0) {
      const dr = (deathRadius / arenaRadius) * r;
      ctx.save();
      ctx.beginPath();
      ctx.arc(center, center, dr, 0, Math.PI * 2);
      ctx.shadowColor = CYAN;
      ctx.shadowBlur = 8;
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = CYAN;
      ctx.stroke();
      ctx.restore();
    }

    if (!players) return;

    // Player dots. Draw self last so it sits on top.
    let self = null;
    for (const p of players) {
      if (p.id === selfId) { self = p; continue; }
      this._dot(p, selfId, arenaRadius);
    }
    if (self) this._dot(self, selfId, arenaRadius);
  }

  _dot(p, selfId, arenaRadius) {
    const ctx = this.ctx;
    const isSelf = p.id === selfId;

    // Dead players: omit (or render very faint). We render faint.
    const alive = p.a !== 0;
    const px = this._project(p.x, arenaRadius);
    const py = this._project(p.z, arenaRadius);

    ctx.save();
    if (!alive) ctx.globalAlpha = 0.18;
    else if (p.b) ctx.globalAlpha = 0.7; // bots slightly dimmer

    if (isSelf) {
      // Self: larger dot with a white outline.
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fillStyle = p.c || '#ffffff';
      ctx.shadowColor = p.c || '#ffffff';
      ctx.shadowBlur = 6;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fillStyle = p.c || '#ff44aa';
      ctx.fill();
    }
    ctx.restore();
  }

  setVisible(on) {
    this._visible = !!on;
    this.canvas.style.display = on ? 'block' : 'none';
  }
}
