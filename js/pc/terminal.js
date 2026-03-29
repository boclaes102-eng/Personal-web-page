/**
 * terminal.js
 * CRT terminal overlay — boots when zoomed into the retro computer,
 * runs the password strength analyzer in terminal style, shuts down on exit.
 *
 * UX:
 *   • Type password → live analysis updates on every keystroke
 *   • Press ENTER (or click [ CHECK BREACH ]) → run HIBP k-anonymity lookup
 *   • Press ESC, click [ SHUTDOWN ], or type 'exit' → CRT shutdown + zoom out
 *
 * Public API:
 *   showTerminal(onCloseRequested)
 *   hideTerminal(onComplete)
 */

'use strict';

// ── Password analysis ─────────────────────────────────────────────────────────

const COMMON_PW = new Set([
  'password','password1','password123','123456','12345678','123456789',
  '1234567890','12345','1234567','qwerty','qwerty123','abc123',
  'iloveyou','admin','welcome','monkey','dragon','master','sunshine',
  'princess','shadow','superman','michael','jessica','football',
  'baseball','soccer','hockey','batman','letmein','passw0rd',
  'trustno1','1q2w3e4r','1qaz2wsx','qazwsx','asdfgh','zxcvbn',
  'qwertyuiop','111111','222222','333333','444444','555555','666666',
  '777777','888888','999999','000000','aaaaaa','123123','121212',
  '112233','123321','password2','p@ssword','p@ssw0rd','pass123',
  'login','hello','guest','test','root','admin123','abcdef',
  'love','money','freedom','summer','winter','changeme','secret',
]);

const KB_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1234567890'];

// Shannon entropy estimate: bits = length × log₂(pool size).
// Pool size = number of possible characters in the character set used.
// 26 lowercase + 26 uppercase + 10 digits + ~32 common symbols = max 94.
function calcEntropy(pw) {
  let pool = 0;
  if (/[a-z]/.test(pw))         pool += 26;
  if (/[A-Z]/.test(pw))         pool += 26;
  if (/[0-9]/.test(pw))         pool += 10;
  if (/[^a-zA-Z0-9]/.test(pw)) pool += 32; // symbols/punctuation
  return pool > 0 ? Math.floor(pw.length * Math.log2(pool)) : 0;
}

// Checks for patterns that make a password predictable regardless of length/entropy.
// Returns an array of { sev: 'high'|'medium'|'low', text } issue objects.
function detectPatterns(pw) {
  const issues = [], lo = pw.toLowerCase();

  if (COMMON_PW.has(lo))
    issues.push({ sev: 'high',   text: 'Very common password — in breach databases' });

  // Regex (.)\1{2,} matches any character repeated 3+ times (e.g. "aaa", "111").
  if (/(.)\1{2,}/.test(pw))
    issues.push({ sev: 'medium', text: 'Repeated characters  (aaa / 111)' });

  // Sequential letters: check every 3-char window for ascending/descending runs.
  // Char codes 97–122 = a–z (lowercase). Both abc and cba are flagged.
  let seqL = false;
  for (let i = 0; i <= lo.length - 3; i++) {
    const a = lo.charCodeAt(i), b = lo.charCodeAt(i+1), c = lo.charCodeAt(i+2);
    const al = v => v >= 97 && v <= 122; // is lowercase letter?
    if (al(a) && al(b) && al(c) && (b===a+1&&c===b+1 || b===a-1&&c===b-1)) { seqL = true; break; }
  }
  if (seqL) issues.push({ sev: 'low', text: 'Sequential letters  (abc / cba)' });

  // Sequential digits: char codes 48–57 = 0–9. Both 123 and 321 are flagged.
  let seqD = false;
  for (let i = 0; i <= pw.length - 3; i++) {
    const a = pw.charCodeAt(i), b = pw.charCodeAt(i+1), c = pw.charCodeAt(i+2);
    const dg = v => v >= 48 && v <= 57; // is digit?
    if (dg(a) && dg(b) && dg(c) && (b===a+1&&c===b+1 || b===a-1&&c===b-1)) { seqD = true; break; }
  }
  if (seqD) issues.push({ sev: 'low', text: 'Sequential digits  (123 / 321)' });

  // Keyboard walk: any 4-char substring that appears in a QWERTY row (or its reverse).
  let kbWalk = false;
  outer: for (const row of KB_ROWS) {
    const rev = row.split('').reverse().join('');
    for (let i = 0; i <= lo.length - 4; i++) {
      const s = lo.slice(i, i+4);
      if (row.includes(s) || rev.includes(s)) { kbWalk = true; break outer; }
    }
  }
  if (kbWalk) issues.push({ sev: 'medium', text: 'Keyboard walk  (qwert / asdf)' });

  if (/^[0-9]+$/.test(pw))     issues.push({ sev: 'medium', text: 'Digits only' });
  if (/^[a-zA-Z]+$/.test(pw)) issues.push({ sev: 'low',    text: 'Letters only' });

  return issues;
}

