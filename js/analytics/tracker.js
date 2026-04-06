/**
 * analytics/tracker.js
 * Lightweight visit + room tracker — writes to the site_visits Supabase table.
 *
 * ── SQL (run once in Supabase SQL Editor) ─────────────────────────────────────
 *
 *  CREATE TABLE site_visits (
 *    id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
 *    session_id  TEXT        NOT NULL,
 *    user_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
 *    room        TEXT        NOT NULL DEFAULT 'world',
 *    device      TEXT        NOT NULL DEFAULT 'desktop',
 *    browser     TEXT        NOT NULL DEFAULT 'unknown',
 *    created_at  TIMESTAMPTZ DEFAULT NOW()
 *  );
 *
 *  CREATE INDEX site_visits_created_at_idx ON site_visits (created_at DESC);
 *  CREATE INDEX site_visits_session_idx    ON site_visits (session_id);
 *
 *  ALTER TABLE site_visits ENABLE ROW LEVEL SECURITY;
 *  CREATE POLICY "public_read"   ON site_visits FOR SELECT USING (true);
 *  CREATE POLICY "public_insert" ON site_visits FOR INSERT WITH CHECK (true);
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Public API:
 *   trackVisit(user)   — call once on world start (logs 'world' room)
 *   trackRoom(room)    — call each time the user enters a room
 */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import { getCurrentUser }                   from '../auth/auth.js';

const API = `${SUPABASE_URL}/rest/v1/site_visits`;
const HDRS = {
  'apikey':        SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type':  'application/json',
  'Prefer':        'return=minimal',
};

// ── Session ID (one per tab, cleared when tab closes) ─────────────────────────

function getSessionId() {
  let sid = sessionStorage.getItem('ds_session_id');
  if (!sid) {
    sid = crypto.randomUUID();
    sessionStorage.setItem('ds_session_id', sid);
  }
  return sid;
}

// ── Client detection ──────────────────────────────────────────────────────────

function detectBrowser() {
  const ua = navigator.userAgent;
  if (ua.includes('Firefox'))  return 'Firefox';
  if (ua.includes('Edg/'))     return 'Edge';
  if (ua.includes('OPR/'))     return 'Opera';
  if (ua.includes('Chrome'))   return 'Chrome';
  if (ua.includes('Safari'))   return 'Safari';
  return 'Other';
}

function detectDevice() {
  return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'mobile' : 'desktop';
}

// ── Insert helper ─────────────────────────────────────────────────────────────

async function insert(room, userId = null) {
  await fetch(API, {
    method: 'POST',
    headers: HDRS,
    body: JSON.stringify({
      session_id: getSessionId(),
      user_id:    userId,
      room,
      device:     detectDevice(),
      browser:    detectBrowser(),
    }),
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Call once when the 3D world starts — logs the initial visit.
 * @param {object|null} user  Supabase user object
 */
export async function trackVisit(user) {
  try {
    await insert('world', user?.id ?? null);
  } catch { /* analytics must never break the app */ }
}

/**
 * Call each time the user enters an interactive room.
 * @param {string} room  e.g. 'computer' | 'arcade' | 'television' | 'jukebox' | 'phonebooth'
 */
export async function trackRoom(room) {
  try {
    const user = getCurrentUser();
    await insert(room, user?.id ?? null);
  } catch { /* silent */ }
}
