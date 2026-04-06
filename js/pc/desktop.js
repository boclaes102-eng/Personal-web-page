/**
 * desktop.js
 * Retro "SecureOS" desktop home screen shown when the user clicks the computer.
 * Left sidebar shows categories; right panel shows apps for the selected category.
 * Pressing ESC or [ SHUTDOWN ] closes the desktop and triggers the camera zoom-out.
 *
 * Public API:
 *   showDesktop(onShutdown)   — mounts the overlay, GSAP entrance
 *   hideDesktop(onComplete)   — GSAP exit, then calls onComplete
 */

import { sfx } from '../audio/audio-manager.js';

// ── Categories ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: 'operator', label: 'OPERATOR FILE',    icon: '' },
  { id: 'crypto',   label: 'CRYPTOGRAPHY',     icon: '' },
  { id: 'recon',    label: 'RECON & ANALYSIS', icon: '' },
  { id: 'field',    label: 'FIELD TOOLS',      icon: '' },
  { id: 'ai',       label: 'A.I. SYSTEM',      icon: '' },
];

// ── App definitions ───────────────────────────────────────────────────────────

const APPS = [
  // ── OPERATOR FILE ──
  {
    id:       'cv',
    cat:      'operator',
    exe:      'PERSONNEL.EXE',
    name:     'Curriculum Vitae',
    desc:     'Classified operator dossier — experience, education, skills and contact details.',
    art: [
      '┌──────┐',
      '│ ░░░░ │',
      '│ ░░░░ │',
      '│ ░░░░ │',
      '│  ██  │',
      '└──────┘',
      '  C.V.  ',
    ],
    loader: () => import('./tools/cv.js'),
  },
  {
    id:       'github-op',
    cat:      'operator',
    exe:      'GITHUB.EXE',
    name:     'GitHub Profile',
    desc:     'Classified intelligence dossier. Navigate to boclaes102-eng on GitHub.',
    art: [
      '  .---.  ',
      ' /o   o\\ ',
      '|  ---  |',
      ' \\ ___ / ',
      '  )   (  ',
      ' /_) (_\\ ',
      ' GITHUB  ',
    ],
    loader: () => import('./tools/github.js'),
  },

  // ── CRYPTOGRAPHY ──
  {
    id:       'hashgen',
    cat:      'crypto',
    exe:      'HASHGEN.EXE',
    name:     'Hash Generator',
    desc:     'Generate SHA-1, SHA-256 and SHA-512 hashes from any input string or file.',
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
    id:       'cipher',
    cat:      'crypto',
    exe:      'CIPHER.EXE',
    name:     'Cipher Tool',
    desc:     'Encode and decode text with ROT13, Caesar, Base64, Hex and URL encoding.',
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
    id:       'jwtdec',
    cat:      'crypto',
    exe:      'JWTDEC.EXE',
    name:     'JWT Decoder',
    desc:     'Decode and inspect JWT tokens — view header, payload and signature claims.',
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

  // ── RECON & ANALYSIS ──
  {
    id:       'panalyze',
    cat:      'recon',
    exe:      'PANALYZE.EXE',
    name:     'Password Analyzer',
    desc:     'Check password strength, entropy score and known breach database lookup.',
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
    id:       'netinfo',
    cat:      'recon',
    exe:      'NETINFO.EXE',
    name:     'Network Info',
    desc:     'Geolocate any IP address and display full browser and system fingerprint.',
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
    id:       'analytics',
    cat:      'recon',
    exe:      'ANALYTICS.EXE',
    name:     'Site Analytics',
    desc:     'Live visitor stats, room popularity, device & browser breakdown, and arcade top scores.',
    art: [
      '  ▁▃▅█▇  ',
      ' ▁▃▅████ ',
      ' ▃▅██████',
      ' ████████',
      '---------',
      ' VISITS  ',
      ' ROOMS   ',
    ],
    loader: () => import('./tools/analytics.js'),
  },
  {
    id:       'mailspy',
    cat:      'recon',
    exe:      'MAILSPY.EXE',
    name:     'Email Checker',
    desc:     'Check an email address against known breach databases and data broker lists.',
    art: [
      ' _______ ',
      '|       |',
      '|\\ @ @ /|',
      '| \\___/ |',
      '|   #   |',
      '|_______|',
      ' INBOX?  ',
    ],
    loader: () => import('./tools/mailspy.js'),
  },

  // ── FIELD TOOLS ──
  {
    id:       'penguide',
    cat:      'field',
    exe:      'PENGUIDE.EXE',
    name:     'Pentest Guide',
    desc:     'Interactive penetration testing checklist with commands for every phase.',
    art: [
      '.-------.',
      '|>nmap  |',
      '|>nessus|',
      '|>blood |',
      '|[X][ ] |',
      "'--.--.-'",
      ' PENTEST ',
    ],
    loader: () => import('./tools/penguide.js'),
  },
  // ── A.I. SYSTEM ──
  {
    id:       'aichat',
    cat:      'ai',
    exe:      'ARIA.EXE',
    name:     'ARIA Terminal',
    desc:     'Chat with ARIA — Artificial Reasoning Intelligence Assistant. LLM-powered.',
    art: [
      ' _______ ',
      '|  A I  |',
      '| R I A |',
      '|_______|',
      '|> _ █  |',
      '|       |',
      ' NEURAL  ',
    ],
    loader: () => import('./tools/aichat.js'),
  },
];

// ── State ─────────────────────────────────────────────────────────────────────

let _el          = null;
let _workspace   = null;
let _taskbarApp  = null;
let _clockId     = null;
let _onShut      = null;
let _activeWin   = null;
let _keyHandler  = null;
let _activeCatId = 'operator';

// ── DOM helpers ───────────────────────────────────────────────────────────────

function el(tag, cls = '', text = '') {
  const e = document.createElement(tag);
  if (cls)  e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function fmtClock() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ── Window manager ────────────────────────────────────────────────────────────

function closeWindow(onComplete) {
  if (!_activeWin) { onComplete?.(); return; }
  const win = _activeWin;
  const bar = _taskbarApp;
  _activeWin  = null;
  _taskbarApp = null;
  if (bar) bar.remove();
  const { gsap } = window;
  gsap.to(win, {
    y: '100%', opacity: 0, duration: 0.22, ease: 'power2.in',
    onComplete: () => { win.remove(); onComplete?.(); },
  });
}

function closeWindowInstant() {
  if (!_activeWin) return;
  _activeWin.remove();
  _activeWin  = null;
  if (_taskbarApp) { _taskbarApp.remove(); _taskbarApp = null; }
}

async function openApp(app, iconEl) {
  sfx('pc-enter');

  _el.querySelectorAll('.pc-icon').forEach(i => i.classList.remove('selected'));
  iconEl.classList.add('selected');

  closeWindowInstant();

  const win = el('div', 'pc-window');
  _activeWin = win;

  const titlebar = el('div', 'pc-window-titlebar');
  const title    = el('span', 'pc-window-title', `C:\\${app.exe}`);
  const backBtn  = el('button', 'pc-window-back', '[ CLOSE ]');
  titlebar.append(title, backBtn);

  const content = el('div', 'pc-window-content');
  win.append(titlebar, content);
  _workspace.appendChild(win);

  win.addEventListener('keydown', e => {
    if (!e.target.matches('input, textarea')) return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete') sfx('pc-type');
  });

  _taskbarApp = el('div', 'pc-taskbar-app', app.exe);
  _el.querySelector('.pc-taskbar').insertBefore(
    _taskbarApp,
    _el.querySelector('.pc-taskbar-clock'),
  );

  backBtn.addEventListener('click', () => {
    sfx('pc-exit');
    closeWindow(() => {
      _el?.querySelectorAll('.pc-icon').forEach(i => i.classList.remove('selected'));
    });
  });

  try {
    const mod = await app.loader();
    mod.startTool(content);
  } catch (err) {
    content.appendChild(Object.assign(el('div', 'pc-tool-danger'), {
      textContent: `  ✗  Failed to load ${app.exe}: ${err.message}`,
    }));
  }
}

// ── Build icon panel ──────────────────────────────────────────────────────────

function buildIconPanel(catId, panelEl) {
  panelEl.innerHTML = '';

  const cat   = CATEGORIES.find(c => c.id === catId);
  const apps  = APPS.filter(a => a.cat === catId);

  // Category heading inside the panel
  const heading = el('div', 'pc-panel-heading');
  const headTitle = el('span', 'pc-panel-heading-title', cat.label);
  const headCount = el('span', 'pc-panel-heading-count', `${apps.length} PROGRAM${apps.length !== 1 ? 'S' : ''}`);
  heading.append(headTitle, headCount);
  panelEl.appendChild(heading);

  const grid = el('div', 'pc-icon-grid');
  apps.forEach(app => {
    const icon = el('div', 'pc-icon');
    icon.title = app.exe;

    const art  = el('div', 'pc-icon-art', app.art.join('\n'));
    const lbl  = el('div', 'pc-icon-label', app.exe);
    const name = el('div', 'pc-icon-name', app.name);
    const desc = el('div', 'pc-icon-desc', app.desc);

    icon.append(art, lbl, name, desc);
    icon.addEventListener('click', () => openApp(app, icon));
    icon.addEventListener('dblclick', () => openApp(app, icon));
    grid.appendChild(icon);
  });

  panelEl.appendChild(grid);
}

// ── Build DOM ─────────────────────────────────────────────────────────────────

function buildDOM() {
  _el = el('div', 'pc-desktop');

  _el.appendChild(el('div', 'crt-scanlines'));
  _el.appendChild(el('div', 'crt-vignette'));

  // ─ Menu bar ─
  const menubar   = el('div', 'pc-menubar');
  const titleSpan = el('span', 'pc-menubar-title', '■ SECUREOS  v1.0');
  const sub       = el('span', 'pc-menubar-sub', '// CYBERSECURITY TOOLKIT');
  const blink     = el('span', 'crt-blink-cursor', '▌');
  const shutBtn   = el('button', 'pc-shutdown-btn', '[ SHUTDOWN ]');
  shutBtn.title   = 'Exit to 3D world (ESC)';
  menubar.append(titleSpan, sub, blink, shutBtn);
  _el.appendChild(menubar);

  // ─ Workspace: sidebar + panel ─
  _workspace = el('div', 'pc-workspace');

  // Sidebar
  const sidebar = el('div', 'pc-sidebar');

  const sideHeader = el('div', 'pc-sidebar-header', 'MODULES');
  sidebar.appendChild(sideHeader);

  const catItems = [];
  CATEGORIES.forEach(cat => {
    const appsInCat = APPS.filter(a => a.cat === cat.id);
    const item = el('div', 'pc-sidebar-item');
    if (cat.id === _activeCatId) item.classList.add('active');

    const itemLabel = el('span', 'pc-sidebar-item-label', cat.label);
    const itemCount = el('span', 'pc-sidebar-item-count', `[${appsInCat.length}]`);
    item.append(itemLabel, itemCount);

    item.addEventListener('click', () => {
      if (_activeCatId === cat.id) return;
      _activeCatId = cat.id;
      catItems.forEach(ci => ci.classList.remove('active'));
      item.classList.add('active');
      buildIconPanel(cat.id, iconPanel);
    });

    catItems.push(item);
    sidebar.appendChild(item);
  });

  // Sidebar footer: total count
  const sideFooter = el('div', 'pc-sidebar-footer',
    `${APPS.length} PROGRAMS TOTAL`);
  sidebar.appendChild(sideFooter);

  // Icon panel
  const iconPanel = el('div', 'pc-icon-panel');
  buildIconPanel(_activeCatId, iconPanel);

  _workspace.append(sidebar, iconPanel);
  _el.appendChild(_workspace);

  // ─ Taskbar ─
  const taskbar  = el('div', 'pc-taskbar');
  const sysLabel = el('span', 'pc-tool-dim', 'SECUREOS');
  const clock    = el('span', 'pc-taskbar-clock', fmtClock());

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
        closeWindow(() => {
          _el?.querySelectorAll('.pc-icon').forEach(i => i.classList.remove('selected'));
        });
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
    { scaleY: 1, duration: 0.45, ease: 'power2.out' },
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