// Weighted score out of 100 — three positive components plus a pattern penalty:
//   Length      (max 25 pts) — NIST recommends ≥12 chars; 16+ is excellent.
//   Complexity  (max 25 pts) — number of distinct character types used.
//   Entropy     (max 30 pts) — bits of entropy from calcEntropy().
//   Patterns    (max 20 pts, can reduce to 0) — penalty for detected bad patterns.
function calcScore(pw, ent, pats) {
  const len = pw.length;
  let s = 0;

  // Length score: thresholds chosen to match NIST SP 800-63B guidance.
  s += len>=16?25 : len>=12?20 : len>=10?15 : len>=8?10 : len>=5?5 : 0;

  // Complexity score: reward using more character type categories (lower/upper/digit/symbol).
  const t = [/[a-z]/,/[A-Z]/,/[0-9]/,/[^a-zA-Z0-9]/].filter(r=>r.test(pw)).length;
  s += ({4:25,3:18,2:10,1:0,0:0})[t] ?? 0;

  // Entropy score: 80+ bits is considered very strong by security researchers.
  s += ent>=80?30 : ent>=60?25 : ent>=50?20 : ent>=36?15 : ent>=28?8 : 0;

  // Pattern penalty: start with 20 bonus points, subtract for each detected weakness.
  let ps = 20;
  for (const p of pats) ps -= p.sev==='high'?20 : p.sev==='medium'?10 : 5;
  s += Math.max(0, ps); // never go below 0 for this component

  return Math.min(100, s);
}

function strengthLabel(sc) {
  if (sc >= 80) return ['VERY STRONG', 'success'];
  if (sc >= 60) return ['STRONG',      'success'];
  if (sc >= 40) return ['FAIR',        'warn'];
  if (sc >= 20) return ['WEAK',        'danger'];
  return               ['VERY WEAK',   'danger'];
}

function getComp(pw) {
  let lo=0, up=0, di=0, sy=0;
  for (const ch of pw) {
    if (/[a-z]/.test(ch)) lo++;
    else if (/[A-Z]/.test(ch)) up++;
    else if (/[0-9]/.test(ch)) di++;
    else sy++;
  }
  return { lo, up, di, sy };
}

function bar(n, max, w = 18) {
  const f = max > 0 ? Math.round((n / max) * w) : 0;
  return '█'.repeat(f) + '░'.repeat(w - f);
}

function getSuggestions(pw, sc, ent, pats, cm) {
  const s = [];
  if (pw.length < 12) s.push('Use at least 12 characters');
  if (cm.up === 0)    s.push('Add uppercase letters  (A-Z)');
  if (cm.di === 0)    s.push('Include at least one digit  (0-9)');
  if (cm.sy === 0)    s.push('Add special characters  (!@#$%^&*)');
  if (pats.some(p => p.sev === 'high' || p.sev === 'medium'))
    s.push('Avoid predictable patterns');
  if (s.length === 0 && sc >= 80) s.push('Strong password! Store in a password manager.');
  if (s.length === 0 && sc >= 60) s.push('Good — adding a symbol would make it stronger.');
  return s;
}

