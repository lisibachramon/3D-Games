// Settings menu — persisted to localStorage; applies live to renderer/camera/audio/controls.
export class Settings {
  constructor(stage, ctrl, audio) {
    this.stage = stage; this.ctrl = ctrl; this.audio = audio;
    this.def = { sens: 100, volume: 50, fov: 72, dist: 100, fps: false, quality: 100 };
    this.val = { ...this.def, ...this._load() };
    this.fpsEl = null; this._build(); this.apply();
    document.getElementById('gearBtn').addEventListener('click', () => this.toggle());
    document.querySelector('#settingsPanel [data-close]').addEventListener('click', () => this.close());
  }
  _load() { try { return JSON.parse(localStorage.getItem('flotsam_settings') || '{}'); } catch { return {}; } }
  _save() { try { localStorage.setItem('flotsam_settings', JSON.stringify(this.val)); } catch {} }

  _build() {
    const body = document.getElementById('settingsBody');
    const rows = [
      ['sens', 'Mouse sensitivity', 10, 300, 1, '%'],
      ['volume', 'Volume', 0, 100, 1, '%'],
      ['fov', 'Field of view', 55, 100, 1, '°'],
      ['dist', 'Render distance', 40, 100, 1, '%'],
      ['quality', 'Resolution', 50, 100, 1, '%'],
    ];
    body.innerHTML = '';
    for (const [k, label, min, max, step, unit] of rows) {
      const row = document.createElement('div'); row.className = 'set';
      row.innerHTML = `<span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${this.val[k]}"><span class="val">${this.val[k]}${unit}</span>`;
      const slider = row.querySelector('input'), out = row.querySelector('.val');
      slider.addEventListener('input', () => { this.val[k] = +slider.value; out.textContent = slider.value + unit; this.apply(); this._save(); });
      body.appendChild(row);
    }
    // toggles + fullscreen
    const fpsRow = document.createElement('div'); fpsRow.className = 'set';
    fpsRow.innerHTML = `<span>Show FPS</span><input type="checkbox" ${this.val.fps ? 'checked' : ''}>`;
    fpsRow.querySelector('input').addEventListener('change', e => { this.val.fps = e.target.checked; this.apply(); this._save(); });
    body.appendChild(fpsRow);
    const fsRow = document.createElement('div'); fsRow.className = 'set';
    fsRow.innerHTML = `<span>Fullscreen</span><button class="stbtn">Toggle</button>`;
    fsRow.querySelector('button').addEventListener('click', () => { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.(); else document.exitFullscreen?.(); });
    body.appendChild(fsRow);
  }
  apply() {
    if (this.ctrl) this.ctrl.sens = 0.0022 * (this.val.sens / 100);
    if (this.audio?.master) this.audio.master.gain.value = 0.5 * (this.val.volume / 100);
    const cam = this.stage.camera; cam.fov = this.val.fov; cam.far = 400 + (this.val.dist / 100) * 1600; cam.updateProjectionMatrix();
    if (this.stage.scene.fog) this.stage.baseFog = 0.0042 * (1.4 - this.val.dist / 100);
    this.stage.renderer.setPixelRatio(Math.min(devicePixelRatio, 2) * (this.val.quality / 100));
    this.stage.renderer.setSize(innerWidth, innerHeight);
    // fps counter element
    if (this.val.fps && !this.fpsEl) { this.fpsEl = document.createElement('div'); this.fpsEl.id = 'fps'; document.getElementById('game').appendChild(this.fpsEl); }
    if (!this.val.fps && this.fpsEl) { this.fpsEl.remove(); this.fpsEl = null; }
  }
  showFps(v) { if (this.fpsEl) this.fpsEl.textContent = v + ' fps'; }
  toggle() { const p = document.getElementById('settingsPanel'); p.classList.contains('hidden') ? this.open() : this.close(); }
  open() { document.getElementById('settingsPanel').classList.remove('hidden'); document.exitPointerLock?.(); if (this.ctrl) this.ctrl.enabled = false; }
  close() { document.getElementById('settingsPanel').classList.add('hidden'); if (this.ctrl && !this.ctrl.hud.panelOpen) this.ctrl.enabled = true; }
}
