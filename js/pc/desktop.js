/**
 * desktop.js
 * Retro "SecureOS" desktop home screen shown when the user clicks the computer.
 * Displays 5 clickable app icons; clicking an icon opens a windowed tool.
 * Pressing ESC or [ SHUTDOWN ] closes the desktop and triggers the camera zoom-out.
 *
 * Public API:
 *   showDesktop(onShutdown)   — mounts the overlay, GSAP entrance
 *   hideDesktop(onComplete)   — GSAP exit, then calls onComplete
 */

import { sfx } from '../audio/audio-manager.js';

// ── App definitions ───────────────────────────────────────────────────────────

const APPS = [
  {
    id:   'panalyze',
    exe:  'PANALYZE.EXE',
    name: 'Password Analyzer',
    desc: 'Strength check\n& breach lookup',
    art: [
      '╔══════╗',
      '║ **** ║',
      '║ *  * ║',
      '║ **** ║',
      '╚══╦═══╝',
      '   ║    ',
      '  ═╩═   ',
    ],
    loader: () => import('./tools/panalyze.js'),
  },
  {
    id:   'hashgen',
    exe:  'HASHGEN.EXE',
    name: 'Hash Generator',
    desc: 'SHA-1 / 256 / 512\nidentifier',
    art: [
      '  #  #  ',
      '########',
      '  #  #  ',
      '########',
      '  #  #  ',
      '        ',
      ' HASH() ',
    ],
    loader: () => import('./tools/hashgen.js'),
  },
  {
    id:   'cipher',
    exe:  'CIPHER.EXE',
    name: 'Cipher Tool',
    desc: 'ROT13 · Caesar\nBase64 · Hex · URL',
    art: [
      ' A → N  ',
      ' B → O  ',
      ' C → P  ',
      '--------',
      'ENCODE  ',
      'DECODE  ',
      '        ',
    ],
    loader: () => import('./tools/cipher.js'),
  },
  {
    id:   'netinfo',
    exe:  'NETINFO.EXE',
    name: 'Network Info',
    desc: 'IP geolocation\n& browser info',
    art: [
      '  .---.  ',
      ' ( IP  ) ',
      "  '---'  ",
      '    |    ',
      '  .-+-. ',
      ' |WORLD|',
      "  '---'  ",
    ],
    loader: () => import('./tools/netinfo.js'),
  },
  {
    id:   'jwtdec',
    exe:  'JWTDEC.EXE',
    name: 'JWT Decoder',
    desc: 'Decode & inspect\nJWT tokens',
    art: [
      'eyJ····',
      '.······',
      '.SflKx·',
      '-------',
      'HDR·PLD',
      '  SIG  ',
      '       ',
    ],
    loader: () => import('./tools/jwtdec.js'),
  },
];

// ── State ─────────────────────────────────────────────────────────────────────

let _el         = null;
let _workspace  = null;
let _taskbarApp = null;
let _clockId    = null;
let _onShut     = null;
let _activeWin  = null;
let _keyHandler = null;

// ── DOM helpers ───────────────────────────────────────────────────────────────

