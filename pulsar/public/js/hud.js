// PULSAR — HUD updates. Pure DOM; fed by the game orchestrator each frame.

import { C, PHASE } from '/shared/constants.js';

export class Hud {
  constructor() {
    this.el = {
      hud: document.getElementById('hud'),
      phase: document.getElementById('phaseLabel'),
      alive: document.getElementById('aliveCount'),
      mutTag: document.getElementById('mutatorTag'),
      board: document.getElementById('scoreboard'),
      dashMeter: document.getElementById('dashMeter'),
      dashFill: document.getElementById('dashFill'),
      blastMeter: document.getElementById('blastMeter'),
      blastFill: document.getElementById('blastFill'),
      buffs: document.getElementById('buffStrip'),
      big: document.getElementById('bigMsg'),
      feed: document.getElementById('killfeed'),
      net: document.getElementById('netInfo'),
      flash: document.getElementById('flash'),
      fps: document.getElementById('fps'),
      help: document.getElementById('help'),
      mvp: document.getElementById('mvp'),
    };
  }

  setFps(n) { if (this.el.fps) this.el.fps.textContent = `${n} FPS`; }
  setFpsVisible(on) { if (this.el.fps) this.el.fps.classList.toggle('hidden', !on); }
  toggleHelp() { if (this.el.help) this.el.help.classList.toggle('hidden'); }

  // End-of-round MVP highlight.
  mvp(state, winnerId) {
    if (!this.el.mvp || !state) return;
    const w = state.players.find((p) => p.id === winnerId);
    if (!w) return;
    this.el.mvp.innerHTML = `👑 <b style="color:${w.c}">${esc(w.n)}</b> &nbsp; ${w.k} KOs · ${w.w} wins`;
    this.el.mvp.classList.remove('hidden');
  }
  clearMvp() { if (this.el.mvp) this.el.mvp.classList.add('hidden'); }

  // Quick full-screen color pop on big moments.
  flash(color = '#ff2bd6') {
    const f = this.el.flash;
    f.style.color = color;
    f.classList.add('on');
    clearTimeout(this._ft);
    this._ft = setTimeout(() => f.classList.remove('on'), 70);
  }

  show() { this.el.hud.classList.remove('hidden'); }

  update(state, selfId, names) {
    // Phase banner + clock.
    let label = '', sub = '';
    if (state.phase === PHASE.COUNTDOWN) label = Math.ceil(state.pt) > 0 ? `${Math.ceil(state.pt)}` : 'GO';
    else if (state.phase === PHASE.PLAYING) label = `${Math.ceil(state.rc)}s`;
    else if (state.phase === PHASE.ROUND_END) label = 'ROUND OVER';
    this.el.phase.textContent = label;

    const alive = state.players.filter((p) => p.a).length;
    this.el.alive.textContent = state.phase === PHASE.PLAYING ? `${alive} ORBS LEFT` : '';

    // Scoreboard, sorted by wins then kos.
    const sorted = [...state.players].sort((a, b) => b.w - a.w || b.k - a.k);
    let html = '<div class="sb-title">LEADERBOARD · WINS</div>';
    for (const p of sorted.slice(0, 8)) {
      const cls = ['sb-row'];
      if (!p.a) cls.push('dead');
      if (p.id === selfId) cls.push('me');
      html += `<div class="${cls.join(' ')}">
        <span class="dot" style="background:${p.c};color:${p.c}"></span>
        <span class="nm">${esc(p.n)}${p.b ? ' <span class="bot">BOT</span>' : ''}</span>
        <span class="sc">${p.w}</span></div>`;
    }
    this.el.board.innerHTML = html;

    // Dash meter + buffs for self.
    const me = state.players.find((p) => p.id === selfId);
    if (me) {
      const ready = me.dc <= 0.001;
      const frac = ready ? 1 : 1 - me.dc / C.DASH_COOLDOWN;
      this.el.dashFill.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
      this.el.dashMeter.classList.toggle('ready', ready);

      const bReady = me.bc <= 0.001;
      const bFrac = bReady ? 1 : 1 - me.bc / C.BLAST_COOLDOWN;
      this.el.blastFill.style.width = `${Math.max(0, Math.min(1, bFrac)) * 100}%`;
      this.el.blastMeter.classList.toggle('ready', bReady);

      let bhtml = '';
      if (me.bs) bhtml += '<span class="buff bolt">⚡ BOLT</span>';
      if (me.bh) bhtml += '<span class="buff shield">⬡ SHIELD</span>';
      if (me.bg) bhtml += '<span class="buff giant">◆ GIANT</span>';
      if (me.bf) bhtml += '<span class="buff feather">🪶 FEATHER</span>';
      if (me.bp) bhtml += '<span class="buff phantom">👻 PHANTOM</span>';
      if (me.bt) bhtml += '<span class="buff trident">🔱 TRIDENT</span>';
      if (me.bu) bhtml += '<span class="buff turbo">🚀 TURBO</span>';
      if (me.bm) bhtml += '<span class="buff magnet">🧲 MAGNET</span>';
      if (me.lv > 0) bhtml += `<span class="buff life">❤ ${me.lv}</span>`;
      this.el.buffs.innerHTML = bhtml;
    }
  }

  // Show the active round mutator: a persistent tag + a splashy intro banner.
  mutator(mut) {
    const t = this.el.mutTag;
    if (!mut || mut.id === 'standard') {
      t.classList.add('hidden');
    } else {
      t.textContent = '✦ ' + mut.name;
      t.style.color = mut.color;
      t.classList.remove('hidden');
      this.banner(mut.name, mut.blurb || '', 2600);
    }
  }

  banner(text, sub = '', ms = 2200) {
    this.el.big.innerHTML = `${text}${sub ? `<span class="sub">${sub}</span>` : ''}`;
    this.el.big.classList.remove('hidden');
    // Restart the pop animation.
    this.el.big.style.animation = 'none'; void this.el.big.offsetWidth;
    this.el.big.style.animation = '';
    clearTimeout(this._bt);
    if (ms) this._bt = setTimeout(() => this.el.big.classList.add('hidden'), ms);
  }
  hideBanner() { this.el.big.classList.add('hidden'); }

  feed(text, color = '#00f0ff') {
    const d = document.createElement('div');
    d.className = 'feed'; d.style.borderLeftColor = color; d.innerHTML = text;
    this.el.feed.prepend(d);
    while (this.el.feed.children.length > 5) this.el.feed.lastChild.remove();
    setTimeout(() => d.remove(), 4500);
  }

  net(ping, players, room) {
    this.el.net.textContent = `${ping}ms · ${players} in arena` + (room ? ` · room ${room}` : '');
  }
}

function esc(s) { return String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])); }
