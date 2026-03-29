/**
 * arcade-machine.js
 * Builds the 3D arcade cabinet geometry and an idle Pong demo on the screen.
 *
 * Exports:
 *   buildArcade(proj) → { group, clickTarget }
 *
 * userData contract (same shape as computer.js / television.js so that
 * frames.js and camera.js can treat this object uniformly):
 *   group.userData.isArcade      = true
 *   group.userData.panelMesh     = screenMesh   (camera fade target)
 *   group.userData.glowMesh      = glowPlane    (hover glow)
 *   group.userData.screenMesh    = screenMesh   (camera look-at target)
 *   group.userData.proj          = proj
 *   group.userData.customAnimate = driftFn(t)   (called by animateFrames)
 */

import * as THREE from 'three';
import { scene }  from '../core/renderer.js';

// ── Cabinet dimensions (world units) ─────────────────────────────────────────
const CAB_W = 1.10;   // width
const CAB_H = 2.30;   // total height (tall upright cabinet)
const CAB_D = 0.82;   // depth (front-to-back)

// Screen: 4:3 aspect, centred in the upper body
const SCR_W = 0.72;
const SCR_H = 0.54;
const SCR_Y = 0.30;  // local Y of screen centre (above group centre)

// Marquee: backlit title at the very top
const MRQ_H = 0.26;
const MRQ_Y = CAB_H / 2 - MRQ_H / 2 - 0.01;

// Control panel: angled box that protrudes at the front, waist height
const CTL_W = CAB_W;
const CTL_D = 0.52;
const CTL_H = 0.10;
const CTL_Y = -0.38;
const CTL_TILT = -Math.PI / 9;  // ~20° forward tilt

// ── Material palette ──────────────────────────────────────────────────────────
const MAT = {
  body:    new THREE.MeshStandardMaterial({ color: 0x12112a, roughness: 0.75, metalness: 0.15 }),
  trim:    new THREE.MeshStandardMaterial({ color: 0x0a0a1a, roughness: 0.80, metalness: 0.05 }),
  bezel:   new THREE.MeshStandardMaterial({ color: 0x080810, roughness: 0.90 }),
  ctl:     new THREE.MeshStandardMaterial({ color: 0x0e0d22, roughness: 0.70, metalness: 0.20 }),
  btn_r:   new THREE.MeshStandardMaterial({ color: 0xff1133, emissive: new THREE.Color(0xff1133), emissiveIntensity: 0.6, roughness: 0.4 }),
  btn_b:   new THREE.MeshStandardMaterial({ color: 0x1133ff, emissive: new THREE.Color(0x1133ff), emissiveIntensity: 0.6, roughness: 0.4 }),
  btn_y:   new THREE.MeshStandardMaterial({ color: 0xffcc00, emissive: new THREE.Color(0xffcc00), emissiveIntensity: 0.6, roughness: 0.4 }),
  stick:   new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.60, metalness: 0.40 }),
  coin:    new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.50, metalness: 0.60 }),
  side:    new THREE.MeshStandardMaterial({ color: 0x1a1040, roughness: 0.80 }),
};

// ── Geometry helpers ──────────────────────────────────────────────────────────
function mesh(geo, mat) {
  return new THREE.Mesh(geo, mat);
}
function box(w, h, d)       { return new THREE.BoxGeometry(w, h, d); }
function cyl(rt, rb, h, s)  { return new THREE.CylinderGeometry(rt, rb, h, s); }