function el(tag, cls='', text='') {
  const e = document.createElement(tag);
  if (cls)  e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function fmtClock() {
  const d = new Date();
  const pad = n => String(n).padStart(2,'0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ── Window manager ────────────────────────────────────────────────────────────

function closeWindow() {
  if (!_activeWin) return;
  _activeWin.remove();
  _activeWin = null;
  if (_taskbarApp) { _taskbarApp.remove(); _taskbarApp = null; }
}

async function openApp(app, iconEl) {
  sfx('pc-enter');

  // Highlight selected icon
  _el.querySelectorAll('.pc-icon').forEach(i => i.classList.remove('selected'));
  iconEl.classList.add('selected');

  // Close any open window first
  closeWindow();

  // ─ Build window ─
  const win = el('div','pc-window');
  _activeWin = win;

  // Title bar
  const titlebar = el('div','pc-window-titlebar');
  const title    = el('span','pc-window-title', `C:\\${app.exe}`);
  const backBtn  = el('button','pc-window-back','[ CLOSE ]');
  titlebar.append(title, backBtn);

  // Content area
  const content = el('div','pc-window-content');

  win.append(titlebar, content);
  _workspace.appendChild(win);

  // Taskbar entry
  _taskbarApp = el('div','pc-taskbar-app', app.exe);
  _el.querySelector('.pc-taskbar').insertBefore(
    _taskbarApp,
    _el.querySelector('.pc-taskbar-clock')
  );

  // Close handlers
  backBtn.addEventListener('click', () => {
    sfx('pc-exit');
    closeWindow();
    _el.querySelectorAll('.pc-icon').forEach(i => i.classList.remove('selected'));
  });

  // Load and start tool
  try {
    const mod = await app.loader();
    mod.startTool(content);
  } catch (err) {
    content.appendChild(Object.assign(el('div','pc-tool-danger'), {
      textContent: `  ✗  Failed to load ${app.exe}: ${err.message}`,
    }));
  }
}

// ── Build DOM ─────────────────────────────────────────────────────────────────

function buildDOM() {
  _el = el('div','pc-desktop');

  // CRT effects
  _el.appendChild(el('div','crt-scanlines'));
  _el.appendChild(el('div','crt-vignette'));

  // ─ Menu bar ─
  const menubar = el('div','pc-menubar');

  const titleSpan = el('span','pc-menubar-title','■ SECUREOS  v1.0');
  const sub       = el('span','pc-menubar-sub','// CYBERSECURITY TOOLKIT');
  const blink     = el('span','crt-blink-cursor','▌');

  const shutBtn   = el('button','pc-shutdown-btn','[ SHUTDOWN ]');
  shutBtn.title   = 'Exit to 3D world (ESC)';

  menubar.append(titleSpan, sub, blink, shutBtn);
  _el.appendChild(menubar);

  // ─ Workspace ─
  _workspace = el('div','pc-workspace');

  // Icon grid
  const grid = el('div','pc-icon-grid');

  APPS.forEach(app => {
    const icon = el('div','pc-icon');
    icon.title = app.exe;

    const art = el('div','pc-icon-art', app.art.join('\n'));
    const lbl = el('div','pc-icon-label', app.exe);
    const desc = el('div','pc-icon-desc', app.desc);

    icon.append(art, lbl, desc);

    icon.addEventListener('click', () => openApp(app, icon));
    icon.addEventListener('dblclick', () => openApp(app, icon));
    grid.appendChild(icon);
  });

  _workspace.appendChild(grid);
  _el.appendChild(_workspace);

  // ─ Taskbar ─
  const taskbar  = el('div','pc-taskbar');
  const sysLabel = el('span','pc-tool-dim','SECUREOS');
  const clock    = el('span','pc-taskbar-clock', fmtClock());

  _clockId = setInterval(() => { clock.textContent = fmtClock(); }, 1000);

  taskbar.append(sysLabel, clock);
  _el.appendChild(taskbar);

  document.body.appendChild(_el);

  // ─ Events ─
  shutBtn.addEventListener('click', () => _onShut?.());

  _keyHandler = e => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (_activeWin) {
        sfx('pc-exit');
        closeWindow();
        _el.querySelectorAll('.pc-icon').forEach(i => i.classList.remove('selected'));
      } else {
        _onShut?.();
      }
    }
  };
  window.addEventListener('keydown', _keyHandler);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function showDesktop(onShutdown) {
  _onShut = onShutdown;
  sfx('pc-enter');
  buildDOM();

  _el.style.transformOrigin = 'center center';
  const { gsap } = window;
  gsap.fromTo(_el,
    { scaleY: 0.005, opacity: 1 },
    { scaleY: 1, duration: 0.45, ease: 'power2.out' }
  );
}

export function hideDesktop(onComplete) {
  if (!_el) { onComplete?.(); return; }
  clearInterval(_clockId);
  _clockId = null;
  if (_keyHandler) {
    window.removeEventListener('keydown', _keyHandler);
    _keyHandler = null;
  }

  const domEl = _el;
  _el = _workspace = _taskbarApp = _activeWin = null;

  const { gsap } = window;
  sfx('pc-exit');
  gsap.timeline({ onComplete: () => { domEl.remove(); onComplete?.(); } })
    .to(domEl, { scaleY: 0.005, duration: 0.28, ease: 'power2.in' })
    .to(domEl, { opacity: 0,    duration: 0.18, ease: 'power1.in' });
}
