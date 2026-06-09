// PULSAR — Settings store + in-game settings panel.
// Self-contained ES module: no imports. Builds its own DOM + injects its own <style>.
// Neon synthwave styling (cyan #00f0ff / magenta #ff2bd6, dark translucent glass).

const STORAGE_KEY = 'pulsar_settings';

// Default settings (key -> value). The schema below describes how each is edited.
const DEFAULTS = {
  masterVolume: 0.8,
  musicVolume: 0.6,
  sfxVolume: 0.9,
  bloom: true,
  bloomStrength: 0.62,
  screenShake: 1.0,
  reduceMotion: false,
  showNames: true,
  showMinimap: true,
  showFps: false,
  quality: 'high',
  colorblind: false,
  fov: 58,
};

// UI schema: ordered groups of controls. Each control names its setting key + type.
const SCHEMA = [
  { group: 'AUDIO', controls: [
    { key: 'masterVolume', type: 'slider', label: 'Master Volume', min: 0, max: 1, step: 0.01 },
    { key: 'musicVolume', type: 'slider', label: 'Music Volume', min: 0, max: 1, step: 0.01 },
    { key: 'sfxVolume', type: 'slider', label: 'SFX Volume', min: 0, max: 1, step: 0.01 },
  ] },
  { group: 'VISUAL', controls: [
    { key: 'bloom', type: 'toggle', label: 'Bloom' },
    { key: 'bloomStrength', type: 'slider', label: 'Bloom Strength', min: 0, max: 1.5, step: 0.01 },
    { key: 'quality', type: 'segmented', label: 'Quality', options: ['low', 'medium', 'high'] },
    { key: 'fov', type: 'slider', label: 'Field of View', min: 50, max: 80, step: 1 },
    { key: 'colorblind', type: 'toggle', label: 'Colorblind Palette' },
  ] },
  { group: 'GAMEPLAY', controls: [
    { key: 'screenShake', type: 'slider', label: 'Screen Shake', min: 0, max: 1, step: 0.01 },
    { key: 'reduceMotion', type: 'toggle', label: 'Reduce Motion' },
    { key: 'showNames', type: 'toggle', label: 'Show Player Names' },
    { key: 'showMinimap', type: 'toggle', label: 'Show Minimap' },
    { key: 'showFps', type: 'toggle', label: 'Show FPS' },
  ] },
];

