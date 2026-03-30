/**
 * auth-ui.js
 * Full-screen auth overlay — login, register, forgot-password, set-new-password.
 *
 * Usage:
 *   showAuthOverlay(onSuccess, opts?)
 *     opts.mode        — 'login' | 'register' | 'reset-password'  (default: 'login')
 *     opts.message     — optional banner message shown on the login screen
 *     opts.resetToken  — access token from the recovery URL hash (for reset-password mode)
 *
 * onSuccess(user) is called once the user is authenticated. The overlay removes itself.
 */

import { signIn, signUp, resetPassword, updatePassword, getCurrentUser } from './auth.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Escape user-supplied strings before inserting into HTML */
function _esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Validation (client-side — belt-and-suspenders, server also validates) ─────

function _validateUsername(v) {
  if (v.length < 3)                        return 'Minimum 3 characters';
  if (v.length > 20)                       return 'Maximum 20 characters';
  if (!/^[a-zA-Z0-9_-]+$/.test(v))        return 'Only letters, numbers, _ and - allowed';
  return null;
}

function _validateEmail(v) {
  // RFC-5322 simplified: must have @ and a dot after it
  if (!v || !v.includes('@'))              return 'Enter a valid email address';
  const [, domain] = v.split('@');
  if (!domain || !domain.includes('.'))    return 'Enter a valid email address';
  return null;
}

function _validatePassword(v) {
  const errors = [];
  if (v.length < 8)                        errors.push('At least 8 characters');
  if (v.length > 72)                       errors.push('Maximum 72 characters (bcrypt limit)');
  if (!/[A-Z]/.test(v))                    errors.push('At least one uppercase letter');
  if (!/[a-z]/.test(v))                    errors.push('At least one lowercase letter');
  if (!/[0-9]/.test(v))                    errors.push('At least one number');
  if (!/[^A-Za-z0-9]/.test(v))            errors.push('At least one special character  (!@#$%^&*)');
  return errors;
}

// ── Password strength meter ────────────────────────────────────────────────────

function _calcStrength(pw) {
  if (!pw) return { score: 0, label: '', cls: '' };
  let score = 0;
  if (pw.length >= 8)               score += 20;
  if (pw.length >= 12)              score += 10;
  if (pw.length >= 16)              score += 10;
  if (/[A-Z]/.test(pw))            score += 15;
  if (/[a-z]/.test(pw))            score += 15;
  if (/[0-9]/.test(pw))            score += 15;
  if (/[^A-Za-z0-9]/.test(pw))    score += 15;
  score = Math.min(score, 100);
  if (score < 30) return { score, label: 'VERY WEAK',   cls: 'pw-very-weak'   };
  if (score < 50) return { score, label: 'WEAK',        cls: 'pw-weak'        };
  if (score < 70) return { score, label: 'FAIR',        cls: 'pw-fair'        };
  if (score < 90) return { score, label: 'STRONG',      cls: 'pw-strong'      };
  return              { score, label: 'VERY STRONG', cls: 'pw-very-strong' };
}

// ── Module state ──────────────────────────────────────────────────────────────

let _overlay    = null;
let _onSuccess  = null;
let _resetToken = null;

// ── Public entry point ────────────────────────────────────────────────────────

export function showAuthOverlay(onSuccess, opts = {}) {
  _onSuccess  = onSuccess;
  _resetToken = opts.resetToken ?? null;

  _overlay = document.createElement('div');
  _overlay.id = 'auth-overlay';
  document.body.appendChild(_overlay);

  if (_resetToken) {
    _renderSetNewPassword();
  } else if (opts.mode === 'register') {
    _renderRegister();
  } else {
    _renderLogin(opts.message ?? null);
  }
}

// ── Internal: clear overlay content ──────────────────────────────────────────

function _clear() { _overlay.innerHTML = ''; }

// ── Internal: shared card scaffold ────────────────────────────────────────────

function _card(titleText, bodyHtml) {
  return `
    <div class="auth-card">
      <div class="auth-scanlines"></div>
      <div class="auth-logo">&#x2B21; DEEP SPACE</div>
      <div class="auth-title">${_esc(titleText)}</div>
      ${bodyHtml}
    </div>`;
}

// ── Screen: Login ─────────────────────────────────────────────────────────────

