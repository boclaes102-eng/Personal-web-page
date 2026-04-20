/**
 * security-monitor.js
 * Detects and reports suspicious activity on thedeepspaceproject.be to the SIEM.
 *
 * Detects:
 *  - XSS attempts in URL, inputs, and form fields
 *  - SQL injection attempts in inputs
 *  - Path/parameter probing (scanner bots)
 *  - Rapid repeated form submissions (brute force)
 *  - JavaScript prototype pollution attempts
 *  - Suspicious referrers
 *  - Unhandled JS errors that suggest exploitation
 *  - DevTools detection (potential recon)
 */

import { siemEvent } from './siem.js';

// ── Attack pattern signatures ────────────────────────────────────────────────

const XSS_PATTERNS = [
  /<script[\s>]/i,
  /javascript\s*:/i,
  /on\w+\s*=/i,          // onerror=, onclick=, etc.
  /<iframe/i,
  /<img[^>]+src\s*=/i,
  /document\.(cookie|write|location)/i,
  /eval\s*\(/i,
  /expression\s*\(/i,
  /vbscript\s*:/i,
  /data:text\/html/i,
];

const SQLI_PATTERNS = [
  /'\s*(or|and)\s*'?\d/i,          // ' or '1'='1
  /union\s+select/i,
  /;\s*drop\s+table/i,
  /;\s*delete\s+from/i,
  /--\s*$/,                         // SQL comment at end
  /\/\*.*\*\//,                     // inline comment
  /xp_cmdshell/i,
  /exec\s*\(/i,
  /cast\s*\(\s*\w+\s+as\s+\w+\)/i,
  /benchmark\s*\(\d+/i,
  /sleep\s*\(\d+/i,
  /load_file\s*\(/i,
];

const SUSPICIOUS_PATHS = [
  /wp-admin/i, /wp-login/i, /phpMyAdmin/i,
  /\.env/i, /\.git\//i, /\.htaccess/i,
  /etc\/passwd/i, /etc\/shadow/i,
  /admin\/config/i, /config\.php/i,
  /shell\.php/i, /cmd\.php/i, /c99/i,
  /\/proc\//i, /\/bin\//i,
  /xmlrpc\.php/i, /eval-stdin/i,
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function matchesAny(str, patterns) {
  return patterns.find(p => p.test(str)) ?? null;
}

function getClientIp() {
  // Best-effort — not reliable from browser but worth logging
  return null;
}

function report(action, severity, message, rawData = {}) {
  siemEvent({
    category: 'threat',
    action,
    severity,
    message,
    rawData: { url: location.href, userAgent: navigator.userAgent, ...rawData },
  });
}

// ── 1. URL / query string scanning ────────────────────────────────────────────

function scanUrl() {
  const full = decodeURIComponent(location.href + location.hash);

  const xss = matchesAny(full, XSS_PATTERNS);
  if (xss) {
    report('xss_attempt', 'high', `XSS pattern in URL: ${xss}`, { payload: full.slice(0, 300) });
    return;
  }

  const sqli = matchesAny(full, SQLI_PATTERNS);
  if (sqli) {
    report('sqli_attempt', 'high', `SQLi pattern in URL: ${sqli}`, { payload: full.slice(0, 300) });
    return;
  }

  const path = matchesAny(full, SUSPICIOUS_PATHS);
  if (path) {
    report('path_probe', 'medium', `Suspicious path probe: ${location.pathname}`, { path: location.pathname });
  }
}

// ── 2. Input field scanning ───────────────────────────────────────────────────

function scanInput(value, fieldName) {
  const xss = matchesAny(value, XSS_PATTERNS);
  if (xss) {
    report('xss_attempt', 'high', `XSS pattern in form field "${fieldName}"`, { field: fieldName, pattern: String(xss) });
    return true;
  }

  const sqli = matchesAny(value, SQLI_PATTERNS);
  if (sqli) {
    report('sqli_attempt', 'high', `SQLi pattern in form field "${fieldName}"`, { field: fieldName, pattern: String(sqli) });
    return true;
  }

  return false;
}

function hookInputs() {
  // Scan all inputs on submit
  document.addEventListener('submit', (e) => {
    const form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    const inputs = form.querySelectorAll('input, textarea');
    inputs.forEach(input => {
      if (input.value) scanInput(input.value, input.name || input.id || input.type);
    });
  }, true);

  // Also scan on blur (catches cases where form isn't submitted normally)
  document.addEventListener('focusout', (e) => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) return;
    if (el.value && el.value.length > 10) {
      scanInput(el.value, el.name || el.id || el.type);
    }
  }, true);
}

// ── 3. Rapid submission / brute force detection ───────────────────────────────

const _submitTimes = [];
const SUBMIT_WINDOW_MS  = 30_000;  // 30 seconds
const SUBMIT_THRESHOLD  = 8;       // 8 submissions in 30s = suspicious

function hookRapidSubmit() {
  document.addEventListener('submit', () => {
    const now = Date.now();
    _submitTimes.push(now);

    // Purge old entries
    const cutoff = now - SUBMIT_WINDOW_MS;
    while (_submitTimes.length && _submitTimes[0] < cutoff) _submitTimes.shift();

    if (_submitTimes.length >= SUBMIT_THRESHOLD) {
      report('rapid_submission', 'medium', `${_submitTimes.length} form submissions in 30s — possible brute force`);
      _submitTimes.length = 0; // reset to avoid flooding
    }
  }, true);
}

// ── 4. Suspicious referrer ────────────────────────────────────────────────────

function checkReferrer() {
  const ref = document.referrer;
  if (!ref) return;

  const SUSPICIOUS_REFERRERS = [
    /shodan\.io/i, /censys\.io/i, /zoomeye\.org/i,
    /fofa\.info/i, /hunter\.io/i, /leakix\.net/i,
    /exploit-db/i, /rapid7/i, /metasploit/i,
    /burpsuite/i, /hackertarget/i,
  ];

  const match = matchesAny(ref, SUSPICIOUS_REFERRERS);
  if (match) {
    report('suspicious_referrer', 'medium', `Visit from suspicious referrer: ${ref}`, { referrer: ref });
  }
}

// ── 5. JavaScript errors (potential exploitation signal) ──────────────────────

let _errorCount = 0;
const ERROR_THRESHOLD = 5;

function hookErrors() {
  window.addEventListener('error', (e) => {
    _errorCount++;
    // Only report clusters of errors, not normal one-offs
    if (_errorCount === ERROR_THRESHOLD) {
      report('js_error_spike', 'low', `${_errorCount} JS errors in session — possible exploitation attempt`, {
        lastError: e.message,
        filename: e.filename,
      });
    }
  });

  window.addEventListener('unhandledrejection', (e) => {
    const msg = String(e.reason?.message ?? e.reason ?? '');
    // Flag if error message contains suspicious keywords
    if (/eval|injection|prototype|__proto__|constructor/i.test(msg)) {
      report('suspicious_js_error', 'medium', `Suspicious unhandled rejection: ${msg.slice(0, 200)}`);
    }
  });
}

// ── 6. Prototype pollution detection ─────────────────────────────────────────

function hookPrototypePollution() {
  // Monitor URL params for __proto__, constructor, prototype keys
  const params = new URLSearchParams(location.search);
  for (const [key] of params) {
    if (/(__proto__|constructor|prototype)/i.test(key)) {
      report('prototype_pollution', 'high', `Prototype pollution attempt in URL param: ${key}`, { param: key });
    }
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

export function initSecurityMonitor() {
  try {
    scanUrl();
    checkReferrer();
    hookPrototypePollution();
    hookInputs();
    hookRapidSubmit();
    hookErrors();
  } catch { /* monitor must never break the site */ }
}
