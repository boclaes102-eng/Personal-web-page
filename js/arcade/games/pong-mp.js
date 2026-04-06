/**
 * pong-mp.js
 * Multiplayer Pong via Supabase Realtime Broadcast.
 *
 * Host (P1, left paddle) runs all physics and broadcasts full game state ~30 fps.
 * Guest (P2, right paddle) mirrors state and broadcasts only its paddle position.
 *
 * Usage:
 *   const stop = startPongMP(canvas, isHost, channel, onGameOver, onOpponentLeft);
 *   stop();   // cleans up RAF + key listeners; also broadcasts opponent_left if
 *             // the game hasn't ended naturally (_done guard).
 */

import { sfx } from '../../audio/audio-manager.js';

const WIN_SCORE = 7;

export function startPongMP(canvas, isHost, channel, onGameOver, onOpponentLeft) {
  const ctx = canvas.getContext('2d');
  const W   = canvas.width;
  const H   = canvas.height;

  const PAD_W      = Math.round(W * 0.018);
  const PAD_H      = Math.round(H * 0.16);
  const PAD_MARGIN = Math.round(W * 0.032);
  const BALL_R     = Math.round(H * 0.016);

  const S          = 60 / 144;
  const PLAYER_SPD = H * 0.011 * S;
  const BALL_INIT  = W * 0.0032 * S;
  const BALL_MAX   = W * 0.022 * S;

  const p1x = PAD_MARGIN;
  const p2x = W - PAD_MARGIN - PAD_W;

  let p1y = H / 2 - PAD_H / 2;
  let p2y = H / 2 - PAD_H / 2;
  let bx = W / 2, by = H / 2, vx = 0, vy = 0;
  let p1Score = 0, p2Score = 0;
  let gameState    = 'countdown';
  let countVal     = 3;
  let nextServeDir = 1;
  let rafId, tickId;
  let _done = false;   // true once game ends naturally

  // Guest-side interpolation targets — lerped towards each frame
  let _tBx = W / 2, _tBy = H / 2;
  let _tVx = 0,     _tVy = 0;
  let _tP1y = p1y,  _tP2y = p2y;

  const keys   = new Set();
  const onKey  = e => keys.add(e.key);
  const offKey = e => keys.delete(e.key);
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup',   offKey);

  // ── Receive events from opponent ──────────────────────────────────────────────

  channel.on('broadcast', { event: 'game_state' }, ({ payload: p }) => {
    if (isHost || _done) return;
    // Store as targets; the render loop lerps towards them
    _tBx  = p.bx  * W; _tBy  = p.by  * H;
    _tVx  = p.vx  * W; _tVy  = p.vy  * H;
    _tP1y = p.p1y * H; _tP2y = p.p2y * H;
    p1Score = p.p1Score; p2Score = p.p2Score;
    if (p.gs  !== undefined) gameState    = p.gs;
    if (p.cv  !== undefined) countVal     = p.cv;
    if (p.nsd !== undefined) nextServeDir = p.nsd;
  });

  // Dedicated sound relay — host fires _sfxGuest() on every SFX, guest plays it locally
  channel.on('broadcast', { event: 'sfx' }, ({ payload: p }) => {
    if (isHost || _done) return;
    sfx(p.name);
  });

  channel.on('broadcast', { event: 'guest_paddle' }, ({ payload: p }) => {
    if (!isHost || _done) return;
    p2y = p.y * H;
  });

  // Host sends an explicit game_over broadcast so guest knows when to trigger callback
  channel.on('broadcast', { event: 'game_over' }, ({ payload: p }) => {
    if (isHost || _done) return;
    _done = true;
    p1Score = p.p1Score; p2Score = p.p2Score;
    gameState = 'gameover';
    const youWon = p2Score >= WIN_SCORE;
    setTimeout(() => onGameOver(youWon), 2000);
  });

  // ── Ball helpers ──────────────────────────────────────────────────────────────

  function serveBall(dir) {
    bx = W / 2; by = H / 2;
    const angle = (Math.random() * 0.60 - 0.30);
    vx = dir * BALL_INIT * Math.cos(angle);
    vy = BALL_INIT * Math.sin(angle);
  }

  // ── Draw ──────────────────────────────────────────────────────────────────────

  function drawPad(x, y, col) {
    ctx.shadowColor = col; ctx.shadowBlur = 18;
    ctx.fillStyle   = col; ctx.fillRect(x, y, PAD_W, PAD_H);
    ctx.shadowBlur  = 0;
  }

  function draw() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    // Centre line
    ctx.save();
    ctx.setLineDash([Math.round(H * 0.022), Math.round(H * 0.022)]);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth   = 2;
    ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
    ctx.restore();

    // Scores
    ctx.fillStyle    = 'rgba(255,255,255,0.85)';
    ctx.font         = `bold ${Math.round(H * 0.13)}px "Courier New",monospace`;
    ctx.textAlign    = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(p1Score, W * 0.25, H * 0.04);
    ctx.fillText(p2Score, W * 0.75, H * 0.04);

    // Labels
    ctx.font      = `${Math.round(H * 0.042)}px "Courier New",monospace`;
    ctx.fillStyle = 'rgba(255,255,255,0.30)';
    ctx.fillText(isHost ? 'YOU' : 'OPP', W * 0.25, H * 0.80);
    ctx.fillText(isHost ? 'OPP' : 'YOU', W * 0.75, H * 0.80);

    drawPad(p1x, p1y, '#00ffcc');
    drawPad(p2x, p2y, '#ff4466');

    if (gameState === 'playing') {
      ctx.shadowColor = '#fff'; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(bx, by, BALL_R, 0, Math.PI * 2);
      ctx.fillStyle = '#fff'; ctx.fill(); ctx.shadowBlur = 0;
    }

    if (gameState === 'countdown') {
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fff'; ctx.shadowColor = '#fff'; ctx.shadowBlur = 30;
      ctx.font = `bold ${Math.round(H * 0.28)}px "Courier New",monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(countVal > 0 ? String(countVal) : 'GO!', W / 2, H / 2);
      ctx.shadowBlur = 0;
    }

    if (gameState === 'point_pause') {
      ctx.fillStyle = 'rgba(0,0,0,0.50)'; ctx.fillRect(0, 0, W, H);
      const p1scored = nextServeDir === -1;
      const youScored = isHost ? p1scored : !p1scored;
      const msg = youScored ? 'YOU SCORED!' : 'OPP SCORED';
      const col = youScored ? '#00ffcc' : '#ff4466';
      ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 20;
      ctx.font = `bold ${Math.round(H * 0.11)}px "Courier New",monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(msg, W / 2, H * 0.42); ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = `${Math.round(H * 0.065)}px "Courier New",monospace`;
      ctx.fillText(`${p1Score}  —  ${p2Score}`, W / 2, H * 0.58);
    }

    if (gameState === 'gameover') {
      const p1won  = p1Score >= WIN_SCORE;
      const youWon = isHost ? p1won : !p1won;
      const label  = youWon ? 'YOU WIN!' : 'YOU LOSE';
      const col    = youWon ? '#00ffcc' : '#ff4466';
      ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 24;
      ctx.font = `bold ${Math.round(H * 0.15)}px "Courier New",monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, W / 2, H * 0.38); ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.70)';
      ctx.font = `${Math.round(H * 0.07)}px "Courier New",monospace`;
      ctx.fillText(`${p1Score} — ${p2Score}`, W / 2, H * 0.55);
    }
  }

  // ── Physics — host only ───────────────────────────────────────────────────────

  function update() {
    if (!isHost || gameState !== 'playing') return;

    // Host controls P1 (left paddle)
    if (keys.has('ArrowUp')   || keys.has('w') || keys.has('W')) p1y -= PLAYER_SPD;
    if (keys.has('ArrowDown') || keys.has('s') || keys.has('S')) p1y += PLAYER_SPD;
    p1y = Math.max(0, Math.min(H - PAD_H, p1y));

    bx += vx; by += vy;

    if (by - BALL_R < 0) { by = BALL_R;      vy =  Math.abs(vy); sfx('pong-wall');   _sfxGuest('pong-wall'); }
    if (by + BALL_R > H) { by = H - BALL_R;  vy = -Math.abs(vy); sfx('pong-wall');   _sfxGuest('pong-wall'); }

    if (vx < 0 && bx - BALL_R <= p1x + PAD_W && bx + BALL_R >= p1x
        && by >= p1y && by <= p1y + PAD_H) {
      bx = p1x + PAD_W + BALL_R;
      vx = Math.abs(vx) * 1.06;
      vy = ((by - (p1y + PAD_H / 2)) / (PAD_H / 2)) * H * 0.014 * S;
      sfx('pong-paddle'); _sfxGuest('pong-paddle');
    }

    if (vx > 0 && bx + BALL_R >= p2x && bx - BALL_R <= p2x + PAD_W
        && by >= p2y && by <= p2y + PAD_H) {
      bx = p2x - BALL_R;
      vx = -Math.abs(vx) * 1.06;
      vy = ((by - (p2y + PAD_H / 2)) / (PAD_H / 2)) * H * 0.014 * S;
      sfx('pong-paddle'); _sfxGuest('pong-paddle');
    }

    const spd = Math.hypot(vx, vy);
    if (spd > BALL_MAX) { vx = (vx / spd) * BALL_MAX; vy = (vy / spd) * BALL_MAX; }

    if (bx < 0) { p2Score++; sfx('pong-score'); _sfxGuest('pong-score'); _onPoint( 1); }
    if (bx > W) { p1Score++; sfx('pong-score'); _sfxGuest('pong-score'); _onPoint(-1); }
  }

  // ── Guest update — lerp all received positions, handle own paddle ────────────

  function updateGuest() {
    if (isHost) return;
    const k = 0.28;   // lerp factor per tick (~144/s) — higher = snappier
    bx  += (_tBx  - bx)  * k;
    by  += (_tBy  - by)  * k;
    vx   = _tVx;
    vy   = _tVy;
    p1y += (_tP1y - p1y) * k;

    if (gameState === 'playing') {
      if (keys.has('ArrowUp')   || keys.has('w') || keys.has('W')) p2y -= PLAYER_SPD;
      if (keys.has('ArrowDown') || keys.has('s') || keys.has('S')) p2y += PLAYER_SPD;
      p2y = Math.max(0, Math.min(H - PAD_H, p2y));
      // Snap target to local position so lerp doesn't fight input
      _tP2y = p2y;
    } else {
      p2y += (_tP2y - p2y) * k;
    }
  }

  // ── Point scored — host only ──────────────────────────────────────────────────

  function _onPoint(nextDir) {
    nextServeDir = nextDir;
    gameState    = 'point_pause';
    bx = W / 2; by = H / 2; vx = 0; vy = 0;
    _broadcastState();

    if (p1Score >= WIN_SCORE || p2Score >= WIN_SCORE) {
      setTimeout(() => {
        gameState = 'gameover';
        _done     = true;
        _broadcastState();
        channel.send({ type: 'broadcast', event: 'game_over',
          payload: { p1Score, p2Score } });
        const youWon = p1Score >= WIN_SCORE;
        setTimeout(() => onGameOver(youWon), 2000);
      }, 700);
      return;
    }

    setTimeout(() => _startCountdown(nextDir), 900);
  }

  function _startCountdown(dir) {
    gameState = 'countdown'; countVal = 3;
    clearInterval(tickId);
    _broadcastState();
    tickId = setInterval(() => {
      if (countVal === 0) {
        clearInterval(tickId);
        serveBall(dir);
        gameState = 'playing';
        _broadcastState();
        return;
      }
      countVal--;
      _broadcastState();
    }, 700);
  }

  // ── Broadcast helpers ─────────────────────────────────────────────────────────

  // Send a dedicated sound event to the guest so they hear the same SFX as the host.
  function _sfxGuest(name) {
    channel.send({ type: 'broadcast', event: 'sfx', payload: { name } });
  }

  function _broadcastState() {
    if (!isHost) return;
    channel.send({ type: 'broadcast', event: 'game_state', payload: {
      bx: bx / W, by: by / H, vx: vx / W, vy: vy / H,
      p1y: p1y / H, p2y: p2y / H,
      p1Score, p2Score,
      gs: gameState, cv: countVal, nsd: nextServeDir,
    }});
  }

  function _broadcastPaddle() {
    channel.send({ type: 'broadcast', event: 'guest_paddle',
      payload: { y: p2y / H } });
  }

  // ── Main loop — fixed 144 fps logic, 30 fps broadcast ────────────────────────

  const TICK  = 1000 / 144;
  const BCAST = 1000 / 30;
  let lastT = 0, acc = 0, bAcc = 0;

  function loop(ts) {
    const dt = lastT ? Math.min(ts - lastT, 100) : 0;
    lastT = ts; acc += dt; bAcc += dt;

    while (acc >= TICK) {
      if (isHost) update(); else updateGuest();
      acc -= TICK;
    }

    if (bAcc >= BCAST) {
      if (isHost) _broadcastState(); else _broadcastPaddle();
      bAcc -= BCAST;
    }

    draw();
    if (gameState !== 'gameover') rafId = requestAnimationFrame(loop);
  }

  // Only the host drives the countdown — guest waits for broadcasts
  if (isHost) _startCountdown(1);
  rafId = requestAnimationFrame(loop);

  // ── Cleanup ───────────────────────────────────────────────────────────────────

  return function stop() {
    cancelAnimationFrame(rafId);
    clearInterval(tickId);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('keyup',   offKey);
    // Set _done BEFORE broadcasting so any bounce-back from opponent's stop() is ignored
    if (!_done) {
      _done = true;
      channel.send({ type: 'broadcast', event: 'opponent_left', payload: {} });
    }
  };
}
