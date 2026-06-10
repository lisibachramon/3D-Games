// Desktop shell for FLOTSAM / PULSAR — one Electron codebase, parameterized
// per game. See games.js for the per-game config and README.md for the modes.
//
// Modes:
//   - online (default): loads the public server URL so desktop players share
//     the live arena with browser players. Override with env GAME_URL.
//   - local: forks the bundled game server (utilityProcess) on a free port and
//     loads http://127.0.0.1:<port>. Used as automatic fallback when the
//     online URL fails to load, via the Game menu, or with --smoke.
//
// CLI flags:
//   --game=flotsam|pulsar  (dev only; packaged builds read resources/meta.json)
//   --smoke                boot local server, wait for HTTP 200 on /, print
//                          "SMOKE OK" and exit 0 (exit 1 after 30s timeout).

'use strict';

const { app, BrowserWindow, Menu, dialog, utilityProcess } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const GAMES = require('./games');

// ---------------------------------------------------------------------------
// Which game is this shell running?
// ---------------------------------------------------------------------------

const argv = process.argv.slice(1);
const SMOKE = argv.includes('--smoke');
const argGame = (argv.find((a) => a.startsWith('--game=')) || '').split('=')[1];

let gameId;
let gameDir; // folder containing server/, public/, (shared/), package.json, node_modules
if (app.isPackaged) {
  // Baked in at build time by scripts/stage-game.js (extraResources).
  const meta = JSON.parse(fs.readFileSync(path.join(process.resourcesPath, 'meta.json'), 'utf8'));
  gameId = meta.game;
  gameDir = path.join(process.resourcesPath, 'game');
} else {
  gameId = argGame || process.env.GAME || 'flotsam';
  gameDir = path.join(__dirname, '..', gameId); // run straight out of the repo
}

const CFG = GAMES[gameId];
if (!CFG) {
  console.error(`[shell] unknown game "${gameId}" (expected one of: ${Object.keys(GAMES).join(', ')})`);
  app.exit(1);
}

const ONLINE_URL = process.env.GAME_URL || CFG.onlineUrl;

app.setName(CFG.productName);
// Separate userData per game (saves, caches) — default would be keyed off the
// shell package name and the two games would collide.
app.setPath('userData', path.join(app.getPath('appData'), CFG.productName));
if (process.platform === 'win32') app.setAppUserModelId(CFG.appId);
if (SMOKE) app.disableHardwareAcceleration();

// ---------------------------------------------------------------------------
// Local server management (utilityProcess fork of the bundled game server)
// ---------------------------------------------------------------------------

let serverProc = null;
let serverPort = null;
let serverStarting = null; // promise while a start is in flight

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    let lastErr = 'no response yet';
    const retry = () => {
      if (Date.now() > deadline) {
        return reject(new Error(`server did not answer HTTP 200 on ${url} within ${timeoutMs}ms (${lastErr})`));
      }
      setTimeout(attempt, 250);
    };
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode === 200) return resolve();
        lastErr = `HTTP ${res.statusCode}`;
        retry();
      });
      req.setTimeout(2000, () => req.destroy(new Error('request timeout')));
      req.on('error', (err) => { lastErr = err.message; retry(); });
    };
    attempt();
  });
}

function startLocalServer() {
  if (serverStarting) return serverStarting;
  serverStarting = (async () => {
    const port = await getFreePort();
    const userData = app.getPath('userData');
    fs.mkdirSync(userData, { recursive: true });

    const env = { ...process.env, PORT: String(port) };
    if (gameId === 'flotsam') {
      if (SMOKE) {
        env.FLOTSAM_NOSAVE = '1'; // never touch saves during smoke checks
      } else {
        env.FLOTSAM_SAVE = path.join(userData, 'save.json'); // per-user persistent save
      }
    }

    const entry = path.join(gameDir, 'server', 'server.js');
    if (!fs.existsSync(entry)) throw new Error(`bundled server not found: ${entry}`);

    // utilityProcess runs the entry under Node (ESM resolved via the game's own
    // package.json "type":"module", which is staged next to it). Equivalent to
    // child_process.fork with ELECTRON_RUN_AS_NODE=1 but with proper lifetime
    // management — children die with the app.
    serverProc = utilityProcess.fork(entry, [], {
      cwd: gameDir,
      env,
      stdio: 'pipe',
      serviceName: `${CFG.productName} local server`,
    });
    if (serverProc.stdout) serverProc.stdout.on('data', (d) => process.stdout.write(`[${gameId}] ${d}`));
    if (serverProc.stderr) serverProc.stderr.on('data', (d) => process.stderr.write(`[${gameId}] ${d}`));
    serverProc.on('exit', (code) => {
      console.log(`[shell] local server exited (code ${code})`);
      serverProc = null;
      serverPort = null;
      serverStarting = null;
    });

    await waitForHttp(`http://127.0.0.1:${port}/`, 30000);
    serverPort = port;
    return port;
  })();
  serverStarting.catch(() => { serverStarting = null; });
  return serverStarting;
}

