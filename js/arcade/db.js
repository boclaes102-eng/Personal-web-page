/**
 * db.js
 * Supabase leaderboard client — uses the PostgREST REST API directly,
 * no SDK needed. Works in any static-site / ES-module project.
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  ONE-TIME DATABASE SETUP                                        │
 * │                                                                 │
 * │  1. Open your Supabase project dashboard.                       │
 * │  2. Go to SQL Editor and run the SQL block below.               │
 * │  3. Then go to Settings → API and copy the "anon public" key.   │
 * │  4. Paste it into SUPABASE_ANON_KEY below.                      │
 * │                                                                 │
 * │  NOTE: The sbp_… Personal Access Token you have is for the      │
 * │  Management API only — it cannot read/write table rows.         │
 * │  You need the "anon public" JWT (starts with "eyJ…").           │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * ── SQL to run in Supabase SQL Editor ──────────────────────────────
 *
 *  CREATE TABLE arcade_scores (
 *    id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
 *    player_name TEXT        NOT NULL
 *                            CHECK (char_length(player_name) BETWEEN 1 AND 20),
 *    game        TEXT        NOT NULL
 *                            CHECK (game IN ('pong', 'galaga', 'breakout')),
 *    score       INTEGER     NOT NULL CHECK (score >= 0),
 *    created_at  TIMESTAMPTZ DEFAULT NOW()
 *  );
 *
 *  -- Fast leaderboard queries (game + score desc)
 *  CREATE INDEX arcade_scores_game_score_idx
 *    ON arcade_scores (game, score DESC);
 *
 *  -- Row-Level Security: anyone can read; anyone can insert
 *  ALTER TABLE arcade_scores ENABLE ROW LEVEL SECURITY;
 *
 *  CREATE POLICY "public_read" ON arcade_scores
 *    FOR SELECT USING (true);
 *
 *  CREATE POLICY "public_insert" ON arcade_scores
 *    FOR INSERT WITH CHECK (
 *      char_length(player_name) BETWEEN 1 AND 20
 *      AND score >= 0
 *    );
 *
 * ───────────────────────────────────────────────────────────────────
 */

const SUPABASE_URL = 'https://iequlhfuqkqjaxxqsijd.supabase.co';

// ↓ Replace with your project's anon/public key:
//   Supabase Dashboard → Settings → API → "anon public"
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllcXVsaGZ1cWtxamF4eHFzaWpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2NDA4ODQsImV4cCI6MjA5MDIxNjg4NH0.4zP_KVcsMzoT3bon8tlC5GUKTRC9i3vohuCTtq-Htx8';

/** Shared headers for all REST requests */
function headers() {
  return {
    'apikey':        SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type':  'application/json',
  };
}

/**
 * Insert a new score row into arcade_scores.
 * @param {string} playerName  Display name — 1 to 20 characters
 * @param {'pong'|'galaga'|'breakout'} game
 * @param {number} score       Non-negative integer
 * @returns {Promise<void>}    Rejects if the request fails
 */
export async function submitScore(playerName, game, score) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/arcade_scores`, {
    method:  'POST',
    headers: { ...headers(), 'Prefer': 'return=minimal' },
    body:    JSON.stringify({ player_name: playerName, game, score }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => String(res.status));
    throw new Error(`Score submit failed (${res.status}): ${detail}`);
  }
}

/**
 * Fetch the top-N scores for a specific game, ordered by score desc.
 * @param {'pong'|'galaga'|'breakout'} game
 * @param {number} [limit=10]  Maximum rows to return
 * @returns {Promise<Array<{player_name: string, score: number, created_at: string}>>}
 */
export async function getLeaderboard(game, limit = 10) {
  const url = `${SUPABASE_URL}/rest/v1/arcade_scores`
    + `?game=eq.${encodeURIComponent(game)}`
    + `&order=score.desc`
    + `&limit=${limit}`
    + `&select=player_name,score,created_at`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) {
    throw new Error(`Leaderboard fetch failed (${res.status})`);
  }
  return res.json();
}
