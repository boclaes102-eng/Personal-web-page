/**
 * jukebox-ui.js
 * Music theme selector overlay — shown when the user clicks the jukebox.
 * Four procedural ambient themes; selection is saved to Supabase.
 *
 * Public API:
 *   showJukeboxUI(onEject)   — mount overlay + GSAP entrance
 *   hideJukeboxUI(onComplete) — GSAP exit, then calls onComplete
 */

import { sfx, setMusicTheme, getMusicTheme } from '../audio/audio-manager.js';
import { saveUserTheme, loadUserTheme }       from '../auth/auth.js';

// ── Theme definitions ─────────────────────────────────────────────────────────
const THEMES = [
  {
    id:     'space',
    name:   'DEEP SPACE',
    artist: 'The Cosmos Orchestra',
    desc:   'Interstellar drones & ambient pads',
    color:  '#4488ff',
    icon:   '🌌',
  },
  {
    id:     'synthwave',
    name:   'SYNTHWAVE',
    artist: 'Neon Highway',
    desc:   '80s retrowave pulse & arpeggios',
    color:  '#ff44bb',
    icon:   '🌆',
  },
  {
    id:     'jazz',
    name:   'JAZZ LOUNGE',
    artist: 'The Space Bar Quartet',
    desc:   'Mellow walking bass & warm chords',
    color:  '#ffcc44',
    icon:   '🎺',
  },
  {
    id:     'cyberpunk',
    name:   'CYBERPUNK',
    artist: 'SYSTEM.EXE',
    desc:   'Dark industrial sub-bass & glitch',
    color:  '#00ffcc',
    icon:   '⚡',
  },
];

// ── DOM state ─────────────────────────────────────────────────────────────────
let _el         = null;
let _onEject    = null;
let _keyHandler = null;
let _visFrame   = null;
let _trackEls   = [];

// ── DOM helpers ───────────────────────────────────────────────────────────────
function el(tag, cls = '', text = '') {
  const e = document.createElement(tag);
  if (cls)  e.className   = cls;
  if (text) e.textContent = text;
  return e;
}

// ── Track selection ───────────────────────────────────────────────────────────
function _selectTheme(id) {
  if (id === getMusicTheme()) return;
  sfx('pc-enter-key');
  setMusicTheme(id);
  saveUserTheme(id);  // fire-and-forget DB write

  // Update all track row UI states
  _trackEls.forEach(({ trackEl, actionEl, npEl, theme }) => {
    const active = theme.id === id;
    trackEl.classList.toggle('jk-track-active', active);
    trackEl.querySelector('.jk-now-playing')?.remove();
    if (active) {
      actionEl.textContent = '► PLAYING';
      const np = el('div', 'jk-now-playing', '● NOW PLAYING');
      trackEl.appendChild(np);
    } else {
      actionEl.textContent = '[ SELECT ]';
    }
  });

  // Update side-panel labels
  const active = THEMES.find(t => t.id === id);
  if (!active || !_el) return;
  const lbl = _el.querySelector('.jk-vis-label');
  const sub = _el.querySelector('.jk-vis-sublabel');
  if (lbl) { lbl.textContent = active.name;   lbl.style.color = active.color; }
  if (sub) { sub.textContent = active.artist; }
}

// ── Visualizer canvas animation ───────────────────────────────────────────────
function _startVis(canvas) {
  const c2 = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const BARS = 20;
  const bw   = (W - (BARS + 1)) / BARS;

  function frame(ms) {
    if (!_el) return;
    const t     = ms * 0.001;
    const theme = THEMES.find(t2 => t2.id === getMusicTheme());
    const color = theme?.color ?? '#ff44bb';

    c2.fillStyle = '#04000c';
    c2.fillRect(0, 0, W, H);
    c2.fillStyle = color;

    for (let i = 0; i < BARS; i++) {
      const f   = 0.4 + i * 0.28;
      const ph  = i * 0.68;
      const env = 0.25 + 0.40 * ((i < BARS / 2) ? i / (BARS / 2) : (BARS - i) / (BARS / 2));
      const v   = env
                + 0.32 * Math.abs(Math.sin(t * f + ph))
                + 0.10 * Math.abs(Math.sin(t * f * 2.3 + ph * 1.6));
      const bh  = Math.min(H - 4, Math.max(2, v * H * 0.88));
      c2.globalAlpha = 0.55 + 0.45 * v;
      c2.fillRect(1 + i * (bw + 1), H - bh, bw, bh);
    }
    c2.globalAlpha = 1;
    _visFrame = requestAnimationFrame(frame);
  }
  _visFrame = requestAnimationFrame(frame);
}

