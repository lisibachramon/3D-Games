// PULSAR — procedural SYNTHWAVE / DARKSYNTH background music engine.
// Pure Web Audio API, zero assets. Kavinsky / Carpenter-Brut-lite vibes.
// A lookahead scheduler walks a 4-bar A-minor chord loop and synthesizes
// bass, arp, pad and percussion per-note (oscillators are created and stopped
// per event, never left running, so nothing leaks).

// --- musical constants -----------------------------------------------------
const BPM_BASE = 110;            // base tempo (~108-118 range with intensity)
const STEPS_PER_BAR = 16;        // 16th-note grid
const BARS = 4;                  // loop length
const TOTAL_STEPS = STEPS_PER_BAR * BARS;

// MIDI note -> frequency.
const f = (m) => 440 * Math.pow(2, (m - 69) / 12);

// A natural-minor flavoured progression: Am - F - C - G  (i - VI - III - VII).
// Each entry: { root MIDI, chord tones for pad/arp (relative to root) }.
const PROG = [
  { root: 57, tones: [57, 60, 64] }, // Am  (A C E)
  { root: 53, tones: [53, 57, 60] }, // F   (F A C)
  { root: 48, tones: [48, 52, 55] }, // C   (C E G)
  { root: 55, tones: [55, 59, 62] }, // G   (G B D)
];

// Arp pattern over the chord tones (indices into the bar's tones[]), 1/8 feel.
const ARP_8 = [0, 1, 2, 1, 0, 2, 1, 2];

export class Music {
  constructor(ctx, destination) {
    this.ctx = ctx;
    this.intensity = 0;          // 0..1 tension
    this.enabled = true;
    this.running = false;

    // --- signal graph -----------------------------------------------------
    // master volume — sits modestly UNDER game SFX.
    this.master = ctx.createGain();
    this.master.gain.value = 0.25;

    // global "mood" lowpass that brightens with intensity.
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 600;
    this.filter.Q.value = 0.9;

    // a touch of feedback delay for that neon shimmer (mostly on the arp).
    this.delay = ctx.createDelay(1.0);
    this.delay.delayTime.value = 60 / BPM_BASE / 2; // ~1/8 note echo
    const fb = ctx.createGain(); fb.gain.value = 0.28;
    const wet = ctx.createGain(); wet.gain.value = 0.25;
    this.delay.connect(fb); fb.connect(this.delay);
    this.delay.connect(wet);

    this.filter.connect(this.master);
    wet.connect(this.master);
    this.master.connect(destination);

    // shared noise buffer for hats (avoids reallocating each hit).
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // scheduler state
    this.step = 0;
    this.nextTime = 0;
    this._timer = null;
    this._lookahead = 0.1;       // schedule 100ms ahead
    this._tick = 0.025;          // 25ms scheduler interval
  }

  // -- public API ------------------------------------------------------------
  start() {
    if (this.running) return;    // idempotent
    this.running = true;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.05;
    this._timer = setInterval(() => this._schedule(), this._tick * 1000);
  }

  stop() {
    this.running = false;
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    // fade master to silence quickly to avoid a click.
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(0.0001, t, 0.05);
  }

  setIntensity(x) {
    this.intensity = Math.max(0, Math.min(1, x));
    const t = this.ctx.currentTime;
    // 600Hz -> 5000Hz, smoothly.
    const cutoff = 600 + this.intensity * 4400;
    this.filter.frequency.setTargetAtTime(cutoff, t, 0.4);
  }

  setEnabled(on) {
    this.enabled = !!on;
    const t = this.ctx.currentTime;
    // mute/unmute without losing loop position — scheduler keeps running.
    this.master.gain.setTargetAtTime(this.enabled ? 0.25 : 0.0001, t, 0.08);
  }

  // -- scheduler --------------------------------------------------------------
  _stepDur() {
    // intensity nudges tempo up to ~118 BPM.
    const bpm = BPM_BASE + this.intensity * 8;
    return (60 / bpm) / 4; // a 16th note
  }

  _schedule() {
    if (!this.running) return;
    const dur = this._stepDur();
    while (this.nextTime < this.ctx.currentTime + this._lookahead) {
      this._playStep(this.step, this.nextTime, dur);
      this.nextTime += dur;
      this.step = (this.step + 1) % TOTAL_STEPS;
    }
  }

  _playStep(step, t, dur) {
    const bar = Math.floor(step / STEPS_PER_BAR) % BARS;
    const inBar = step % STEPS_PER_BAR;     // 0..15
    const chord = PROG[bar];
    const I = this.intensity;

    // (1) BASS — driving root eighths, octave-down sawtooth through lowpass.
    if (inBar % 2 === 0) {
      const oct = (inBar % 4 === 0) ? 0 : 12; // root then up an octave for movement
      this._bass(f(chord.root - 12 + (oct ? 12 : 0)), t, dur * 1.9);
    }

    // (3) PAD — soft detuned-saw stack, retriggered each bar with slow attack.
    if (inBar === 0) this._pad(chord.tones, t, dur * STEPS_PER_BAR);

    // (2) ARP — bright pluck following chord tones, 1/8 notes always; add the
    // in-between 1/16 notes at high intensity for extra urgency.
    const eighth = inBar % 2 === 0;
    const arpOn = eighth || (I > 0.6 && inBar % 1 === 0);
    if (arpOn) {
      const idx = ARP_8[(inBar >> 1) % ARP_8.length];
      const note = chord.tones[idx % chord.tones.length] + 12; // up an octave, bright
      this._arp(f(note), t, dur * (eighth ? 1.4 : 0.7), eighth ? 0.18 : 0.1);
    }

    // (4) PERCUSSION — strengthens with intensity.
    // Kick on beats (every 4 steps); reinforced backbeat as it heats up.
    if (inBar % 4 === 0) this._kick(t);
    else if (I > 0.5 && inBar % 4 === 2) this._kick(t, 0.7);

    // Closed hats: offbeat 8ths from low intensity, full 16ths when hot.
    const hatHere = (inBar % 2 === 1) || (I > 0.65);
    if (hatHere) this._hat(t, 0.1 + I * 0.25);
  }

  // -- voices -----------------------------------------------------------------
  _bass(freq, t, dur) {
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 400 + this.intensity * 600;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp); lp.connect(g); g.connect(this.filter);
    o.start(t); o.stop(t + dur + 0.02);
  }

  _arp(freq, t, dur, peak) {
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.filter);   // dry
    g.connect(this.delay);    // + echo tail
    o.start(t); o.stop(t + dur + 0.02);
  }

  _pad(tones, t, dur) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.09, t + dur * 0.4); // slow swell
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    g.connect(this.filter);
    // detuned saw stack per chord tone (one octave below the arp).
    for (const m of tones) {
      for (const det of [-6, 6]) {
        const o = this.ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f(m);
        o.detune.value = det;
        o.connect(g);
        o.start(t); o.stop(t + dur + 0.05);
      }
    }
  }

  _kick(t, peak = 1) {
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12); // pitch drop = punch
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.9 * peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g); g.connect(this.master); // kick bypasses mood filter for thump
    o.start(t); o.stop(t + 0.2);
  }

  _hat(t, peak) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04); // short, ticky
    src.connect(hp); hp.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 0.05);
  }
}
