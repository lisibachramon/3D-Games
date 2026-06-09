// PULSAR — self-contained mobile touch controls (no imports, pure ES module).
// LEFT half: floating virtual joystick that springs up wherever you press.
// RIGHT half: a fixed neon "DASH" button in the bottom-right corner.
// Activates only on touch-capable devices; otherwise everything stays hidden
// so it never steals events on desktop.

const CYAN = '#00f0ff';
const MAGENTA = '#ff2bd6';
const MAX_RADIUS = 60; // px the thumb can travel from the joystick base

export class TouchControls {
  constructor() {
    // Feature-detect touch. We freeze this once: orientation/resize won't change it.
    this._isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

    // Joystick state.
    this._joyId = null;         // identifier of the finger driving the stick (or null)
    this._baseX = 0;            // screen px where the base is centered
    this._baseY = 0;
    this._vecX = 0;             // normalized [-1..1], +x = right
    this._vecY = 0;             // normalized [-1..1], +y = up (screen Y inverted)
    this._active = false;

    // Dash edge-trigger: set on tap, consumed (cleared) on the next sample().
    this._dashEdge = false;

    this._injectStyle();
    this._buildDom();

    if (this._isTouch) {
      this._wire();
    } else {
      this.setVisible(false);
    }
  }

  // ---- Public API ---------------------------------------------------------

  get isTouch() {
    return this._isTouch;
  }

  // Snapshot of current control state. dash is edge-triggered: true exactly
  // once per tap, then cleared so the caller never double-fires a dash.
  sample() {
    const dash = this._dashEdge;
    this._dashEdge = false;
    return {
      active: this._active,
      x: this._vecX,
      y: this._vecY,
      dash,
    };
  }

  setVisible(on) {
    this._root.style.display = on && this._isTouch ? 'block' : 'none';
  }

  // ---- DOM + style --------------------------------------------------------

  _injectStyle() {
    if (document.getElementById('pulsar-touch-style')) return;
    const s = document.createElement('style');
    s.id = 'pulsar-touch-style';
    s.textContent = `
      #pulsar-touch {
        position: fixed; inset: 0; z-index: 6;
        pointer-events: none;            /* container itself is transparent to input */
        touch-action: none;
        -webkit-user-select: none; user-select: none;
      }
      /* Left half captures joystick gestures. It sits BELOW the dash button so a
         finger on the right never gets swallowed by the joystick zone. */
      #pulsar-touch .pt-joyzone {
        position: absolute; left: 0; top: 0; width: 50%; height: 100%;
        pointer-events: auto;
      }
      #pulsar-touch .pt-base {
        position: absolute; width: ${MAX_RADIUS * 2}px; height: ${MAX_RADIUS * 2}px;
        margin-left: ${-MAX_RADIUS}px; margin-top: ${-MAX_RADIUS}px;
        border-radius: 50%;
        border: 2px solid ${CYAN};
        background: radial-gradient(circle, rgba(0,240,255,0.10), rgba(0,240,255,0.02));
        box-shadow: 0 0 18px rgba(0,240,255,0.55), inset 0 0 18px rgba(0,240,255,0.25);
        display: none;                   /* shown only while a finger is down */
      }
      #pulsar-touch .pt-thumb {
        position: absolute; width: 54px; height: 54px;
        margin-left: -27px; margin-top: -27px;
        border-radius: 50%;
        border: 2px solid ${CYAN};
        background: radial-gradient(circle, rgba(0,240,255,0.55), rgba(0,240,255,0.12));
        box-shadow: 0 0 22px rgba(0,240,255,0.8);
      }
      #pulsar-touch .pt-dash {
        position: absolute; right: 32px; bottom: 40px;
        width: 96px; height: 96px; border-radius: 50%;
        pointer-events: auto;
        border: 2px solid ${MAGENTA};
        background: radial-gradient(circle, rgba(255,43,214,0.22), rgba(255,43,214,0.05));
        box-shadow: 0 0 22px rgba(255,43,214,0.6), inset 0 0 18px rgba(255,43,214,0.25);
        color: ${MAGENTA}; font: 700 18px/96px system-ui, sans-serif;
        text-align: center; letter-spacing: 2px;
        text-shadow: 0 0 8px rgba(255,43,214,0.9);
      }
      #pulsar-touch .pt-dash.pt-press {
        background: radial-gradient(circle, rgba(255,43,214,0.5), rgba(255,43,214,0.15));
        box-shadow: 0 0 34px rgba(255,43,214,0.95), inset 0 0 22px rgba(255,43,214,0.4);
      }
    `;
    document.head.appendChild(s);
  }

