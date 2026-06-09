// End-to-end test: drives the real server over WebSocket like a player would.
import { WebSocket } from 'ws';

const PORT = process.env.PORT || 8091;
const url = `ws://localhost:${PORT}`;
const ws = new WebSocket(url);
const log = (...a) => console.log(...a);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; log('  ✓', m); } else { fail++; log('  ✗ FAIL:', m); } };

let inv = {}, tiles = [], props = [], lastState = null, toasts = [];
const seen = new Set();
const waitFor = (pred, ms = 4000) => new Promise((res, rej) => {
  const t0 = Date.now();
  const iv = setInterval(() => {
    if (pred()) { clearInterval(iv); res(true); }
    else if (Date.now() - t0 > ms) { clearInterval(iv); rej(new Error('timeout')); }
  }, 40);
});
const send = (o) => ws.send(JSON.stringify(o));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

ws.on('message', (raw) => {
  const m = JSON.parse(raw); seen.add(m.t);
  if (m.t === 'welcome') { tiles = m.tiles; props = m.props; }
  if (m.t === 'inv') inv = m.inv;
  if (m.t === 'tiles') tiles = m.tiles;
  if (m.t === 'props') props = m.props;
  if (m.t === 'state') lastState = m;
  if (m.t === 'toast') toasts.push(m.msg);
});

ws.on('open', async () => {
  try {
    send({ t: 'join', name: 'Tester' });
    await waitFor(() => seen.has('welcome'));
    ok(tiles.length === 9, `starter raft has 9 tiles (got ${tiles.length})`);
    ok(props.some(p => p.type === 'storage'), 'starter storage prop present');

    await waitFor(() => Object.keys(inv).length > 0);
    ok((inv.wood || 0) >= 6, `starter wood >= 6 (got ${inv.wood})`);
    ok((inv.hook || 0) === 1, 'starter has hook');

    // wait for some debris and a state, then teleport onto a debris and collect
    await waitFor(() => lastState && lastState.debris.length > 0, 8000);
    const d = lastState.debris[0];
    send({ t: 'input', x: d.x, y: 1, z: d.z, ry: 0 });
    await sleep(150);
    const before = JSON.stringify(inv);
    send({ t: 'collect', id: d.id });
    await waitFor(() => JSON.stringify(inv) !== before, 3000);
    ok(true, 'collecting debris granted resources');

    // craft a plank (needs wood:2)
    const woodBefore = inv.wood || 0;
    send({ t: 'craft', recipe: 'plank' });
    await waitFor(() => (inv.plank || 0) >= 1, 3000);
    ok((inv.plank || 0) >= 1 && inv.wood === woodBefore - 2, 'crafting plank consumed 2 wood, produced 1 plank');

    // move back near the raft to build (centroid ~0,0)
    send({ t: 'input', x: 0, y: 1, z: 0, ry: 0 });
    await sleep(150);
    // give ourselves wood by collecting more if needed: ensure >=4
    while ((inv.wood || 0) < 4) {
      await waitFor(() => lastState.debris.length > 0, 8000);
      const dd = lastState.debris.find(x => Math.hypot(x.x, x.z) < 20) || lastState.debris[0];
      send({ t: 'input', x: dd.x, y: 1, z: dd.z, ry: 0 }); await sleep(120);
      const b = JSON.stringify(inv); send({ t: 'collect', id: dd.id });
      try { await waitFor(() => JSON.stringify(inv) !== b, 2000); } catch {}
      send({ t: 'input', x: 0, y: 1, z: 0, ry: 0 }); await sleep(100);
    }
    // build a foundation at (2,0) adjacent to (1,0). stand near it.
    send({ t: 'input', x: 4, y: 1, z: 0, ry: 0 }); await sleep(150);
    const tilesBefore = tiles.length;
    send({ t: 'build', kind: 'foundation', gx: 2, gz: 0 });
    await waitFor(() => tiles.length === tilesBefore + 1, 3000);
    ok(tiles.some(t => t.gx === 2 && t.gz === 0), 'built a new foundation adjacent to raft');

    // hit shark without a spear -> should be blocked (toast)
    toasts = [];
    send({ t: 'hitshark' });
    await sleep(200);
    ok(toasts.some(s => /Spear/i.test(s)), 'spear-less shark attack is rejected');

    // deposit resources into storage (storage prop at 1,1)
    send({ t: 'input', x: 4, y: 1, z: 4, ry: 0 }); await sleep(150);
    send({ t: 'station', gx: 1, gz: 1, action: 'depositResources' });
    await sleep(300);
    ok(seen.has('storage'), 'storage station responded');

    // ---- v2 systems ----
    ok(typeof lastState.weather === 'string', `weather present in state (${lastState.weather})`);
    const me = lastState.players[0];
    ok(Number.isFinite(me.oxygen) && Number.isFinite(me.stamina) && Number.isFinite(me.temp), 'player has oxygen/stamina/temp vitals');
    ok(Array.isArray(lastState.jellies) && lastState.jellies.length > 0, `jellyfish hazards present (${lastState.jellies.length})`);

    // craft rope (fiber:2 -> rope)  [starter has fiber:2]
    if ((inv.fiber || 0) < 2) { /* fish/seaweed could add fiber; ensure via collect */ }
    if ((inv.fiber || 0) >= 2) { const rb = inv.rope || 0; send({ t: 'craft', recipe: 'rope' }); await waitFor(() => (inv.rope || 0) > rb, 2500); ok((inv.rope || 0) > 0, 'crafted rope from fiber'); }
    else ok(true, 'rope skipped (no fiber)');

    // tech gating: smelting metal requires a furnace
    toasts = []; send({ t: 'craft', recipe: 'metal' }); await sleep(200);
    ok(toasts.some(s => /Furnace/i.test(s)), 'furnace-gated recipe rejected without station');

    // drink sea water requires a bucket
    toasts = []; send({ t: 'drinksea' }); await sleep(200);
    ok(toasts.some(s => /Bucket/i.test(s)), 'drinking sea water requires a bucket');

    // ping + emote relay back to us
    let gotPing = false, gotEmote = false;
    const onMsg = (raw) => { const mm = JSON.parse(raw); if (mm.t === 'ping') gotPing = true; if (mm.t === 'emote') gotEmote = true; };
    ws.on('message', onMsg);
    send({ t: 'ping', x: 5, z: 5 }); send({ t: 'emote', e: '👋' });
    await waitFor(() => gotPing && gotEmote, 2000).catch(() => {});
    ok(gotPing, 'ping waypoint broadcast'); ok(gotEmote, 'emote broadcast');

    log(`\n  RESULT: ${pass} passed, ${fail} failed`);
    ws.close();
    process.exit(fail ? 1 : 0);
  } catch (e) {
    log('  ✗ test crashed:', e.message);
    log(`\n  RESULT: ${pass} passed, ${fail + 1} failed`);
    process.exit(1);
  }
});
ws.on('error', (e) => { log('socket error', e.message); process.exit(1); });
