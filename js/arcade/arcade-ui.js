/**
 * arcade-ui.js
 * Manages the full-screen arcade overlay: main menu → game → leaderboard.
 *
 * Exports:
 *   showArcade(onClose)  — power-on CRT animation, show menu
 *   hideArcade(callback) — power-off CRT animation, then call callback
 */

import { startPong }     from './games/pong.js';
import { startGalaga }   from './games/galaga.js';
import { startBreakout } from './games/breakout.js';
import { submitScore, getLeaderboard } from './db.js';
import { sfx } from '../audio/audio-manager.js';
import { getCurrentUser } from '../auth/auth.js';

const { gsap } = window;

// ── Game catalogue ────────────────────────────────────────────────────────────
const GAMES = [
  {
    id:    'pong',
    label: 'PONG',
    desc:  'CLASSIC PADDLE BATTLE  ·  W/S TO MOVE  ·  FIRST TO 7 WINS',
    color: '#00ffcc',
    start: startPong,
  },
  {
    id:    'galaga',
    label: 'GALAGA',
    desc:  'SPACE SHOOTER  ·  ARROWS TO MOVE  ·  SPACE TO FIRE',
    color: '#ffdd00',
    start: startGalaga,
  },
  {
    id:    'breakout',
    label: 'BREAKOUT',
    desc:  'BRICK BREAKER  ·  ARROWS OR MOUSE  ·  CLEAR ALL BRICKS',
    color: '#ff44ff',
    start: startBreakout,
  },
];

// ── Module state ──────────────────────────────────────────────────────────────
let _onClose       = null;   // called when user exits the overlay
let _stopGame      = null;   // cleanup fn returned by the active game
let _currentGameId = null;
let _lastScore     = 0;

// ── DOM helpers ───────────────────────────────────────────────────────────────
const $  = id => document.getElementById(id);
const el = id => $(id);

// ── Show / hide overlay with CRT power animation ─────────────────────────────
export function showArcade(onClose) {
  sfx('arcade-enter');
  _onClose = onClose;
  const overlay = el('arcade-overlay');
  overlay.style.display = 'flex';

  // Wire up the top-bar exit button (once — clone-replace to clear old listeners)
  const exitBtn    = el('arc-exit-btn');
  const newExitBtn = exitBtn.cloneNode(true);
  exitBtn.parentNode.replaceChild(newExitBtn, exitBtn);
  newExitBtn.addEventListener('click', () => hideArcade(_onClose));

  // CRT power-on: squash vertically from a thin horizontal line to full height
  gsap.fromTo(overlay,
    { scaleY: 0.005, opacity: 1 },
    { scaleY: 1, duration: 0.45, ease: 'power2.out',
      onComplete: () => _showMenu() }
  );
}

export function hideArcade(callback) {
  sfx('arcade-exit');
  _stopCurrentGame();
  const overlay = el('arcade-overlay');
  // CRT power-off: shrink to a horizontal line then fade
  gsap.to(overlay, {
    scaleY: 0.005,
    duration: 0.30,
    ease: 'power2.in',
    onComplete: () => {
      overlay.style.display = 'none';
      overlay.style.transform = '';
      callback?.();
    },
  });
}

// ── Screen management ─────────────────────────────────────────────────────────
function _showScreen(id) {
  ['arc-screen-menu', 'arc-screen-game', 'arc-screen-gameover', 'arc-screen-lb']
    .forEach(s => el(s).style.display = 'none');
  el(id).style.display = 'flex';
}

// ── Menu screen ───────────────────────────────────────────────────────────────
let _menuCursor = 0;

function _showMenu() {
  _stopCurrentGame();
  _menuCursor = 0;
  _renderMenu();
  _showScreen('arc-screen-menu');
  _attachMenuKeys();
}

