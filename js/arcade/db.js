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
 *  -- Run this in SQL Editor to link scores to authenticated users:
 *  ALTER TABLE arcade_scores
 *    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
 *
 *  -- Require authentication to insert (replaces the open public_insert policy)
 *  DROP POLICY IF EXISTS "public_insert" ON arcade_scores;
 *  CREATE POLICY "auth_insert" ON arcade_scores
 *    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND score >= 0);
 *
 *  -- Allow users to update their own scores (needed for best-score upsert)
 *  CREATE POLICY "auth_update" ON arcade_scores
 *    FOR UPDATE USING (auth.uid() = user_id)
 *    WITH CHECK (auth.uid() IS NOT NULL AND score >= 0);
 *
 * ───────────────────────────────────────────────────────────────────
 */

import { getAccessToken, getCurrentUser } from '../auth/auth.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

/** Shared headers — uses the user's auth token when available for RLS */
function headers() {
  const token = getAccessToken();
  return {
    'apikey':        SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${token ?? SUPABASE_ANON_KEY}`,
    'Content-Type':  'application/json',
  };
}

/**
 * Submit a score for a game. If the user already has a score for this game,
 * only updates it when the new score is higher (best-score-only behaviour).
 * @param {string} playerName  Display name — 1 to 20 characters
 * @param {'pong'|'galaga'|'breakout'} game
 * @param {number} score       Non-negative integer
 * @returns {Promise<void>}    Rejects if the request fails
 */
export async function submitScore(playerName, game, score) {
  const user = getCurrentUser();

  // When logged in, check for an existing score row for this user+game combo.
  if (user?.id) {
    const checkUrl = `${SUPABASE_URL}/rest/v1/arcade_scores`
      + `?user_id=eq.${encodeURIComponent(user.id)}`
      + `&game=eq.${encodeURIComponent(game)}`
      + `&select=id,score`
      + `&limit=1`;

    const checkRes = await fetch(checkUrl, { headers: headers() });
    if (checkRes.ok) {
      const existing = await checkRes.json();
      if (existing.length > 0) {
        // Row exists — only update when new score beats the stored best
        if (score <= existing[0].score) return;
        const patchRes = await fetch(
          `${SUPABASE_URL}/rest/v1/arcade_scores?id=eq.${existing[0].id}`,
          {
            method:  'PATCH',
            headers: { ...headers(), 'Prefer': 'return=minimal' },
            body:    JSON.stringify({ score, player_name: playerName }),
          }
        );
        if (!patchRes.ok) {
          const detail = await patchRes.text().catch(() => String(patchRes.status));
          throw new Error(`Score update failed (${patchRes.status}): ${detail}`);
        }
        return;
      }
    }
  }

  // No existing row — insert fresh
  const payload = { player_name: playerName, game, score };
  if (user?.id) payload.user_id = user.id;

  const res = await fetch(`${SUPABASE_URL}/rest/v1/arcade_scores`, {
    method:  'POST',
    headers: { ...headers(), 'Prefer': 'return=minimal' },
    body:    JSON.stringify(payload),
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
