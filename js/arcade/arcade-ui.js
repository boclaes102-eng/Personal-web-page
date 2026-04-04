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
import { submitScore, getLeaderboard,
         subscribeLeaderboard, unsubscribeLeaderboard } from './db.js';
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

// Menu items = games + a direct-leaderboard shortcut at the bottom
const MENU_ITEMS = [
  ...GAMES,
  {
    id:            '__leaderboard__',
    label:         'LEADERBOARD',
    desc:          'HALL OF FAME  ·  LIVE SCORES  ·  ALL GAMES',
    color:         '#aaaaff',
    isLeaderboard: true,
  },
];

// ── Module state ──────────────────────────────────────────────────────────────
let _onClose        = null;   // called when user exits the overlay
let _stopGame       = null;   // cleanup fn returned by the active game
let _currentGameId  = null;
let _lbGameId       = null;   // game currently shown in leaderboard

// ── DOM helpers ───────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ── Show / hide overlay with CRT power animation ─────────────────────────────
export function showArcade(onClose) {
  sfx('arcade-enter');
  _onClose = onClose;
  const overlay = $('arcade-overlay');
  overlay.style.display = 'flex';

  // Wire up the top-bar exit button (once — clone-replace to clear old listeners)
  const exitBtn    = $('arc-exit-btn');
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
  unsubscribeLeaderboard();
  _setLiveBadge(false);
  const overlay = $('arcade-overlay');
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
    .forEach(s => $(s).style.display = 'none');
  $(id).style.display = 'flex';
}

// ── Animated screen transitions ───────────────────────────────────────────────

function _transition(fn) {
  const content = document.querySelector('.arc-content');
  gsap.timeline()
    .to(content,  { opacity: 0, duration: 0.15, ease: 'power2.in' })
    .call(fn)
    .to(content,  { opacity: 1, duration: 0.25, ease: 'power2.out' });
}

// Back to menu from leaderboard or mid-game ESC.
function _goToMenu() {
  sfx('arcade-exit');
  unsubscribeLeaderboard();
  _setLiveBadge(false);
  _transition(() => _showMenu());
}

// Game over → leaderboard transition.
function _goToLeaderboard(gameDef) {
  sfx('arcade-menu-select');
  _transition(() => {
    _showScreen('arc-screen-lb');
    _setupLeaderboardScreen(gameDef.id, gameDef.color, false);
    $('arc-lb-body').innerHTML = '<div class="arc-lb-loading">SAVING SCORE…</div>';
  });
}

// Leaderboard / menu → launch game transition.
function _goToGame(gameDef) {
  sfx('arcade-menu-select');
  unsubscribeLeaderboard();
  _setLiveBadge(false);
  _transition(() => _launchGame(gameDef));
}

// ── Menu screen ───────────────────────────────────────────────────────────────
let _menuCursor = 0;

function _showMenu() {
  _stopCurrentGame();
  unsubscribeLeaderboard();
  _setLiveBadge(false);
  _menuCursor = 0;
  _renderMenu();
  _showScreen('arc-screen-menu');
  _attachMenuKeys();
}

function _renderMenu() {
  const list = $('arc-menu-list');
  list.innerHTML = '';

  MENU_ITEMS.forEach((item, i) => {
    // Separator line before the leaderboard entry
    if (item.isLeaderboard) {
      const sep = document.createElement('div');
      sep.className = 'arc-menu-separator';
      list.appendChild(sep);
    }

    const div = document.createElement('div');
    div.className = 'arc-menu-item' + (i === _menuCursor ? ' selected' : '');
    div.style.setProperty('--game-color', item.color);
    div.innerHTML = `
      <span class="arc-cursor">&gt;</span>
      <span class="arc-game-label">${item.label}</span>
      <span class="arc-game-desc">${item.desc}</span>
    `;
    div.addEventListener('click', () => { _menuCursor = i; _selectMenuItem(item); });
    list.appendChild(div);
  });
}

let _menuKeyListener = null;

function _attachMenuKeys() {
  _detachMenuKeys();
  _menuKeyListener = e => {
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
      e.stopImmediatePropagation();
      sfx('arcade-menu-move');
      _menuCursor = (_menuCursor - 1 + MENU_ITEMS.length) % MENU_ITEMS.length;
      _renderMenu();
    } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
      e.stopImmediatePropagation();
      sfx('arcade-menu-move');
      _menuCursor = (_menuCursor + 1) % MENU_ITEMS.length;
      _renderMenu();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.stopImmediatePropagation();
      _selectMenuItem(MENU_ITEMS[_menuCursor]);
    } else if (e.key === 'Escape') {
      e.stopImmediatePropagation();
      _detachMenuKeys();
      hideArcade(_onClose);
    }
  };
  window.addEventListener('keydown', _menuKeyListener, true);
}

function _detachMenuKeys() {
  if (_menuKeyListener) {
    window.removeEventListener('keydown', _menuKeyListener, true);
    _menuKeyListener = null;
  }
}

// ── Menu item selection ───────────────────────────────────────────────────────
function _selectMenuItem(item) {
  _detachMenuKeys();
  if (item.isLeaderboard) {
    sfx('arcade-menu-select');
    _transition(() => _showLeaderboard('pong', null));
  } else {
    _goToGame(item);
  }
}

