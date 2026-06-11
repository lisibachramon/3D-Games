// Stages one game into desktop/staging/<game>/ for packaging:
//
//   staging/<game>/meta.json   -> tells the packaged shell which game it is
//   staging/<game>/game/       -> server/ public/ shared/ package.json
//                                 package-lock.json + production node_modules
//
// Production deps are installed with `npm ci --omit=dev --ignore-scripts` in
// the staging copy, so the repo's game folders (and their node_modules, which
// may contain dev deps like puppeteer) are never touched or shipped.
// electron-builder then maps staging/<game> into the app's resources dir
// (extraResources in scripts/build.js), landing at:
//
//   <resources>/meta.json and <resources>/game/...
//
// Usage: node scripts/stage-game.js [flotsam|pulsar]   (default: flotsam)

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const GAMES = require('../games');

const COPY_ENTRIES = ['server', 'public', 'shared', 'package.json', 'package-lock.json'];

function stageGame(gameId) {
  const cfg = GAMES[gameId];
  if (!cfg) throw new Error(`unknown game "${gameId}"`);

  const repoRoot = path.join(__dirname, '..', '..');
  const src = path.join(repoRoot, gameId);
  const outRoot = path.join(__dirname, '..', 'staging', gameId);
  const dest = path.join(outRoot, 'game');

  if (!fs.existsSync(path.join(src, 'server', 'server.js'))) {
    throw new Error(`game source not found at ${src}`);
  }

  console.log(`[stage] ${gameId}: ${src} -> ${dest}`);
  fs.rmSync(outRoot, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });

  for (const entry of COPY_ENTRIES) {
    const from = path.join(src, entry);
    if (!fs.existsSync(from)) continue; // shared/ only exists for pulsar
    fs.cpSync(from, path.join(dest, entry), { recursive: true });
  }

  console.log(`[stage] ${gameId}: npm ci --omit=dev`);
  const res = spawnSync('npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: dest,
    stdio: 'inherit',
    shell: process.platform === 'win32', // npm is npm.cmd on Windows
  });
  if (res.status !== 0) throw new Error(`npm ci failed for ${gameId} (exit ${res.status})`);

  const meta = {
    game: gameId,
    productName: cfg.productName,
    onlineUrl: cfg.onlineUrl,
    stagedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(outRoot, 'meta.json'), JSON.stringify(meta, null, 2));
  console.log(`[stage] ${gameId}: done`);
  return outRoot;
}

module.exports = { stageGame };

if (require.main === module) {
  stageGame(process.argv[2] || 'flotsam');
}
