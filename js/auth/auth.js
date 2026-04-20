// @ts-check
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

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import { siemEvent } from '../siem.js';

/**
 * @typedef {{ access_token: string, refresh_token: string, expires_at: number, user: object }} Session
 * @typedef {{ type: string, access_token: string, refresh_token: string|null }} HashTokens
 */

const SESSION_KEY = 'ds_auth_v1';   // localStorage key for persisting the session

/** @type {Session|null} */
let _session = null;

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
/**
 * Restore a saved session from localStorage, silently refreshing if near expiry.
 * @returns {Promise<object|null>} The user object, or null if not authenticated.
 */
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
/**
 * Register a new user. Returns a Supabase auth response.
 * If email confirmation is required, `data.session` will be null.
 * @param {string} username
 * @param {string} email
 * @param {string} password
 * @returns {Promise<object>}
 */
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
/**
 * Sign in with email and password.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<object>} Session data including `access_token` and `user`.
 */
export async function signIn(email, password) {
  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    { method: 'POST', headers: _headers(), body: JSON.stringify({ email, password }) }
  );
  const data = await res.json();
  if (!res.ok) {
    siemEvent({ category: 'auth', action: 'login_failed', severity: 'medium', message: `Failed login for ${email}` });
    throw new Error(data.error_description ?? data.msg ?? data.error ?? 'Sign-in failed');
  }
  siemEvent({ category: 'auth', action: 'login_success', severity: 'info', message: `Successful login for ${email}` });
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
/**
 * Send a password-reset email to the given address.
 * @param {string} email
 */
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
/**
 * Set a new password using the recovery token from the email link.
 * @param {string} recoveryToken  The `access_token` from the recovery URL hash.
 * @param {string} newPassword
 * @returns {Promise<object>}
 */
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
/** @returns {object|null} The currently signed-in user, or null. */
export function getCurrentUser()  { return _session?.user  ?? null; }
/** @returns {string|null} The current JWT access token, or null if not signed in. */
export function getAccessToken()  { return _session?.access_token ?? null; }

// ── Public: music theme preference ───────────────────────────────────────────
// Uses the user_preferences table (see SQL setup in auth.js header comment).
// Both functions are fire-and-forget safe — they fail silently.

/**
 * Persist the user's music theme choice to the database (fire-and-forget).
 * @param {string} theme
 */
export async function saveUserTheme(theme) {
  const token = getAccessToken();
  const uid   = getCurrentUser()?.id;
  if (!token || !uid) return;
  await fetch(`${SUPABASE_URL}/rest/v1/user_preferences`, {
    method:  'POST',
    headers: {
      ..._headers(token),
      'Content-Type': 'application/json',
      'Prefer':        'resolution=merge-duplicates',   // upsert on primary key
    },
    body: JSON.stringify({ user_id: uid, music_theme: theme }),
  }).catch(() => {});
}

/** @returns {Promise<string|null>} The saved theme name, or null if not set. */
export async function loadUserTheme() {
  const token = getAccessToken();
  const uid   = getCurrentUser()?.id;
  if (!token || !uid) return null;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/user_preferences?user_id=eq.${uid}&select=music_theme`,
      { headers: _headers(token) }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    return rows?.[0]?.music_theme ?? null;
  } catch {
    return null;
  }
}

// ── Jukebox: custom track upload / save / load (3 slots per user) ────────────
// Slots are numbered 1-3. DB columns: custom_track_url, custom_track_url_2, custom_track_url_3.
// Storage paths: {uid}/custom_1.{ext}, {uid}/custom_2.{ext}, {uid}/custom_3.{ext}

function _trackCol(slot) {
  return slot === 1 ? 'custom_track_url' : `custom_track_url_${slot}`;
}

/** Delete only the storage file (not the DB column). Used before re-uploading with a new name. */
export async function deleteJukeboxFile(url) {
  const token = getAccessToken();
  if (!token || !url) return;
  const prefix = `${SUPABASE_URL}/storage/v1/object/public/jukebox-tracks/`;
  if (!url.startsWith(prefix)) return;
  const path = url.slice(prefix.length);
  await fetch(`${SUPABASE_URL}/storage/v1/object/jukebox-tracks/${path}`, {
    method: 'DELETE',
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` },
  }).catch(() => {});
}