function _renderLogin(message = null) {
  _clear();
  _overlay.innerHTML = _card('SIGN IN', `
    ${message ? `<div class="auth-banner auth-banner-success">${_esc(message)}</div>` : ''}
    <div class="auth-field">
      <label class="auth-label" for="auth-email">EMAIL</label>
      <input class="auth-input" id="auth-email" type="email" autocomplete="email"
             placeholder="user@example.com" maxlength="254" />
    </div>
    <div class="auth-field">
      <label class="auth-label" for="auth-password">PASSWORD</label>
      <div class="auth-pw-wrap">
        <input class="auth-input" id="auth-password" type="password"
               autocomplete="current-password" placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;" maxlength="72" />
        <button class="auth-pw-toggle" id="auth-pw-toggle" type="button" tabindex="-1"
                aria-label="Toggle password visibility">&#128065;</button>
      </div>
    </div>
    <div class="auth-error" id="auth-error" role="alert" aria-live="polite"></div>
    <button class="auth-btn primary" id="auth-submit">SIGN IN</button>
    <div class="auth-links">
      <button class="auth-link" id="auth-to-forgot">Forgot password?</button>
      <button class="auth-link" id="auth-to-register">Create account</button>
    </div>
  `);

  const emailEl    = document.getElementById('auth-email');
  const passwordEl = document.getElementById('auth-password');
  const submitEl   = document.getElementById('auth-submit');
  const errorEl    = document.getElementById('auth-error');

  document.getElementById('auth-pw-toggle').addEventListener('click', () => {
    passwordEl.type = passwordEl.type === 'password' ? 'text' : 'password';
  });
  document.getElementById('auth-to-forgot').addEventListener('click', _renderForgot);
  document.getElementById('auth-to-register').addEventListener('click', _renderRegister);

  async function doSignIn() {
    const email    = emailEl.value.trim();
    const password = passwordEl.value;
    errorEl.textContent = '';

    if (!email)    { errorEl.textContent = 'Enter your email address.'; return; }
    if (!password) { errorEl.textContent = 'Enter your password.'; return; }

    submitEl.disabled    = true;
    submitEl.textContent = 'SIGNING IN\u2026';

    try {
      await signIn(email, password);
      const user = getCurrentUser();
      _overlay.remove();
      _onSuccess(user);
    } catch (err) {
      // Normalise Supabase error message — never show raw internal details
      const msg = err.message ?? '';
      errorEl.textContent = msg.toLowerCase().includes('invalid')
        ? 'Incorrect email or password.'
        : (msg || 'Sign-in failed. Please try again.');
      submitEl.disabled    = false;
      submitEl.textContent = 'SIGN IN';
    }
  }

  submitEl.addEventListener('click', doSignIn);
  [emailEl, passwordEl].forEach(el =>
    el.addEventListener('keydown', e => { if (e.key === 'Enter') doSignIn(); })
  );
  emailEl.focus();
}

// ── Screen: Register ──────────────────────────────────────────────────────────