const CSS = `
.pulsar-gear{position:fixed;top:14px;left:14px;z-index:7;width:42px;height:42px;
  display:flex;align-items:center;justify-content:center;cursor:pointer;pointer-events:auto;
  font-size:22px;color:#00f0ff;background:rgba(8,12,24,.6);border:1px solid #00f0ff;
  border-radius:10px;box-shadow:0 0 12px rgba(0,240,255,.5);transition:transform .15s,box-shadow .15s;
  font-family:system-ui,sans-serif;user-select:none;}
.pulsar-gear:hover{transform:rotate(45deg);box-shadow:0 0 18px rgba(0,240,255,.9);}
.pulsar-settings-overlay{position:fixed;inset:0;z-index:9;display:none;align-items:center;
  justify-content:center;background:rgba(2,4,10,.6);backdrop-filter:blur(3px);
  font-family:system-ui,sans-serif;}
.pulsar-settings-card{width:min(440px,92vw);max-height:88vh;overflow-y:auto;
  background:linear-gradient(160deg,rgba(12,16,32,.94),rgba(20,10,32,.94));
  border:1px solid #ff2bd6;border-radius:16px;padding:22px 24px;color:#e8f6ff;
  box-shadow:0 0 30px rgba(255,43,214,.45),0 0 60px rgba(0,240,255,.2);}
.pulsar-settings-card h1{margin:0 0 18px;font-size:26px;letter-spacing:6px;text-align:center;
  color:#00f0ff;text-shadow:0 0 14px rgba(0,240,255,.8);font-weight:800;}
.pulsar-grp{margin:18px 0 10px;font-size:12px;letter-spacing:4px;color:#ff2bd6;
  text-shadow:0 0 8px rgba(255,43,214,.7);border-bottom:1px solid rgba(255,43,214,.35);padding-bottom:4px;}
.pulsar-row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:10px 0;}
.pulsar-row label{font-size:14px;color:#cfe9ff;flex:0 0 auto;}
.pulsar-row .ctl{display:flex;align-items:center;gap:10px;flex:1 1 auto;justify-content:flex-end;}
.pulsar-row input[type=range]{flex:1 1 auto;max-width:150px;accent-color:#00f0ff;cursor:pointer;}
.pulsar-val{font-variant-numeric:tabular-nums;min-width:38px;text-align:right;color:#00f0ff;
  font-size:13px;text-shadow:0 0 6px rgba(0,240,255,.6);}
.pulsar-tgl{width:48px;height:24px;border-radius:14px;border:1px solid #00f0ff;cursor:pointer;
  background:rgba(0,240,255,.12);position:relative;transition:background .15s;}
.pulsar-tgl::after{content:'';position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;
  background:#00f0ff;box-shadow:0 0 8px rgba(0,240,255,.8);transition:left .15s,background .15s;}
.pulsar-tgl.on{background:rgba(255,43,214,.3);border-color:#ff2bd6;}
.pulsar-tgl.on::after{left:26px;background:#ff2bd6;box-shadow:0 0 8px rgba(255,43,214,.9);}
.pulsar-seg{display:flex;gap:6px;}
.pulsar-seg button{background:rgba(0,240,255,.08);border:1px solid rgba(0,240,255,.5);color:#9fd9ff;
  padding:4px 10px;border-radius:8px;cursor:pointer;font-size:12px;text-transform:capitalize;transition:all .12s;}
.pulsar-seg button.on{background:rgba(255,43,214,.25);border-color:#ff2bd6;color:#fff;
  box-shadow:0 0 10px rgba(255,43,214,.6);}
.pulsar-close{display:block;width:100%;margin-top:22px;padding:11px;letter-spacing:4px;font-weight:700;
  background:rgba(255,43,214,.15);border:1px solid #ff2bd6;color:#ff8fe6;border-radius:10px;cursor:pointer;
  text-shadow:0 0 8px rgba(255,43,214,.7);transition:all .15s;}
.pulsar-close:hover{background:rgba(255,43,214,.35);color:#fff;box-shadow:0 0 16px rgba(255,43,214,.7);}
`;

export class Settings {
  constructor() {
    // Load persisted values, merge over defaults (ignore unknown / corrupt data).
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch (e) { saved = {}; }
    this._values = { ...DEFAULTS };
    for (const k of Object.keys(DEFAULTS)) {
      if (k in saved) this._values[k] = saved[k];
    }

    this._open = false;
    this._listeners = [];
    this._ctlRefs = {}; // key -> { sync(value) } to reflect external set() calls in the UI

    this._injectStyle();
    this._buildDom();

    // Keyboard: Escape closes the panel.
    this._onKey = (e) => { if (e.key === 'Escape' && this._open) this.close(); };
    window.addEventListener('keydown', this._onKey);
  }

  // ----- public store API -----
  get(key) { return this._values[key]; }

  set(key, value) {
    if (!(key in DEFAULTS)) return;
    if (this._values[key] === value) return;
    this._values[key] = value;
    this._persist();
    if (this._ctlRefs[key]) this._ctlRefs[key].sync(value); // keep UI in sync
    for (const fn of this._listeners) { try { fn(key, value, this.values()); } catch (e) {} }
  }

  values() { return { ...this._values }; }

  onChange(fn) { if (typeof fn === 'function') this._listeners.push(fn); }

  get isOpen() { return this._open; }

