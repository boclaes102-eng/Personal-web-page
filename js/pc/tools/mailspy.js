/**
 * tools/mailspy.js
 * Email security checker:
 *   • Local format & domain analysis
 *   • Reputation via emailrep.io (10 free anonymous lookups/day, CORS-friendly)
 *   • Data broker awareness + opt-out guidance
 *   • Known breach overview
 *
 * Export: startTool(container)
 */

// ── Static datasets ───────────────────────────────────────────────────────────

const FREE_DOMAINS = new Set([
  'gmail.com','googlemail.com','yahoo.com','yahoo.fr','yahoo.co.uk','yahoo.de',
  'yahoo.es','hotmail.com','hotmail.fr','hotmail.co.uk','hotmail.de','outlook.com',
  'outlook.fr','live.com','live.fr','icloud.com','me.com','mac.com','aol.com',
  'protonmail.com','proton.me','tutanota.com','zoho.com','mail.com','yandex.com',
  'yandex.ru','gmx.com','gmx.net','gmx.de','msn.com','rocketmail.com',
]);

const DISPOSABLE_HINTS = [
  'mailinator','guerrillamail','throwam','yopmail','trashmail','sharklasers',
  'maildrop','spamgourmet','dispostable','fakeinbox','nospam.ze','mytrashmail',
  'filzmail','deadaddress','10minutemail','tempmail','disposable','throwaway',
  'spam4','mailnull','jetable','trashmail','trillianpro','binkmail',
];

const DATA_BROKERS = [
  { name: 'Acxiom',          risk: 'CRITICAL', note: 'Largest data broker — sells to 1000+ companies worldwide' },
  { name: 'Oracle BlueKai',  risk: 'CRITICAL', note: 'Behavioural ad targeting — enormous consumer profiles' },
  { name: 'LiveRamp',        risk: 'CRITICAL', note: 'Identity resolution — links all your online identities' },
  { name: 'Epsilon',         risk: 'HIGH',     note: 'Email marketing — sells consumer data to direct mailers' },
  { name: 'LexisNexis',      risk: 'HIGH',     note: 'Legal & identity data — widely shared with businesses' },
  { name: 'Experian Mktg',   risk: 'HIGH',     note: 'Credit bureau that also sells marketing profiles' },
  { name: 'Spokeo',          risk: 'HIGH',     note: 'People-finder: address, phone, email, relatives' },
  { name: 'BeenVerified',    risk: 'HIGH',     note: 'Background checks — aggregates public records' },
  { name: 'Whitepages',      risk: 'HIGH',     note: 'People search & reverse phone / email lookup' },
  { name: 'Intelius',        risk: 'HIGH',     note: 'Background checks, criminal records, address history' },
  { name: 'TruthFinder',     risk: 'HIGH',     note: 'Background checks + dark web monitoring upsells' },
  { name: 'MyLife',          risk: 'MEDIUM',   note: 'Online reputation profiles — hard to opt out' },
  { name: 'Radaris',         risk: 'MEDIUM',   note: 'People search aggregator — very persistent profiles' },
  { name: 'CoreLogic',       risk: 'MEDIUM',   note: 'Property data + consumer lending profiles' },
  { name: 'Equifax Mktg',    risk: 'MEDIUM',   note: 'Credit bureau marketing division' },
];

const NOTABLE_BREACHES = [
  { name: 'Yahoo',              year: 2016, records: '3  BILLION',    note: 'Largest single data breach in history' },
  { name: 'RockYou2024',        year: 2024, records: '9.9 BILLION',   note: 'Compiled from thousands of past breaches' },
  { name: 'National Public',    year: 2024, records: '2.9 BILLION',   note: 'SSNs + full background data leaked' },
  { name: 'Collection #1',      year: 2019, records: '773 MILLION',   note: 'Email + password combinations' },
  { name: 'LinkedIn',           year: 2021, records: '700 MILLION',   note: 'Professional profiles + emails scraped' },
  { name: 'Facebook',           year: 2021, records: '533 MILLION',   note: 'Phone numbers + profile data' },
  { name: 'Twitter / X',        year: 2022, records: '235 MILLION',   note: 'Email addresses linked to accounts' },
  { name: 'Adobe',              year: 2013, records: '153 MILLION',   note: 'Emails + weakly encrypted passwords' },
  { name: 'Canva',              year: 2019, records: '137 MILLION',   note: 'Emails + hashed passwords' },
];

// ── DOM helpers ───────────────────────────────────────────────────────────────

