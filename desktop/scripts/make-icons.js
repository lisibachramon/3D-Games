// Generates a 1024x1024 icon PNG per game into build/<game>/icon.png using
// nothing but Node (zlib + a minimal PNG encoder — no native deps, no canvas).
// electron-builder picks up buildResources/icon.png and converts it to
// .icns (mac) / .ico (win) automatically.
//
// Usage: node scripts/make-icons.js [flotsam|pulsar]   (default: both)

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const GAMES = require('../games');

// ---------------------------------------------------------------------------
// Minimal PNG encoder (8-bit RGBA, no interlace, filter 0 per scanline)
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  // bytes 10..12: compression/filter/interlace = 0
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => a + (b - a) * t;
// Smooth falloff: 1 at d=0, 0 at d>=edge.
const soft = (d, edge) => clamp01(1 - d / edge) ** 2;

function drawIcon(cfg, size) {
  const { icon } = cfg;
  const px = Buffer.alloc(size * size * 4);
  const S = size;

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const v = y / S;
      // Vertical background gradient.
      let r = mix(icon.bgTop[0], icon.bgBottom[0], v);
      let g = mix(icon.bgTop[1], icon.bgBottom[1], v);
      let b = mix(icon.bgTop[2], icon.bgBottom[2], v);

      if (icon.style === 'wave') {
        // Layered sine-wave bands (crests), painted back to front.
        for (const band of icon.bands) {
          const cy = band.y + band.amp * Math.sin(u * Math.PI * 2 * band.freq + band.phase);
          const d = Math.abs(v - cy);
          const a = soft(d, band.thick);
          r = mix(r, band.color[0], a);
          g = mix(g, band.color[1], a);
          b = mix(b, band.color[2], a);
        }
      } else if (icon.style === 'orb') {
        const dx = u - 0.5;
        const dy = v - 0.5;
        const d = Math.sqrt(dx * dx + dy * dy);
        const ang = Math.atan2(dy, dx);
        // Neon ring: gaussian around the radius, hue cycling cyan<->magenta.
        const ringI = Math.exp(-((d - icon.ring.radius) ** 2) / (2 * icon.ring.sigma ** 2));
        const hueT = (Math.sin(ang * 2) + 1) / 2;
        const rc = [
          mix(icon.ring.colorA[0], icon.ring.colorB[0], hueT),
          mix(icon.ring.colorA[1], icon.ring.colorB[1], hueT),
          mix(icon.ring.colorA[2], icon.ring.colorB[2], hueT),
        ];
        // Bright core glow.
        const coreI = Math.exp(-(d ** 2) / (2 * icon.core.sigma ** 2));
        r = clamp01((r + ringI * rc[0] + coreI * icon.core.color[0]) / 255) * 255;
        g = clamp01((g + ringI * rc[1] + coreI * icon.core.color[1]) / 255) * 255;
        b = clamp01((b + ringI * rc[2] + coreI * icon.core.color[2]) / 255) * 255;
      }

      const i = (y * S + x) * 4;
      px[i] = Math.round(clamp01(r / 255) * 255);
      px[i + 1] = Math.round(clamp01(g / 255) * 255);
      px[i + 2] = Math.round(clamp01(b / 255) * 255);
      px[i + 3] = 255;
    }
  }
  return px;
}

// ---------------------------------------------------------------------------

function makeIcon(gameId, size = 1024) {
  const cfg = GAMES[gameId];
  if (!cfg) throw new Error(`unknown game "${gameId}"`);
  const outDir = path.join(__dirname, '..', 'build', gameId);
  fs.mkdirSync(outDir, { recursive: true });
  const png = encodePNG(size, size, drawIcon(cfg, size));
  const outFile = path.join(outDir, 'icon.png');
  fs.writeFileSync(outFile, png);
  console.log(`[icons] wrote ${outFile} (${size}x${size}, ${png.length} bytes)`);
  return outFile;
}

module.exports = { makeIcon };

if (require.main === module) {
  const which = process.argv[2];
  const targets = which ? [which] : Object.keys(GAMES);
  for (const g of targets) makeIcon(g);
}