function _renderRegister() {
  _clear();
  _overlay.innerHTML = _card('CREATE ACCOUNT', `
    <div class="auth-field">
      <label class="auth-label" for="auth-username">USERNAME</label>
      <input class="auth-input" id="auth-username" type="text" autocomplete="username"
             placeholder="space_pilot_42" maxlength="20"
             pattern="[a-zA-Z0-9_\\-]+" />
      <div class="auth-hint" id="auth-username-hint" aria-live="polite"></div>
    </div>
    <div class="auth-field">
      <label class="auth-label" for="auth-email">EMAIL</label>
      <input class="auth-input" id="auth-email" type="email" autocomplete="email"
             placeholder="user@example.com" maxlength="254" />
    </div>
    <div class="auth-field">
      <label class="auth-label" for="auth-password">PASSWORD</label>
      <div class="auth-pw-wrap">
        <input class="auth-input" id="auth-password" type="password"
               autocomplete="new-password" placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;" maxlength="72" />
        <button class="auth-pw-toggle" id="auth-pw-toggle" type="button" tabindex="-1"
                aria-label="Toggle password visibility">&#128065;</button>
      </div>
      <div class="auth-strength-bar-wrap" aria-hidden="true">
        <div class="auth-strength-bar" id="auth-strength-bar"></div>
      </div>
      <div class="auth-strength-label" id="auth-strength-label" aria-live="polite"></div>
      <div class="auth-pw-reqs" id="auth-pw-reqs" aria-live="polite"></div>
    </div>
    <div class="auth-field">
      <label class="auth-label" for="auth-confirm">CONFIRM PASSWORD</label>
      <input class="auth-input" id="auth-confirm" type="password"
             autocomplete="new-password" placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;" maxlength="72" />
      <div class="auth-hint" id="auth-confirm-hint" aria-live="polite"></div>
    </div>
    <div class="auth-error" id="auth-error" role="alert" aria-live="polite"></div>
    <button class="auth-btn primary" id="auth-submit">CREATE ACCOUNT</button>
    <div class="auth-links">
      <button class="auth-link" id="auth-to-login">Already have an account?  Sign in</button>
    </div>
  `);

  const usernameEl = document.getElementById('auth-username');
  const emailEl    = document.getElementById('auth-email');
  const passwordEl = document.getElementById('auth-password');
  const confirmEl  = document.getElementById('auth-confirm');
  const submitEl   = document.getElementById('auth-submit');
  const errorEl    = document.getElementById('auth-error');

  document.getElementById('auth-pw-toggle').addEventListener('click', () => {
    const t = passwordEl.type === 'password' ? 'text' : 'password';
    passwordEl.type = t;
    confirmEl.type  = t;
  });
  document.getElementById('auth-to-login').addEventListener('click', () => _renderLogin());

  // Live username hint
  usernameEl.addEventListener('input', () => {
    const hintEl = document.getElementById('auth-username-hint');
    const err    = _validateUsername(usernameEl.value.trim());
    hintEl.textContent = err
      ? `\u2717 ${err}`
      : (usernameEl.value.trim() ? '\u2713 Looks good' : '');
    hintEl.className = 'auth-hint ' + (err ? 'auth-hint-error' : 'auth-hint-ok');
  });

  // Live password strength
  passwordEl.addEventListener('input', () => {
    const pw   = passwordEl.value;
    const { score, label, cls } = _calcStrength(pw);
    const bar  = document.getElementById('auth-strength-bar');
    const lbl  = document.getElementById('auth-strength-label');
    const reqs = document.getElementById('auth-pw-reqs');

    bar.style.width = `${score}%`;
    bar.className   = `auth-strength-bar ${cls}`;
    lbl.textContent = label;
    lbl.className   = `auth-strength-label ${cls}`;

    if (pw) {
      const errs = _validatePassword(pw);
      reqs.innerHTML = errs.length
        ? errs.map(e => `<span class="auth-req-fail">\u2717 ${_esc(e)}</span>`).join('')
        : `<span class="auth-req-ok">\u2713 Password meets all requirements</span>`;
    } else {
      reqs.innerHTML = '';
    }
  });

  // Live confirm match
  confirmEl.addEventListener('input', () => {
    const hintEl = document.getElementById('auth-confirm-hint');
    if (!confirmEl.value) { hintEl.textContent = ''; return; }
    if (confirmEl.value !== passwordEl.value) {
      hintEl.textContent = '\u2717 Passwords do not match';
      hintEl.className   = 'auth-hint auth-hint-error';
    } else {
      hintEl.textContent = '\u2713 Passwords match';
      hintEl.className   = 'auth-hint auth-hint-ok';
    }
  });

  async function doSignUp() {
    const username = usernameEl.value.trim();
    const email    = emailEl.value.trim();
    const password = passwordEl.value;
    const confirm  = confirmEl.value;
    errorEl.textContent = '';

    const usernameErr = _validateUsername(username);
    if (usernameErr) { errorEl.textContent = usernameErr; usernameEl.focus(); return; }

    const emailErr = _validateEmail(email);
    if (emailErr) { errorEl.textContent = emailErr; emailEl.focus(); return; }

    const pwErrs = _validatePassword(password);
    if (pwErrs.length) { errorEl.textContent = pwErrs[0]; passwordEl.focus(); return; }

    if (password !== confirm) { errorEl.textContent = 'Passwords do not match.'; confirmEl.focus(); return; }

    submitEl.disabled    = true;
    submitEl.textContent = 'CREATING\u2026';

    try {
      const data = await signUp(username, email, password);
      if (!data.session) {
        // Email confirmation required — tell user to check inbox
        _renderEmailSent(email, 'confirm');
      } else {
        // Email confirmation disabled — logged in immediately
        const user = getCurrentUser();
        _overlay.remove();
        _onSuccess(user);
      }
    } catch (err) {
      const msg = err.message ?? '';
      errorEl.textContent = msg.toLowerCase().includes('already')
        ? 'An account with this email already exists.'
        : (msg || 'Sign-up failed. Please try again.');
      submitEl.disabled    = false;
      submitEl.textContent = 'CREATE ACCOUNT';
    }
  }

  submitEl.addEventListener('click', doSignUp);
  [usernameEl, emailEl, passwordEl, confirmEl].forEach(el =>
    el.addEventListener('keydown', e => { if (e.key === 'Enter') doSignUp(); })
  );
  usernameEl.focus();
}