  _buildDom() {
    this._root = document.createElement('div');
    this._root.id = 'pulsar-touch';

    this._joyzone = document.createElement('div');
    this._joyzone.className = 'pt-joyzone';

    this._base = document.createElement('div');
    this._base.className = 'pt-base';

    this._thumb = document.createElement('div');
    this._thumb.className = 'pt-thumb';
    this._base.appendChild(this._thumb);
    this._joyzone.appendChild(this._base);

    this._dash = document.createElement('div');
    this._dash.className = 'pt-dash';
    this._dash.textContent = 'DASH';

    this._root.appendChild(this._joyzone);
    this._root.appendChild(this._dash);
    document.body.appendChild(this._root);
  }

  // ---- Event wiring -------------------------------------------------------

  _wire() {
    // Joystick: listen on its left-half zone. preventDefault stops scroll/zoom.
    this._joyzone.addEventListener('touchstart', (e) => this._joyStart(e), { passive: false });
    this._joyzone.addEventListener('touchmove', (e) => this._joyMove(e), { passive: false });
    this._joyzone.addEventListener('touchend', (e) => this._joyEnd(e), { passive: false });
    this._joyzone.addEventListener('touchcancel', (e) => this._joyEnd(e), { passive: false });

    // Dash button: any new touch on it fires the edge-trigger.
    this._dash.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this._dashEdge = true;
      this._dash.classList.add('pt-press');
    }, { passive: false });
    const release = (e) => { e.preventDefault(); this._dash.classList.remove('pt-press'); };
    this._dash.addEventListener('touchend', release, { passive: false });
    this._dash.addEventListener('touchcancel', release, { passive: false });
  }

  _joyStart(e) {
    e.preventDefault();
    if (this._joyId !== null) return; // already have a finger on the stick
    const t = e.changedTouches[0];
    this._joyId = t.identifier;
    this._baseX = t.clientX;
    this._baseY = t.clientY;
    this._base.style.left = this._baseX + 'px';
    this._base.style.top = this._baseY + 'px';
    this._base.style.display = 'block';
    this._active = true;
    this._updateThumb(0, 0);
  }

  _joyMove(e) {
    if (this._joyId === null) return;
    const t = this._findTouch(e.changedTouches, this._joyId);
    if (!t) return;
    e.preventDefault();
    this._updateThumb(t.clientX - this._baseX, t.clientY - this._baseY);
  }

  _joyEnd(e) {
    if (this._joyId === null) return;
    if (!this._findTouch(e.changedTouches, this._joyId)) return; // a different finger lifted
    e.preventDefault();
    this._joyId = null;
    this._active = false;
    this._vecX = 0;
    this._vecY = 0;
    this._base.style.display = 'none';
  }

  // dx,dy are raw screen-pixel offsets from base (screen Y grows downward).
  _updateThumb(dx, dy) {
    const dist = Math.hypot(dx, dy);
    let cx = dx, cy = dy;
    if (dist > MAX_RADIUS) {
      const s = MAX_RADIUS / dist;
      cx = dx * s;
      cy = dy * s;
    }
    // Move the visible thumb (screen coords).
    this._thumb.style.left = (MAX_RADIUS + cx) + 'px';
    this._thumb.style.top = (MAX_RADIUS + cy) + 'px';
    // Normalize to [-1..1]; invert Y so pushing UP yields +y (forward).
    this._vecX = cx / MAX_RADIUS;
    this._vecY = -cy / MAX_RADIUS;
  }

  _findTouch(list, id) {
    for (let i = 0; i < list.length; i++) {
      if (list[i].identifier === id) return list[i];
    }
    return null;
  }
}
