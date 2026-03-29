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
 */

export function startPong(canvas, onGameOver) {
  const ctx = canvas.getContext('2d');
  const W   = canvas.width;
  const H   = canvas.height;

  // ── Layout constants ──────────────────────────────────────────────────────────
  const PAD_W    = Math.round(W * 0.018);   // paddle width  (~14 px at 800 wide)
  const PAD_H    = Math.round(H * 0.16);    // paddle height (~80 px at 500 tall)
  const PAD_MARGIN = Math.round(W * 0.032); // distance from wall to paddle edge
  const BALL_R   = Math.round(H * 0.016);   // ball radius
  const WIN_SCORE = 7;                      // first to 7 wins

  // Speeds are expressed in px/frame at 60 fps — feels responsive without
  // being impossible to track.
  const PLAYER_SPD = H * 0.011;   // ~5.5 px/frame at H=500
  const CPU_SPD    = H * 0.0085;  // ~4.2 px/frame — slightly slower → beatable
  const BALL_INIT  = W * 0.0065;  // ~5.2 px/frame initial ball speed
  const BALL_MAX   = W * 0.022;   // ~17.6 px/frame maximum ball speed

  // ── Mutable state ─────────────────────────────────────────────────────────────
  let py = H / 2 - PAD_H / 2;                    // player paddle Y (top edge)
  let cy = H / 2 - PAD_H / 2;                    // CPU paddle Y
  const px_x = PAD_MARGIN;                        // player paddle X (fixed)
  const cx_x = W - PAD_MARGIN - PAD_W;            // CPU paddle X (fixed)

  let bx, by, vx, vy;
  let pScore = 0, cScore = 0;
  let paused = true;   // true during countdown / game-over
  let rafId;

  const keys = new Set();
  const onKey  = e => keys.add(e.key);
  const offKey = e => keys.delete(e.key);
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup',   offKey);

  // ── Ball reset ────────────────────────────────────────────────────────────────
  // dir=1 → serves toward CPU (right), dir=-1 → toward player (left).
  // Random vertical angle in ±17° so rallies don't become purely horizontal.
  function resetBall(dir = 1) {
    bx = W / 2;
    by = H / 2;
    const angle = (Math.random() * 0.60 - 0.30); // ±0.30 rad ≈ ±17°
    vx = dir * BALL_INIT * Math.cos(angle);
    vy = BALL_INIT * Math.sin(angle);
  }

  // ── Draw helpers ──────────────────────────────────────────────────────────────
  function drawPaddle(x, y, glowColor) {
    // Outer glow
    ctx.shadowColor = glowColor;
    ctx.shadowBlur  = 18;
    ctx.fillStyle   = glowColor;
    ctx.fillRect(x, y, PAD_W, PAD_H);
    ctx.shadowBlur  = 0;
  }

  function draw() {
    // Background
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    // Centre dashed line
    ctx.save();
    ctx.setLineDash([Math.round(H * 0.022), Math.round(H * 0.022)]);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo(W / 2, 0);
    ctx.lineTo(W / 2, H);
    ctx.stroke();
    ctx.restore();

    // Score display
    ctx.fillStyle    = 'rgba(255,255,255,0.85)';
    ctx.font         = `bold ${Math.round(H * 0.13)}px "Courier New", monospace`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(pScore, W * 0.25, H * 0.04);
    ctx.fillText(cScore, W * 0.75, H * 0.04);

    // Labels (YOU / CPU)
    ctx.font         = `${Math.round(H * 0.042)}px "Courier New", monospace`;
    ctx.fillStyle    = 'rgba(255,255,255,0.30)';
    ctx.fillText('YOU', W * 0.25, H * 0.80);
    ctx.fillText('CPU', W * 0.75, H * 0.80);

    // Paddles
    drawPaddle(px_x, py, '#00ffcc');  // player — cyan-green
    drawPaddle(cx_x, cy, '#ff4466');  // CPU — warm red

    // Ball
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur  = 14;
    ctx.beginPath();
    ctx.arc(bx, by, BALL_R, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // ── Physics update ────────────────────────────────────────────────────────────
  function update() {
    if (paused) return;

    // Player paddle
    if (keys.has('ArrowUp')   || keys.has('w') || keys.has('W')) py -= PLAYER_SPD;
    if (keys.has('ArrowDown') || keys.has('s') || keys.has('S')) py += PLAYER_SPD;
    py = Math.max(0, Math.min(H - PAD_H, py));

    // CPU paddle — tracks ball Y with a slight lag so it is beatable
    const cpuCentre = cy + PAD_H / 2;
    if (cpuCentre < by - 4) cy = Math.min(cy + CPU_SPD, H - PAD_H);
    else if (cpuCentre > by + 4) cy = Math.max(cy - CPU_SPD, 0);

    // Ball movement
    bx += vx;
    by += vy;

    // Wall bounce (top / bottom)
    if (by - BALL_R < 0)  { by = BALL_R;      vy =  Math.abs(vy); }
    if (by + BALL_R > H)  { by = H - BALL_R;  vy = -Math.abs(vy); }

    // Player paddle collision (left side)
    if (vx < 0
        && bx - BALL_R <= px_x + PAD_W
        && bx + BALL_R >= px_x
        && by >= py && by <= py + PAD_H) {
      bx = px_x + PAD_W + BALL_R;
      vx = Math.abs(vx) * 1.06;  // slight acceleration per rally hit
      // Offset angle based on where on the paddle the ball hit: centre = flat,
      // edges = steep. rel ∈ [-1, +1].
      const rel = (by - (py + PAD_H / 2)) / (PAD_H / 2);
      vy = rel * H * 0.014;
    }

    // CPU paddle collision (right side)
    if (vx > 0
        && bx + BALL_R >= cx_x
        && bx - BALL_R <= cx_x + PAD_W
        && by >= cy && by <= cy + PAD_H) {
      bx = cx_x - BALL_R;
      vx = -Math.abs(vx) * 1.06;
      const rel = (by - (cy + PAD_H / 2)) / (PAD_H / 2);
      vy = rel * H * 0.014;
    }

    // Cap speed so the ball never becomes impossible to track
    const spd = Math.hypot(vx, vy);
    if (spd > BALL_MAX) { vx = (vx / spd) * BALL_MAX; vy = (vy / spd) * BALL_MAX; }

    // Scoring — ball exits left or right
    if (bx < 0)  { cScore++; checkWin(); resetBall( 1); }
    if (bx > W)  { pScore++; checkWin(); resetBall(-1); }
  }

  // ── Win detection ─────────────────────────────────────────────────────────────
  function checkWin() {
    if (pScore < WIN_SCORE && cScore < WIN_SCORE) return;
    paused = true;
    const won   = pScore >= WIN_SCORE;
    const label = won ? 'YOU WIN!' : 'CPU WINS';
    // Score: 100 per point scored by player — you earn nothing for a CPU win
    const score = won ? pScore * 100 : 0;

    // Let draw() render the final state once, then overlay the result screen
    requestAnimationFrame(() => {
      draw();
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.fillRect(0, 0, W, H);

      ctx.fillStyle    = won ? '#00ffcc' : '#ff4466';
      ctx.shadowColor  = ctx.fillStyle;
      ctx.shadowBlur   = 24;
      ctx.font         = `bold ${Math.round(H * 0.15)}px "Courier New", monospace`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, W / 2, H * 0.40);

      ctx.shadowBlur  = 0;
      ctx.fillStyle   = 'rgba(255,255,255,0.70)';
      ctx.font        = `${Math.round(H * 0.07)}px "Courier New", monospace`;
      ctx.fillText(`SCORE: ${score}`, W / 2, H * 0.58);

      setTimeout(() => onGameOver(score), 1800);
    });
  }

  // ── Main loop ─────────────────────────────────────────────────────────────────
  function loop() {
    update();
    draw();
    rafId = requestAnimationFrame(loop);
  }

  // ── Countdown before game starts ──────────────────────────────────────────────
  resetBall(1);
  let count = 3;
  const countTick = setInterval(() => {
    draw();
    ctx.fillStyle    = 'rgba(0,0,0,0.60)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle    = '#ffffff';
    ctx.shadowColor  = '#ffffff';
    ctx.shadowBlur   = 30;
    ctx.font         = `bold ${Math.round(H * 0.28)}px "Courier New", monospace`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(count > 0 ? String(count) : 'GO!', W / 2, H / 2);
    ctx.shadowBlur   = 0;
    if (count === 0) {
      clearInterval(countTick);
      paused = false;
      rafId  = requestAnimationFrame(loop);
    }
    count--;
  }, 800);

  // ── Cleanup function returned to caller ───────────────────────────────────────
  return function stop() {
    cancelAnimationFrame(rafId);
    clearInterval(countTick);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('keyup',   offKey);
  };
}
