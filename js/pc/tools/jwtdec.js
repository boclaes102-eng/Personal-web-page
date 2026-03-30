/**
 * tools/jwtdec.js
 * JWT token decoder — parses and displays header + payload.
 * Fully client-side; never sends the token anywhere.
 *
 * Export: startTool(container)
 */

// ── JWT parsing ───────────────────────────────────────────────────────────────

function b64urlDecode(s) {
  // Add padding, replace URL-safe chars, then atob
  s = s.replace(/-/g,'+').replace(/_/g,'/');
  while (s.length % 4) s += '=';
  try {
    return JSON.parse(decodeURIComponent(escape(atob(s))));
  } catch {
    return null;
  }
}

function parseJWT(token) {
  const parts = token.trim().split('.');
  if (parts.length !== 3) return { error: `Expected 3 parts (got ${parts.length})` };
  const header  = b64urlDecode(parts[0]);
  const payload = b64urlDecode(parts[1]);
  if (!header)  return { error: 'Header is not valid Base64url JSON' };
  if (!payload) return { error: 'Payload is not valid Base64url JSON' };
  return { header, payload, signature: parts[2] };
}

function fmtTime(ts) {
  if (!ts) return null;
  try {
    const d = new Date(ts * 1000);
    const now = Date.now();
    const diff = ts * 1000 - now;
    const abs  = Math.abs(diff);
    const days = Math.floor(abs / 86400000);
    const hrs  = Math.floor((abs % 86400000) / 3600000);
    const mins = Math.floor((abs % 3600000)  / 60000);
    const ago  = diff < 0
      ? `${days ? days+'d ' : ''}${hrs ? hrs+'h ' : ''}${mins}m ago`
      : `in ${days ? days+'d ' : ''}${hrs ? hrs+'h ' : ''}${mins}m`;
    return `${d.toISOString().replace('T',' ').slice(0,19)} UTC  (${ago})`;
  } catch { return String(ts); }
}

// ── DOM helpers ───────────────────────────────────────────────────────────────

