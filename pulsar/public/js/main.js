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

// ---- private rooms (invite links) ----
// ?room=ABC12 puts you in a private arena with whoever has the link. The
// lobby can mint a code, copy the invite, or drop back to the public arena.
const roomInfo = document.getElementById('roomInfo');
const roomCreate = document.getElementById('roomCreate');
const roomCopy = document.getElementById('roomCopy');
const roomLeave = document.getElementById('roomLeave');

function currentRoom() {
  const r = (new URLSearchParams(location.search).get('room') || '')
    .toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  return r.length >= 4 ? r : null;
}

function setRoomUrl(code) {
  const url = new URL(location.href);
  if (code) url.searchParams.set('room', code); else url.searchParams.delete('room');
  history.replaceState(null, '', url);
  renderRoom();
}

function inviteUrl() {
  return location.origin + location.pathname + '?room=' + currentRoom();
}

async function copyInvite(btn) {
  try { await navigator.clipboard.writeText(inviteUrl()); }
  catch { prompt('Copy this invite link:', inviteUrl()); return; }
  const old = btn.textContent;
  btn.textContent = '✓ COPIED!';
  setTimeout(() => { btn.textContent = old; }, 1400);
}

function renderRoom() {
  const room = currentRoom();
  roomCreate.classList.toggle('hidden', !!room);
  roomCopy.classList.toggle('hidden', !room);
  roomLeave.classList.toggle('hidden', !room);
  roomInfo.innerHTML = room
    ? `PRIVATE ARENA · CODE <b>${room}</b> — send the link, friends drop straight in`
    : '';
}

roomCreate.onclick = () => {
  // Unambiguous alphabet (no 0/O/1/I/L).
  const AB = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += AB[Math.floor(Math.random() * AB.length)];
  setRoomUrl(code);
  copyInvite(roomCopy);
};
roomCopy.onclick = () => copyInvite(roomCopy);
roomLeave.onclick = () => setRoomUrl(null);
renderRoom();

// Social proof: live player count in the lobby.
fetch('/health').then((r) => r.json()).then((h) => {
  if (h && h.players > 0) {
    const n = h.players;
    roomInfo.insertAdjacentHTML('beforebegin',
      `<p class="live-count">🟢 ${n} ${n === 1 ? 'player' : 'players'} in the arena right now</p>`);
  }
}).catch(() => {});

let started = false;
function launch() {
  if (started) return;
  started = true;
  const name = (nameInput.value || 'Orb').trim().slice(0, 14);
  localStorage.setItem('pulsar_name', name);
  lobby.classList.add('hidden');
  try {
    const game = new Game(canvas);
    game.start(name, chosen, currentRoom());
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
