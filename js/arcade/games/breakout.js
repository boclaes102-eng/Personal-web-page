/**
 * breakout.js
 * Classic Breakout (brick breaker).
 *
 * Usage:
 *   const stop = startBreakout(canvasEl, (finalScore) => { ... });
 *   stop();
 *
 * Controls:
 *   ArrowLeft / ArrowRight  — move paddle
 *   Mouse movement          — moves paddle (while pointer is over canvas)
 */

export function startBreakout(canvas, onGameOver) {
  const ctx = canvas.getContext('2d');
  const W   = canvas.width;
  const H   = canvas.height;

  // ── Layout ────────────────────────────────────────────────────────────────────
  const PAD_W   = Math.round(W * 0.125);   // ~100 px at W=800
  const PAD_H   = Math.round(H * 0.026);   // ~13 px at H=500
  const PAD_Y   = H - Math.round(H * 0.08);
  const PAD_SPD = W * 0.008;               // key-controlled speed

  const BALL_R  = Math.round(H * 0.014);   // ~7 px

  // Brick grid: 10 cols × 6 rows
  const COLS      = 10;
  const ROWS      = 6;
  const BRICK_GAP = Math.round(W * 0.006); // ~5 px gap between bricks
  const BRICK_W   = (W - BRICK_GAP * (COLS + 1)) / COLS;
  const BRICK_H   = Math.round(H * 0.058);
  const GRID_TOP  = H * 0.10;              // bricks start 10% from top

  // Row definitions (bottom row = index 0 in ROWS):
  // Row 5 (top)    — gold, 2 hits required, 70 pts each hit
  // Rows 4-3       — red,  1 hit, 50 pts
  // Rows 2-1       — orange, 1 hit, 30 pts
  // Row 0 (bottom) — green, 1 hit, 10 pts
  // visual order is top→bottom: rows 5,4,3,2,1,0
  const ROW_DEF = [
    { color: '#ffdd00', pts: 70, hp: 2 },  // row 0 rendered at top = ROWS-1=5 visual
    { color: '#ffdd00', pts: 70, hp: 2 },
    { color: '#ff4444', pts: 50, hp: 1 },
    { color: '#ff4444', pts: 50, hp: 1 },
    { color: '#ff8800', pts: 30, hp: 1 },
    { color: '#00ff88', pts: 10, hp: 1 },
  ];

  // ── State ─────────────────────────────────────────────────────────────────────
  let padX = W / 2 - PAD_W / 2;
  let bx, by, vx, vy;
  let launched = false;    // ball sticks to paddle until Space pressed

  let score = 0;
  let lives = 3;
  let level = 1;
  let gameOver = false;
  let rafId;

  const keys = new Set();
  const onKey  = e => {
    if (!e.repeat) keys.add(e.key);
    // Launch on space or arrow
    if ((e.key === ' ' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !launched) {
      launched = true;
    }
  };
  const offKey = e => keys.delete(e.key);
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup',   offKey);

  // Mouse control — moves paddle proportionally across screen
  const onMouseMove = e => {
    const rect = canvas.getBoundingClientRect();
    const mx   = (e.clientX - rect.left) * (W / rect.width);
    padX = Math.max(0, Math.min(W - PAD_W, mx - PAD_W / 2));
    if (!launched) launched = true;
  };
  canvas.addEventListener('mousemove', onMouseMove);

  // ── Brick array ────────────────────────────────────────────────────────────────
  // bricks[row][col] — row 0 = visually topmost
  let bricks = [];

  function buildBricks() {
    bricks = [];
    for (let r = 0; r < ROWS; r++) {
      const def = ROW_DEF[r];
      bricks[r] = [];
      for (let c = 0; c < COLS; c++) {
        bricks[r][c] = {
          hp:    def.hp,
          maxHp: def.hp,
          pts:   def.pts,
          color: def.color,
          x: BRICK_GAP + c * (BRICK_W + BRICK_GAP),
          y: GRID_TOP  + r * (BRICK_H + BRICK_GAP),
        };
      }
    }
  }

  // ── Ball reset (on paddle) ─────────────────────────────────────────────────────
  function resetBall() {
    bx = padX + PAD_W / 2;
    by = PAD_Y - BALL_R - 2;
    // Speed increases slightly each level: 6 + 0.4 per level
    const spd  = Math.min(W * (0.0075 + (level - 1) * 0.0005), W * 0.013);
    const angle = -Math.PI / 2 + (Math.random() * 0.6 - 0.3);  // mostly upward ±17°
    vx = spd * Math.cos(angle);
    vy = spd * Math.sin(angle);
    launched = false;
  }

  // ── Particles ─────────────────────────────────────────────────────────────────
  let particles = [];

  function spawnPop(x, y, color) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      particles.push({
        x, y,
        vx: Math.cos(a) * (1 + Math.random() * 2),
        vy: Math.sin(a) * (1 + Math.random() * 2),
        life: 1.0,
        color,
      });
    }
  }

  // ── Starfield ─────────────────────────────────────────────────────────────────
  const STARS = Array.from({ length: 60 }, () => ({
    x: Math.random() * W,
    y: Math.random() * H,
    r: 0.5 + Math.random() * 1.2,
  }));

  function drawStars() {
    STARS.forEach(s => {
      ctx.globalAlpha = 0.25 + Math.random() * 0.3;
      ctx.fillStyle   = '#ffffff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  // ── HUD ───────────────────────────────────────────────────────────────────────
  function drawHUD() {
    ctx.fillStyle    = '#00ffcc';
    ctx.font         = `bold ${Math.round(H * 0.048)}px "Courier New", monospace`;
    ctx.textBaseline = 'top';
    ctx.textAlign    = 'left';
    ctx.fillText(`SCORE ${score}`, W * 0.02, H * 0.01);
    ctx.textAlign = 'center';
    ctx.fillText(`LVL ${level}`, W / 2, H * 0.01);
    ctx.textAlign = 'right';
    ctx.fillText(`LIVES ${'♥ '.repeat(lives).trim()}`, W * 0.98, H * 0.01);
  }

  // ── Draw ──────────────────────────────────────────────────────────────────────
  function draw() {
    ctx.fillStyle = '#05080f';
    ctx.fillRect(0, 0, W, H);
    drawStars();

    // Bricks
    bricks.forEach(row => row.forEach(b => {
      if (b.hp <= 0) return;
      // Damaged bricks appear slightly dimmer
      const alpha = b.hp < b.maxHp ? 0.55 : 1.0;
      ctx.globalAlpha  = alpha;
      ctx.fillStyle    = b.color;
      ctx.shadowColor  = b.color;
      ctx.shadowBlur   = 8;
      ctx.fillRect(b.x, b.y, BRICK_W, BRICK_H);
      // Highlight top edge
      ctx.shadowBlur = 0;
      ctx.fillStyle  = 'rgba(255,255,255,0.22)';
      ctx.fillRect(b.x, b.y, BRICK_W, 3);
    }));
    ctx.globalAlpha = 1;
    ctx.shadowBlur  = 0;

    // Paddle
    const pCx = padX + PAD_W / 2;
    const grad = ctx.createLinearGradient(padX, 0, padX + PAD_W, 0);
    grad.addColorStop(0,   '#0088ff');
    grad.addColorStop(0.5, '#00ffcc');
    grad.addColorStop(1,   '#0088ff');
    ctx.fillStyle   = grad;
    ctx.shadowColor = '#00ffcc';
    ctx.shadowBlur  = 16;
    ctx.beginPath();
    ctx.roundRect(padX, PAD_Y, PAD_W, PAD_H, PAD_H / 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Ball
    ctx.fillStyle   = '#ffffff';
    ctx.shadowColor = '#aaddff';
    ctx.shadowBlur  = 14;
    ctx.beginPath();
    ctx.arc(bx, by, BALL_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // "PRESS SPACE" hint when ball is on paddle
    if (!launched) {
      ctx.fillStyle    = 'rgba(0,255,204,0.60)';
      ctx.font         = `${Math.round(H * 0.040)}px "Courier New", monospace`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('PRESS SPACE OR MOVE MOUSE TO LAUNCH', W / 2, PAD_Y - BALL_R * 3);
    }

    // Particles
    particles.forEach(p => {
      ctx.globalAlpha = p.life;
      ctx.fillStyle   = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    drawHUD();
  }

  // ── Update ────────────────────────────────────────────────────────────────────
  function update() {
    // Paddle keyboard movement
    if (keys.has('ArrowLeft')  || keys.has('a') || keys.has('A')) padX -= PAD_SPD;
    if (keys.has('ArrowRight') || keys.has('d') || keys.has('D')) padX += PAD_SPD;
    padX = Math.max(0, Math.min(W - PAD_W, padX));

    if (!launched) {
      // Ball tracks paddle centre until launched
      bx = padX + PAD_W / 2;
      by = PAD_Y - BALL_R - 2;
      return;
    }

    // Ball movement
    bx += vx;
    by += vy;

    // Wall bounce (left / right)
    if (bx - BALL_R < 0)  { bx = BALL_R;     vx =  Math.abs(vx); }
    if (bx + BALL_R > W)  { bx = W - BALL_R; vx = -Math.abs(vx); }
    // Top wall
    if (by - BALL_R < 0)  { by = BALL_R;     vy =  Math.abs(vy); }

    // Paddle collision
    if (vy > 0
        && bx >= padX - BALL_R && bx <= padX + PAD_W + BALL_R
        && by + BALL_R >= PAD_Y && by - BALL_R <= PAD_Y + PAD_H) {
      by = PAD_Y - BALL_R;
      // Angle depends on where on paddle it hits: centre=straight up, edges=steep
      const rel = ((bx - padX) / PAD_W) * 2 - 1;  // -1 (left) to +1 (right)
      const angle = rel * (Math.PI * 0.38);          // max ±68° from straight up
      const spd   = Math.hypot(vx, vy);
      vx = spd * Math.sin(angle);
      vy = -Math.abs(spd * Math.cos(angle));
    }

    // Brick collision — check all alive bricks
    outer:
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const b = bricks[r][c];
        if (b.hp <= 0) continue;

        // AABB test with ball radius as margin
        if (bx + BALL_R < b.x || bx - BALL_R > b.x + BRICK_W) continue;
        if (by + BALL_R < b.y || by - BALL_R > b.y + BRICK_H) continue;

        // Determine which face was hit to choose correct bounce axis
        const overlapL = (bx + BALL_R) - b.x;
        const overlapR = (b.x + BRICK_W) - (bx - BALL_R);
        const overlapT = (by + BALL_R) - b.y;
        const overlapB = (b.y + BRICK_H) - (by - BALL_R);
        const minH = Math.min(overlapL, overlapR);
        const minV = Math.min(overlapT, overlapB);

        if (minH < minV) {
          vx = overlapL < overlapR ? -Math.abs(vx) : Math.abs(vx);
        } else {
          vy = overlapT < overlapB ? -Math.abs(vy) : Math.abs(vy);
        }

        b.hp--;
        score += b.pts * level;   // level multiplier
        spawnPop(b.x + BRICK_W / 2, b.y + BRICK_H / 2, b.color);

        break outer;  // one brick per frame prevents tunnelling through thin gaps
      }
    }

    // Ball fell below screen — lose a life
    if (by - BALL_R > H) {
      lives--;
      if (lives <= 0) {
        gameOver = true;
      } else {
        resetBall();
      }
    }

    // Particle update
    particles = particles.filter(p => {
      p.x += p.vx; p.y += p.vy;
      p.life -= 0.04;
      return p.life > 0;
    });

    // Level clear — rebuild bricks
    if (bricks.every(row => row.every(b => b.hp <= 0))) {
      level++;
      score += 2000;
      buildBricks();
      resetBall();
    }
  }

  // ── Game-over screen ──────────────────────────────────────────────────────────
  function showGameOver() {
    draw();
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle    = '#ff4444';
    ctx.shadowColor  = '#ff4444';
    ctx.shadowBlur   = 28;
    ctx.font         = `bold ${Math.round(H * 0.14)}px "Courier New", monospace`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GAME OVER', W / 2, H * 0.38);

    ctx.shadowBlur  = 0;
    ctx.fillStyle   = 'rgba(255,255,255,0.75)';
    ctx.font        = `${Math.round(H * 0.068)}px "Courier New", monospace`;
    ctx.fillText(`SCORE: ${score}`, W / 2, H * 0.56);

    setTimeout(() => onGameOver(score), 1800);
  }

  // ── Loop ──────────────────────────────────────────────────────────────────────
  function loop() {
    if (gameOver) { showGameOver(); return; }
    update();
    draw();
    rafId = requestAnimationFrame(loop);
  }

  buildBricks();
  resetBall();
  rafId = requestAnimationFrame(loop);

  return function stop() {
    cancelAnimationFrame(rafId);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('keyup',   offKey);
    canvas.removeEventListener('mousemove', onMouseMove);
  };
}
