/**
 * tools/hashgen.js
 * Hash generator: SHA-1, SHA-256, SHA-512 via Web Crypto API.
 * Also identifies common hash formats when input looks like a hash.
 *
 * Export: startTool(container)
 */

// ── Hash identification ───────────────────────────────────────────────────────

const HASH_TYPES = [
  { name: 'MD5 / NTLM',  len: 32, re: /^[0-9a-f]{32}$/i,   bits: 128,  notes: 'MD5 (deprecated for security), NTLM' },
  { name: 'SHA-1',        len: 40, re: /^[0-9a-f]{40}$/i,   bits: 160,  notes: 'SHA-1 (deprecated — collision attacks known)' },
  { name: 'SHA-224',      len: 56, re: /^[0-9a-f]{56}$/i,   bits: 224,  notes: 'SHA-224 (SHA-2 family)' },
  { name: 'SHA-256',      len: 64, re: /^[0-9a-f]{64}$/i,   bits: 256,  notes: 'SHA-256 (SHA-2 family — widely used)' },
  { name: 'SHA-384',      len: 96, re: /^[0-9a-f]{96}$/i,   bits: 384,  notes: 'SHA-384 (SHA-2 family)' },
  { name: 'SHA-512',      len:128, re: /^[0-9a-f]{128}$/i,  bits: 512,  notes: 'SHA-512 (SHA-2 family — very strong)' },
  { name: 'bcrypt',       len:  0, re: /^\$2[aby]\$\d{2}\$.{53}$/, bits: null, notes: 'bcrypt (slow KDF — good for passwords)' },
  { name: 'Argon2',       len:  0, re: /^\$argon2(i|d|id)\$/,       bits: null, notes: 'Argon2 (memory-hard KDF — excellent for passwords)' },
  { name: 'PBKDF2 (B64)', len:  0, re: /^[A-Za-z0-9+/]{43}={0,1}$/, bits: null, notes: 'Possible PBKDF2 / raw Base64 (256-bit)' },
];

function identifyHash(input) {
  const trimmed = input.trim();
  const matches = HASH_TYPES.filter(h => h.re.test(trimmed));
  return matches;
}

// ── SHA hashing ───────────────────────────────────────────────────────────────

