import { ITEMS, RECIPES, BUILDABLES, SURVIVAL, GAME, EMOTES } from './config.js';

const $ = (id) => document.getElementById(id);
const BASE_TOOLS = ['hook', 'hammer', 'spear', 'rod'];
const TOOL_ORDER = ['hook', 'hammer', 'axe', 'machete', 'spear', 'metalspear', 'rod', 'fishnet', 'bow', 'bucket', 'torch'];

export class HUD {
  constructor(net, audio) {
    this.net = net; this.audio = audio; this.ctrl = null; this.world = null;
    this.inv = {}; this.dur = {}; this.storage = {};
    this.hotbar = [...BASE_TOOLS]; this.activeSlot = 0; this.stamina = 100;
    this.typing = false; this.panelOpen = false; this.buildOpen = false; this.emoteOpen = false;
    this.buildables = Object.keys(BUILDABLES); this.buildSel = 0; this.curStorage = null;
    this._bindUI(); this.renderHotbar(); this.renderEmotes();
  }
  bind(ctrl) { this.ctrl = ctrl; }

  _bindUI() {
    document.querySelectorAll('[data-close]').forEach(x => x.addEventListener('click', () => this.closeAll()));
    $('depositAll').addEventListener('click', () => { if (this.curStorage) this.net.send({ t: 'station', gx: this.curStorage.gx, gz: this.curStorage.gz, action: 'depositResources' }); });
    const ci = $('chatInput');
    ci.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { const v = ci.value.trim(); if (v) this.net.send({ t: 'chat', msg: v }); ci.value = ''; this._closeChat(); } else if (e.key === 'Escape') { ci.value = ''; this._closeChat(); } });
  }

  hasStation(s) { if (!this.world) return false; for (const e of this.world.props.values()) if (BUILDABLES[e.userData.type]?.station === s) return true; return false; }
  setInventory(inv, dur) { this.inv = inv || {}; this.dur = dur || {}; this._rebuildHotbar(); this.refreshPanels(); this.renderHotbar(); }
  setStorage(s) { this.storage = s || {}; if (this.panelOpen === 'storage') this.renderStorage(); }
  has(item, q = 1) { return (this.inv[item] || 0) >= q; }
  canAfford(cost) { for (const k in cost) if (!this.has(k, cost[k])) return false; return true; }

  _rebuildHotbar() {
    const extras = TOOL_ORDER.filter(t => !BASE_TOOLS.includes(t) && this.inv[t]);
    this.hotbar = [...BASE_TOOLS, ...extras].slice(0, 9);
    if (this.activeSlot >= this.hotbar.length) this.activeSlot = 0;
  }

  // ---- vitals ----
  updateSelf(p) {
    if (!p) return; this.stamina = p.stamina;
    $('hpFill').style.width = (p.hp / SURVIVAL.MAX * 100) + '%';
    $('hungerFill').style.width = (p.hunger / SURVIVAL.MAX * 100) + '%';
    $('thirstFill').style.width = (p.thirst / SURVIVAL.MAX * 100) + '%';
    $('oxyFill').style.width = (p.oxygen / SURVIVAL.OXYGEN_MAX * 100) + '%';
    $('staFill').style.width = (p.stamina / SURVIVAL.STAMINA_MAX * 100) + '%';
    $('tempFill').style.width = (p.temp / SURVIVAL.TEMP_MAX * 100) + '%';
    $('oxyBar').style.opacity = p.oxygen < SURVIVAL.OXYGEN_MAX - 1 ? 1 : 0.35;
    $('tempBar').style.opacity = p.temp < 40 ? 1 : 0.35;
  }
  updateTop(state, nearestShark) {
    const tf = state.time / GAME.DAY_LENGTH;
    const icon = state.night ? '🌙' : (tf < 0.3 || tf > 0.7 ? '🌅' : '☀️');
    $('clock').textContent = `${icon} Day ${state.day}`;
    const wicon = { clear: '☀️', cloudy: '☁️', rain: '🌧️', storm: '⛈️' }[state.weather] || '☀️';
    $('weather').textContent = `${wicon} ${state.weather[0].toUpperCase() + state.weather.slice(1)}` + (state.sail ? ' ⛵' : '') + (state.anchored ? ' ⚓' : '');
    $('players').textContent = `👥 ${state.players.length}`;
    const sb = $('sharkbar');
    if (nearestShark && nearestShark.d < 60) { sb.classList.remove('hidden'); $('sharkFill').style.width = (nearestShark.hp / nearestShark.maxhp * 100) + '%'; $('sharkName').textContent = nearestShark.boss ? '☠ MEGALODON' : '🦈'; }
    else sb.classList.add('hidden');
    const eg = $('endgame');
    if (state.endgame != null) { eg.classList.remove('hidden'); eg.textContent = `📡 RESCUE IN ${state.endgame}s — SURVIVE!`; } else eg.classList.add('hidden');
    this.updateCrew(state); this.updateObjective(state);
  }
  updateCrew(state) {
    const el = $('crewlist'); el.innerHTML = '';
    for (const p of state.players) {
      const d = document.createElement('div'); d.className = 'crew';
      const col = '#' + (p.color || 0xffffff).toString(16).padStart(6, '0');
      d.innerHTML = `<span class="dot" style="background:${col}"></span><span class="${p.downed ? 'down' : ''}">${p.name}${p.downed ? ' (down)' : ''}</span><span class="mini"><i style="width:${p.hp}%"></i></span>`;
      el.appendChild(d);
    }
  }
  updateObjective(state) {
    let g;
    if (!this.hasStation('workbench')) g = 'Hook debris for <b>wood/scrap</b>, then build a <b>Workbench</b> (B).';
    else if (!this.hasStation('furnace')) g = 'Dive (Ctrl) with an <b>Axe</b> for <b>stone</b>, then build a <b>Furnace</b>.';
    else if (!this.hasStation('anvil')) g = 'Smelt <b>metal</b> at the furnace, then build an <b>Anvil</b>.';
    else if (!this.hasStation('research')) g = 'Build a <b>Research Table</b> to unlock end-game tech.';
    else if (!(this.world && [...this.world.props.values()].some(e => e.userData.type === 'beacon'))) g = 'Craft a <b>Beacon Core</b> + <b>Battery</b>, then build the <b>Rescue Beacon</b>.';
    else if (state.endgame == null) g = 'Stand by the <b>Beacon</b> and press <b>E</b> to call for rescue!';
    else g = '🔥 <b>SURVIVE THE MEGALODON</b> until rescue arrives!';
    $('objective').innerHTML = '🎯 ' + g;
  }

  // ---- hotbar ----
  renderHotbar() {
    const el = $('hotbar'); el.innerHTML = '';
    this.hotbar.forEach((tool, i) => {
      const it = ITEMS[tool]; const owned = this.has(tool);
      const d = document.createElement('div'); d.className = 'slot' + (i === this.activeSlot ? ' active' : ''); d.style.opacity = owned ? 1 : 0.4;
      let durBar = ''; if (owned && it.dur && it.dur < 999 && this.dur[tool] != null) durBar = `<i style="position:absolute;bottom:0;left:0;height:3px;background:#7be6ff;width:${Math.round(this.dur[tool] / it.dur * 100)}%"></i>`;
      d.innerHTML = `<span class="k">${i + 1}</span>${it.icon}<span class="nm">${it.name}</span>${durBar}`;
      d.onclick = () => this.ctrl?.selectTool(i); el.appendChild(d);
    });
  }
  setActiveSlot(i) { this.activeSlot = i; this.renderHotbar(); }

  // ---- emotes ----
  renderEmotes() { const bar = $('emotebar'); bar.innerHTML = ''; EMOTES.forEach(e => { const d = document.createElement('div'); d.className = 'em'; d.textContent = e; d.onclick = () => { this.net.send({ t: 'emote', e }); this.toggleEmote(); }; bar.appendChild(d); }); }
  toggleEmote() { this.emoteOpen = !this.emoteOpen; const bar = $('emotebar'); if (this.emoteOpen) { bar.classList.remove('hidden'); document.exitPointerLock?.(); } else bar.classList.add('hidden'); }

  // ---- toasts / hint / chat ----
  toast(msg) { const t = $('toasts'); const d = document.createElement('div'); d.className = 'toast'; d.textContent = msg; t.appendChild(d); setTimeout(() => d.remove(), 2600); }
  hint(html) { const h = $('hint'); if (!html) h.classList.remove('show'); else { h.innerHTML = html; h.classList.add('show'); } }
  addChat(name, msg) {
    const log = $('chatlog'); const d = document.createElement('div'); d.className = 'line';
    const sea = (name === 'SEA' || name === 'BEACON' || name === 'BOTTLE');
    d.innerHTML = `<span class="${sea ? 'sea' : 'nm'}">${name}:</span> ${this._esc(msg)}`;
    log.appendChild(d); while (log.children.length > 8) log.firstChild.remove();
    setTimeout(() => { if (d.parentNode) { d.style.opacity = 0; d.style.transition = 'opacity 1s'; } }, 9000);
    setTimeout(() => d.remove(), 11000);
  }
  _esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  openChat() { if (this.typing) return; this.typing = true; document.exitPointerLock?.(); const ci = $('chatInput'); ci.classList.remove('hidden'); ci.focus(); }
  _closeChat() { this.typing = false; $('chatInput').classList.add('hidden'); }

  // ---- build palette ----
  toggleBuild() {
    if (this.panelOpen) this.closeAll();
    this.buildOpen = !this.buildOpen; const bar = $('buildbar');
    if (this.buildOpen) { bar.classList.remove('hidden'); this.renderBuild(); this.selectBuild(this.buildSel); }
    else { bar.classList.add('hidden'); if (this.ctrl) this.ctrl.buildKind = null; }
  }
  renderBuild() {
    const bar = $('buildbar'); bar.innerHTML = '';
    this.buildables.forEach((k, i) => {
      const b = BUILDABLES[k]; const locked = b.req && !this.hasStation(b.req);
      const d = document.createElement('div'); d.className = 'bslot' + (i === this.buildSel ? ' sel' : '') + ((this.canAfford(b.in) && !locked) ? '' : ' cant');
      const cost = Object.entries(b.in).map(([m, q]) => `${q}${ITEMS[m].icon}`).join(' ');
      d.innerHTML = `<span class="bi">${b.icon}</span>${b.name}<span class="cost">${locked ? '🔒' + this._stationName(b.req) : cost}</span>`;
      d.onclick = () => this.selectBuild(i); bar.appendChild(d);
    });
  }
  _stationName(s) { const k = Object.keys(BUILDABLES).find(x => BUILDABLES[x].station === s); return k ? BUILDABLES[k].name : s; }
  selectBuild(i) { if (i < 0 || i >= this.buildables.length) return; this.buildSel = i; if (this.ctrl) this.ctrl.setBuildKind(this.buildables[i]); this.renderBuild(); this.hint(`<b>Click</b> place ${BUILDABLES[this.buildables[i]].name} · <b>right-click</b> remove`); }
  cycleBuild(dir) { this.selectBuild((this.buildSel + dir + this.buildables.length) % this.buildables.length); }

  // ---- panels ----
  _setPanel(name) { this.panelOpen = name; if (name) { document.exitPointerLock?.(); if (this.ctrl) this.ctrl.enabled = false; } else if (this.ctrl) this.ctrl.enabled = true; }
  toggleCraft() { if (this.panelOpen === 'craft') return this.closeAll(); this.closeAll(); $('craftPanel').classList.remove('hidden'); this._setPanel('craft'); this.renderCraft(); }
  openStorage(gx, gz) { this.closeAll(); this.curStorage = { gx, gz }; $('storagePanel').classList.remove('hidden'); this._setPanel('storage'); this.renderStorage(); }
  closeAll() {
    $('craftPanel').classList.add('hidden'); $('storagePanel').classList.add('hidden'); $('buildbar').classList.add('hidden'); $('emotebar').classList.add('hidden');
    const sp = $('settingsPanel'); if (sp) sp.classList.add('hidden');
    this.buildOpen = false; this.emoteOpen = false; if (this.ctrl) this.ctrl.buildKind = null; this._closeChat(); this._setPanel(false);
  }
  refreshPanels() { if (this.panelOpen === 'craft') this.renderCraft(); if (this.panelOpen === 'storage') this.renderStorage(); if (this.buildOpen) this.renderBuild(); }

  renderCraft() {
    const rl = $('recipeList'); rl.innerHTML = '';
    for (const key in RECIPES) {
      const r = RECIPES[key]; const out = Object.keys(r.out)[0]; const it = ITEMS[out];
      const locked = r.req && !this.hasStation(r.req); const ok = this.canAfford(r.in) && !locked;
      const req = Object.entries(r.in).map(([m, q]) => `${ITEMS[m].icon}${q}`).join(' ') + (r.req ? `  <span style="color:#ff9">@${this._stationName(r.req)}</span>` : '');
      const d = document.createElement('div'); d.className = 'row ' + (ok ? 'craftable' : 'locked');
      d.innerHTML = `<span class="ri">${it.icon}</span><span class="rn">${it.name}${r.out[out] > 1 ? ' ×' + r.out[out] : ''}<br><span class="req">${req}</span></span>`;
      if (ok) d.onclick = () => this.net.send({ t: 'craft', recipe: key });
      rl.appendChild(d);
    }
    this._renderInv($('invList'), true);
  }
  _renderInv(el, consumable) {
    el.innerHTML = ''; const keys = Object.keys(this.inv).filter(k => this.inv[k] > 0).sort();
    if (!keys.length) { el.innerHTML = '<div class="row"><span class="rn" style="opacity:.6">empty…</span></div>'; return; }
    for (const k of keys) { const it = ITEMS[k]; if (!it) continue; const d = document.createElement('div'); d.className = 'row';
      d.innerHTML = `<span class="ri">${it.icon}</span><span class="rn">${it.name}</span><span class="rq">×${this.inv[k]}</span>`;
      if (consumable && (it.kind === 'food' || it.kind === 'drink')) { d.classList.add('craftable'); d.onclick = () => this.net.send({ t: 'consume', item: k }); }
      el.appendChild(d); }
  }
  renderStorage() {
    const inv = $('stInv'), st = $('stStore'); inv.innerHTML = ''; st.innerHTML = '';
    const mk = (parent, item, qty, action) => { const it = ITEMS[item]; if (!it) return; const d = document.createElement('div'); d.className = 'row craftable';
      d.innerHTML = `<span class="ri">${it.icon}</span><span class="rn">${it.name}</span><span class="rq">×${qty}</span>`;
      d.onclick = () => this.net.send({ t: 'station', gx: this.curStorage.gx, gz: this.curStorage.gz, action, item, qty }); parent.appendChild(d); };
    for (const k of Object.keys(this.inv).sort()) if (this.inv[k] > 0) mk(inv, k, this.inv[k], 'deposit');
    for (const k of Object.keys(this.storage).sort()) if (this.storage[k] > 0) mk(st, k, this.storage[k], 'withdraw');
    if (!inv.children.length) inv.innerHTML = '<div class="row"><span class="rn" style="opacity:.6">empty…</span></div>';
    if (!st.children.length) st.innerHTML = '<div class="row"><span class="rn" style="opacity:.6">empty…</span></div>';
  }

  quickEat() { let best = null, val = 0; for (const k in this.inv) { const it = ITEMS[k]; if (it && it.kind === 'food' && this.inv[k] > 0 && (it.hunger || 0) > val) { val = it.hunger; best = k; } } if (best) { this.net.send({ t: 'consume', item: best }); this.audio.eat(); } else this.toast('No food. Hook a barrel or catch a fish!'); }
  quickDrink() { let best = null, val = 0; for (const k in this.inv) { const it = ITEMS[k]; if (it && (it.thirst || 0) > val && this.inv[k] > 0) { val = it.thirst; best = k; } } if (best) { this.net.send({ t: 'consume', item: best }); this.audio.eat(); } else this.toast('No fresh water. Build a Purifier/Rain Collector!'); }

  // ---- death / downed / victory ----
  showDeath() {
    this.audio.death(); const v = $('veil'), p = $('veilPanel');
    p.innerHTML = `<h1 style="color:#ff6b6b">💀 You drowned</h1><p class="tag">The sea is patient. Respawn at your bed (or the raft).</p><button id="respawnBtn">RESPAWN</button>`;
    v.classList.remove('hidden'); document.exitPointerLock?.(); if (this.ctrl) this.ctrl.alive = false;
    $('respawnBtn').onclick = () => this.net.send({ t: 'respawn' });
  }
  showDowned() { this.audio.hurt(); const eg = $('endgame'); eg.classList.remove('hidden'); eg.style.background = 'rgba(120,0,0,.9)'; eg.textContent = '🆘 DOWNED — a crewmate must revive you!'; }
  clearDowned() { const eg = $('endgame'); eg.style.background = ''; }
  hideVeil() { $('veil').classList.add('hidden'); }
  showVictory() {
    this.audio.victory(); const v = $('veil'), p = $('veilPanel');
    p.innerHTML = `<h1>🚁 RESCUED!</h1><p class="tag">You built a beacon, survived the Megalodon, and got out alive. Legends of FLOTSAM. ⛵</p><div class="btnrow"><button id="keepBtn">KEEP SAILING</button></div>`;
    v.classList.remove('hidden'); document.exitPointerLock?.(); $('keepBtn').onclick = () => this.hideVeil();
  }
}
