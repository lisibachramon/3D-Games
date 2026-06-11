// PULSAR — client orchestrator. Buffers server snapshots and interpolates other
// orbs (~100ms behind) for smoothness, while predicting our OWN orb locally with
// the shared physics for instant response, gently reconciling to authority.

import * as THREE from 'three';
import { Scene } from '/js/scene.js';
import { Hud } from '/js/hud.js';
import { Input } from '/js/input.js';
import { Audio } from '/js/audio.js';
import { Net } from '/js/net.js';
import { Music } from '/js/music.js';
import { Settings } from '/js/settings.js';
import { Stats } from '/js/stats.js';
import { Minimap } from '/js/minimap.js';
import { integrate } from '/shared/physics.js';
import { C, PHASE } from '/shared/constants.js';

const EMOTES = ['👋', '😎', '😂', '🔥', '💀', '🎯'];

const INTERP_DELAY = 0.1;   // seconds we render behind the newest snapshot
const INPUT_HZ = 30;

export class Game {
  constructor(canvas) {
    this.scene = new Scene(canvas);
    this.hud = new Hud();
    this.input = new Input(canvas, this.scene.camera);
    this.audio = new Audio();
    this.net = new Net();
    this.settings = new Settings();
    this.stats = new Stats();
    this.minimap = new Minimap();

    // Live-apply settings.
    this.settings.onChange((_k, _v, all) => this._applySettings(all));

    this.selfId = null;
    this.snapshots = [];     // { time, state }
    this.latest = null;      // newest raw snapshot (authoritative flags/scores)
    this.self = null;        // predicted orb
    this.names = new Map();
    this.lastInput = 0;
    this.seq = 0;
    this.clock = 0;
    this.deathRadius = 24;

    this._wireNet();
  }

  start(name, color) {
    this.audio.init();
    this.music = new Music(this.audio.ctx, this.audio.musicGain);
    this.music.start();
    this._applySettings(this.settings.values());
    this.stats.record('game');
    this.muted = false;
    addEventListener('keydown', (e) => {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.code === 'KeyM') {
        this.muted = !this.muted;
        this.audio.enabled = !this.muted;
        this.music.setEnabled(!this.muted);
        this.hud.banner(this.muted ? '🔇 MUTED' : '🔊 SOUND ON', '', 800);
      } else if (e.code === 'KeyH') { this.hud.toggleHelp(); this.audio.ui(); }
      else if (e.code === 'KeyF') { this._toggleFullscreen(); }
      else if (/^Digit[1-6]$/.test(e.code)) { this._emote(+e.code.slice(5) - 1); }
    });
    this.net.connect();
    this.net.join(name, color);
    this.hud.show();
    let prev = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      this.frame(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  _applySettings(s) {
    this.scene.applySettings(s);
    this.audio.setVolumes({ master: s.masterVolume, music: s.musicVolume, sfx: s.sfxVolume });
    this.minimap.setVisible(s.showMinimap !== false);
    this.scene.showNames = s.showNames !== false;
    document.body.classList.toggle('cb', !!s.colorblind);
    this._showFps = !!s.showFps;
    this.hud.setFpsVisible(!!s.showFps);
  }

  _toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  }

  _emote(i) {
    if (i < 0 || i >= EMOTES.length) return;
    this.net.send({ t: 'emote', e: i });
    this.audio.ui();
  }

  _wireNet() {
    this.net.on('welcome', (m) => { this.selfId = m.id; this.scene.selfId = m.id; });
    this.net.on('state', (m) => {
      this.latest = m;
      this.snapshots.push({ time: performance.now() / 1000, state: m });
      if (this.snapshots.length > 30) this.snapshots.shift();
      for (const p of m.players) this.names.set(p.id, p);
      this._reconcile(m);
    });
    this.net.on('event', (m) => this._event(m));
    this.net.on('disconnect', () => this.hud.feed('reconnecting…', '#ff5e3a'));
  }

  // Find our predicted orb and softly pull it toward server truth.
  _reconcile(state) {
    const s = state.players.find((p) => p.id === this.selfId);
    if (!s) { this.self = null; return; }
    if (!this.self) {
      this.self = { ...s, x: s.x, y: s.y, z: s.z, vx: s.vx, vy: 0, vz: s.vz,
        dashCooldown: s.dc, dashTime: s.dt, buffs: this._buffsFrom(s),
        scaleMul: 1, alive: !!s.a, falling: !!s.f };
      return;
    }
    // Authoritative scalars copied outright.
    this.self.alive = !!s.a;
    this.self.falling = !!s.f;
    this.self.dashCooldown = s.dc;
    this.self.dashTime = s.dt;
    this.self.buffs = this._buffsFrom(s);

    const err = Math.hypot(s.x - this.self.x, s.z - this.self.z);
    if (err > 3.5 || !this.self.alive) {
      // Knockback, respawn, or fell: trust the server hard.
      this.self.x = s.x; this.self.z = s.z; this.self.y = s.y;
      this.self.vx = s.vx; this.self.vz = s.vz;
    } else {
      // Gentle blend keeps us responsive but converged.
      this.self.x += (s.x - this.self.x) * 0.18;
      this.self.z += (s.z - this.self.z) * 0.18;
      this.self.y += (s.y - this.self.y) * 0.3;
      this.self.vx += (s.vx - this.self.vx) * 0.3;
      this.self.vz += (s.vz - this.self.vz) * 0.3;
    }
  }