// ── Game launch ───────────────────────────────────────────────────────────────
function _launchGame(gameDef) {
  _currentGameId = gameDef.id;

  _showScreen('arc-screen-game');
  const gameCanvas = $('arc-canvas');

  const container = $('arc-screen-game');
  gameCanvas.width  = container.clientWidth  || 800;
  gameCanvas.height = container.clientHeight || 500;

  _stopGame = gameDef.start(gameCanvas, score => {
    _stopCurrentGame();
    _autoSubmitAndShowLeaderboard(gameDef, score);
  });

  const escListener = e => {
    if (e.key === 'Escape') {
      e.stopImmediatePropagation();
      window.removeEventListener('keydown', escListener, true);
      _stopCurrentGame();
      _goToMenu();
    }
  };
  window.addEventListener('keydown', escListener, true);
}

function _stopCurrentGame() {
  if (_stopGame) { _stopGame(); _stopGame = null; }
}

// ── Auto-submit score then show leaderboard ───────────────────────────────────
async function _autoSubmitAndShowLeaderboard(gameDef, score) {
  const user     = getCurrentUser();
  const username = user?.user_metadata?.username ?? user?.email ?? null;

  // Animated transition into the leaderboard screen
  _goToLeaderboard(gameDef);

  // Give the fade-out time to complete before doing async work
  await new Promise(r => setTimeout(r, 160));

  if (username) {
    try {
      await submitScore(username, gameDef.id, score);
    } catch {
      $('arc-lb-body').innerHTML =
        '<div class="arc-lb-error">SCORE SAVE FAILED<br><small>Please try again later.</small></div>';
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  try {
    const rows = await getLeaderboard(gameDef.id, 10);
    _renderLeaderboard(rows, username, gameDef.color);
  } catch {
    $('arc-lb-body').innerHTML =
      '<div class="arc-lb-error">COULD NOT LOAD SCORES<br><small>Please try again later.</small></div>';
  }

  _startRealtimeForLeaderboard(username);
}

// ── Leaderboard screen ────────────────────────────────────────────────────────
async function _showLeaderboard(gameId, playerName) {
  _showScreen('arc-screen-lb');
  const gameDef = GAMES.find(g => g.id === gameId);
  _setupLeaderboardScreen(gameId, gameDef?.color ?? '#aaaaff', true);
  $('arc-lb-body').innerHTML = '<div class="arc-lb-loading">LOADING…</div>';

  try {
    const rows = await getLeaderboard(gameId, 10);
    _renderLeaderboard(rows, playerName, gameDef?.color ?? '#aaaaff');
  } catch {
    $('arc-lb-body').innerHTML =
      '<div class="arc-lb-error">COULD NOT LOAD SCORES<br><small>Please try again later.</small></div>';
  }

  _startRealtimeForLeaderboard(playerName);
}

// Shared setup for the leaderboard screen (tabs, title, buttons).
// fromMenu=true  → browsing all games via the menu shortcut: show tabs, hide play again
// fromMenu=false → just finished a game: hide tabs, show play again for that game
function _setupLeaderboardScreen(gameId, color, fromMenu) {
  _lbGameId = gameId;

  const gameDef = GAMES.find(g => g.id === gameId);
  $('arc-lb-title').textContent = `${gameDef?.label ?? gameId.toUpperCase()} — HALL OF FAME`;
  $('arc-lb-color').style.setProperty('--game-color', color);

  // Tabs — only visible when browsing from the menu
  const tabsEl = document.querySelector('.arc-lb-tabs');
  if (tabsEl) tabsEl.style.display = fromMenu ? 'flex' : 'none';

  document.querySelectorAll('.arc-lb-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.game === gameId);
    t.onclick = () => {
      unsubscribeLeaderboard();
      _setLiveBadge(false);
      _transition(() => _showLeaderboard(t.dataset.game, null));
    };
  });

  $('arc-lb-back').onclick = () => _goToMenu();

  // "PLAY AGAIN" — only visible after finishing a game
  const againBtn = $('arc-lb-again');
  againBtn.style.display = fromMenu ? 'none' : '';
  againBtn.onclick = () => {
    const def = GAMES.find(g => g.id === _currentGameId);
    if (def) _goToGame(def);
  };
}

// ── Realtime subscription management ─────────────────────────────────────────
function _startRealtimeForLeaderboard(highlightName) {
  subscribeLeaderboard(
    // Called on any INSERT or UPDATE to arcade_scores
    async () => {
      if (_lbGameId) {
        try {
          const gameDef = GAMES.find(g => g.id === _lbGameId);
          const rows    = await getLeaderboard(_lbGameId, 10);
          _renderLeaderboard(rows, highlightName, gameDef?.color ?? '#aaaaff');
        } catch { /* silent — don't disrupt the UI on a failed refresh */ }
      }
    },
    // Called when WebSocket status changes
    status => _setLiveBadge(status === 'SUBSCRIBED'),
  );
}

function _setLiveBadge(active) {
  const badge = $('arc-lb-live');
  if (!badge) return;
  badge.style.display = active ? 'inline-flex' : 'none';
}

// ── Render rows ───────────────────────────────────────────────────────────────
function _renderLeaderboard(rows, highlightName, color) {
  const tbody = $('arc-lb-body');
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
