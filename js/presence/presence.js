/**
 * presence.js
 * Live visitor presence via Supabase Realtime.
 * Tracks which room each authenticated user is currently in and renders
 * a small HUD widget in the bottom-left corner of the screen.
 *
 * Public API:
 *   initPresence(user)      — connect + start tracking (call after auth)
 *   setPresenceRoom(room)   — update this user's current room
 *   destroyPresence()       — unsubscribe (call on sign-out)
 */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

const ROOM_LABELS = {
  lobby:      '[ LOBBY ]',
  computer:   '[ PC ]',
  television: '[ TV ]',
  arcade:     '[ ARCADE ]',
  phonebooth: '[ PHONE ]',
  jukebox:    '[ JUKEBOX ]',
  project:    '[ LOBBY ]',
  celestial:  '[ DEEP SPACE ]',
};

let _channel  = null;
let _username = 'VISITOR';
let _room     = 'lobby';
let _hud      = null;

// ── Public API ────────────────────────────────────────────────────────────────

export function initPresence(user) {
  _username = (user?.user_metadata?.username ?? user?.email ?? 'VISITOR').toUpperCase();
  _hud = document.getElementById('presence-hud');

  // Click the pill to toggle the list open/closed
  _hud.querySelector('.pr-counter').addEventListener('click', () => {
    _hud.classList.toggle('pr-open');
  });

  _connect(user.id);
}

export function setPresenceRoom(room) {
  _room = room;
  _channel?.track({ username: _username, room });
}

export function destroyPresence() {
  if (_channel) {
    _channel.unsubscribe();
    _channel = null;
  }
}

// ── Supabase Realtime connection ──────────────────────────────────────────────

function _connect(userId) {
  const { createClient } = window.supabase;
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Each user gets a unique presence key (their UUID) so their state is
  // always a single entry even if they open multiple tabs.
  _channel = client.channel('online-users', {
    config: { presence: { key: userId } },
  });

  _channel.on('presence', { event: 'sync' }, () => {
    _render(_channel.presenceState());
  });

  _channel.subscribe(async status => {
    if (status === 'SUBSCRIBED') {
      await _channel.track({ username: _username, room: _room });
    }
  });
}

// ── HUD rendering ─────────────────────────────────────────────────────────────

function _render(state) {
  if (!_hud) return;

  // state is { [key]: [{ username, room, presence_ref }] }
  const users = Object.values(state).map(arr => arr[0]).filter(Boolean);
  const count = users.length;

  const counter = _hud.querySelector('.pr-counter');
  const list    = _hud.querySelector('.pr-list');
  if (!counter || !list) return;

  counter.textContent = `● ${count} ONLINE`;

  list.innerHTML = '';
  // Sort: current user first, then alphabetically
  users
    .slice()
    .sort((a, b) => {
      if (a.username === _username) return -1;
      if (b.username === _username) return  1;
      return a.username.localeCompare(b.username);
    })
    .forEach(u => {
      const row      = document.createElement('div');
      row.className  = 'pr-row';
      const isSelf   = u.username === _username;
      const roomLbl  = ROOM_LABELS[u.room] ?? '[ LOBBY ]';

      const nameSpan = document.createElement('span');
      nameSpan.className   = isSelf ? 'pr-name pr-self' : 'pr-name';
      nameSpan.textContent = u.username;

      const roomSpan = document.createElement('span');
      roomSpan.className   = 'pr-room';
      roomSpan.textContent = roomLbl;

      row.append(nameSpan, roomSpan);
      list.appendChild(row);
    });
}
