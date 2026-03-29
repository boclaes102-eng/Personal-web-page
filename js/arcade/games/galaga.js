/**
 * galaga.js
 * Galaga-style space shooter.
 *
 * Usage:
 *   const stop = startGalaga(canvasEl, (finalScore) => { ... });
 *   stop();
 *
 * Controls:
 *   ArrowLeft / ArrowRight  — move ship
 *   Space                   — shoot
 */

export function startGalaga(canvas, onGameOver) {
  const ctx = canvas.getContext('2d');
  const W   = canvas.width;
  const H   = canvas.height;

  // ── Layout ────────────────────────────────────────────────────────────────────
  const SHIP_W   = Math.round(W * 0.050);  // ~40 px wide at W=800
  const SHIP_H   = Math.round(H * 0.065);  // ~32 px tall at H=500
  const SHIP_SPD = W * 0.006;              // ~4.8 px/frame
  const BULLET_W = 3;
  const BULLET_H = Math.round(H * 0.030);  // ~15 px
  const BULLET_SPD = H * 0.018;            // ~9 px/frame
  const MAX_BULLETS = 2;                    // max player bullets on screen

  // Enemy grid: 3 rows × 8 cols = 24 enemies
  const COLS = 8, ROWS = 3;
  const E_W = Math.round(W * 0.050);       // ~40 px enemy width
  const E_H = Math.round(H * 0.055);       // ~27 px enemy height
  // Rows: 0=commander(red), 1=fighter(blue), 2=bee(yellow)
  const ENEMY_COLORS  = ['#ff4444', '#4488ff', '#ffdd00'];
  const ENEMY_POINTS  = [40, 20, 10];       // formation score per enemy
  const ENEMY_DIVE_PTS = [150, 80, 50];     // bonus when killed while diving

  // Formation layout — centred horizontally, starting Y at 10% from top
  const F_COL_PITCH = Math.round(W / (COLS + 2));   // horizontal spacing
  const F_ROW_PITCH = Math.round(H * 0.090);         // vertical spacing
  const F_START_X   = (W - (COLS - 1) * F_COL_PITCH) / 2;
  const F_START_Y   = H * 0.08;

  // ── State ─────────────────────────────────────────────────────────────────────
  let shipX = W / 2 - SHIP_W / 2;
  const SHIP_Y = H - SHIP_H - Math.round(H * 0.06);  // near bottom, fixed

  let score  = 0;
  let lives  = 3;
  let wave   = 1;
  let gameOver = false;
  let rafId;
  let invincible     = false;  // brief invincibility after being hit
  let invincibleTimer = 0;     // frames remaining
  let flashOn        = true;   // ship visibility during invincibility

  const keys = new Set();
  const onKey  = e => { if (!e.repeat) keys.add(e.key); };
  const offKey = e => keys.delete(e.key);
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup',   offKey);

  // Player bullets
  let bullets = [];

  // Enemy bullets (fired by enemies)
  let eBullets = [];
  const E_BULLET_SPD = H * 0.008;  // ~4 px/frame — slow enough to dodge

  // Formation sway
  let fSwayX    = 0;             // current horizontal offset applied to all formation enemies
  let fSwayDir  = 1;             // +1 or -1
  let fSwaySpd  = W * 0.0015;   // px/frame, increases each wave

  // Enemies array — each: { row, col, x, y, alive, diving, diveVx, diveVy,
  //                          diveOriginX, diveOriginY, returning }
  let enemies = [];

  // Timer tracking
  let diveTimer  = 0;   // frames until next enemy dives
  let eBulTimer  = 0;   // frames until next enemy fires

  // ── Build enemy formation ─────────────────────────────────────────────────────
  function buildEnemies() {
    enemies = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        enemies.push({
          row: r, col: c,
          // Formation home position (before sway offset)
          homeX: F_START_X + c * F_COL_PITCH - E_W / 2,
          homeY: F_START_Y + r * F_ROW_PITCH,
          x: 0, y: 0,      // actual draw position, computed each frame
          alive: true,
          diving: false,
          returning: false,
          diveVx: 0, diveVy: 0,
          diveOriginX: 0, diveOriginY: 0,
          diveSin: 0,      // phase for horizontal sine wobble during dive
        });
      }
    }
  }

  function resetWave() {
    buildEnemies();
    bullets  = [];
    eBullets = [];
    diveTimer  = fps(2.5);
    eBulTimer  = fps(3.0);
    fSwaySpd  = W * (0.0015 + (wave - 1) * 0.0004);  // slightly faster each wave
  }

  // Convert seconds to frames at 60 fps
  function fps(s) { return Math.round(s * 60 + (Math.random() - 0.5) * 30); }

  // ── Ship drawing ──────────────────────────────────────────────────────────────
  function drawShip(x, y) {
    ctx.save();
    ctx.translate(x + SHIP_W / 2, y + SHIP_H / 2);
    // Body
    ctx.fillStyle   = '#00ffcc';
    ctx.shadowColor = '#00ffcc';
    ctx.shadowBlur  = 16;
    ctx.beginPath();
    ctx.moveTo(0, -SHIP_H / 2);
    ctx.lineTo( SHIP_W / 2,  SHIP_H / 2);
    ctx.lineTo(-SHIP_W / 2,  SHIP_H / 2);
    ctx.closePath();
    ctx.fill();
    // Engine glow
    ctx.fillStyle  = '#ffffff';
    ctx.shadowBlur = 8;
    ctx.fillRect(-SHIP_W * 0.12, SHIP_H * 0.20, SHIP_W * 0.24, SHIP_H * 0.22);
    ctx.restore();
  }

  // ── Enemy drawing ─────────────────────────────────────────────────────────────
  function drawEnemy(e) {
    const cx = e.x + E_W / 2;
    const cy = e.y + E_H / 2;
    const col = ENEMY_COLORS[e.row];
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle   = col;
    ctx.shadowColor = col;
    ctx.shadowBlur  = 12;

    if (e.row === 0) {
      // Commander — diamond / butterfly shape
      ctx.beginPath();
      ctx.moveTo(0, -E_H * 0.50);
      ctx.lineTo( E_W * 0.48,  0);
      ctx.lineTo(0,  E_H * 0.50);
      ctx.lineTo(-E_W * 0.48,  0);
      ctx.closePath();
      ctx.fill();
      // Inner eye
      ctx.fillStyle = '#ffffff';
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(0, 0, E_W * 0.14, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.row === 1) {
      // Fighter — T shape (horizontal + vertical bar)
      ctx.fillRect(-E_W * 0.48, -E_H * 0.15, E_W * 0.96, E_H * 0.30);
      ctx.fillRect(-E_W * 0.15, -E_H * 0.48, E_W * 0.30, E_H * 0.70);
    } else {
      // Bee — oval body + small wing bumps on sides
      ctx.beginPath();
      ctx.ellipse(0, 0, E_W * 0.34, E_H * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(-E_W * 0.40, 0, E_W * 0.16, E_H * 0.24, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse( E_W * 0.40, 0, E_W * 0.16, E_H * 0.24, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ── Explosion particles ───────────────────────────────────────────────────────
  let particles = [];

  function spawnExplosion(x, y, color) {
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const spd   = 1.5 + Math.random() * 3;
      particles.push({
        x, y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        life: 1.0,  // normalised 0–1
        color,
      });
    }
  }

  // ── Starfield background ──────────────────────────────────────────────────────
  const STARS = Array.from({ length: 80 }, () => ({
    x: Math.random() * W,
    y: Math.random() * H,
    r: 0.5 + Math.random() * 1.5,
    spd: 0.3 + Math.random() * 0.8,
  }));

  function drawStars() {
    ctx.fillStyle = '#fff';
    STARS.forEach(s => {
      ctx.globalAlpha = 0.4 + Math.random() * 0.4;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
      s.y += s.spd;
      if (s.y > H) { s.y = 0; s.x = Math.random() * W; }
    });
    ctx.globalAlpha = 1;
  }

  // ── HUD ───────────────────────────────────────────────────────────────────────
  function drawHUD() {
    ctx.fillStyle    = '#00ffcc';
    ctx.font         = `bold ${Math.round(H * 0.048)}px "Courier New", monospace`;
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`SCORE ${score}`, W * 0.02, H * 0.02);

    ctx.textAlign = 'right';
    ctx.fillText(`WAVE ${wave}`, W * 0.98, H * 0.02);

    // Lives as small ship icons
    ctx.textAlign = 'center';
    ctx.font = `${Math.round(H * 0.040)}px monospace`;
    ctx.fillText(`LIVES: ${'▲'.repeat(lives)}`, W / 2, H * 0.02);
  }

  // ── Input: fire ───────────────────────────────────────────────────────────────
  let spaceWasUp = true;   // detect press (not hold)

  // ── Main update ───────────────────────────────────────────────────────────────
  function update() {
    // Ship movement
    if (keys.has('ArrowLeft')  || keys.has('a') || keys.has('A')) shipX -= SHIP_SPD;
    if (keys.has('ArrowRight') || keys.has('d') || keys.has('D')) shipX += SHIP_SPD;
    shipX = Math.max(0, Math.min(W - SHIP_W, shipX));

    // Shoot — allow fire only on fresh keydown, not continuous hold
    const spaceDown = keys.has(' ');
    if (spaceDown && spaceWasUp && bullets.length < MAX_BULLETS) {
      bullets.push({
        x: shipX + SHIP_W / 2 - BULLET_W / 2,
        y: SHIP_Y,
      });
    }
    spaceWasUp = !spaceDown;

    // Player bullets — move up
    bullets = bullets.filter(b => {
      b.y -= BULLET_SPD;
      return b.y + BULLET_H > 0;
    });

    // Enemy bullets — move down
    eBullets = eBullets.filter(b => {
      b.y += E_BULLET_SPD;
      return b.y < H;
    });

    // Formation sway — left/right oscillation
    fSwayX += fSwayDir * fSwaySpd;
    if (Math.abs(fSwayX) > W * 0.08) fSwayDir *= -1;

    // Update enemy positions (formation + dive)
    enemies.forEach(e => {
      if (!e.alive) return;
      if (!e.diving && !e.returning) {
        // Formation position
        e.x = e.homeX + fSwayX;
        e.y = e.homeY;
      } else if (e.diving) {
        // Dive toward last-known player position with sine wobble
        e.diveSin += 0.18;
        e.x += e.diveVx + Math.sin(e.diveSin) * 1.8;
        e.y += e.diveVy;
        // Once enemy exits bottom of screen → respawn at top formation spot
        if (e.y > H + E_H * 2) {
          e.diving    = false;
          e.returning = true;
          e.x = e.homeX + fSwayX;
          e.y = -E_H * 3;  // appear from top
        }
      } else if (e.returning) {
        // Animate back into formation from above
        const targetX = e.homeX + fSwayX;
        const targetY = e.homeY;
        const dx = targetX - e.x;
        const dy = targetY - e.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 4) {
          e.x = targetX; e.y = targetY;
          e.returning = false;
        } else {
          const spd = Math.min(dist, H * 0.010);
          e.x += (dx / dist) * spd;
          e.y += (dy / dist) * spd;
        }
      }
    });

    // Spawn a diver
    if (--diveTimer <= 0) {
      const formationEnemies = enemies.filter(e => e.alive && !e.diving && !e.returning);
      if (formationEnemies.length > 0) {
        const target = formationEnemies[Math.floor(Math.random() * formationEnemies.length)];
        target.diving       = true;
        target.diveOriginX  = target.x;
        target.diveOriginY  = target.y;
        target.diveSin      = 0;
        // Aim toward player position at time of dive
        const aimX = shipX + SHIP_W / 2 - (target.x + E_W / 2);
        const aimY = SHIP_Y - target.y;
        const dist = Math.hypot(aimX, aimY) || 1;
        const diveSpd = H * (0.0055 + (wave - 1) * 0.0008); // faster each wave
        target.diveVx = (aimX / dist) * diveSpd * 0.55;  // softer horizontal component
        target.diveVy = (aimY / dist) * diveSpd;
      }
      // Fewer frames between dives as wave increases
      diveTimer = fps(2.5 - (wave - 1) * 0.25);
    }

    // Enemy fires occasionally
    if (--eBulTimer <= 0) {
      const shooters = enemies.filter(
        e => e.alive && (e.diving || (!e.returning && e.y > 0))
      );
      if (shooters.length > 0) {
        const src = shooters[Math.floor(Math.random() * shooters.length)];
        eBullets.push({ x: src.x + E_W / 2 - 2, y: src.y + E_H });
      }
      eBulTimer = fps(3.5 - (wave - 1) * 0.2);
    }

    // ── Collision: player bullet vs enemy ────────────────────────────────────────
    bullets = bullets.filter(b => {
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (!e.alive) continue;
        if (b.x < e.x + E_W && b.x + BULLET_W > e.x &&
            b.y < e.y + E_H && b.y + BULLET_H > e.y) {
          const pts = e.diving ? ENEMY_DIVE_PTS[e.row] : ENEMY_POINTS[e.row];
          score += pts;
          spawnExplosion(e.x + E_W / 2, e.y + E_H / 2, ENEMY_COLORS[e.row]);
          e.alive   = false;
          e.diving  = false;
          e.returning = false;
          return false;  // remove bullet
        }
      }
      return true;
    });

    // ── Collision: enemy bullet or enemy body vs player ───────────────────────────
    if (!invincible) {
      const shipCx = shipX + SHIP_W / 2;
      const shipCy = SHIP_Y + SHIP_H / 2;
      const hitR   = SHIP_W * 0.40;  // generous hitbox forgiveness

      const hitByBullet = eBullets.some(b =>
        Math.hypot(b.x - shipCx, b.y - shipCy) < hitR
      );
      const hitByEnemy = enemies.some(e =>
        e.alive && e.diving &&
        Math.hypot((e.x + E_W / 2) - shipCx, (e.y + E_H / 2) - shipCy) < hitR + E_W * 0.3
      );

      if (hitByBullet || hitByEnemy) {
        lives--;
        spawnExplosion(shipCx, shipCy, '#00ffcc');
        eBullets = [];
        if (lives <= 0) {
          gameOver = true;
        } else {
          invincible      = true;
          invincibleTimer = 120;  // 2 seconds at 60 fps
        }
      }
    }

    // Invincibility countdown
    if (invincible) {
      invincibleTimer--;
      flashOn = Math.floor(invincibleTimer / 6) % 2 === 0;  // flash every 6 frames
      if (invincibleTimer <= 0) { invincible = false; flashOn = true; }
    }

    // Particle update
    particles = particles.filter(p => {
      p.x += p.vx; p.y += p.vy;
      p.life -= 0.035;
      return p.life > 0;
    });

    // ── Wave clear check ──────────────────────────────────────────────────────────
    if (enemies.every(e => !e.alive)) {
      wave++;
      score += 1000;  // wave clear bonus
      resetWave();
    }
  }

  // ── Draw ──────────────────────────────────────────────────────────────────────
  function draw() {
    ctx.fillStyle = '#05080f';
    ctx.fillRect(0, 0, W, H);

    drawStars();

    // Enemy bullets
    ctx.fillStyle = '#ff8844';
    eBullets.forEach(b => {
      ctx.shadowColor = '#ff8844';
      ctx.shadowBlur  = 8;
      ctx.fillRect(b.x, b.y, 3, Math.round(H * 0.022));
    });
    ctx.shadowBlur = 0;

    // Enemies
    enemies.forEach(e => { if (e.alive) drawEnemy(e); });

    // Player bullets
    ctx.fillStyle   = '#ffffff';
    ctx.shadowColor = '#00ffcc';
    ctx.shadowBlur  = 10;
    bullets.forEach(b => ctx.fillRect(b.x, b.y, BULLET_W, BULLET_H));
    ctx.shadowBlur = 0;

    // Ship (hidden while flashing during invincibility)
    if (flashOn) drawShip(shipX, SHIP_Y);

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

  // ── Game over screen ──────────────────────────────────────────────────────────
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

  resetWave();
  rafId = requestAnimationFrame(loop);

  return function stop() {
    cancelAnimationFrame(rafId);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('keyup',   offKey);
  };
}
