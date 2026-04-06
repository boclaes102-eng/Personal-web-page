/**
 * tools/aichat.js
 * ARIA — AI terminal chat powered by Groq (Llama 3.1 8B Instant).
 * Streams the response from Groq, then types it out character-by-character
 * with pc-type sound effects.
 *
 * Export: startTool(container)
 */

import { GROQ_API_KEY } from '../../config.js';
import { sfx }            from '../../audio/audio-manager.js';

const MODEL         = 'llama-3.1-8b-instant';
const MAX_HISTORY   = 20;   // messages kept in context (10 conversation turns)
const CHAR_DELAY    = 22;   // ms per character while typing (hold mouse to speed up)
const SYSTEM_PROMPT =
  'You are ARIA (Artificial Reasoning Intelligence Assistant), an AI terminal ' +
  'running inside SecureOS v1.0 — a retro cyberpunk computer system. ' +
  'Be helpful, concise, and slightly cryptic in tone. ' +
  'You can discuss programming, cybersecurity, science, history, or anything else. ' +
  'Avoid markdown — plain text only. Keep responses under 180 words unless asked for more.';

// ── DOM helpers ───────────────────────────────────────────────────────────────

function el(tag, cls = '', text = '') {
  const e = document.createElement(tag);
  if (cls)  e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Tool entry point ──────────────────────────────────────────────────────────

export function startTool(container) {
  if (!GROQ_API_KEY) {
    const warn = el('div', 'pc-tool-warn');
    warn.style.cssText = 'padding:1rem;white-space:pre;';
    warn.textContent = '  ✗  GROQ_API_KEY not configured in js/config.js';
    container.appendChild(warn);
    return;
  }

  // ─ Layout ─
  container.style.cssText = 'display:flex;flex-direction:column;height:100%;';

  // Header
  const header = el('div', 'pc-tool-header');
  header.style.cssText = 'flex-shrink:0;padding:0.4rem 0 0.2rem;';
  header.textContent = 'ARIA  //  ARTIFICIAL REASONING INTELLIGENCE ASSISTANT';
  container.appendChild(header);

  const subline = el('div', 'pc-tool-dim');
  subline.style.cssText = 'flex-shrink:0;font-size:0.75em;margin-bottom:0.6rem;';
  subline.textContent = `MODEL: ${MODEL}  |  MAX CONTEXT: ${MAX_HISTORY / 2} TURNS  |  HOLD MOUSE TO FAST-FORWARD`;
  container.appendChild(subline);

  // Chat log
  const log = el('div');
  log.style.cssText = 'flex:1;overflow-y:auto;font-size:0.85em;line-height:1.55;padding-right:0.3rem;';
  container.appendChild(log);

  // Input row
  const inputRow = el('div', 'pc-tool-row');
  inputRow.style.cssText = 'flex-shrink:0;margin-top:0.5rem;gap:0.4rem;';

  const prompt = el('span', 'pc-tool-value');
  prompt.style.cssText = 'flex-shrink:0;user-select:none;';
  prompt.textContent = 'USER>';

  const inp = document.createElement('input');
  inp.className = 'pc-tool-input';
  inp.style.cssText = 'flex:1;margin:0;';
  inp.placeholder = 'Type a message and press Enter…';
  inp.setAttribute('autocomplete', 'off');
  inp.setAttribute('spellcheck', 'false');

  const sendBtn  = el('button', 'pc-tool-btn', '[ SEND ]');
  const clearBtn = el('button', 'pc-tool-btn', '[ CLEAR ]');

  inputRow.append(prompt, inp, sendBtn, clearBtn);
  container.appendChild(inputRow);

  // ─ State ─
  const history = [];
  let   _busy   = false;
  let   mouseHeld = false;

  // Hold-to-fast-forward (same pattern as github.js)
  log.addEventListener('mousedown', () => { mouseHeld = true; });
  window.addEventListener('mouseup', () => { mouseHeld = false; });

  // ─ Helpers ───────────────────────────────────────────────────────────────

  function isClosed() { return !document.body.contains(container); }

  // Append a row label + empty span, return the span for writing into.
  function appendRow(role) {
    const wrap = el('div');
    wrap.style.marginBottom = '0.55rem';

    const label = el('span');
    label.style.cssText = 'user-select:none;margin-right:0.5rem;';
    label.className = role === 'user' ? 'pc-tool-dim' : 'pc-tool-value';
    label.textContent = role === 'user' ? 'USER>' : 'ARIA>';

    const msg = el('span');
    msg.style.whiteSpace = 'pre-wrap';

    wrap.append(label, msg);
    log.appendChild(wrap);
    log.scrollTop = log.scrollHeight;
    return msg;
  }

  // Type a string char-by-char into an existing span element with sound effects.
  async function typeInto(spanEl, text) {
    for (const ch of text) {
      if (isClosed()) return;
      spanEl.textContent += ch;
      sfx('pc-type');
      log.scrollTop = log.scrollHeight;
      await sleep(mouseHeld ? 2 : CHAR_DELAY);
    }
  }

  function setBusy(state) {
    _busy            = state;
    inp.disabled     = state;
    sendBtn.disabled = state;
    sendBtn.textContent = state ? '[ … ]' : '[ SEND ]';
  }

  // ─ Fetch full response from Groq (streaming under the hood) ──────────────

  async function fetchResponse(messages) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model:    MODEL,
        stream:   true,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson?.error?.message || `HTTP ${res.status}`);
    }

    // Collect full text from SSE stream
    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let   full    = '';
    let   buf     = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        const t = line.trim();
        if (!t || t === 'data: [DONE]' || !t.startsWith('data: ')) continue;
        try {
          const chunk = JSON.parse(t.slice(6)).choices?.[0]?.delta?.content;
          if (chunk) full += chunk;
        } catch { /* skip malformed chunk */ }
      }
    }
    return full;
  }

  // ─ Send message flow ──────────────────────────────────────────────────────

  async function sendMessage() {
    const text = inp.value.trim();
    if (!text || _busy) return;

    inp.value = '';
    const userSpan = appendRow('user');
    userSpan.textContent = text;

    history.push({ role: 'user', content: text });
    if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);

    setBusy(true);

    // Show "processing" cursor while waiting for Groq
    const ariaSpan = appendRow('aria');
    ariaSpan.className = 'pc-tool-dim';
    ariaSpan.textContent = '▌';

    let fullResponse = '';
    try {
      fullResponse = await fetchResponse(history);
    } catch (err) {
      ariaSpan.className   = 'pc-tool-warn';
      ariaSpan.textContent = `✗  ${err.message || 'Request failed'}`;
      history.pop();
      setBusy(false);
      inp.focus();
      return;
    }

    // Clear the cursor, then type the response char-by-char with sound
    ariaSpan.className   = '';
    ariaSpan.textContent = '';
    await typeInto(ariaSpan, fullResponse);

    history.push({ role: 'assistant', content: fullResponse });
    if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);

    setBusy(false);
    inp.focus();
  }

  // ─ Events ─────────────────────────────────────────────────────────────────

  sendBtn.addEventListener('click', sendMessage);

  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.stopPropagation(); sendMessage(); }
  });

  clearBtn.addEventListener('click', () => {
    if (_busy) return;
    history.length = 0;
    log.innerHTML  = '';
    // Re-add boot header after clear
    log.appendChild(bootEl());
    inp.focus();
  });

  // ─ Boot message ───────────────────────────────────────────────────────────

  function bootEl() {
    const b = el('div', 'pc-tool-dim');
    b.style.cssText = 'margin-bottom:0.8rem;white-space:pre;font-size:0.82em;';
    b.textContent =
      '  ┌─────────────────────────────────────────────┐\n' +
      '  │  ARIA TERMINAL  //  SECUREOS v1.0           │\n' +
      '  │  Connection established. Ready for input.   │\n' +
      '  └─────────────────────────────────────────────┘';
    return b;
  }

  log.appendChild(bootEl());
  inp.focus();
}