  // Mirror server buff flags into prediction-friendly timers (so phantom/turbo
  // affect our own predicted movement).
  _buffsFrom(s) {
    return { speed: s.bs ? 9 : 0, shield: s.bh ? 9 : 0, giant: s.bg ? 9 : 0,
      feather: s.bf ? 9 : 0, phantom: s.bp ? 9 : 0, trident: s.bt ? 9 : 0,
      turbo: s.bu ? 9 : 0, magnet: s.bm ? 9 : 0 };
  }

  _event(m) {
    const pos = (id) => { const p = this.names.get(id); return p ? p : null; };
    switch (m.kind) {
      case 'go': this.audio.go(); this.hud.banner('GO!', '', 900); break;
      case 'dash': { const p = pos(m.id); this.audio.dash(p && this.audio.panX(p.x)); if (p) this.scene.ripple(p.x, p.z, p.c, 4); this.scene.dashFx(m.id); if (m.id === this.selfId) this.stats.record('dash'); break; }
      case 'hit': {
        const p = pos(m.id);
        this.audio.hit(p && this.audio.panX(p.x));
        if (p) { this.scene.burst(p.x, p.z, p.c, 8); this.scene.ripple(p.x, p.z, p.c, 6); }
        this.scene.hitPop(m.id);
        this.scene.shake(0.45);
        if (m.id === this.selfId) this.scene.punch(1.2);
        break;
      }
      case 'fall': { const p = pos(m.id); this.audio.fall(p && this.audio.panX(p.x)); this.scene.shake(0.25); break; }
      case 'pickup': { const p = pos(m.id); this.audio.pickup(m.type, p && this.audio.panX(p.x)); if (m.id === this.selfId) this.stats.record('pickup'); break; }
      case 'revive': {
        const p = pos(m.id);
        this.audio.revive(p && this.audio.panX(p.x));
        if (p) { this.scene.ripple(0, 0, p.c, 16); this.scene.popup(0, 0, 'REVIVE', p.c); }
        if (m.id === this.selfId) this.hud.banner('REVIVED', 'one more chance', 1200);
        break;
      }
      case 'blast': {
        this.audio.blast(this.audio.panX(m.x));
        const blaster = this.names.get(m.id);
        this.scene.ripple(m.x, m.z, blaster ? blaster.c : '#ffffff', 11);
        this.scene.shake(m.id === this.selfId ? 1.0 : 0.5);
        if (m.id === this.selfId) { this.scene.punch(2); this.stats.record('blast'); }
        break;
      }
      case 'multi': {
        const txt = m.n >= 4 ? 'MEGA KO!' : m.n === 3 ? 'TRIPLE KO!' : 'DOUBLE KO!';
        const who = this.names.get(m.id);
        if (who) this.scene.popup(who.x, who.z, txt, who.c);
        if (m.id === this.selfId) { this.hud.banner(txt, '', 1300); this.stats.record('combo', m.n); }
        else if (who) this.hud.feed(`<b style="color:${who.c}">${esc(who.n)}</b> · ${txt}`, who.c);
        this.audio.combo(m.n);
        break;
      }
      case 'emote': {
        const who = this.names.get(m.id);
        if (who) this.scene.popup(who.x, who.z, EMOTES[m.e] || '❓', '#ffffff');
        break;
      }
      case 'ko': {
        const v = pos(m.id);
        this.audio.ko(v && this.audio.panX(v.x));
        if (v) { this.scene.burst(v.x, v.z, v.c, 46); this.scene.ripple(v.x, v.z, v.c, 10); this.scene.beam(v.x, v.z, v.c, 1.6); this.scene.popup(v.x, v.z, 'KO', '#ff2bd6'); }
        this.scene.shake(1.3);
        this.scene.punch(3.2);
        this.hud.flash(m.by === this.selfId ? '#7cff00' : '#ff2bd6');
        const victim = this.names.get(m.id);
        const killer = m.by ? this.names.get(m.by) : null;
        if (victim) {
          const vn = `<b style="color:${victim.c}">${esc(victim.n)}</b>`;
          if (killer) this.hud.feed(`<b style="color:${killer.c}">${esc(killer.n)}</b> ⟶ ${vn}`, killer.c);
          else this.hud.feed(`${vn} fell into the void`, '#888');
        }
        if (m.by === this.selfId) this.stats.record('ko');
        if (m.id === this.selfId) this.hud.banner('KNOCKED OUT', 'spectating…', 1600);
        break;
      }
      case 'round_end': {
        const w = m.winner ? this.names.get(m.winner) : null;
        if (m.winner === this.selfId) { this.audio.win(); this.hud.banner('VICTORY', 'you are the last orb standing', 4000); this.stats.record('win'); }
        else { this.audio.lose(); this.hud.banner(w ? `${esc(w.n)} WINS` : 'DRAW', '', 4000); }
        this.stats.record('round');
        if (w) {
          this.scene.confetti(w.x ?? 0, w.z ?? 0);
          this.scene.spotlight(w.x ?? 0, w.z ?? 0, w.c);
          this.scene.punch(2.2);
          this.hud.flash(w.c);
          this.hud.mvp(this.latest, w.id);
        }
        break;
      }
      case 'round_start': {
        this.hud.hideBanner();
        this.hud.clearMvp();
        if (m.mut) this.hud.mutator(m.mut);
        break;
      }
    }
  }

