// stats.js — PULSAR local progression + lifetime stats system.
// Pure ES module, no imports. Persists to localStorage under 'pulsar_stats'.
// Provides XP/level progression and neon HTML widgets for profile/lobby.

const STORAGE_KEY = 'pulsar_stats';

// Default stat shape. Every tracked value is a number.
const DEFAULTS = {
  games: 0,
  wins: 0,
  rounds: 0,
  kos: 0,
  falls: 0,
  blasts: 0,
  dashes: 0,
  pickups: 0,
  bestCombo: 0,
  xp: 0,
  level: 1,
  playtimeRounds: 0,
};

// XP awarded per recorded event. Combo is handled specially (scales with size).
const XP_TABLE = {
  ko: 10,
  win: 60,
  round: 6,
  pickup: 3,
  blast: 1,
};

// Title brackets keyed by minimum level (inclusive). Searched high-to-low.
const TITLES = [
  { min: 20, title: 'LEGEND' },
  { min: 15, title: 'PULSAR ACE' },
  { min: 10, title: 'VOID RUNNER' },
  { min: 6, title: 'NEON DUELIST' },
  { min: 3, title: 'BRAWLER' },
  { min: 1, title: 'ROOKIE' },
];

// XP needed to advance from level L to L+1.
function xpForLevel(L) {
  return 100 + (L - 1) * 60;
}

// Resolve the title string for a given level.
function titleForLevel(level) {
  for (const t of TITLES) {
    if (level >= t.min) return t.title;
  }
  return 'ROOKIE';
}

// Flag so the <style> tag is only injected once across all instances.
let stylesInjected = false;

export class Stats {
  constructor() {
    // Load persisted data and merge over defaults so new fields get filled in.
    let saved = {};
    try {
      const raw =
        typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY);
      if (raw) saved = JSON.parse(raw) || {};
    } catch (e) {
      saved = {};
    }
    this.data = Object.assign({}, DEFAULTS, saved);
    // Guard against corrupt level values.
    if (!(this.data.level >= 1)) this.data.level = 1;