function _renderMenu() {
  const list = el('arc-menu-list');
  list.innerHTML = '';
  GAMES.forEach((g, i) => {
    const item = document.createElement('div');
    item.className = 'arc-menu-item' + (i === _menuCursor ? ' selected' : '');
    item.style.setProperty('--game-color', g.color);
    item.innerHTML = `
      <span class="arc-cursor">&gt;</span>
      <span class="arc-game-label">${g.label}</span>
      <span class="arc-game-desc">${g.desc}</span>
    `;
    item.addEventListener('click', () => { _menuCursor = i; _launchGame(g); });
    list.appendChild(item);
  });
}

let _menuKeyListener = null;

function _attachMenuKeys() {
  _detachMenuKeys();
  _menuKeyListener = e => {
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
      e.stopImmediatePropagation();
      sfx('arcade-menu-move');
      _menuCursor = (_menuCursor - 1 + GAMES.length) % GAMES.length;
      _renderMenu();
    } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
      e.stopImmediatePropagation();
      sfx('arcade-menu-move');
      _menuCursor = (_menuCursor + 1) % GAMES.length;
      _renderMenu();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.stopImmediatePropagation();
      _launchGame(GAMES[_menuCursor]);
    } else if (e.key === 'Escape') {
      // Capture + stopImmediatePropagation prevents input.js from also calling zoomOut()
      e.stopImmediatePropagation();
      _detachMenuKeys();  // prevent re-entry if user spams ESC during the exit animation
      hideArcade(_onClose);
    }
  };
  // Use capture phase so this fires before input.js's bubble-phase listener
  window.addEventListener('keydown', _menuKeyListener, true);
}

function _detachMenuKeys() {
  if (_menuKeyListener) {
    window.removeEventListener('keydown', _menuKeyListener, true);
    _menuKeyListener = null;
  }
}

// ── Game launch ───────────────────────────────────────────────────────────────
function _launchGame(gameDef) {
  sfx('arcade-menu-select');
  _detachMenuKeys();
  _currentGameId = gameDef.id;

  _showScreen('arc-screen-game');
  const gameCanvas = el('arc-canvas');

  // Resize canvas to available container dimensions
  const container = el('arc-screen-game');
  gameCanvas.width  = container.clientWidth  || 800;
  gameCanvas.height = container.clientHeight || 500;

  // Start the game; it calls onGameOver(score) when finished
  _stopGame = gameDef.start(gameCanvas, score => {
    _lastScore = score;
    _stopCurrentGame();
    _showGameOver(gameDef, score);
  });

  // ESC returns to menu (not out of arcade).
  // Capture phase + stopImmediatePropagation prevents input.js from seeing ESC.
  const escListener = e => {
    if (e.key === 'Escape') {
      e.stopImmediatePropagation();
      window.removeEventListener('keydown', escListener, true);
      _stopCurrentGame();
      _showMenu();
    }
  };
  window.addEventListener('keydown', escListener, true);
}

function _stopCurrentGame() {
  if (_stopGame) { _stopGame(); _stopGame = null; }
}

// ── Game-over / name entry screen ─────────────────────────────────────────────
function _showGameOver(gameDef, score) {
  el('arc-go-game').textContent  = gameDef.label;
  el('arc-go-score').textContent = score;
  el('arc-go-color').style.setProperty('--game-color', gameDef.color);
  el('arc-submit-msg').textContent = '';

  // Resolve the username from the current auth session
  const user     = getCurrentUser();
  const username = user?.user_metadata?.username ?? user?.email ?? null;

  // Swap the free-text name input for a read-only display of the logged-in username.
  // The input is hidden; the label now shows who will be credited on the leaderboard.
  const input = el('arc-name-input');
  if (username) {
    input.value    = username;
    input.readOnly = true;
    // Show the username visually in the label
    const label = input.closest('.arc-name-row')?.querySelector('.arc-name-label');
    if (label) label.textContent = `POSTING AS: ${username}`;
  } else {
    input.value    = '';
    input.readOnly = false;
    input.maxLength = 20;
  }

  _showScreen('arc-screen-gameover');

  // Clone-replace ALL three interactive elements to clear any accumulated listeners
  // from previous game-over screens. Without this, the input's Enter listener stacks
  // up each game and fires multiple times with stale gameDef/score closures.
  const btn  = el('arc-submit-btn');
  const skip = el('arc-skip-btn');

  const newBtn  = btn.cloneNode(true);
  const newSkip = skip.cloneNode(true);

  // cloneNode copies the disabled attribute if it was set by a previous submission,
  // so explicitly re-enable the button every time the game-over screen opens.
  newBtn.disabled = false;

  btn.parentNode.replaceChild(newBtn, btn);
  skip.parentNode.replaceChild(newSkip, skip);

  newBtn.addEventListener('click',  () => _submitAndShowLeaderboard(gameDef, score));
  newSkip.addEventListener('click', () => _showLeaderboard(gameDef.id, null));
  if (!username) {
    // Only listen for Enter on the input when the user needs to type a name
    el('arc-name-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') _submitAndShowLeaderboard(gameDef, score);
    });
  }
  if (!username) el('arc-name-input').focus();
}

