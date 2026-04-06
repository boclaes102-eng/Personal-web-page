/**
 * mp-lobby.js
 * Presence-based matchmaking for Pong multiplayer.
 *
 * Both players join the 'pong-mp-lobby' presence channel.
 * When 2 players are present, both deterministically compute the same roomId
 * and independently create + subscribe to the same game broadcast channel.
 * After 1200ms (to absorb any subscription timing differences) onMatch fires.
 *
 * Public API:
 *   joinLobby(onMatch, onStatus)  — join matchmaking
 *   leaveLobby()                  — cancel and clean up
 */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import { getCurrentUser }                   from '../auth/auth.js';

let _lobbyClient  = null;
let _lobbyChannel = null;
let _matched      = false;

/**
 * @param {(isHost: bool, gameChannel, gameClient, roomId: string) => void} onMatch
 * @param {(statusMsg: string) => void} onStatus
 */
export function joinLobby(onMatch, onStatus) {
  leaveLobby();   // clean up any previous session
  _matched = false;

  const user = getCurrentUser();
  if (!user) return;

  _lobbyClient  = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  _lobbyChannel = _lobbyClient.channel('pong-mp-lobby', {
    config: { presence: { key: user.id } },
  });

  _lobbyChannel
    .on('presence', { event: 'sync' }, () => _tryMatch(onMatch, onStatus))
    .on('presence', { event: 'join' }, () => _tryMatch(onMatch, onStatus))
    .subscribe(async status => {
      if (status !== 'SUBSCRIBED') return;
      const username = (
        user.user_metadata?.username ?? user.email ?? 'PLAYER'
      ).toUpperCase();
      await _lobbyChannel.track({ userId: user.id, username });
      onStatus?.('WAITING FOR OPPONENT…  (1/2)');
    });
}

export function leaveLobby() {
  if (_lobbyChannel) { _lobbyChannel.unsubscribe(); _lobbyChannel = null; }
  _lobbyClient = null;
  _matched     = false;
}

// ── Internal matchmaking ──────────────────────────────────────────────────────

function _tryMatch(onMatch, onStatus) {
  if (!_lobbyChannel || _matched) return;

  const state   = _lobbyChannel.presenceState();
  const players = Object.values(state)
    .map(arr => arr[arr.length - 1])
    .filter(Boolean);

  if (players.length < 2) {
    onStatus?.(`WAITING FOR OPPONENT…  (${players.length}/2)`);
    return;
  }

  const user = getCurrentUser();
  if (!players.find(p => p.userId === user.id)) return;   // not in match

  // Take exactly 2 — sort by userId for determinism (both clients compute same result)
  const sorted = players
    .sort((a, b) => a.userId.localeCompare(b.userId))
    .slice(0, 2);

  if (!sorted.find(p => p.userId === user.id)) return;   // not in this pair

  _matched = true;
  const [p1, p2] = sorted;
  const isHost   = p1.userId === user.id;
  const roomId   = `${p1.userId.slice(0, 8)}_${p2.userId.slice(0, 8)}`;

  onStatus?.('OPPONENT FOUND!  CONNECTING…');

  // Detach lobby (keep channel alive briefly so the other player also sees the sync)
  const dying = _lobbyChannel;
  _lobbyChannel = null;
  setTimeout(() => dying.unsubscribe(), 2000);

  // Create dedicated game channel (broadcast + presence for disconnect detection)
  const gameClient  = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const gameChannel = gameClient.channel(`pong-mp-${roomId}`, {
    config: {
      broadcast: { self: false },
      presence:  { key: user.id },
    },
  });

  gameChannel.subscribe(async status => {
    if (status !== 'SUBSCRIBED') return;
    await gameChannel.track({ ready: true });
    // Give both clients 1200ms to subscribe before the game starts.
    // The subsequent 3-2-1 countdown (≈2.1 s) absorbs any remaining skew.
    setTimeout(() => onMatch(isHost, gameChannel, gameClient, roomId), 1200);
  });
}
