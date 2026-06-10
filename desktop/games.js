// Per-game configuration for the desktop shell.
// One Electron codebase; GAME=flotsam|pulsar (or --game=) picks the entry here.
// Used by main.js (runtime), scripts/build.js (packaging), scripts/make-icons.js
// and scripts/stage-game.js (build-time staging).

'use strict';

module.exports = {
  flotsam: {
    id: 'flotsam',
    productName: 'FLOTSAM',
    appId: 'xyz.lisibach.flotsam',
    onlineUrl: 'https://flotsam.lisibach.xyz',
    windowBg: '#06223f',
    icon: {
      style: 'wave',           // wave glyph on deep blue
      bgTop: [4, 24, 48],      // deep navy
      bgBottom: [10, 56, 96],
      bands: [
        { y: 0.42, amp: 0.045, freq: 2.2, phase: 0.0, thick: 0.030, color: [234, 246, 255] },
        { y: 0.55, amp: 0.055, freq: 1.8, phase: 1.7, thick: 0.034, color: [127, 208, 255] },
        { y: 0.69, amp: 0.050, freq: 2.6, phase: 3.1, thick: 0.038, color: [63, 150, 220] },
      ],
    },
  },
  pulsar: {
    id: 'pulsar',
    productName: 'PULSAR',
    appId: 'xyz.lisibach.pulsar',
    onlineUrl: 'https://pulsar.lisibach.xyz',
    windowBg: '#140826',
    icon: {
      style: 'orb',            // neon orb on dark purple
      bgTop: [20, 8, 38],      // dark purple
      bgBottom: [37, 16, 64],
      ring: { radius: 0.27, sigma: 0.045, colorA: [255, 43, 214], colorB: [41, 243, 255] },
      core: { sigma: 0.10, color: [255, 235, 255] },
    },
  },
};
