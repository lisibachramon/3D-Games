// Headless browser smoke test: loads the real client, clicks PLAY,
// verifies WebGL renders and the networked world initializes, captures a screenshot.
import puppeteer from 'puppeteer';

const PORT = process.env.PORT || 8092;
const URL = `http://localhost:${PORT}`;
const SCREENSHOT_PATH = process.env.SCREENSHOT_PATH || '/home/user/flotsam/screenshot.png';
const errors = [];

const browser = await puppeteer.launch({
  headless: 'new',
  args: [
    '--no-sandbox', '--disable-setuid-sandbox',
    '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
    '--ignore-gpu-blocklist', '--window-size=1280,720',
  ],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });

page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
page.on('requestfailed', (r) => errors.push('REQFAIL: ' + r.url() + ' ' + (r.failure()?.errorText || '')));

let fail = 0;
const ok = (c, m) => { if (c) console.log('  ✓', m); else { console.log('  ✗ FAIL:', m); fail++; } };

try {
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 15000 });
  await page.waitForSelector('#playBtn', { timeout: 5000 });
  ok(true, 'page loaded, menu visible');

  // verify WebGL is actually available in this headless env
  const webgl = await page.evaluate(() => {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  });
  ok(webgl, 'WebGL context available');

  await page.type('#nameInput', 'Bot', { delay: 10 });
  await page.click('#playBtn');

  // wait for the game canvas + websocket round-trip (welcome -> chat line)
  await page.waitForSelector('#game canvas', { timeout: 8000 });
  ok(true, 'game canvas created');

  // hud hotbar populated
  await page.waitForFunction(() => document.querySelectorAll('#hotbar .slot').length >= 4, { timeout: 6000 });
  ok(true, 'hotbar rendered with tools');

  // welcome chat from server proves WS round-trip
  await page.waitForFunction(() => document.querySelectorAll('#chatlog .line').length > 0, { timeout: 6000 });
  ok(true, 'server welcome received over WebSocket');

  // vitals bars got a width (means a state packet updated the HUD)
  await page.waitForFunction(() => {
    const w = document.getElementById('hpFill').style.width; return w && w !== '';
  }, { timeout: 6000 });
  ok(true, 'vitals updated from server state');

  // v2 UI surfaces
  const ui = await page.evaluate(() => ({
    minimap: !!document.querySelector('#minimap'),
    objective: (document.getElementById('objective').textContent || '').trim(),
    weather: (document.getElementById('weather').textContent || '').trim(),
    crew: document.querySelectorAll('#crewlist .crew').length,
    oxy: document.getElementById('oxyFill').style.width,
    gear: !!document.getElementById('gearBtn'),
  }));
  ok(ui.minimap, 'minimap canvas present');
  ok(ui.objective.length > 3, `objective tracker populated ("${ui.objective.slice(0, 40)}…")`);
  ok(ui.weather.length > 0, `weather chip populated ("${ui.weather}")`);
  ok(ui.crew >= 1, `crew list shows players (${ui.crew})`);
  ok(ui.oxy !== '', 'secondary vitals (oxygen) updating');
  ok(ui.gear, 'settings gear present');

  // open the build palette so the screenshot shows the full UI
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB' })));
  // let it render a few seconds, then verify the rendered frame is non-blank
  await new Promise(r => setTimeout(r, 2500));
  const buf = await page.screenshot({ path: SCREENSHOT_PATH });
  // a blank frame compresses to near-uniform bytes; a real scene has high variety
  const distinct = new Set();
  for (let i = 0; i < buf.length; i += 101) distinct.add(buf[i]);
  ok(buf.length > 15000 && distinct.size > 60, `rendered frame is non-blank (${buf.length}B, ${distinct.size} distinct bytes)`);
  console.log('  📸 screenshot saved');

  console.log('\n  Runtime errors captured:', errors.length);
  errors.slice(0, 12).forEach(e => console.log('     -', e));
  // Filter out benign AudioContext autoplay warnings if any slipped through as errors
  const fatal = errors.filter(e => !/AudioContext|autoplay|favicon/i.test(e));
  ok(fatal.length === 0, 'no fatal runtime errors');

  console.log(`\n  RESULT: ${fail ? fail + ' FAILED' : 'ALL PASSED'}`);
} catch (e) {
  console.log('  ✗ crashed:', e.message);
  errors.slice(0, 12).forEach(x => console.log('     -', x));
  fail++;
} finally {
  await browser.close();
  process.exit(fail ? 1 : 0);
}