    // Inject neon 'pf-' styles exactly once (no-op in non-DOM environments).
    this._injectStyles();
  }

  // --- persistence ---------------------------------------------------------

  _save() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
      }
    } catch (e) {
      /* storage unavailable / quota — ignore, stats stay in memory */
    }
  }

  // --- recording -----------------------------------------------------------

  // Increment a stat and award XP. `value` is the increment (and combo size).
  record(type, value = 1) {
    const d = this.data;
    switch (type) {
      case 'game':
        d.games += value;
        break;
      case 'win':
        d.wins += value;
        this.addXp(XP_TABLE.win * value);
        break;
      case 'round':
        d.rounds += value;
        d.playtimeRounds += value;
        this.addXp(XP_TABLE.round * value);
        break;
      case 'ko':
        d.kos += value;
        this.addXp(XP_TABLE.ko * value);
        break;
      case 'fall':
        d.falls += value;
        break;
      case 'blast':
        d.blasts += value;
        this.addXp(XP_TABLE.blast * value);
        break;
      case 'dash':
        d.dashes += value;
        break;
      case 'pickup':
        d.pickups += value;
        this.addXp(XP_TABLE.pickup * value);
        break;
      case 'combo':
        // `value` is the combo size; track the best and award a scaling bonus.
        if (value > d.bestCombo) d.bestCombo = value;
        this.addXp(value * 8);
        break;
      default:
        // Unknown type: ignore but still persist nothing extra.
        break;
    }
    this._save();
    return this;
  }

  // Add XP and recompute level by consuming the curve cumulatively.
  addXp(n) {
    if (!n) {
      this._save();
      return this;
    }
    this.data.xp += n;
    this._recomputeLevel();
    this._save();
    return this;
  }

  // Walk levels upward while remaining xp covers the next requirement.
  _recomputeLevel() {
    const d = this.data;
    let level = 1;
    let remaining = d.xp;
    while (remaining >= xpForLevel(level)) {
      remaining -= xpForLevel(level);
      level += 1;
    }
    d.level = level;
  }

  // --- accessors -----------------------------------------------------------

  // Return a defensive copy of the full stats object.
  get() {
    return Object.assign({}, this.data);
  }

  // Level breakdown: progress within the current level toward the next.
  levelInfo() {
    const d = this.data;
    const level = d.level;
    // Total XP consumed to reach the start of the current level.
    let consumed = 0;
    for (let L = 1; L < level; L++) consumed += xpForLevel(L);
    const xpIntoLevel = d.xp - consumed;
    const xpForThis = xpForLevel(level);
    return {
      level,
      xp: d.xp,
      xpIntoLevel,
      xpForLevel: xpForThis,
      progress: xpForThis > 0 ? Math.min(1, xpIntoLevel / xpForThis) : 0,
      title: titleForLevel(level),
    };
  }

  // --- HTML widgets --------------------------------------------------------

  // Inject the shared neon stylesheet a single time.
  _injectStyles() {
    if (stylesInjected) return;
    if (typeof document === 'undefined') return;
    stylesInjected = true;
    const style = document.createElement('style');
    style.id = 'pf-stats-styles';
    style.textContent = `
      .pf-card{font-family:'Segoe UI',system-ui,sans-serif;background:#0a0a14;
        border:1px solid #19d3ff;border-radius:14px;padding:18px 20px;color:#cfe9ff;
        box-shadow:0 0 18px rgba(25,211,255,.35),inset 0 0 24px rgba(255,0,200,.06);
        max-width:340px;}
      .pf-head{display:flex;align-items:center;gap:16px;}
      .pf-ring{position:relative;width:74px;height:74px;border-radius:50%;flex:0 0 auto;
        display:grid;place-items:center;}
      .pf-ring .pf-lvl{font-size:26px;font-weight:800;color:#19d3ff;
        text-shadow:0 0 10px #19d3ff;}
      .pf-title{font-size:18px;font-weight:800;letter-spacing:1px;color:#ff39c8;
        text-shadow:0 0 10px rgba(255,57,200,.7);}
      .pf-sub{font-size:12px;color:#7fb6d6;margin-top:2px;}
      .pf-bar{height:8px;border-radius:6px;background:#10233a;margin:12px 0 6px;
        overflow:hidden;box-shadow:inset 0 0 6px rgba(0,0,0,.6);}
      .pf-fill{height:100%;background:linear-gradient(90deg,#19d3ff,#ff39c8);
        box-shadow:0 0 10px #19d3ff;}
      .pf-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px;}
      .pf-stat{background:#0e1726;border:1px solid #16314a;border-radius:8px;
        padding:8px 6px;text-align:center;}
      .pf-stat b{display:block;font-size:18px;color:#19d3ff;text-shadow:0 0 8px rgba(25,211,255,.6);}
      .pf-stat span{font-size:10px;color:#6f93ac;letter-spacing:1px;text-transform:uppercase;}
      .pf-combo{margin-top:10px;font-size:12px;color:#ff39c8;text-align:center;
        text-shadow:0 0 8px rgba(255,57,200,.5);}
      .pf-banner{font-family:'Segoe UI',system-ui,sans-serif;display:inline-block;
        padding:6px 12px;border-radius:8px;background:#0a0a14;border:1px solid #19d3ff;
        color:#cfe9ff;font-size:13px;letter-spacing:.5px;
        box-shadow:0 0 10px rgba(25,211,255,.3);}
      .pf-banner .pf-b-lvl{color:#19d3ff;font-weight:800;text-shadow:0 0 8px #19d3ff;}
      .pf-banner .pf-b-title{color:#ff39c8;font-weight:700;text-shadow:0 0 8px rgba(255,57,200,.6);}
    `;
    document.head.appendChild(style);
  }

  // Full neon profile card: level ring + progress bar, title, stat grid, combo.
  profileHTML() {
    const info = this.levelInfo();
    const d = this.data;
    const pct = Math.round(info.progress * 100);
    // Conic gradient ring shows progress toward the next level.
    const ringStyle =
      `background:conic-gradient(#19d3ff ${pct}%, #16314a ${pct}%);` +
      `box-shadow:0 0 14px rgba(25,211,255,.5);`;
    const cell = (val, label) =>
      `<div class="pf-stat"><b>${val}</b><span>${label}</span></div>`;
    return (
      `<div class="pf-card">` +
      `<div class="pf-head">` +
      `<div class="pf-ring" style="${ringStyle}">` +
      `<div class="pf-ring" style="background:#0a0a14;width:60px;height:60px;box-shadow:none;">` +
      `<div class="pf-lvl">${info.level}</div></div></div>` +
      `<div><div class="pf-title">${info.title}</div>` +
      `<div class="pf-sub">${info.xpIntoLevel} / ${info.xpForLevel} XP &middot; ${d.xp} total</div></div>` +
      `</div>` +
      `<div class="pf-bar"><div class="pf-fill" style="width:${pct}%"></div></div>` +
      `<div class="pf-grid">` +
      cell(d.wins, 'Wins') +
      cell(d.kos, 'KOs') +
      cell(d.games, 'Games') +
      cell(d.rounds, 'Rounds') +
      cell(d.dashes, 'Dashes') +
      cell(d.pickups, 'Pickups') +
      `</div>` +
      `<div class="pf-combo">BEST COMBO &times;${d.bestCombo}</div>` +
      `</div>`
    );
  }

  // Compact one-line summary for the lobby/banner.
  bannerHTML() {
    const info = this.levelInfo();
    const d = this.data;
    return (
      `<span class="pf-banner">` +
      `<span class="pf-b-lvl">LVL ${info.level}</span> &middot; ` +
      `<span class="pf-b-title">${info.title}</span> &middot; ` +
      `${d.kos} KOs &middot; ${d.wins} wins</span>`
    );
  }
}