// ── HIBP k-anonymity breach check ─────────────────────────────────────────────
// HIBP k-anonymity model:
//   1. SHA-1 hash the password locally (never send the plaintext).
//   2. Send only the first 5 hex characters of the hash to the API.
//   3. The API returns all breach-database suffixes that share that prefix (typically ~500 lines).
//   4. Check locally whether our suffix appears — the server never learns the full hash.
// 'Add-Padding: true' requests that the response is padded to a fixed length,
// preventing traffic analysis from inferring which prefix was requested.
async function hibpCheck(pw) {
  const buf    = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(pw));
  const hex    = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('').toUpperCase();
  const prefix = hex.slice(0, 5), suffix = hex.slice(5);
  const res    = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, { headers: { 'Add-Padding': 'true' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  for (const line of (await res.text()).split('\r\n')) {
    const [s, c] = line.split(':');
    if (s === suffix) return parseInt(c, 10);
  }
  return 0;
}

// ── DOM state ─────────────────────────────────────────────────────────────────
let _el          = null;
let _output      = null;
let _input       = null;
let _checkBtn    = null;
let _onClose     = null;
let _lastPw      = '';
let _checkRunning = false;

// ── DOM helpers ───────────────────────────────────────────────────────────────
function make(tag, cls = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

function printLine(text = '', cls = '') {
  const div = make('div', 'term-line' + (cls ? ' term-' + cls : ''));
  div.textContent = text;
  _output.appendChild(div);
  _output.scrollTop = _output.scrollHeight;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function typeLine(text, cls = '', charDelay = 14) {
  const div = make('div', 'term-line' + (cls ? ' term-' + cls : ''));
  _output.appendChild(div);
  for (const ch of text) {
    div.textContent += ch;
    _output.scrollTop = _output.scrollHeight;
    await sleep(charDelay);
  }
}

// ── Boot sequence ─────────────────────────────────────────────────────────────
async function runBoot() {
  // Each entry: t = text, d = per-character delay in ms (overrides default 12ms).
  // Lines without d use the default 12ms/char — quick BIOS output.
  // d: 16 on the "Loading" line makes it feel like the program is actually loading.
  // d: 5 on the progress bar races through quickly for satisfying visual feedback.
  // d: 4 on the box border lines draws them fast but distinctly.
  // Empty strings print a blank line; sleep(55) adds a pause between sections.
  const lines = [
    { t: 'BIOS v2.1.0  (C)1991 Phoenix Technologies' },
    { t: 'Memory Test: 640K OK' },
    { t: 'Detecting drives ... C: FOUND' },
    { t: '' },
    { t: 'Loading PANALYZE.EXE ...', d: 16 },
    { t: '[####################] 100%', d: 5 },
    { t: '' },
    { t: '╔════════════════════════════════════════╗', d: 4 },
    { t: '║      PASSWORD  STRENGTH  ANALYZER      ║', d: 4 },
    { t: '║              PANALYZE v1.0             ║', d: 4 },
    { t: '╚════════════════════════════════════════╝', d: 4 },
    { t: '' },
    { t: 'Analysis runs locally — nothing leaves your browser.' },
    { t: 'Breach checks use k-anonymity  (HIBP API).' },
    { t: '' },
    { t: 'Type your password below.' },
    { t: 'Press ENTER or click [ CHECK BREACH ] for a breach scan.' },
    { t: '' },
  ];
  for (const l of lines) {
    if (!l.t) { printLine(); await sleep(55); }
    else       { await typeLine(l.t, '', l.d ?? 12); await sleep(28); }
  }
}

// ── Analysis display ──────────────────────────────────────────────────────────
function showAnalysis(pw) {
  const ent  = calcEntropy(pw);
  const pats = detectPatterns(pw);
  const sc   = calcScore(pw, ent, pats);
  const cm   = getComp(pw);
  const sugg = getSuggestions(pw, sc, ent, pats, cm);
  const [slabel, scls] = strengthLabel(sc);
  const total = pw.length || 1;

  _output.innerHTML = '';
  printLine();
  // Score bar: w=22 chars — wide enough to show fine-grained progress visually.
  // Composition bars (w=14) are narrower to fit alongside the count labels.
  printLine(`  SCORE    [${bar(sc, 100, 22)}]  ${sc}/100`);
  printLine(`  STRENGTH  ${slabel}`, scls);
  printLine();
  printLine(`  ENTROPY  ${ent} bits`);
  printLine(`  LENGTH   ${pw.length} chars`);
  printLine();
  printLine('  COMPOSITION:');
  printLine(`   a-z  [${bar(cm.lo, total, 14)}]  ${cm.lo}`);
  printLine(`   A-Z  [${bar(cm.up, total, 14)}]  ${cm.up}`);
  printLine(`   0-9  [${bar(cm.di, total, 14)}]  ${cm.di}`);
  printLine(`   !@#  [${bar(cm.sy, total, 14)}]  ${cm.sy}`);
  printLine();
  printLine('  PATTERNS:');
  if (pats.length === 0) {
    printLine('   ✓ None detected', 'success');
  } else {
    for (const p of pats) {
      const icon = p.sev === 'high' ? '✗' : p.sev === 'medium' ? '⚠' : '·';
      const cls  = p.sev === 'high' ? 'danger' : p.sev === 'medium' ? 'warn' : 'dim';
      printLine(`   ${icon} ${p.text}`, cls);
    }
  }
  printLine();
  printLine('  SUGGESTIONS:');
  for (const s of sugg) printLine(`   > ${s}`, 'dim');
  printLine();
  printLine('  ─────────────────────────────────────────────', 'dim');
  printLine('  Press ENTER or [ CHECK BREACH ] for HIBP scan', 'dim');
  printLine();
}

// ── HIBP display ──────────────────────────────────────────────────────────────
async function runHibpCheck() {
  const pw = _lastPw;
  if (!pw) {
    printLine();
    printLine('  > Type a password first, then check.', 'warn');
    printLine();
    return;
  }
  if (_checkRunning) return;
  _checkRunning = true;

  // Update button state
  if (_checkBtn) {
    _checkBtn.textContent = '[ SCANNING... ]';
    _checkBtn.disabled = true;
  }

  printLine();
  printLine('  ── HIBP BREACH CHECK ─────────────────────────', 'dim');
  // Show first 2 characters so the user can confirm the right password is being checked,
  // then mask the rest with asterisks — never displays the full password in the output.
  printLine(`  Sending prefix hash for "${pw.slice(0,2)}${'*'.repeat(Math.max(0, pw.length-2))}"...`, 'dim');

  try {
    const count = await hibpCheck(pw);
    if (count > 0) {
      printLine(`  ✗  COMPROMISED — found ${count.toLocaleString()} times in breach data!`, 'danger');
      printLine('  Do NOT use this password anywhere.', 'danger');
    } else {
      printLine('  ✓  Not found in known breach databases.', 'success');
      printLine('  (This does not guarantee it is safe — use a unique password.)', 'dim');
    }
  } catch {
    printLine('  ✗  Network error — check your connection.', 'warn');
  }

  printLine();
  _output.scrollTop = _output.scrollHeight;
  _checkRunning = false;

  if (_checkBtn) {
    _checkBtn.textContent = '[ CHECK BREACH ]';
    _checkBtn.disabled = false;
  }
}

// ── DOM builder ───────────────────────────────────────────────────────────────
function buildDOM() {
  _el = make('div', 'crt-terminal');

  _el.appendChild(make('div', 'crt-scanlines'));
  _el.appendChild(make('div', 'crt-vignette'));

  const inner = make('div', 'crt-inner');
  _el.appendChild(inner);

  // Top bar: title + CHECK BREACH + SHUTDOWN
  const topbar = make('div', 'crt-topbar');

  const title = make('span', 'crt-title');
  title.textContent = 'C:\\PANALYZE> ';
  topbar.appendChild(title);

  const blink = make('span', 'crt-blink-cursor');
  blink.textContent = '▌';
  topbar.appendChild(blink);

  _checkBtn = make('button', 'crt-breach-btn');
  _checkBtn.textContent = '[ CHECK BREACH ]';
  _checkBtn.title = 'Check HIBP breach database (Enter)';
  topbar.appendChild(_checkBtn);

  const shutBtn = make('button', 'crt-shutdown-btn');
  shutBtn.textContent = '[ SHUTDOWN ]';
  shutBtn.title = 'Exit terminal (ESC)';
  topbar.appendChild(shutBtn);

  inner.appendChild(topbar);

  // Output area
  _output = make('div', 'crt-output');
  inner.appendChild(_output);

  // Input row
  const row = make('div', 'crt-input-row');
  const prompt = make('span', 'crt-prompt');
  prompt.textContent = 'C:\\PANALYZE> ';
  _input = make('input', 'crt-input');
  _input.type = 'password';
  _input.setAttribute('autocomplete',   'off');
  _input.setAttribute('autocorrect',    'off');
  _input.setAttribute('autocapitalize', 'off');
  _input.setAttribute('spellcheck',     'false');
  _input.placeholder = 'type password…';
  row.appendChild(prompt);
  row.appendChild(_input);
  inner.appendChild(row);

  document.body.appendChild(_el);

  // ── Events ──────────────────────────────────────────────────────────────────
  shutBtn.addEventListener('click', () => _onClose?.());

  _checkBtn.addEventListener('click', () => runHibpCheck());

  _input.addEventListener('input', () => {
    const val = _input.value;
    if (!val) { _output.innerHTML = ''; _lastPw = ''; return; }
    if (val === 'exit') return;
    if (val !== _lastPw) { _lastPw = val; showAnalysis(val); }
  });

  _input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.stopPropagation();
      const cmd = _input.value.trim().toLowerCase();
      if (cmd === 'exit' || cmd === 'quit') { _onClose?.(); return; }
      // Enter = run breach check on whatever password is typed
      runHibpCheck();
    }
    if (e.key === 'Escape') {
      e.stopPropagation();
      _onClose?.();
    }
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

export function showTerminal(onClose) {
  _onClose      = onClose;
  _lastPw       = '';
  _checkRunning = false;
  buildDOM();

  _el.style.transformOrigin = 'center center';
  const { gsap } = window;
  gsap.fromTo(_el,
    { scaleY: 0.005, opacity: 1 },
    {
      scaleY: 1, duration: 0.45, ease: 'power2.out',
      onComplete: () => runBoot().then(() => _input?.focus()),
    }
  );
}

export function hideTerminal(onComplete) {
  if (!_el) { onComplete?.(); return; }
  const el = _el;
  _el = _output = _input = _checkBtn = null;

  const { gsap } = window;
  gsap.timeline({ onComplete: () => { el.remove(); onComplete?.(); } })
    .to(el, { scaleY: 0.005, duration: 0.28, ease: 'power2.in' })
    .to(el, { opacity: 0,    duration: 0.18, ease: 'power1.in' });
}