/**
 * Upload an audio file to a Supabase Storage slot (1-3). Returns the public URL.
 * @param {File}   file
 * @param {number} [slot=1]  Storage slot 1-3.
 * @param {string} [title=''] Sanitised name used in the storage path for readability.
 * @returns {Promise<string>} Public URL of the uploaded file.
 */
export async function uploadJukeboxTrack(file, slot = 1, title = '') {
  const token = getAccessToken();
  const uid   = getCurrentUser()?.id;
  if (!token || !uid) throw new Error('Not signed in');

  const ext      = file.name.split('.').pop().toLowerCase() || 'mp3';
  const safeName = title
    ? title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60) + '.' + ext
    : `custom_${slot}.${ext}`;
  const path = `${uid}/custom_${slot}/${safeName}`;

  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/jukebox-tracks/${path}`,
    {
      method:  'POST',
      headers: {
        'apikey':        SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
        'Content-Type':  file.type || 'audio/mpeg',
        'x-upsert':      'true',
      },
      body: file,
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Upload failed (${res.status})`);
  }

  return `${SUPABASE_URL}/storage/v1/object/public/jukebox-tracks/${path}`;
}

/** Save a slot's URL to user_preferences. */
export async function saveCustomTrackUrl(url, slot = 1) {
  const token = getAccessToken();
  const uid   = getCurrentUser()?.id;
  if (!token || !uid) return;
  await fetch(`${SUPABASE_URL}/rest/v1/user_preferences`, {
    method:  'POST',
    headers: { ..._headers(token), 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify({ user_id: uid, [_trackCol(slot)]: url }),
  }).catch(() => {});
}

/** Delete a slot's file from Storage and clear it in user_preferences. */
export async function deleteCustomTrack(url, slot = 1) {
  const token = getAccessToken();
  const uid   = getCurrentUser()?.id;
  if (!token || !uid) return;

  const prefix = `${SUPABASE_URL}/storage/v1/object/public/jukebox-tracks/`;
  if (url?.startsWith(prefix)) {
    const storagePath = url.slice(prefix.length);
    await fetch(`${SUPABASE_URL}/storage/v1/object/jukebox-tracks/${storagePath}`, {
      method:  'DELETE',
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` },
    }).catch(() => {});
  }

  await fetch(`${SUPABASE_URL}/rest/v1/user_preferences`, {
    method:  'POST',
    headers: { ..._headers(token), 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify({ user_id: uid, [_trackCol(slot)]: null }),
  }).catch(() => {});
}

/**
 * Load all three custom track URLs from the database.
 * @returns {Promise<Array<string|null>>} [url1, url2, url3] — null where no upload exists.
 */
export async function loadAllCustomTrackUrls() {
  const token = getAccessToken();
  const uid   = getCurrentUser()?.id;
  if (!token || !uid) return [null, null, null];
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/user_preferences?user_id=eq.${uid}&select=custom_track_url,custom_track_url_2,custom_track_url_3`,
      { headers: _headers(token) }
    );
    if (!res.ok) return [null, null, null];
    const rows = await res.json();
    const row  = rows?.[0];
    return [
      row?.custom_track_url   ?? null,
      row?.custom_track_url_2 ?? null,
      row?.custom_track_url_3 ?? null,
    ];
  } catch {
    return [null, null, null];
  }
}

// ── Public: parse recovery / email-confirm tokens from the URL hash ───────────
// Supabase appends  #access_token=...&type=recovery  (or type=signup) to the
// redirect URL after the user clicks a link in their email.
/**
 * Parse Supabase callback tokens from the URL hash after email link redirects.
 * Strips the tokens from the address bar once read.
 * @returns {HashTokens|null}
 */
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