async function sha(algo, text) {
  const buf = await crypto.subtle.digest(algo, new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

// ── DOM helpers ───────────────────────────────────────────────────────────────

function el(tag, cls='', text='') {
  const e = document.createElement(tag);
  if (cls)  e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function copyable(container, label, value) {
  const row = el('div','pc-tool-row');
  row.style.alignItems = 'flex-start';

  const lbl = el('span','pc-tool-label', label);
  const val = el('div','pc-tool-value pc-tool-mono', value);
  val.title = 'Click to copy';
  val.style.flex = '1';
  val.addEventListener('click', () => {
    navigator.clipboard.writeText(value).catch(()=>{});
    val.textContent = '✓ copied!';
    setTimeout(() => { val.textContent = value; }, 1400);
  });

  row.append(lbl, val);
  container.appendChild(row);
}

// ── Tool entry point ──────────────────────────────────────────────────────────

export function startTool(container) {
  container.style.display = 'flex';
  container.style.flexDirection = 'column';

  // ─ Input area ─
  const topSection = el('div','pc-tool-section');
  topSection.style.flexShrink = '0';

  const h1 = el('div','pc-tool-header','INPUT');
  const inp = document.createElement('input');
  inp.className = 'pc-tool-input';
  inp.placeholder = 'Type text to hash, or paste a hash to identify…';
  inp.setAttribute('autocomplete','off');
  inp.setAttribute('spellcheck','false');

  const btnRow = el('div','pc-tool-row');
  const genBtn = el('button','pc-tool-btn','[ GENERATE HASHES ]');
  const idBtn  = el('button','pc-tool-btn','[ IDENTIFY HASH ]');
  btnRow.append(genBtn, idBtn);

  topSection.append(h1, inp, btnRow);
  container.appendChild(topSection);

  // ─ Output ─
  const output = el('div');
  output.style.cssText = 'flex:1;overflow-y:auto;';
  container.appendChild(output);

  // ─ Generate hashes ─
  async function doGenerate() {
    const text = inp.value;
    if (!text) { showMsg('Enter some text first.', 'pc-tool-warn'); return; }
    genBtn.disabled = true;
    genBtn.textContent = '[ HASHING… ]';
    output.innerHTML = '';

    const section = el('div','pc-tool-section');
    section.appendChild(el('div','pc-tool-header',`HASHES — "${text.length > 40 ? text.slice(0,40)+'…' : text}"`));

    try {
      const [h1r, h256r, h512r] = await Promise.all([
        sha('SHA-1',   text),
        sha('SHA-256', text),
        sha('SHA-512', text),
      ]);
      copyable(section, 'SHA-1   (160b)', h1r);
      copyable(section, 'SHA-256 (256b)', h256r);
      copyable(section, 'SHA-512 (512b)', h512r);

      const hint = el('div','pc-tool-dim');
      hint.style.cssText = 'font-size:0.72em;margin-top:0.4rem;';
      hint.textContent = '↑ Click any hash to copy it to clipboard.';
      section.appendChild(hint);
    } catch {
      section.appendChild(el('div','pc-tool-danger','  ✗ Hashing failed — browser error.'));
    }

    output.appendChild(section);
    genBtn.disabled = false;
    genBtn.textContent = '[ GENERATE HASHES ]';
  }

  // ─ Identify hash ─
  function doIdentify() {
    const text = inp.value.trim();
    if (!text) { showMsg('Paste a hash string first.', 'pc-tool-warn'); return; }
    output.innerHTML = '';

    const section = el('div','pc-tool-section');
    section.appendChild(el('div','pc-tool-header','HASH IDENTIFICATION'));

    const lenRow = el('div','pc-tool-row');
    lenRow.append(
      Object.assign(el('span','pc-tool-label'), {textContent:'Input length'}),
      Object.assign(el('span','pc-tool-value'), {textContent:`${text.length} chars`})
    );
    section.appendChild(lenRow);

    const isHex = /^[0-9a-f]+$/i.test(text);
    const isB64 = /^[A-Za-z0-9+/]+=*$/.test(text);
    const charRow = el('div','pc-tool-row');
    charRow.append(
      Object.assign(el('span','pc-tool-label'), {textContent:'Charset'}),
      Object.assign(el('span','pc-tool-value'), {
        textContent: isHex ? 'Hex (0-9, a-f)' : isB64 ? 'Base64' : 'Mixed / Unknown',
      })
    );
    section.appendChild(charRow);

    const hr = el('hr','pc-tool-divider');
    section.appendChild(hr);

    const matches = identifyHash(text);
    if (matches.length === 0) {
      section.appendChild(el('div','pc-tool-warn','  ⚠  No known hash format matched.'));
      const hint2 = el('div','pc-tool-dim');
      hint2.style.cssText = 'font-size:0.72em;margin-top:0.3rem;';
      hint2.textContent = 'Try generating hashes from text instead.';
      section.appendChild(hint2);
    } else {
      matches.forEach(m => {
        const mDiv = el('div');
        mDiv.style.marginBottom = '0.5rem';

        const nameEl = el('div','pc-tool-success');
        nameEl.textContent = `  ✓  ${m.name}`;
        nameEl.style.fontWeight = 'bold';

        const bitsEl = el('div','pc-tool-dim');
        bitsEl.style.cssText = 'font-size:0.78em;margin-left:1rem;';
        bitsEl.textContent = m.bits ? `  ${m.bits} bits — ${m.notes}` : `  ${m.notes}`;

        mDiv.append(nameEl, bitsEl);
        section.appendChild(mDiv);
      });
    }

    output.appendChild(section);
  }

  function showMsg(text, cls) {
    output.innerHTML = '';
    output.appendChild(el('div', cls, text));
  }

  genBtn.addEventListener('click', doGenerate);
  idBtn.addEventListener('click', doIdentify);

  inp.addEventListener('keydown', e => {
    if (e.key==='Enter') { e.stopPropagation(); doGenerate(); }
  });

  setTimeout(() => inp.focus(), 80);
}