  // ---- per-frame ----
  frame(dt) {
    this.clock += dt;

    // Predict our own orb from local input.
    if (this.self) {
      this.input.setSelf(this.self);
      const cmd = this.input.sample();
      // Latch one-shot actions so a dash/blast on a non-send frame still ships.
      if (cmd.dash) this.pendingDash = true;
      if (cmd.blast) this.pendingBlast = true;
      if (this.self.alive && !this.self.falling && this.latest && this.latest.phase === PHASE.PLAYING) {
        integrate(this.self, cmd, dt);
      }
      // Throttled input send.
      const nowMs = performance.now();
      if (nowMs - this.lastInput > 1000 / INPUT_HZ) {
        this.lastInput = nowMs;
        this.net.send({ t: 'input', seq: ++this.seq, dx: cmd.dx, dz: cmd.dz,
          dash: !!this.pendingDash, blast: !!this.pendingBlast, aimx: cmd.aimx, aimz: cmd.aimz });
        this.pendingDash = false; this.pendingBlast = false;
      }
      this.scene.setAim(this.input.aimWorld, this.self.alive && !this.self.falling);
    } else {
      this.scene.setAim(null, false);
    }

    // Build the render state: interpolated others + predicted self.
    const players = this._interpolate(performance.now() / 1000 - INTERP_DELAY);
    if (this.self && this.selfId != null) {
      const i = players.findIndex((p) => p.id === this.selfId);
      if (i >= 0) { players[i] = { ...players[i], x: this.self.x, y: this.self.y, z: this.self.z }; }
    }

    const state = this.latest;
    if (state) {
      this.deathRadius += (state.dr - this.deathRadius) * Math.min(1, dt * 5);
      this.scene.sync(players, state.pu || [], this.deathRadius, this.clock, state.haz, state.mut && state.mut.color);
      this.hud.update(state, this.selfId, this.names);
      this.minimap.update(players, this.selfId, this.deathRadius, C.ARENA_RADIUS);
      // Music tension rises as the void closes in.
      if (this.music) {
        const heat = (C.ARENA_RADIUS - state.dr) / (C.ARENA_RADIUS - C.ARENA_MIN_RADIUS);
        this.music.setIntensity(state.phase === PHASE.PLAYING ? Math.max(0.15, Math.min(1, heat)) : 0.12);
      }
      // Countdown beeps.
      if (state.phase === PHASE.COUNTDOWN) {
        const c = Math.ceil(state.pt);
        if (c !== this._lastCount && c > 0) { this.audio.beep(); this._lastCount = c; }
      } else this._lastCount = -1;
      this.hud.net(this.net.ping, state.players.filter((p) => p.a).length + '/' + state.players.length);
    }

    // FPS counter.
    if (this._showFps) {
      this._fpsT = (this._fpsT || 0) + dt; this._fpsN = (this._fpsN || 0) + 1;
      if (this._fpsT >= 0.5) { this.hud.setFps(Math.round(this._fpsN / this._fpsT)); this._fpsT = 0; this._fpsN = 0; }
    }

    // Camera: follow our orb, else drift over the arena center / leader.
    let focus = this.self;
    if (!focus || !focus.alive) {
      const leader = players.slice().sort((a, b) => b.w - a.w)[0];
      focus = leader || { x: 0, y: 0, z: 0 };
    }
    this.scene.follow(new THREE.Vector3(focus.x, focus.y, focus.z), dt);
    this.scene.render(dt);
  }

  // Lerp other orbs between the two snapshots bracketing renderTime.
  _interpolate(renderTime) {
    const snaps = this.snapshots;
    if (snaps.length === 0) return this.latest ? this.latest.players : [];
    let a = null, b = null;
    for (let i = 0; i < snaps.length - 1; i++) {
      if (snaps[i].time <= renderTime && snaps[i + 1].time >= renderTime) { a = snaps[i]; b = snaps[i + 1]; break; }
    }
    if (!a) { return snaps[snaps.length - 1].state.players; }
    const span = b.time - a.time || 1;
    const f = Math.max(0, Math.min(1, (renderTime - a.time) / span));
    const out = [];
    const bById = new Map(b.state.players.map((p) => [p.id, p]));
    for (const pa of a.state.players) {
      const pb = bById.get(pa.id) || pa;
      out.push({ ...pb,
        x: pa.x + (pb.x - pa.x) * f,
        y: pa.y + (pb.y - pa.y) * f,
        z: pa.z + (pb.z - pa.z) * f });
    }
    return out;
  }
}

function esc(s) { return String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])); }