// ── Screen: Forgot password ───────────────────────────────────────────────────

function _renderForgot() {
  _clear();
  _overlay.innerHTML = _card('RESET PASSWORD', `
    <div class="auth-subtitle">
      Enter your email address and we'll send you a link to reset your password.
    </div>
    <div class="auth-field">
      <label class="auth-label" for="auth-email">EMAIL</label>
      <input class="auth-input" id="auth-email" type="email" autocomplete="email"
             placeholder="user@example.com" maxlength="254" />
    </div>
    <div class="auth-error" id="auth-error" role="alert" aria-live="polite"></div>
    <button class="auth-btn primary" id="auth-submit">SEND RESET EMAIL</button>
    <div class="auth-links">
      <button class="auth-link" id="auth-to-login">&#8592; Back to sign in</button>
    </div>
  `);

  const emailEl  = document.getElementById('auth-email');
  const submitEl = document.getElementById('auth-submit');
  const errorEl  = document.getElementById('auth-error');

  document.getElementById('auth-to-login').addEventListener('click', () => _renderLogin());

  async function doReset() {
    const email = emailEl.value.trim();
    errorEl.textContent = '';

    const emailErr = _validateEmail(email);
    if (emailErr) { errorEl.textContent = emailErr; return; }

    submitEl.disabled    = true;
    submitEl.textContent = 'SENDING\u2026';

    try {
      await resetPassword(email);
      _renderEmailSent(email, 'reset');
    } catch (err) {
      errorEl.textContent = err.message || 'Could not send reset email. Please try again.';
      submitEl.disabled    = false;
      submitEl.textContent = 'SEND RESET EMAIL';
    }
  }

  submitEl.addEventListener('click', doReset);
  emailEl.addEventListener('keydown', e => { if (e.key === 'Enter') doReset(); });
  emailEl.focus();
}

// ── Screen: Email sent (confirm + reset both use this) ───────────────────────

function _renderEmailSent(email, type) {
  _clear();
  const isReset   = type === 'reset';
  const heading   = isReset ? 'CHECK YOUR EMAIL' : 'VERIFY YOUR EMAIL';
  const body      = isReset
    ? 'Password reset instructions have been sent to:'
    : 'A confirmation link has been sent to:';
  const sub       = isReset
    ? 'Click the link in the email to set a new password.'
    : 'Click the link in the email, then return here to sign in.';

  _overlay.innerHTML = _card(heading, `
    <div class="auth-subtitle">${_esc(body)}</div>
    <div class="auth-email-display">${_esc(email)}</div>
    <div class="auth-email-sent-icon">&#9993;</div>
    <div class="auth-subtitle auth-dim">${_esc(sub)}</div>
    <div class="auth-links">
      <button class="auth-link" id="auth-to-login">&#8592; Back to sign in</button>
    </div>
  `);

  document.getElementById('auth-to-login').addEventListener('click', () => _renderLogin());
}

// ── Screen: Set new password (called when recovery token is in URL hash) ──────

