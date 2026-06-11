// PULSAR — thin WebSocket client. Auto-reconnects, measures ping, and routes
// messages to handlers registered by the game layer.

export class Net {
  constructor() {
    this.ws = null;
    this.handlers = {};
    this.connected = false;
    this.ping = 0;
    this._pendingJoin = null;
  }

  on(type, fn) { this.handlers[type] = fn; }

  connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${proto}://${location.host}`);
    this.ws.onopen = () => {
      this.connected = true;
      if (this._pendingJoin) this.send(this._pendingJoin);
      this._pingLoop();
    };
    this.ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.t === 'pong') { this.ping = Math.round(performance.now() - msg.s); return; }
      const h = this.handlers[msg.t];
      if (h) h(msg);
    };
    this.ws.onclose = () => {
      this.connected = false;
      if (this.handlers.disconnect) this.handlers.disconnect();
      setTimeout(() => this.connect(), 1000); // reconnect
    };
    this.ws.onerror = () => this.ws.close();
  }

  join(name, color, room) {
    this._pendingJoin = { t: 'join', name, color, room };
    if (this.connected) this.send(this._pendingJoin);
  }

  send(obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }

  _pingLoop() {
    const tick = () => {
      if (!this.connected) return;
      this.send({ t: 'ping', s: performance.now() });
      setTimeout(tick, 2000);
    };
    tick();
  }
}