function stopLocalServer() {
  if (serverProc) {
    try { serverProc.kill(); } catch { /* already gone */ }
    serverProc = null;
  }
  serverPort = null;
  serverStarting = null;
}

// ---------------------------------------------------------------------------
// Window, modes, menu
// ---------------------------------------------------------------------------

let win = null;
let mode = 'online'; // 'online' | 'local'
let fallingBack = false;

async function playOnline() {
  if (!win) return;
  mode = 'online';
  try {
    await win.loadURL(ONLINE_URL);
  } catch {
    // did-fail-load below handles the fallback; loadURL also rejects for the
    // same failure, so swallow the duplicate here.
  }
}

async function hostLocal({ auto = false } = {}) {
  try {
    const port = await startLocalServer();
    mode = 'local';
    if (win) await win.loadURL(`http://127.0.0.1:${port}/`);
    if (auto) console.log(`[shell] online unreachable — fell back to local host on port ${port}`);
  } catch (err) {
    console.error('[shell] local host failed:', err);
    if (win && !SMOKE) {
      dialog.showMessageBox(win, {
        type: 'error',
        title: CFG.productName,
        message: `Could not start the local ${CFG.productName} server`,
        detail: String((err && err.message) || err),
      });
    }
  }
}

function toggleFullscreen() {
  if (win) win.setFullScreen(!win.isFullScreen());
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 810,
    minWidth: 800,
    minHeight: 450,
    fullscreenable: true,
    autoHideMenuBar: process.platform !== 'darwin', // Windows/Linux: Alt reveals
    title: CFG.productName,
    backgroundColor: CFG.windowBg || '#000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3 /* ERR_ABORTED: in-page nav, not a real failure */) return;
    console.warn(`[shell] load failed (${errorCode} ${errorDescription}) for ${validatedURL}`);
    if (mode === 'online' && !fallingBack) {
      fallingBack = true;
      hostLocal({ auto: true }).finally(() => { fallingBack = false; });
    }
  });

  win.on('closed', () => { win = null; });
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'Game',
      submenu: [
        { label: 'Play Online', accelerator: 'CmdOrCtrl+1', click: () => playOnline() },
        { label: 'Host Local/LAN', accelerator: 'CmdOrCtrl+2', click: () => hostLocal() },
        { type: 'separator' },
        // F11 on Windows/Linux, Ctrl+Cmd+F on macOS (role defaults).
        { role: 'togglefullscreen', label: 'Toggle Fullscreen' },
        { type: 'separator' },
        { role: 'quit', label: `Quit ${CFG.productName}` },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
      ],
    },
    ...(isMac ? [{ role: 'windowMenu' }] : []),
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------------------------------------------------------------------------
// Smoke mode (CI / local verification hook) — no window
// ---------------------------------------------------------------------------

async function runSmoke() {
  const guard = setTimeout(() => {
    console.error('SMOKE FAIL: hard timeout');
    stopLocalServer();
    app.exit(1);
  }, 35000);
  try {
    const port = await startLocalServer(); // includes the 30s HTTP-200 wait
    clearTimeout(guard);
    console.log(`SMOKE OK (${gameId} on 127.0.0.1:${port})`);
    stopLocalServer();
    app.exit(0);
  } catch (err) {
    clearTimeout(guard);
    console.error(`SMOKE FAIL: ${(err && err.message) || err}`);
    stopLocalServer();
    app.exit(1);
  }
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  if (SMOKE) return runSmoke();
  buildMenu();
  createWindow();
  return playOnline();
});

// A game shell quits when its window closes — on macOS too (otherwise a
// headless local server could linger with no UI to control it).
app.on('window-all-closed', () => app.quit());
app.on('before-quit', stopLocalServer);
process.on('exit', stopLocalServer);