  open() { this._open = true; this._overlay.style.display = 'flex'; }
  close() { this._open = false; this._overlay.style.display = 'none'; }
  toggle() { this._open ? this.close() : this.open(); }

  // ----- internals -----
  _persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this._values)); } catch (e) {}
  }

  _injectStyle() {
    if (document.getElementById('pulsar-settings-style')) return;
    const s = document.createElement('style');
    s.id = 'pulsar-settings-style';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  _buildDom() {
    // Gear button (always visible).
    this._gear = document.createElement('div');
    this._gear.className = 'pulsar-gear';
    this._gear.textContent = '⚙'; // gear
    this._gear.title = 'Settings';
    this._gear.addEventListener('click', () => this.toggle());

    // Modal overlay + card (hidden by default).
    this._overlay = document.createElement('div');
    this._overlay.className = 'pulsar-settings-overlay';
    this._overlay.addEventListener('click', (e) => { if (e.target === this._overlay) this.close(); });

    const card = document.createElement('div');
    card.className = 'pulsar-settings-card';
    const title = document.createElement('h1');
    title.textContent = 'SETTINGS';
    card.appendChild(title);

    for (const grp of SCHEMA) {
      const h = document.createElement('div');
      h.className = 'pulsar-grp';
      h.textContent = grp.group;
      card.appendChild(h);
      for (const c of grp.controls) card.appendChild(this._buildControl(c));
    }

    const closeBtn = document.createElement('button');
    closeBtn.className = 'pulsar-close';
    closeBtn.textContent = 'CLOSE';
    closeBtn.addEventListener('click', () => this.close());
    card.appendChild(closeBtn);

    this._overlay.appendChild(card);
    document.body.appendChild(this._gear);
    document.body.appendChild(this._overlay);
  }

  // Build a single labeled control row and wire it to set().
  _buildControl(c) {
    const row = document.createElement('div');
    row.className = 'pulsar-row';
    const label = document.createElement('label');
    label.textContent = c.label;
    row.appendChild(label);

    const ctl = document.createElement('div');
    ctl.className = 'ctl';
    const val = this._values[c.key];

    if (c.type === 'slider') {
      const input = document.createElement('input');
      input.type = 'range';
      input.min = c.min; input.max = c.max; input.step = c.step;
      input.value = val;
      const out = document.createElement('span');
      out.className = 'pulsar-val';
      const fmt = (v) => (c.step < 1 ? Number(v).toFixed(2) : String(v));
      out.textContent = fmt(val);
      input.addEventListener('input', () => {
        const v = Number(input.value);
        out.textContent = fmt(v);
        this.set(c.key, v);
      });
      this._ctlRefs[c.key] = { sync: (v) => { input.value = v; out.textContent = fmt(v); } };
      ctl.appendChild(input);
      ctl.appendChild(out);

    } else if (c.type === 'toggle') {
      const tgl = document.createElement('div');
      tgl.className = 'pulsar-tgl' + (val ? ' on' : '');
      tgl.setAttribute('role', 'switch');
      tgl.addEventListener('click', () => this.set(c.key, !this._values[c.key]));
      this._ctlRefs[c.key] = { sync: (v) => tgl.classList.toggle('on', !!v) };
      ctl.appendChild(tgl);

    } else if (c.type === 'segmented') {
      const seg = document.createElement('div');
      seg.className = 'pulsar-seg';
      const btns = {};
      for (const opt of c.options) {
        const b = document.createElement('button');
        b.textContent = opt;
        b.className = (val === opt ? 'on' : '');
        b.addEventListener('click', () => this.set(c.key, opt));
        btns[opt] = b;
        seg.appendChild(b);
      }
      this._ctlRefs[c.key] = { sync: (v) => {
        for (const o of c.options) btns[o].classList.toggle('on', o === v);
      } };
      ctl.appendChild(seg);
    }

    row.appendChild(ctl);
    return row;
  }
}
