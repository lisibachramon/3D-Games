// Thin WebSocket client. Emits server messages to registered handlers.
export class Net {
  constructor() {
    this.handlers = {};
    this.queue = [];
    this.ready = false;
  }
  connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${proto}://${location.host}`);
    this.ws.onopen = () => { this.ready = true; this.queue.forEach(m => this.ws.send(m)); this.queue = []; this.emit('open'); };
    this.ws.onclose = () => { this.ready = false; this.emit('close'); };
    this.ws.onerror = () => this.emit('error');
    this.ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      this.emit(m.t, m);
    };
  }
  on(type, fn) { (this.handlers[type] ||= []).push(fn); return this; }
  emit(type, m) { (this.handlers[type] || []).forEach(fn => fn(m)); }
  send(obj) {
    const s = JSON.stringify(obj);
    if (this.ready) this.ws.send(s); else this.queue.push(s);
  }
}