async function _submitAndShowLeaderboard(gameDef, score) {
  const name = el('arc-name-input').value.trim();
  if (!name) { el('arc-submit-msg').textContent = 'ENTER YOUR NAME FIRST'; return; }

  el('arc-submit-msg').textContent = 'SAVING…';
  el('arc-submit-btn').disabled = true;

  try {
    await submitScore(name, gameDef.id, score);
    _showLeaderboard(gameDef.id, name);
  } catch (err) {
    console.error('Score submit error:', err);
    el('arc-submit-msg').textContent = 'SAVE FAILED — SHOWING LEADERBOARD ANYWAY';
    setTimeout(() => _showLeaderboard(gameDef.id, null), 1200);
  }
}

// ── Leaderboard screen ────────────────────────────────────────────────────────
async function _showLeaderboard(gameId, playerName) {
  _showScreen('arc-screen-lb');
  const gameDef = GAMES.find(g => g.id === gameId);

  el('arc-lb-title').textContent = `${gameDef?.label ?? gameId.toUpperCase()} — HALL OF FAME`;
  el('arc-lb-body').innerHTML = '<div class="arc-lb-loading">LOADING…</div>';

  el('arc-lb-color').style.setProperty('--game-color', gameDef?.color ?? '#00ffcc');

  // Tab switcher active state
  document.querySelectorAll('.arc-lb-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.game === gameId);
    t.onclick = () => _showLeaderboard(t.dataset.game, null);
  });

  // Back and play-again buttons
  const backBtn  = el('arc-lb-back');
  const againBtn = el('arc-lb-again');
  backBtn.onclick  = () => _showMenu();
  againBtn.onclick = () => {
    const def = GAMES.find(g => g.id === _currentGameId || g.id === gameId);
    if (def) _launchGame(def);
  };

  try {
    const rows = await getLeaderboard(gameId, 10);
    _renderLeaderboard(rows, playerName, gameDef?.color ?? '#00ffcc');
  } catch (err) {
    console.error('Leaderboard fetch error:', err);
    el('arc-lb-body').innerHTML =
      '<div class="arc-lb-error">COULD NOT LOAD SCORES<br>'
      + '<small>Check your Supabase anon key in db.js</small></div>';
  }
}

function _renderLeaderboard(rows, highlightName, color) {
  const tbody = el('arc-lb-body');
  if (!rows.length) {
    tbody.innerHTML = '<div class="arc-lb-empty">NO SCORES YET — BE THE FIRST!</div>';
    return;
  }
  tbody.innerHTML = rows.map((r, i) => {
    const isHighlight = highlightName && r.player_name === highlightName;
    const rank = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
    return `
      <div class="arc-lb-row${isHighlight ? ' highlight' : ''}"
           style="--game-color:${color}">
        <span class="arc-lb-rank">${rank}</span>
        <span class="arc-lb-name">${_escHtml(r.player_name)}</span>
        <span class="arc-lb-score">${r.score.toLocaleString()}</span>
      </div>`;
  }).join('');
}

function _escHtml(str) {
  return str.replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}
