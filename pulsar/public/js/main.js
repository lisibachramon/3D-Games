// PULSAR — bootstrap. Wires the lobby, then hands off to the game loop.

import { Game } from '/js/game.js';
import { Stats } from '/js/stats.js';

const COLORS = ['#00f0ff', '#ff2bd6', '#7cff00', '#ffd000', '#ff5e3a',
  '#9b5cff', '#22ff9b', '#ff8a00', '#4d7bff', '#ff4d7d'];

const nameInput = document.getElementById('name');
const swatches = document.getElementById('swatches');
const playBtn = document.getElementById('play');
const lobby = document.getElementById('lobby');
const canvas = document.getElementById('game');
const banner = document.getElementById('profileBanner');

// Show the player's persistent progression in the lobby.
try { if (banner) banner.innerHTML = new Stats().bannerHTML(); } catch (e) { /* no stats yet */ }

let chosen = localStorage.getItem('pulsar_color') || COLORS[Math.floor(Math.random() * COLORS.length)];

// Build color swatches.
for (const c of COLORS) {
  const s = document.createElement('div');
  s.className = 'swatch' + (c === chosen ? ' sel' : '');
  s.style.background = c; s.style.color = c;
  s.onclick = () => {
    chosen = c;
    localStorage.setItem('pulsar_color', c);
    [...swatches.children].forEach((el) => el.classList.remove('sel'));
    s.classList.add('sel');
  };
  swatches.appendChild(s);
}

// Remember the last call sign.
nameInput.value = localStorage.getItem('pulsar_name') || '';
nameInput.focus();

let started = false;
function launch() {
  if (started) return;
  started = true;
  const name = (nameInput.value || 'Orb').trim().slice(0, 14);
  localStorage.setItem('pulsar_name', name);
  lobby.classList.add('hidden');
  try {
    const game = new Game(canvas);
    game.start(name, chosen);
  } catch (err) {
    console.error(err);
    document.body.insertAdjacentHTML('beforeend',
      `<div class="overlay"><div class="panel"><h1 class="logo" style="font-size:34px">OOPS</h1>
       <p class="blurb">Couldn't start the 3D engine — your browser needs WebGL enabled.
       Try a recent Chrome, Edge, Firefox, or Safari.</p></div></div>`);
  }
}

playBtn.onclick = launch;
nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') launch(); });
