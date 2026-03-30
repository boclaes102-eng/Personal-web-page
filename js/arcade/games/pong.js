/**
 * pong.js
 * Classic Pong — Player (left paddle) vs CPU (right paddle).
 * Renders onto a provided <canvas> element.
 *
 * Usage:
 *   const stop = startPong(canvasEl, (finalScore) => { ... });
 *   stop();  // cleans up RAF + key listeners
 *
 * Controls: W / S  or  ArrowUp / ArrowDown
 *
 * Game states:
 *   'countdown'   — 3-2-1 before first serve / after a point
 *   'playing'     — live physics
 *   'point_pause' — brief flash after a point scored, before countdown
 *   'gameover'    — result screen, RAF loop stopped
 */

import { sfx } from '../../audio/audio-manager.js';

export function startPong(canvas, onGameOver) {
  const ctx = canvas.getContext('2d');
  const W   = canvas.width;
  const H   = canvas.height;

  // ── Layout constants ──────────────────────────────────────────────────────────
  const PAD_W      = Math.round(W * 0.018);
  const PAD_H      = Math.round(H * 0.16);
  const PAD_MARGIN = Math.round(W * 0.032);
  const BALL_R     = Math.round(H * 0.016);
  const WIN_SCORE  = 7;

  const PLAYER_SPD = H * 0.011;
  const CPU_SPD    = H * 0.0085;
  const BALL_INIT  = W * 0.0032;
  const BALL_MAX   = W * 0.022;

  // ── State ─────────────────────────────────────────────────────────────────────
  let py = H / 2 - PAD_H / 2;
  let cy = H / 2 - PAD_H / 2;
  const px_x = PAD_MARGIN;
  const cx_x = W - PAD_MARGIN - PAD_W;

  let bx = W / 2, by = H / 2, vx = 0, vy = 0;
  let pScore = 0, cScore = 0;

  // 'countdown' | 'playing' | 'point_pause' | 'gameover'
  let gameState  = 'countdown';
  let countVal   = 3;          // countdown number currently displayed
  let nextServeDir = 1;        // direction after countdown ends
  let rafId;
  let tickId;                  // setInterval for countdowns

  const keys   = new Set();
  const onKey  = e => keys.add(e.key);
  const offKey = e => keys.delete(e.key);
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup',   offKey);

  // ── Ball helpers ──────────────────────────────────────────────────────────────
  function serveBall(dir) {
    bx = W / 2; by = H / 2;
    const angle = (Math.random() * 0.60 - 0.30);
    vx = dir * BALL_INIT * Math.cos(angle);
    vy = BALL_INIT * Math.sin(angle);
  }

  // ── Draw ──────────────────────────────────────────────────────────────────────
  function drawPaddle(x, y, color) {
    ctx.shadowColor = color;
    ctx.shadowBlur  = 18;
    ctx.fillStyle   = color;
    ctx.fillRect(x, y, PAD_W, PAD_H);
    ctx.shadowBlur  = 0;
  }

  function draw() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    // Centre dashed line
    ctx.save();
    ctx.setLineDash([Math.round(H * 0.022), Math.round(H * 0.022)]);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth   = 2;
    ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
    ctx.restore();

    // Scores
    ctx.fillStyle    = 'rgba(255,255,255,0.85)';
    ctx.font         = `bold ${Math.round(H * 0.13)}px "Courier New", monospace`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(pScore, W * 0.25, H * 0.04);
    ctx.fillText(cScore, W * 0.75, H * 0.04);

    // Labels
    ctx.font      = `${Math.round(H * 0.042)}px "Courier New", monospace`;
    ctx.fillStyle = 'rgba(255,255,255,0.30)';
    ctx.fillText('YOU', W * 0.25, H * 0.80);
    ctx.fillText('CPU', W * 0.75, H * 0.80);

    // Paddles
    drawPaddle(px_x, py, '#00ffcc');
    drawPaddle(cx_x, cy, '#ff4466');

    // Ball — hidden during point_pause and countdown so it doesn't flash at centre
    if (gameState === 'playing') {
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur  = 14;
      ctx.beginPath();
      ctx.arc(bx, by, BALL_R, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // ── State overlays ────────────────────────────────────────────────────────────
    if (gameState === 'countdown') {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle    = '#ffffff';
      ctx.shadowColor  = '#ffffff';
      ctx.shadowBlur   = 30;
      ctx.font         = `bold ${Math.round(H * 0.28)}px "Courier New", monospace`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(countVal > 0 ? String(countVal) : 'GO!', W / 2, H / 2);
      ctx.shadowBlur   = 0;
    }

    if (gameState === 'point_pause') {
      ctx.fillStyle = 'rgba(0,0,0,0.50)';
      ctx.fillRect(0, 0, W, H);
      // Who just scored
      const scored = nextServeDir === -1 ? 'YOU SCORED!' : 'CPU SCORED';
      const col    = nextServeDir === -1 ? '#00ffcc' : '#ff4466';
      ctx.fillStyle   = col;
      ctx.shadowColor = col;
      ctx.shadowBlur  = 20;
      ctx.font        = `bold ${Math.round(H * 0.11)}px "Courier New", monospace`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(scored, W / 2, H * 0.42);
      ctx.shadowBlur = 0;
      ctx.fillStyle  = 'rgba(255,255,255,0.55)';
      ctx.font       = `${Math.round(H * 0.065)}px "Courier New", monospace`;
      ctx.fillText(`${pScore}  —  ${cScore}`, W / 2, H * 0.58);
    }

    if (gameState === 'gameover') {
      const won   = pScore >= WIN_SCORE;
      const label = won ? 'YOU WIN!' : 'CPU WINS';
      const col   = won ? '#00ffcc' : '#ff4466';
      const score = won ? pScore * 100 : 0;

      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle    = col;
      ctx.shadowColor  = col;
      ctx.shadowBlur   = 24;
      ctx.font         = `bold ${Math.round(H * 0.15)}px "Courier New", monospace`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, W / 2, H * 0.38);
      ctx.shadowBlur  = 0;
      ctx.fillStyle   = 'rgba(255,255,255,0.70)';
      ctx.font        = `${Math.round(H * 0.07)}px "Courier New", monospace`;
      ctx.fillText(`SCORE: ${score}`, W / 2, H * 0.55);
      ctx.fillStyle   = 'rgba(255,255,255,0.35)';
      ctx.font        = `${Math.round(H * 0.05)}px "Courier New", monospace`;
      ctx.fillText(`${pScore} — ${cScore}`, W / 2, H * 0.66);
    }
  }

  // ── Physics update (only runs in 'playing' state) ─────────────────────────────
  function update() {
    if (gameState !== 'playing') return;

    // Player paddle
    if (keys.has('ArrowUp')   || keys.has('w') || keys.has('W')) py -= PLAYER_SPD;
    if (keys.has('ArrowDown') || keys.has('s') || keys.has('S')) py += PLAYER_SPD;
    py = Math.max(0, Math.min(H - PAD_H, py));

    // CPU paddle tracks ball with slight lag
    const cpuCentre = cy + PAD_H / 2;
    if (cpuCentre < by - 4) cy = Math.min(cy + CPU_SPD, H - PAD_H);
    else if (cpuCentre > by + 4) cy = Math.max(cy - CPU_SPD, 0);

    bx += vx; by += vy;

    // Top / bottom wall bounce
    if (by - BALL_R < 0)  { by = BALL_R;      vy =  Math.abs(vy); sfx('pong-wall'); }
    if (by + BALL_R > H)  { by = H - BALL_R;  vy = -Math.abs(vy); sfx('pong-wall'); }

    // Player paddle (left)
    if (vx < 0
        && bx - BALL_R <= px_x + PAD_W
        && bx + BALL_R >= px_x
        && by >= py && by <= py + PAD_H) {
      bx = px_x + PAD_W + BALL_R;
      vx = Math.abs(vx) * 1.06;
      vy = ((by - (py + PAD_H / 2)) / (PAD_H / 2)) * H * 0.014;
      sfx('pong-paddle');
    }

    // CPU paddle (right)
    if (vx > 0
        && bx + BALL_R >= cx_x
        && bx - BALL_R <= cx_x + PAD_W
        && by >= cy && by <= cy + PAD_H) {
      bx = cx_x - BALL_R;
      vx = -Math.abs(vx) * 1.06;
      vy = ((by - (cy + PAD_H / 2)) / (PAD_H / 2)) * H * 0.014;
      sfx('pong-paddle');
    }

    // Cap speed
    const spd = Math.hypot(vx, vy);
    if (spd > BALL_MAX) { vx = (vx / spd) * BALL_MAX; vy = (vy / spd) * BALL_MAX; }

    // Scoring
    if (bx < 0) { cScore++; sfx('pong-score'); onPoint( 1); }
    if (bx > W) { pScore++; sfx('pong-score'); onPoint(-1); }
  }

  // ── Point scored ──────────────────────────────────────────────────────────────
  // Called immediately after a score update; enters point_pause then countdown.
  function onPoint(nextDir) {
    nextServeDir = nextDir;
    gameState    = 'point_pause';
    bx = W / 2; by = H / 2; vx = 0; vy = 0;  // park ball off-screen

    // Check win condition first
    if (pScore >= WIN_SCORE || cScore >= WIN_SCORE) {
      // Brief flash of point_pause (700ms) then show gameover
      setTimeout(() => {
        gameState = 'gameover';
        const finalScore = pScore >= WIN_SCORE ? pScore * 100 : 0;
        setTimeout(() => onGameOver(finalScore), 2000);
      }, 700);
      return;
    }

    // Show "YOU/CPU SCORED" for 900ms, then start countdown
    setTimeout(() => startCountdown(nextDir), 900);
  }

  // ── Countdown before serve ────────────────────────────────────────────────────
  function startCountdown(serveDir) {
    gameState = 'countdown';
    countVal  = 3;
    clearInterval(tickId);
    tickId = setInterval(() => {
      if (countVal === 0) {
        clearInterval(tickId);
        serveBall(serveDir);
        gameState = 'playing';
        return;
      }
      countVal--;
    }, 700);
  }

  // ── Main loop ─────────────────────────────────────────────────────────────────
  // The loop always draws; update() is a no-op unless gameState === 'playing'.
  // When gameState becomes 'gameover', the loop draws the result once and stops.
  function loop() {
    update();
    draw();
    if (gameState !== 'gameover') {
      rafId = requestAnimationFrame(loop);
    }
    // If gameover: RAF is not rescheduled — loop terminates naturally.
  }

  // ── Initial 3-2-1 before the very first serve ─────────────────────────────────
  startCountdown(1);
  rafId = requestAnimationFrame(loop);

  // ── Cleanup ───────────────────────────────────────────────────────────────────
  return function stop() {
    cancelAnimationFrame(rafId);
    clearInterval(tickId);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('keyup',   offKey);
  };
}