function _renderSetNewPassword() {
  _clear();
  _overlay.innerHTML = _card('SET NEW PASSWORD', `
    <div class="auth-subtitle">
      Choose a strong new password for your account.
    </div>
    <div class="auth-field">
      <label class="auth-label" for="auth-password">NEW PASSWORD</label>
      <div class="auth-pw-wrap">
        <input class="auth-input" id="auth-password" type="password"
               autocomplete="new-password" placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;" maxlength="72" />
        <button class="auth-pw-toggle" id="auth-pw-toggle" type="button" tabindex="-1"
                aria-label="Toggle password visibility">&#128065;</button>
      </div>
      <div class="auth-strength-bar-wrap" aria-hidden="true">
        <div class="auth-strength-bar" id="auth-strength-bar"></div>
      </div>
      <div class="auth-strength-label" id="auth-strength-label" aria-live="polite"></div>
      <div class="auth-pw-reqs" id="auth-pw-reqs" aria-live="polite"></div>
    </div>
    <div class="auth-field">
      <label class="auth-label" for="auth-confirm">CONFIRM PASSWORD</label>
      <input class="auth-input" id="auth-confirm" type="password"
             autocomplete="new-password" placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;" maxlength="72" />
      <div class="auth-hint" id="auth-confirm-hint" aria-live="polite"></div>
    </div>
    <div class="auth-error" id="auth-error" role="alert" aria-live="polite"></div>
    <button class="auth-btn primary" id="auth-submit">UPDATE PASSWORD</button>
  `);

  const passwordEl = document.getElementById('auth-password');
  const confirmEl  = document.getElementById('auth-confirm');
  const submitEl   = document.getElementById('auth-submit');
  const errorEl    = document.getElementById('auth-error');

  document.getElementById('auth-pw-toggle').addEventListener('click', () => {
    const t = passwordEl.type === 'password' ? 'text' : 'password';
    passwordEl.type = t;
    confirmEl.type  = t;
  });

  // Same strength listeners as register
  passwordEl.addEventListener('input', () => {
    const pw   = passwordEl.value;
    const { score, label, cls } = _calcStrength(pw);
    const bar  = document.getElementById('auth-strength-bar');
    const lbl  = document.getElementById('auth-strength-label');
    const reqs = document.getElementById('auth-pw-reqs');
    bar.style.width = `${score}%`;
    bar.className   = `auth-strength-bar ${cls}`;
    lbl.textContent = label;
    lbl.className   = `auth-strength-label ${cls}`;
    if (pw) {
      const errs = _validatePassword(pw);
      reqs.innerHTML = errs.length
        ? errs.map(e => `<span class="auth-req-fail">\u2717 ${_esc(e)}</span>`).join('')
        : `<span class="auth-req-ok">\u2713 Password meets all requirements</span>`;
    } else {
      reqs.innerHTML = '';
    }
  });

  confirmEl.addEventListener('input', () => {
    const hintEl = document.getElementById('auth-confirm-hint');
    if (!confirmEl.value) { hintEl.textContent = ''; return; }
    hintEl.textContent = confirmEl.value !== passwordEl.value
      ? '\u2717 Passwords do not match'
      : '\u2713 Passwords match';
    hintEl.className = 'auth-hint ' +
      (confirmEl.value !== passwordEl.value ? 'auth-hint-error' : 'auth-hint-ok');
  });

  async function doUpdate() {
    const password = passwordEl.value;
    const confirm  = confirmEl.value;
    errorEl.textContent = '';

    const pwErrs = _validatePassword(password);
    if (pwErrs.length) { errorEl.textContent = pwErrs[0]; passwordEl.focus(); return; }
    if (password !== confirm) { errorEl.textContent = 'Passwords do not match.'; confirmEl.focus(); return; }

    submitEl.disabled    = true;
    submitEl.textContent = 'UPDATING\u2026';

    try {
      await updatePassword(_resetToken, password);
      // Password updated — show success and redirect to login
      _clear();
      _overlay.innerHTML = _card('PASSWORD UPDATED', `
        <div class="auth-subtitle">Your password has been updated successfully.</div>
        <div class="auth-email-sent-icon" style="font-size:2.5rem;margin:1rem 0">&#10003;</div>
        <button class="auth-btn primary" id="auth-to-login-btn">SIGN IN</button>
      `);
      document.getElementById('auth-to-login-btn').addEventListener('click', () => _renderLogin());
    } catch (err) {
      errorEl.textContent = err.message || 'Password update failed. The link may have expired.';
      submitEl.disabled    = false;
      submitEl.textContent = 'UPDATE PASSWORD';
    }
  }

  submitEl.addEventListener('click', doUpdate);
  [passwordEl, confirmEl].forEach(el =>
    el.addEventListener('keydown', e => { if (e.key === 'Enter') doUpdate(); })
  );
  passwordEl.focus();
}
