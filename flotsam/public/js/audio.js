// Procedural sound effects + ambient ocean. Zero audio files — all synthesized.
export class Audio {
  constructor() { this.ctx = null; this.master = null; this.started = false; }
  start() {
    if (this.started) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.5; this.master.connect(this.ctx.destination);
    this.started = true;
    this._ambient();
  }
  _env(node, t, a, d, peak = 1) {
    const g = node.gain; g.cancelScheduledValues(t);
    g.setValueAtTime(0.0001, t); g.exponentialRampToValueAtTime(peak, t + a);
    g.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  tone(freq, { type = 'sine', a = 0.005, d = 0.15, gain = 0.3, slide = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + a + d);
    o.connect(g); g.connect(this.master); this._env(g, t, a, d, gain);
    o.start(t); o.stop(t + a + d + 0.05);
  }
  noise(dur = 0.3, { gain = 0.3, hp = 400, lp = 4000 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const g = this.ctx.createGain(); g.gain.value = gain;
    const f1 = this.ctx.createBiquadFilter(); f1.type = 'highpass'; f1.frequency.value = hp;
    const f2 = this.ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = lp;
    src.connect(f1); f1.connect(f2); f2.connect(g); g.connect(this.master);
    src.start(t);
  }
  _ambient() {
    // slow wash of filtered noise = waves
    const n = this.ctx.createBufferSource();
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    n.buffer = buf; n.loop = true;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
    const g = this.ctx.createGain(); g.gain.value = 0.05;
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.12;
    const lfoG = this.ctx.createGain(); lfoG.gain.value = 0.03;
    lfo.connect(lfoG); lfoG.connect(g.gain);
    n.connect(lp); lp.connect(g); g.connect(this.master);
    n.start(); lfo.start();
  }
  pickup() { this.tone(660, { type: 'triangle', d: 0.1, gain: 0.25 }); this.tone(990, { type: 'triangle', a: 0.04, d: 0.12, gain: 0.2 }); }
  build()  { this.noise(0.12, { gain: 0.25, hp: 200, lp: 2000 }); this.tone(180, { type: 'square', d: 0.12, gain: 0.18 }); }
  craft()  { this.tone(520, { type: 'triangle', d: 0.12, gain: 0.22 }); setTimeout(() => this.tone(780, { type: 'triangle', d: 0.12, gain: 0.2 }), 80); }
  splash() { this.noise(0.35, { gain: 0.3, hp: 300, lp: 3500 }); }
  bite()   { this.tone(110, { type: 'sawtooth', d: 0.25, gain: 0.4, slide: -60 }); this.noise(0.2, { gain: 0.35, hp: 100, lp: 1200 }); }
  hit()    { this.tone(220, { type: 'square', d: 0.12, gain: 0.3, slide: -80 }); }
  hurt()   { this.tone(160, { type: 'sawtooth', d: 0.2, gain: 0.3, slide: -40 }); }
  eat()    { this.tone(300, { type: 'sine', d: 0.18, gain: 0.2 }); }
  alarm()  { for (let i = 0; i < 3; i++) setTimeout(() => this.tone(880, { type: 'square', d: 0.15, gain: 0.3 }), i * 220); }
  victory(){ [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, { type: 'triangle', d: 0.35, gain: 0.3 }), i * 150)); }
  death()  { [330, 262, 196, 130].forEach((f, i) => setTimeout(() => this.tone(f, { type: 'sawtooth', d: 0.4, gain: 0.3 }), i * 200)); }
  thunder(){ this.noise(1.4, { gain: 0.4, hp: 40, lp: 600 }); this.tone(55, { type: 'sine', d: 1.2, gain: 0.3, slide: -20 }); }
  sting()  { this.tone(700, { type: 'sine', d: 0.2, gain: 0.25, slide: 200 }); }
  music() {
    if (!this.ctx || this._music) return; this._music = true;
    const notes = [110, 164.81, 220, 246.94]; // slow ambient pad
    const bus = this.ctx.createGain(); bus.gain.value = 0.04; bus.connect(this.master);
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; lp.connect(bus);
    notes.forEach((f, i) => { const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; const g = this.ctx.createGain(); g.gain.value = 0.0; o.connect(g); g.connect(lp);
      const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.03 + i * 0.017; const lg = this.ctx.createGain(); lg.gain.value = 0.5; lfo.connect(lg); lg.connect(g.gain);
      o.start(); lfo.start(); });
  }
}
