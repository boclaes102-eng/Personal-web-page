/**
 * auth.js
 * Supabase Auth client — sign-up, sign-in, sign-out, password reset,
 * session persistence in localStorage.
 *
 * ── ONE-TIME SUPABASE SETUP ───────────────────────────────────────────────────
 *
 * 1. Dashboard → Authentication → Providers → Email
 *    • Make sure Email is enabled (default).
 *    • "Confirm email": keep ON for production; disable for local testing.
 *
 * 2. Dashboard → Authentication → URL Configuration
 *    • Site URL: your deployed domain (e.g. https://yourname.github.io)
 *    • For local dev add: http://127.0.0.1:5500  (or your Live-Server port)
 *    • These are where Supabase redirects after email confirmation / reset.
 *
 * 3. SQL Editor — run once to link scores to users:
 *
 *   -- Add user_id column to arcade_scores
 *   ALTER TABLE arcade_scores
 *     ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
 *
 *   -- Only authenticated users may insert scores (removes the old open policy)
 *   DROP POLICY IF EXISTS "public_insert" ON arcade_scores;
 *   CREATE POLICY "auth_insert" ON arcade_scores
 *     FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND score >= 0);
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

const SUPABASE_URL      = 'https://iequlhfuqkqjaxxqsijd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllcXVsaGZ1cWtxamF4eHFzaWpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2NDA4ODQsImV4cCI6MjA5MDIxNjg4NH0.4zP_KVcsMzoT3bon8tlC5GUKTRC9i3vohuCTtq-Htx8';
const SESSION_KEY       = 'ds_auth_v1';   // localStorage key for persisting the session

let _session = null;   // { access_token, refresh_token, expires_at, user }

// ── Internal ──────────────────────────────────────────────────────────────────

function _headers(token) {
  return {
    'apikey':        SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${token ?? SUPABASE_ANON_KEY}`,
    'Content-Type':  'application/json',
  };
}

function _saveSession(data) {
  // data: { access_token, refresh_token, expires_in, user }
  const session = {
    access_token:  data.access_token,
    refresh_token: data.refresh_token,
    expires_at:    Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600),
    user:          data.user,
  };
  _session = session;
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch {}
}

function _clearSession() {
  _session = null;
  try { localStorage.removeItem(SESSION_KEY); } catch {}
}

async function _refreshSession(refreshToken) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
      { method: 'POST', headers: _headers(), body: JSON.stringify({ refresh_token: refreshToken }) }
    );
    if (!res.ok) { _clearSession(); return null; }
    const data = await res.json();
    _saveSession(data);
    return data.user;
  } catch {
    _clearSession();
    return null;
  }
}

// ── Public: restore an existing session on page load ──────────────────────────
export async function checkSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (!saved?.access_token) { _clearSession(); return null; }

    // Refresh proactively if the token expires within the next 5 minutes
    const now = Math.floor(Date.now() / 1000);
    if (!saved.expires_at || saved.expires_at < now + 300) {
      if (!saved.refresh_token) { _clearSession(); return null; }
      return await _refreshSession(saved.refresh_token);
    }

    _session = saved;
    return saved.user;
  } catch {
    _clearSession();
    return null;
  }
}

// ── Public: sign up ───────────────────────────────────────────────────────────
export async function signUp(username, email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method:  'POST',
    headers: _headers(),
    body:    JSON.stringify({
      email,
      password,
      data: { username },    // stored in auth.users.raw_user_meta_data
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description ?? data.msg ?? data.error ?? 'Sign-up failed');
  }
  // If email confirmation is disabled, data.session is populated immediately.
  if (data.session) _saveSession(data.session);
  return data;   // caller checks data.session — null means "check your email first"
}

// ── Public: sign in ───────────────────────────────────────────────────────────
export async function signIn(email, password) {
  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    { method: 'POST', headers: _headers(), body: JSON.stringify({ email, password }) }
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description ?? data.msg ?? data.error ?? 'Sign-in failed');
  }
  _saveSession(data);
  return data;
}

// ── Public: sign out ──────────────────────────────────────────────────────────
export async function signOut() {
  const token = _session?.access_token;
  _clearSession();
  if (!token) return;
  // Best-effort server-side logout (revokes the refresh token)
  await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
    method: 'POST', headers: _headers(token),
  }).catch(() => {});
}

// ── Public: send a password-reset email ───────────────────────────────────────
export async function resetPassword(email) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
    method:  'POST',
    headers: _headers(),
    body:    JSON.stringify({ email }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error_description ?? data.msg ?? 'Reset request failed');
  }
}

// ── Public: set a new password (called with the recovery access token) ────────
export async function updatePassword(recoveryToken, newPassword) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method:  'PUT',
    headers: _headers(recoveryToken),
    body:    JSON.stringify({ password: newPassword }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description ?? data.msg ?? data.error ?? 'Password update failed');
  }
  return data;
}

// ── Public: current session getters ──────────────────────────────────────────
export function getCurrentUser()  { return _session?.user  ?? null; }
export function getAccessToken()  { return _session?.access_token ?? null; }

// ── Public: parse recovery / email-confirm tokens from the URL hash ───────────
// Supabase appends  #access_token=...&type=recovery  (or type=signup) to the
// redirect URL after the user clicks a link in their email.
export function parseHashTokens() {
  if (!window.location.hash || window.location.hash.length < 2) return null;
  try {
    const params       = new URLSearchParams(window.location.hash.slice(1));
    const type         = params.get('type');
    const access_token = params.get('access_token');
    if (type && access_token) {
      // Remove tokens from the address bar so they don't linger in browser history
      history.replaceState(null, '', window.location.pathname + window.location.search);
      return { type, access_token, refresh_token: params.get('refresh_token') };
    }
  } catch {}
  return null;
}