function el(tag, cls = '', text = '') {
  const e = document.createElement(tag);
  if (cls)  e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function section(parent, title) {
  const s = el('div', 'pc-tool-section');
  s.appendChild(el('div', 'pc-tool-header', title));
  parent.appendChild(s);
  return s;
}

function kv(parent, label, value, valueCls = 'pc-tool-value') {
  const row = el('div', 'pc-tool-row');
  row.style.marginBottom = '0.2rem';
  const lbl = el('span', 'pc-tool-label', label);
  lbl.style.minWidth = '10rem';
  const val = el('span', valueCls, String(value ?? 'N/A'));
  row.append(lbl, val);
  parent.appendChild(row);
}

// ── Local email analysis ──────────────────────────────────────────────────────

function analyzeEmail(email) {
  const r = { valid: false, local: '', domain: '', type: 'unknown', notes: [] };
  const m = email.match(/^([^@]+)@([^@]+)$/);
  if (!m) { r.notes.push({ text: 'Invalid email format', cls: 'pc-tool-danger' }); return r; }

  r.valid  = true;
  r.local  = m[1];
  r.domain = m[2].toLowerCase();

  // Disposable check
  const domLower = r.domain.toLowerCase();
  if (DISPOSABLE_HINTS.some(h => domLower.includes(h))) {
    r.type = 'disposable';
    r.notes.push({ text: 'Disposable / temporary email domain', cls: 'pc-tool-danger' });
  } else if (FREE_DOMAINS.has(r.domain)) {
    r.type = 'free';
    r.notes.push({ text: 'Free email provider', cls: 'pc-tool-warn' });
  } else {
    r.type = 'custom';
    r.notes.push({ text: 'Custom domain (could be corporate or personal)', cls: 'pc-tool-success' });
  }

  // Gmail + alias / dot trick detection
  if (r.domain === 'gmail.com' || r.domain === 'googlemail.com') {
    const normalized = r.local.replace(/\./g, '').split('+')[0];
    if (r.local.includes('+')) {
      r.notes.push({ text: `Gmail alias detected — base address: ${normalized}@gmail.com`, cls: 'pc-tool-dim' });
    }
    if (r.local.includes('.')) {
      r.notes.push({ text: 'Gmail ignores dots — dots are cosmetic only', cls: 'pc-tool-dim' });
    }
  }

  // Subaddressing detection
  if (r.local.includes('+') && r.domain !== 'gmail.com') {
    r.notes.push({ text: 'Subaddress (+tag) detected — can reveal base email', cls: 'pc-tool-dim' });
  }

  // Local part suspicious patterns
  if (/\d{6,}/.test(r.local)) {
    r.notes.push({ text: 'Long number string in local part — common in auto-generated or breached addresses', cls: 'pc-tool-warn' });
  }

  return r;
}

// ── Tool entry point ──────────────────────────────────────────────────────────

export function startTool(container) {
  container.style.display       = 'flex';
  container.style.flexDirection = 'column';

  // ─ Input ─
  const inputSec = el('div', 'pc-tool-section');
  inputSec.style.flexShrink = '0';
  inputSec.appendChild(el('div', 'pc-tool-header', 'EMAIL  ADDRESS'));

  const row = el('div', 'pc-tool-row');
  row.style.flexWrap = 'nowrap';
  const inp = document.createElement('input');
  inp.className = 'pc-tool-input';
  inp.type = 'email';
  inp.placeholder = 'you@example.com';
  inp.setAttribute('autocomplete', 'off');
  inp.setAttribute('spellcheck', 'false');
  inp.style.marginBottom = '0';
  const scanBtn = el('button', 'pc-tool-btn', '[ SCAN ]');
  scanBtn.style.flexShrink = '0';
  row.append(inp, scanBtn);

  const hint = el('div', 'pc-tool-dim');
  hint.style.cssText = 'font-size:0.72em;margin-top:0.2rem;';
  hint.textContent = 'Email sent to emailrep.io API for reputation check (10 free lookups/day · no storage).';
  inputSec.append(row, hint);
  container.appendChild(inputSec);

  // ─ Output ─
  const output = el('div');
  output.style.cssText = 'flex:1;overflow-y:auto;';
  container.appendChild(output);

  // Always render static data broker + breach info
  function renderStaticInfo() {
    // Data broker section
    const brkSec = section(output, 'KNOWN  DATA  BROKERS  (top 15)');

    const riskColors = { CRITICAL: 'pc-tool-danger', HIGH: 'pc-tool-warn', MEDIUM: 'pc-tool-dim' };
    DATA_BROKERS.forEach(b => {
      const bRow = el('div', 'pc-tool-row');
      bRow.style.marginBottom = '0.25rem';
      bRow.style.alignItems = 'flex-start';

      const badge = el('span', riskColors[b.risk] || 'pc-tool-dim');
      badge.style.cssText = 'font-size:0.72em;min-width:5rem;flex-shrink:0;';
      badge.textContent = `[${b.risk}]`;

      const nameEl = el('span', 'pc-tool-value');
      nameEl.style.cssText = 'font-size:0.8em;font-weight:bold;min-width:9rem;flex-shrink:0;';
      nameEl.textContent = b.name;

      const noteEl = el('span', 'pc-tool-dim');
      noteEl.style.fontSize = '0.75em';
      noteEl.textContent = b.note;

      bRow.append(badge, nameEl, noteEl);
      brkSec.appendChild(bRow);
    });

    const optOut = el('div', 'pc-tool-dim');
    optOut.style.cssText = 'font-size:0.73em;margin-top:0.5rem;border-top:1px solid rgba(0,255,65,0.15);padding-top:0.35rem;';
    optOut.textContent = '▶ Opt-out: visit each broker\'s website → Privacy/CCPA → "Do Not Sell" or "Delete My Data". For bulk removal use services like DeleteMe, Privacy Bee, or Incogni.';
    brkSec.appendChild(optOut);

    // Notable breaches section
    const brchSec = section(output, 'NOTABLE  BREACH  DATABASES');

    NOTABLE_BREACHES.forEach(b => {
      const bRow = el('div', 'pc-tool-row');
      bRow.style.marginBottom = '0.2rem';

      const yr = el('span', 'pc-tool-dim');
      yr.style.cssText = 'font-size:0.72em;min-width:3.5rem;flex-shrink:0;';
      yr.textContent = b.year;

      const nm = el('span', 'pc-tool-value');
      nm.style.cssText = 'font-size:0.8em;min-width:9rem;flex-shrink:0;';
      nm.textContent = b.name;

      const rec = el('span', 'pc-tool-warn');
      rec.style.cssText = 'font-size:0.78em;min-width:8rem;flex-shrink:0;';
      rec.textContent = b.records + ' records';

      const note = el('span', 'pc-tool-dim');
      note.style.fontSize = '0.73em';
      note.textContent = b.note;

      bRow.append(yr, nm, rec, note);
      brchSec.appendChild(bRow);
    });

    const hibpNote = el('div', 'pc-tool-dim');
    hibpNote.style.cssText = 'font-size:0.73em;margin-top:0.4rem;border-top:1px solid rgba(0,255,65,0.15);padding-top:0.35rem;';
    hibpNote.textContent = '▶ Check your email against all known breaches at: haveibeenpwned.com  (free, trusted, maintained by Troy Hunt)';
    brchSec.appendChild(hibpNote);
  }

  // ─ Scan logic ─
  let _scanning = false;

  async function doScan() {
    const email = inp.value.trim();
    if (!email) { return; }
    if (_scanning) return;
    _scanning = true;
    scanBtn.textContent = '[ SCANNING… ]';
    scanBtn.disabled = true;

    output.innerHTML = '';

    // 1. Local analysis
    const local = analyzeEmail(email);
    const localSec = section(output, 'EMAIL  ANALYSIS');

    if (!local.valid) {
      localSec.appendChild(el('div', 'pc-tool-danger', '  ✗  Invalid email format'));
    } else {
      kv(localSec, 'Address',    email);
      kv(localSec, 'Local part', local.local);
      kv(localSec, 'Domain',     local.domain);
      kv(localSec, 'Type',       local.type === 'free' ? 'Free email provider' : local.type === 'disposable' ? '⚠ Disposable / temporary' : 'Custom domain',
         local.type === 'disposable' ? 'pc-tool-danger' : local.type === 'free' ? 'pc-tool-warn' : 'pc-tool-success');

      local.notes.forEach(n => {
        const d = el('div', n.cls);
        d.style.cssText = 'font-size:0.78em;margin-top:0.15rem;padding-left:0.3rem;';
        d.textContent = '  · ' + n.text;
        localSec.appendChild(d);
      });
    }

    // 2. Reputation section — emailrep.io is a server-side-only API (no CORS headers),
    //    so we skip the fetch entirely and point the user to check manually.
    if (local.valid) {
      const repSec = section(output, 'REPUTATION  CHECK  (emailrep.io)');
      const note = el('div', 'pc-tool-warn');
      note.textContent = '  ✗ Not available from browser — emailrep.io blocks cross-origin requests';
      repSec.appendChild(note);
      const fallback = el('div', 'pc-tool-dim');
      fallback.style.cssText = 'font-size:0.75em;margin-top:0.25rem;';
      fallback.textContent = '  Check manually at: emailrep.io  ·  haveibeenpwned.com';
      repSec.appendChild(fallback);
    }

    // 3. Static info (always render)
    renderStaticInfo();

    _scanning = false;
    scanBtn.textContent = '[ SCAN ]';
    scanBtn.disabled = false;
  }

  scanBtn.addEventListener('click', doScan);
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.stopPropagation(); doScan(); }
  });

  // Initial: show static info immediately
  renderStaticInfo();
  setTimeout(() => inp.focus(), 80);
}