// ── Demo Pong on the idle screen ──────────────────────────────────────────────
// 256×192 canvas, phosphor-green style, CPU vs CPU, runs at 30 fps via setInterval.
function makeDemoScreen() {
  const CW = 256, CH = 192;
  const cv  = document.createElement('canvas');
  cv.width  = CW;
  cv.height = CH;
  const ctx = cv.getContext('2d');

  const PH = 28;   // paddle height
  const PW = 5;    // paddle width
  const BR = 4;    // ball radius
  const SPD = 2.4;

  let py = CH / 2 - PH / 2;  // left paddle
  let ry = CH / 2 - PH / 2;  // right paddle
  let bx = CW / 2, by = CH / 2;
  let vx = SPD, vy = SPD * 0.6;

  let ls = 0, rs = 0;  // score

  function tick() {
    bx += vx; by += vy;
    if (by - BR < 0)   { by = BR;      vy = Math.abs(vy); }
    if (by + BR > CH)  { by = CH - BR; vy = -Math.abs(vy); }

    // Left paddle AI
    if (py + PH / 2 < by - 2) py = Math.min(py + 2.1, CH - PH);
    else if (py + PH / 2 > by + 2) py = Math.max(py - 2.1, 0);

    // Right paddle AI (slightly slower = less perfect)
    if (ry + PH / 2 < by - 4) ry = Math.min(ry + 1.8, CH - PH);
    else if (ry + PH / 2 > by + 4) ry = Math.max(ry - 1.8, 0);

    // Left paddle hit
    if (vx < 0 && bx - BR <= PW + 4 && by >= py && by <= py + PH) {
      vx = Math.abs(vx);
      vy += (Math.random() - 0.5) * 0.8;
    }
    // Right paddle hit
    if (vx > 0 && bx + BR >= CW - PW - 4 && by >= ry && by <= ry + PH) {
      vx = -Math.abs(vx);
      vy += (Math.random() - 0.5) * 0.8;
    }

    // Score reset
    if (bx < 0)  { rs++; bx = CW / 2; by = CH / 2; vx =  SPD; vy = SPD * 0.5; }
    if (bx > CW) { ls++; bx = CW / 2; by = CH / 2; vx = -SPD; vy = SPD * 0.5; }
    if (ls > 9 || rs > 9) { ls = 0; rs = 0; }

    // Draw
    ctx.fillStyle = '#000308';
    ctx.fillRect(0, 0, CW, CH);

    // Scanline effect: every other row is slightly dimmer
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let y = 0; y < CH; y += 2) ctx.fillRect(0, y, CW, 1);

    // Centre dash
    ctx.setLineDash([5, 6]);
    ctx.strokeStyle = 'rgba(0,255,120,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(CW / 2, 0); ctx.lineTo(CW / 2, CH); ctx.stroke();
    ctx.setLineDash([]);

    // Score
    ctx.fillStyle    = 'rgba(0,255,120,0.75)';
    ctx.font         = 'bold 14px monospace';
    ctx.textAlign    = 'center';
    ctx.fillText(ls, CW * 0.27, 16);
    ctx.fillText(rs, CW * 0.73, 16);

    // Paddles
    ctx.shadowColor = '#00ff78';
    ctx.shadowBlur  = 6;
    ctx.fillStyle   = '#00ff78';
    ctx.fillRect(4,        py, PW, PH);
    ctx.fillRect(CW - 4 - PW, ry, PW, PH);

    // Ball
    ctx.beginPath();
    ctx.arc(bx, by, BR, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // DEMO watermark
    ctx.fillStyle = 'rgba(0,255,120,0.28)';
    ctx.font      = '9px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('DEMO', CW - 4, CH - 4);

    tex.needsUpdate = true;
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter       = THREE.LinearFilter;
  tex.generateMipmaps = false;

  // 30 fps demo loop
  const id = setInterval(tick, 33);
  // Store interval id on the canvas so it can be cleared if needed
  cv._demoInterval = id;

  return tex;
}

// ── Marquee canvas texture ─────────────────────────────────────────────────────
function makeMarqueeTexture(glowColor) {
  const CW = 512, CH = 96;
  const cv  = document.createElement('canvas');
  cv.width  = CW; cv.height = CH;
  const ctx = cv.getContext('2d');

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, 0, CH);
  bg.addColorStop(0, '#1a0028');
  bg.addColorStop(1, '#0a0018');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CW, CH);

  // Neon title
  ctx.shadowColor  = glowColor;
  ctx.shadowBlur   = 28;
  ctx.fillStyle    = glowColor;
  ctx.font         = `bold 58px "Courier New", monospace`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ARCADE', CW / 2, CH / 2);

  // Outer border
  ctx.strokeStyle  = glowColor;
  ctx.lineWidth    = 3;
  ctx.globalAlpha  = 0.6;
  ctx.strokeRect(4, 4, CW - 8, CH - 8);
  ctx.globalAlpha  = 1;

  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter       = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

