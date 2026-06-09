// PULSAR — all sound is synthesized at runtime (zero audio assets to ship).
// Signal path: per-sound oscillator/noise -> optional stereo panner -> sfx bus
// -> master. Music plugs into its own bus so volumes are independent.

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.enabled = true;
    this._vol = { master: 0.8, music: 0.6, sfx: 0.9 };
  }

  // Must be created after a user gesture (the Play button) per browser policy.
  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5 * this._vol.master;
    this.master.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this._vol.sfx;
    this.sfxGain.connect(this.master);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this._vol.music;
    this.musicGain.connect(this.master);
  }

  setVolumes({ master, music, sfx }) {
    if (master != null) this._vol.master = master;
    if (music != null) this._vol.music = music;
    if (sfx != null) this._vol.sfx = sfx;
    if (!this.ctx) return;
    this.master.gain.value = 0.5 * this._vol.master;
    this.musicGain.gain.value = this._vol.music;
    this.sfxGain.gain.value = this._vol.sfx;
  }

  // Map a world x to a stereo pan in [-1, 1] (arena is ~24 units wide).
  panX(x) { return Math.max(-1, Math.min(1, (x || 0) / 26)); }

  _bus(pan) {
    if (pan == null || !this.ctx.createStereoPanner) return this.sfxGain;
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(this.sfxGain);
    return p;
  }

  _env(node, t, dur, peak, pan) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    node.connect(g); g.connect(this._bus(pan));
    return g;
  }

  _tone(freq, dur, type = 'sine', peak = 0.8, slideTo = null, pan = null) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    this._env(o, t, dur, peak, pan);
    o.start(t); o.stop(t + dur + 0.02);
  }

  _noise(dur, peak = 0.5, filterFreq = 1200, pan = null) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass'; filt.frequency.value = filterFreq; filt.Q.value = 1.2;
    src.connect(filt);
    this._env(filt, t, dur, peak, pan);
    src.start(t); src.stop(t + dur + 0.02);
  }

  dash(pan) { this._tone(220, 0.22, 'sawtooth', 0.4, 760, pan); this._noise(0.18, 0.25, 2200, pan); }
  hit(pan) { this._tone(140, 0.12, 'square', 0.5, 60, pan); this._noise(0.08, 0.4, 800, pan); }
  fall(pan) { this._tone(500, 0.5, 'sine', 0.4, 70, pan); }
  ko(pan) { this._tone(880, 0.18, 'sawtooth', 0.5, 220, pan); this._noise(0.2, 0.3, 1500, pan); }
  go() { this._tone(440, 0.1, 'square', 0.4); this._tone(660, 0.18, 'square', 0.4); }
  beep() { this._tone(560, 0.1, 'square', 0.35); }
  ui() { this._tone(720, 0.05, 'triangle', 0.25); }
  revive(pan) { this._tone(330, 0.25, 'triangle', 0.4, 880, pan); this._tone(660, 0.3, 'sine', 0.3, 990, pan); }

  // Per-power-up pickup tone (distinct pitch per type).
  pickup(type, pan) {
    const pitch = { bolt: 880, shield: 660, giant: 330, feather: 990, phantom: 740,
      trident: 560, turbo: 1040, magnet: 470, life: 784 }[type] || 660;
    this._tone(pitch, 0.08, 'triangle', 0.4, null, pan);
    this._tone(pitch * 1.5, 0.12, 'triangle', 0.35, null, pan);
  }

  blast(pan) {
    this._tone(120, 0.4, 'sawtooth', 0.55, 600, pan);
    this._tone(60, 0.45, 'sine', 0.5, 35, pan);
    this._noise(0.32, 0.45, 1600, pan);
  }
  combo(n) {
    const base = 523;
    const steps = Math.min(n, 5);
    for (let i = 0; i < steps; i++) {
      setTimeout(() => this._tone(base * Math.pow(1.18, i + (n >= 3 ? 1 : 0)), 0.16, 'square', 0.45), i * 70);
    }
  }

  win() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((f, i) => setTimeout(() => this._tone(f, 0.28, 'triangle', 0.5), i * 110));
  }
  lose() { this._tone(330, 0.5, 'sawtooth', 0.35, 110); }
}