// ── Build DOM ─────────────────────────────────────────────────────────────────
function _build(currentTheme) {
  _el = el('div', 'jk-overlay');
  _el.appendChild(el('div', 'crt-scanlines'));
  _el.appendChild(el('div', 'crt-vignette'));

  // ─ Top bar ─
  const topbar  = el('div', 'jk-topbar');
  const logo    = el('span', 'jk-logo',     '♫  SPACE JUKEBOX');
  const sub     = el('span', 'jk-logo-sub', '// MUSIC THEME SELECTOR v1.0');
  const ejectBtn = el('button', 'jk-eject-btn', '[ ⏏ EJECT ]');
  ejectBtn.title = 'Exit (ESC)';
  topbar.append(logo, sub, ejectBtn);
  _el.appendChild(topbar);

  // ─ Body: track list + visualizer panel ─
  const body = el('div', 'jk-body');

  // Track list
  const trackList = el('div', 'jk-tracklist');
  _trackEls = THEMES.map((theme, i) => {
    const trackEl  = el('div', 'jk-track' + (theme.id === currentTheme ? ' jk-track-active' : ''));
    const numEl    = el('div', 'jk-track-num', String(i + 1).padStart(2, '0'));
    const infoEl   = el('div', 'jk-track-info');
    const nameEl   = el('div', 'jk-track-name', theme.name);
    nameEl.style.color = theme.color;
    const artistEl = el('div', 'jk-track-artist', theme.artist);
    const descEl   = el('div', 'jk-track-desc',   theme.desc);
    infoEl.append(nameEl, artistEl, descEl);

    const actionEl = el('div', 'jk-track-action',
      theme.id === currentTheme ? '► PLAYING' : '[ SELECT ]');

    trackEl.append(numEl, infoEl, actionEl);

    if (theme.id === currentTheme) {
      const np = el('div', 'jk-now-playing', '● NOW PLAYING');
      trackEl.appendChild(np);
    }

    trackEl.addEventListener('click', () => _selectTheme(theme.id));
    trackList.appendChild(trackEl);
    return { trackEl, actionEl, npEl: null, theme };
  });

  // Visualizer panel
  const visPanel  = el('div', 'jk-visualizer');
  const visTitle  = el('div', 'jk-vis-title', '// SPECTRUM');
  const visCv     = document.createElement('canvas');
  visCv.className = 'jk-vis-canvas';
  visCv.width = 180; visCv.height = 180;

  const active    = THEMES.find(t => t.id === currentTheme);
  const visLabel  = el('div', 'jk-vis-label', active?.name ?? '');
  visLabel.style.color = active?.color ?? '#ff44bb';
  const visSub    = el('div', 'jk-vis-sublabel', active?.artist ?? '');

  visPanel.append(visTitle, visCv, visLabel, visSub);
  body.append(trackList, visPanel);
  _el.appendChild(body);

  // ─ Status bar ─
  const status = el('div', 'jk-status-bar',
    'SELECT A THEME TO CHANGE THE MUSIC  //  YOUR CHOICE IS SAVED TO YOUR PROFILE');
  _el.appendChild(status);

  // ─ Events ─
  ejectBtn.addEventListener('click', () => _onEject?.());
  _keyHandler = e => {
    if (e.key === 'Escape') { e.stopPropagation(); _onEject?.(); }
  };
  window.addEventListener('keydown', _keyHandler);
  document.body.appendChild(_el);

  _startVis(visCv);
}

// ── Public API ────────────────────────────────────────────────────────────────
export function showJukeboxUI(onEject) {
  _onEject = onEject;
  sfx('arcade-enter');

  const current = getMusicTheme();
  _build(current);

  // Async: check DB for the user's saved theme; apply if different from in-memory
  loadUserTheme().then(saved => {
    if (saved && saved !== getMusicTheme()) _selectTheme(saved);
  }).catch(() => {});

  _el.style.transformOrigin = 'center center';
  const { gsap } = window;
  gsap.fromTo(_el,
    { scaleY: 0.005, opacity: 1 },
    { scaleY: 1, duration: 0.45, ease: 'power2.out',
      onComplete: () => sfx('phone-pickup') }
  );
}

export function hideJukeboxUI(onComplete) {
  if (!_el) { onComplete?.(); return; }
  if (_keyHandler) { window.removeEventListener('keydown', _keyHandler); _keyHandler = null; }
  if (_visFrame)   { cancelAnimationFrame(_visFrame); _visFrame = null; }

  sfx('zoom-out');
  const domEl = _el;
  _el = null; _trackEls = [];

  const { gsap } = window;
  gsap.timeline({ onComplete: () => { domEl.remove(); onComplete?.(); } })
    .to(domEl, { scaleY: 0.005, duration: 0.28, ease: 'power2.in' })
    .to(domEl, { opacity: 0,    duration: 0.18, ease: 'power1.in' });
}