// ── Drift animator (same multi-axis float as the computer) ────────────────────
function makeDriftAnimator(group) {
  // Randomly seeded per-axis phases so no two cabinets move identically
  const ph = [
    Math.random() * Math.PI * 2,
    Math.random() * Math.PI * 2,
    Math.random() * Math.PI * 2,
  ];
  return function (t) {
    const d = group.userData;
    // Vertical bob — primary float motion
    group.position.y = d.baseY
      + Math.sin(t * d.floatSpeed       + ph[0]) * d.floatAmp;
    // Slow yaw sway ±1.2°
    group.rotation.y = d.baseQuat.y
      + Math.sin(t * d.floatSpeed * 0.4 + ph[1]) * 0.021;
    // Gentle pitch rock ±0.7°
    group.rotation.x = d.baseQuat.x
      + Math.sin(t * d.floatSpeed * 0.6 + ph[2]) * 0.012;
  };
}

// ── Main builder ──────────────────────────────────────────────────────────────
export function buildArcade(proj) {
  const group = new THREE.Group();

  // ── A. Main cabinet body ──────────────────────────────────────────────────
  const body = mesh(box(CAB_W, CAB_H, CAB_D), MAT.body);
  group.add(body);

  // ── B. Side panels (slightly darker strip, full height) ───────────────────
  // Gives the cabinet visual depth and matches classic side-art look
  [-1, 1].forEach(side => {
    const panel = mesh(box(0.025, CAB_H, CAB_D + 0.01), MAT.side);
    panel.position.set(side * (CAB_W / 2 - 0.013), 0, 0);
    group.add(panel);
  });

  // ── C. Marquee (backlit name sign at the very top) ────────────────────────
  const glowColor = proj.glowColor || '#ff44ff';
  const mrqMat = new THREE.MeshStandardMaterial({
    map:                  makeMarqueeTexture(glowColor),
    emissive:             new THREE.Color(glowColor),
    emissiveMap:          makeMarqueeTexture(glowColor),
    emissiveIntensity:    0.90,
    roughness:            0.50,
  });
  const marquee = mesh(box(CAB_W + 0.04, MRQ_H, CAB_D * 0.70 + 0.04), mrqMat);
  marquee.position.set(0, MRQ_Y, -(CAB_D - CAB_D * 0.70) / 2);
  group.add(marquee);

  // Neon trim strip under marquee (a thin emissive bar)
  const neonMat = new THREE.MeshStandardMaterial({
    color:             new THREE.Color(glowColor),
    emissive:          new THREE.Color(glowColor),
    emissiveIntensity: 1.4,
    roughness:         0.30,
  });
  const neonBar = mesh(box(CAB_W + 0.04, 0.025, 0.04), neonMat);
  neonBar.position.set(0, MRQ_Y - MRQ_H / 2 - 0.013, CAB_D / 2);
  group.add(neonBar);

  // ── D. Screen bezel (dark recessed frame around the screen) ───────────────
  // A box that sits proud of the cabinet front with the screen recessed inside
  const bezel = mesh(box(SCR_W + 0.10, SCR_H + 0.10, 0.07), MAT.bezel);
  bezel.position.set(0, SCR_Y, CAB_D / 2 - 0.02);
  group.add(bezel);

  // ── E. Screen mesh (canvas texture — live demo pong) ──────────────────────
  const demoTex   = makeDemoScreen();
  const screenMat = new THREE.MeshBasicMaterial({ map: demoTex });
  const screenMesh = mesh(new THREE.PlaneGeometry(SCR_W, SCR_H), screenMat);
  screenMesh.position.set(0, SCR_Y, CAB_D / 2 + 0.005);
  group.add(screenMesh);

  // Screen glow sprite (additive blending, sits just in front of screen)
  const glowMat = new THREE.MeshBasicMaterial({
    color:       new THREE.Color(0x00ff88),
    transparent: true,
    opacity:     0.07,
    blending:    THREE.AdditiveBlending,
    depthWrite:  false,
    side:        THREE.DoubleSide,
  });
  const glowPlane = mesh(new THREE.PlaneGeometry(SCR_W + 0.60, SCR_H + 0.60), glowMat);
  glowPlane.position.set(0, SCR_Y, CAB_D / 2 + 0.004);
  group.add(glowPlane);

  // ── F. Control panel (angled forward at waist height) ─────────────────────
  const ctlGroup = new THREE.Group();
  ctlGroup.position.set(0, CTL_Y, CAB_D / 2 - CTL_D / 2);
  ctlGroup.rotation.x = CTL_TILT;

  const ctlBox = mesh(box(CTL_W, CTL_H, CTL_D), MAT.ctl);
  ctlGroup.add(ctlBox);

  // Joystick — cylinder shaft + ball top
  const stickShaft = mesh(cyl(0.025, 0.022, 0.10, 8), MAT.stick);
  stickShaft.position.set(-CTL_W * 0.24, CTL_H / 2 + 0.05, 0);
  ctlGroup.add(stickShaft);

  const stickBall = mesh(new THREE.SphereGeometry(0.040, 8, 8), MAT.stick);
  stickBall.position.set(-CTL_W * 0.24, CTL_H / 2 + 0.105, 0);
  ctlGroup.add(stickBall);

  // 3 action buttons (red, blue, yellow)
  const BTN_R = 0.038;
  [MAT.btn_r, MAT.btn_b, MAT.btn_y].forEach((bMat, i) => {
    const btn = mesh(cyl(BTN_R, BTN_R, 0.030, 10), bMat);
    btn.rotation.x = Math.PI / 2;
    btn.position.set(CTL_W * 0.08 + i * (BTN_R * 2.8), CTL_H / 2 + 0.015, 0);
    ctlGroup.add(btn);
  });

  group.add(ctlGroup);

  // ── G. Coin door (lower front face, below control panel) ──────────────────
  const coinDoor = mesh(box(0.32, 0.26, 0.03), MAT.trim);
  coinDoor.position.set(0, -0.70, CAB_D / 2 - 0.005);
  group.add(coinDoor);

  // Coin slot (horizontal slit)
  const coinSlot = mesh(box(0.18, 0.018, 0.025), MAT.coin);
  coinSlot.position.set(0, -0.64, CAB_D / 2 + 0.006);
  group.add(coinSlot);

  // ── H. Speaker grille (front lower, thin horizontal slats) ────────────────
  // 6 thin horizontal bars just above the coin door
  for (let i = 0; i < 6; i++) {
    const slot = mesh(box(CAB_W * 0.48, 0.014, 0.022), MAT.trim);
    slot.position.set(-CAB_W * 0.14, -0.48 + i * 0.036, CAB_D / 2 + 0.002);
    group.add(slot);
  }

  // ── I. Decorative neon side strips (vertical trim lines) ──────────────────
  [-1, 1].forEach(side => {
    for (let i = 0; i < 3; i++) {
      const strip = mesh(box(0.010, CAB_H * 0.65, 0.010), neonMat);
      strip.position.set(
        side * (CAB_W / 2 - 0.01),
        0,
        CAB_D * (0.10 + i * 0.15) - CAB_D / 2
      );
      group.add(strip);
    }
  });

  // ── J. Base / feet ────────────────────────────────────────────────────────
  const base = mesh(box(CAB_W * 1.06, 0.10, CAB_D * 1.04), MAT.trim);
  base.position.set(0, -CAB_H / 2 - 0.05, 0);
  group.add(base);

  // 4 small rubber feet at corners
  const footMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95 });
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
    const foot = mesh(cyl(0.055, 0.050, 0.07, 6), footMat);
    foot.position.set(sx * CAB_W * 0.36, -CAB_H / 2 - 0.085, sz * CAB_D * 0.36);
    group.add(foot);
  });

  // ── K. Ambient point light (screen glow into scene) ───────────────────────
  const screenLight = new THREE.PointLight(0x00ff88, 0.5, 2.5);
  screenLight.position.set(0, SCR_Y, CAB_D / 2 + 0.3);
  group.add(screenLight);

  // ── userData wiring ───────────────────────────────────────────────────────
  screenMesh.userData.frameGroup = group;
  group.userData.panelMesh       = screenMesh;
  group.userData.glowMesh        = glowPlane;
  group.userData.screenMesh      = screenMesh;
  group.userData.isArcade        = true;
  group.userData.proj            = proj;
  group.userData.customAnimate   = makeDriftAnimator(group);

  return { group, clickTarget: screenMesh };
}