function el(tag, cls='', text='') {
  const e = document.createElement(tag);
  if (cls)  e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function kv(parent, key, value, valueCls='pc-tool-value') {
  const wrap = el('div','pc-tool-row');
  wrap.style.alignItems = 'flex-start';

  const k = el('span','pc-tool-label', key);
  k.style.minWidth = '8.5rem';

  const v = el('span', valueCls, String(value ?? 'N/A'));
  v.style.wordBreak = 'break-all';

  wrap.append(k, v);
  parent.appendChild(wrap);
}

function jsonBlock(parent, obj) {
  const pre = el('div','pc-tool-mono');
  pre.style.cssText = 'font-size:0.78em;white-space:pre-wrap;word-break:break-all;cursor:pointer;margin:0.2rem 0;';
  const text = JSON.stringify(obj, null, 2);
  pre.textContent = text;
  pre.title = 'Click to copy';
  pre.addEventListener('click', () => {
    navigator.clipboard.writeText(text).catch(()=>{});
    pre.textContent = '✓ copied!';
    setTimeout(() => { pre.textContent = text; }, 1400);
  });
  parent.appendChild(pre);
}

// ── Tool entry point ──────────────────────────────────────────────────────────

export function startTool(container) {
  container.style.display = 'flex';
  container.style.flexDirection = 'column';

  // ─ Input ─
  const topSection = el('div','pc-tool-section');
  topSection.style.flexShrink = '0';
  topSection.appendChild(el('div','pc-tool-header','PASTE JWT TOKEN'));

  const textarea = document.createElement('textarea');
  textarea.className = 'pc-tool-textarea';
  textarea.placeholder = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0…';
  textarea.setAttribute('spellcheck','false');
  textarea.rows = 3;

  const hint = el('div','pc-tool-dim');
  hint.style.cssText = 'font-size:0.72em;margin-bottom:0.3rem;';
  hint.textContent = 'Decoded locally — nothing sent to any server.';

  topSection.append(textarea, hint);
  container.appendChild(topSection);

  // ─ Output ─
  const output = el('div');
  output.style.cssText = 'flex:1;overflow-y:auto;';
  container.appendChild(output);

  // ─ Render ─
  function render() {
    const token = textarea.value.trim();
    output.innerHTML = '';

    if (!token) {
      output.appendChild(el('div','pc-tool-dim','(paste a JWT token above…)'));
      return;
    }

    const result = parseJWT(token);

    if (result.error) {
      output.appendChild(el('div','pc-tool-danger', `  ✗  ${result.error}`));
      const help = el('div','pc-tool-dim');
      help.style.cssText = 'font-size:0.78em;margin-top:0.3rem;';
      help.textContent = '  A valid JWT has exactly 3 dot-separated Base64url sections.';
      output.appendChild(help);
      return;
    }

    const { header, payload, signature } = result;

    // ─ Header section ─
    const hSec = el('div','pc-tool-section');
    hSec.appendChild(el('div','pc-tool-header','HEADER'));
    kv(hSec, 'Algorithm', header.alg || 'N/A');
    kv(hSec, 'Token type', header.typ || 'N/A');
    if (header.kid) kv(hSec, 'Key ID',   header.kid);
    jsonBlock(hSec, header);
    output.appendChild(hSec);

    // ─ Payload section ─
    const pSec = el('div','pc-tool-section');
    pSec.appendChild(el('div','pc-tool-header','PAYLOAD  CLAIMS'));

    // Well-known claims
    if (payload.sub !== undefined) kv(pSec, 'Subject  (sub)',  payload.sub);
    if (payload.iss !== undefined) kv(pSec, 'Issuer   (iss)',  payload.iss);
    if (payload.aud !== undefined) kv(pSec, 'Audience (aud)',  Array.isArray(payload.aud) ? payload.aud.join(', ') : payload.aud);
    if (payload.jti !== undefined) kv(pSec, 'JWT ID   (jti)',  payload.jti);
    if (payload.email !== undefined) kv(pSec, 'Email',         payload.email);
    if (payload.name  !== undefined) kv(pSec, 'Name',          payload.name);
    if (payload.role  !== undefined) kv(pSec, 'Role',          payload.role);
    if (payload.roles !== undefined) kv(pSec, 'Roles',         Array.isArray(payload.roles) ? payload.roles.join(', ') : payload.roles);

    // Time claims
    if (payload.iat) {
      const t = fmtTime(payload.iat);
      kv(pSec, 'Issued at  (iat)', t || payload.iat);
    }
    if (payload.nbf) {
      const t = fmtTime(payload.nbf);
      kv(pSec, 'Not before (nbf)', t || payload.nbf);
    }
    if (payload.exp) {
      const t   = fmtTime(payload.exp);
      const now = Date.now();
      const cls = payload.exp * 1000 < now ? 'pc-tool-danger' : 'pc-tool-success';
      const expWrap = el('div','pc-tool-row');
      expWrap.style.alignItems = 'flex-start';
      const expKey = el('span','pc-tool-label','Expires  (exp)');
      expKey.style.minWidth = '8.5rem';
      const expVal = el('span', cls);
      expVal.style.wordBreak = 'break-all';
      expVal.textContent = (t || payload.exp) + (payload.exp * 1000 < now ? '  ← EXPIRED' : '  ← VALID');
      expWrap.append(expKey, expVal);
      pSec.appendChild(expWrap);
    }

    pSec.appendChild(el('hr','pc-tool-divider'));
    const fullPayLbl = el('div','pc-tool-dim','Full payload (click to copy):');
    fullPayLbl.style.cssText = 'font-size:0.72em;margin-bottom:0.1rem;';
    pSec.appendChild(fullPayLbl);
    jsonBlock(pSec, payload);
    output.appendChild(pSec);

    // ─ Signature section ─
    const sSec = el('div','pc-tool-section');
    sSec.appendChild(el('div','pc-tool-header','SIGNATURE'));

    const sigNote = el('div','pc-tool-dim');
    sigNote.style.cssText = 'font-size:0.78em;margin-bottom:0.3rem;';
    sigNote.textContent = 'Verification requires the secret/public key — not done here.';
    sSec.appendChild(sigNote);

    const sigVal = el('div','pc-tool-mono');
    sigVal.style.cssText = 'font-size:0.72em;word-break:break-all;cursor:pointer;';
    sigVal.textContent = signature;
    sigVal.title = 'Click to copy signature';
    sigVal.addEventListener('click', () => {
      navigator.clipboard.writeText(signature).catch(()=>{});
      sigVal.textContent = '✓ copied!';
      setTimeout(() => { sigVal.textContent = signature; }, 1400);
    });
    sSec.appendChild(sigVal);
    output.appendChild(sSec);
  }

  textarea.addEventListener('input', render);
  render();
  setTimeout(() => textarea.focus(), 80);
}
