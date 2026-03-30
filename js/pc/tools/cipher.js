/**
 * tools/cipher.js
 * Text encoder / decoder: ROT13, Caesar cipher, Base64, Hex, URL encode.
 * All operations are client-side only.
 *
 * Export: startTool(container)
 */

// ── Transformations ───────────────────────────────────────────────────────────

function rot13(s) {
  return s.replace(/[a-zA-Z]/g, c => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });
}

function caesar(s, shift) {
  shift = ((shift % 26) + 26) % 26;
  return s.replace(/[a-zA-Z]/g, c => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + shift) % 26) + base);
  });
}

function toBase64(s) {
  try { return btoa(unescape(encodeURIComponent(s))); } catch { return '(encoding error)'; }
}

function fromBase64(s) {
  try { return decodeURIComponent(escape(atob(s))); } catch { return '(invalid Base64)'; }
}

function toHex(s) {
  return Array.from(new TextEncoder().encode(s)).map(b => b.toString(16).padStart(2,'0')).join(' ');
}

function fromHex(s) {
  const clean = s.replace(/\s+/g,'');
  if (!/^[0-9a-f]*$/i.test(clean) || clean.length%2!==0) return '(invalid hex)';
  const bytes = [];
  for (let i=0;i<clean.length;i+=2) bytes.push(parseInt(clean.slice(i,i+2),16));
  try { return new TextDecoder().decode(new Uint8Array(bytes)); } catch { return '(decode error)'; }
}

function toUrl(s) { try { return encodeURIComponent(s); } catch { return '(error)'; } }
function fromUrl(s) { try { return decodeURIComponent(s); } catch { return '(invalid URL encoding)'; } }

// ── DOM helpers ───────────────────────────────────────────────────────────────

function el(tag, cls='', text='') {
  const e = document.createElement(tag);
  if (cls)  e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function resultRow(parent, label, value, copyable=true) {
  const wrap = el('div');
  wrap.style.marginBottom = '0.35rem';

  const lbl = el('div','pc-tool-dim');
  lbl.style.cssText = 'font-size:0.72em;letter-spacing:0.06em;margin-bottom:0.1rem;';
  lbl.textContent = label;

  const val = el('div', copyable ? 'pc-tool-value pc-tool-mono' : 'pc-tool-value');
  val.style.wordBreak = 'break-all';
  val.style.fontSize = '0.82em';
  val.textContent = value || '(empty)';

  if (copyable) {
    val.title = 'Click to copy';
    val.addEventListener('click', () => {
      navigator.clipboard.writeText(value).catch(()=>{});
      val.textContent = '✓ copied!';
      setTimeout(() => { val.textContent = value || '(empty)'; }, 1400);
    });
  }

  wrap.append(lbl, val);
  parent.appendChild(wrap);
  return val;
}

// ── Tool entry point ──────────────────────────────────────────────────────────

export function startTool(container) {
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.gap = '0';

  // ─ Top controls ─
  const controls = el('div','pc-tool-section');
  controls.style.flexShrink = '0';

  const h1 = el('div','pc-tool-header','INPUT TEXT');

  const textarea = document.createElement('textarea');
  textarea.className = 'pc-tool-textarea';
  textarea.placeholder = 'Type or paste text to encode / decode…';
  textarea.setAttribute('spellcheck','false');
  textarea.rows = 3;

  // Mode row
  const modeRow = el('div','pc-tool-row');
  modeRow.style.marginBottom = '0.2rem';

  const modeLbl = el('span','pc-tool-label','Mode:');
  modeLbl.style.minWidth = 'auto';
  modeLbl.style.marginRight = '0.4rem';

  const modeSelect = el('select','pc-tool-select') ;
  [['encode','ENCODE'], ['decode','DECODE']].forEach(([v,t]) => {
    const o = document.createElement('option');
    o.value=v; o.textContent=t;
    modeSelect.appendChild(o);
  });

  const shiftLbl = el('span','pc-tool-dim','  Caesar shift:');
  shiftLbl.style.marginLeft = '0.8rem';

  const shiftInp = document.createElement('input');
  shiftInp.type = 'number';
  shiftInp.className = 'pc-tool-input';
  shiftInp.style.cssText = 'width:4.5rem;margin:0 0 0 0.3rem;padding:0.15rem 0.3rem;';
  shiftInp.value = '13';
  shiftInp.min = '1';
  shiftInp.max = '25';

  modeRow.append(modeLbl, modeSelect, shiftLbl, shiftInp);
  controls.append(h1, textarea, modeRow);
  container.appendChild(controls);

  // ─ Output ─
  const outputHead = el('div','pc-tool-header','OUTPUT');
  outputHead.style.flexShrink = '0';
  container.appendChild(outputHead);

  const output = el('div');
  output.style.cssText = 'flex:1;overflow-y:auto;padding-top:0.3rem;';
  container.appendChild(output);

  // ─ Render results ─
  function render() {
    const text = textarea.value;
    const mode = modeSelect.value;
    const shift = parseInt(shiftInp.value, 10) || 13;
    output.innerHTML = '';

    if (!text) {
      output.appendChild(el('div','pc-tool-dim','(type something above…)'));
      return;
    }

    if (mode === 'encode') {
      resultRow(output, 'ROT13',       rot13(text));
      resultRow(output, `CAESAR +${shift}`, caesar(text, shift));
      output.appendChild(el('hr','pc-tool-divider'));
      resultRow(output, 'BASE64',      toBase64(text));
      resultRow(output, 'HEX (UTF-8)', toHex(text));
      resultRow(output, 'URL ENCODE',  toUrl(text));
    } else {
      // decode mode
      resultRow(output, 'ROT13 (self-inverse)',      rot13(text));
      resultRow(output, `CAESAR −${shift}`,         caesar(text, 26-shift));
      output.appendChild(el('hr','pc-tool-divider'));
      resultRow(output, 'BASE64 DECODE',   fromBase64(text));
      resultRow(output, 'HEX DECODE',      fromHex(text));
      resultRow(output, 'URL DECODE',      fromUrl(text));
    }

    const hint = el('div','pc-tool-dim');
    hint.style.cssText = 'font-size:0.7em;margin-top:0.4rem;';
    hint.textContent = '↑ Click any result to copy it.';
    output.appendChild(hint);
  }

  textarea.addEventListener('input',  render);
  modeSelect.addEventListener('change', render);
  shiftInp.addEventListener('input',  render);

  render();
  setTimeout(() => textarea.focus(), 80);
}
