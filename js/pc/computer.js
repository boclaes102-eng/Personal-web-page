/**
 * computer.js
 * Builds a detailed procedural retro 90s desktop PC in Three.js:
 *   — CRT monitor (boxy, deep, chunky bezel, ventilation, control buttons)
 *   — Horizontal desktop tower case (drive bays, power button, LEDs)
 *   — Keyboard (wedge-shaped, in front of the tower)
 *
 * The group faces the camera (+Z local = toward viewer) because frames.js calls
 * group.lookAt(0, 0, 0) after positioning.
 *
 * Drift: stored as userData.customAnimate(t) — called by animateFrames().
 */

import * as THREE from 'three';
import { scene, ensureLights } from '../core/renderer.js';

// ── Material palette ─────────────────────────────────────────────────────────
// classic "greige" beige of 90s PC hardware
const COL_BEIGE     = 0xc8bfa8;
const COL_BEIGE_LT  = 0xd4cbba;
const COL_BEIGE_DK  = 0xafa698;
const COL_VENT      = 0x1c1c1c;
const COL_KEY_BODY  = 0xc0b8a0;
const COL_KEY_CAP   = 0xb8b09a;

function mat(color, shin = 20) {
  return new THREE.MeshPhongMaterial({ color, shininess: shin });
}

// ── Shared reusable geometries ───────────────────────────────────────────────
function box(w, h, d) { return new THREE.BoxGeometry(w, h, d); }
function mesh(geo, mat_) { return new THREE.Mesh(geo, mat_); }

// ── Idle screen canvas texture ────────────────────────────────────────────────
// Draws a static "boot screen" onto a 512×400 canvas that is then used as a
// Three.js texture on the monitor plane. Called once per buildComputer() call.
// hexGlow is the project's accent colour (e.g. '#00ff41' for green phosphor).
function makeScreenTex(hexGlow) {
  const W = 512, H = 400; // canvas pixels — arbitrary, just needs to look sharp at zoom distance
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');

  // Clip everything to a rounded rectangle so the screen plane blends into the
  // bezel instead of showing hard rectangular corners. R=32px at 512px wide ≈ 6%.
  const R = 32;
  ctx.beginPath();
  ctx.moveTo(R, 0); ctx.lineTo(W - R, 0);
  ctx.quadraticCurveTo(W, 0, W, R);
  ctx.lineTo(W, H - R); ctx.quadraticCurveTo(W, H, W - R, H);
  ctx.lineTo(R, H); ctx.quadraticCurveTo(0, H, 0, H - R);
  ctx.lineTo(0, R); ctx.quadraticCurveTo(0, 0, R, 0);
  ctx.closePath();
  ctx.clip();

  // Very dark green-black — matches the phosphor colour of a monochrome CRT.
  ctx.fillStyle = '#050c05';
  ctx.fillRect(0, 0, W, H);

  // Scanlines — one dark stripe every 3px, 18% opacity keeps them subtle.
  for (let y = 0; y < H; y += 3) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, y, W, 1);
  }

  // Radial vignette — inner radius 28% of height, outer 72%; darkens edges 55%.
  const vig = ctx.createRadialGradient(W/2, H/2, H*0.28, W/2, H/2, H*0.72);
  vig.addColorStop(0,   'transparent');
  vig.addColorStop(1,   'rgba(0,0,0,0.55)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  const g = (text, x, y, font, alpha = 1.0) => {
    ctx.save();
    ctx.shadowColor = hexGlow;
    ctx.shadowBlur  = 12;
    ctx.globalAlpha = alpha;
    ctx.fillStyle   = hexGlow;
    ctx.font        = font;
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, x, y);
    ctx.restore();
  };

  g('PANALYZE  v1.0',         W/2,  95, 'bold 30px "Courier New",monospace');
  g('─────────────────────',  W/2, 128, '18px "Courier New",monospace', 0.45);
  g('PASSWORD ANALYZER',       W/2, 158, '19px "Courier New",monospace', 0.75);
  g('─────────────────────',  W/2, 188, '18px "Courier New",monospace', 0.45);
  g('[ CLICK  TO  INTERACT ]', W/2, 252, '16px "Courier New",monospace', 0.5);
  g('C:\\PANALYZE>  _',        W/2, 295, '14px "Courier New",monospace', 0.35);

  // Decorative corner brackets — common UI motif on retro terminal software.
  // '33' appended to hexGlow = 20% opacity (0x33 / 0xFF ≈ 0.2).
  ctx.save();
  ctx.strokeStyle = hexGlow + '33';
  ctx.lineWidth   = 1.2;
  [[24,20],[W-24,20],[24,H-20],[W-24,H-20]].forEach(([cx,cy]) => {
    const sx = cx < W/2 ?  26 : -26;
    const sy = cy < H/2 ?  26 : -26;
    ctx.beginPath();
    ctx.moveTo(cx+sx, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy+sy);
    ctx.stroke();
  });
  ctx.restore();

  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter      = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

// ── Drift animation quaternions (allocated once per computer) ─────────────────
function makeDriftAnimator(group) {
  const qY = new THREE.Quaternion();
  const qX = new THREE.Quaternion();
  const qZ = new THREE.Quaternion();
  const vY = new THREE.Vector3(0, 1, 0);
  const vX = new THREE.Vector3(1, 0, 0);
  const vZ = new THREE.Vector3(0, 0, 1);

  return (t) => {
    const d = group.userData;
    // Vertical bob — larger amplitude than flat panels
    group.position.y = d.baseY + Math.sin(t * d.floatSpeed + d.floatPhase) * d.floatAmp;
    // Base orientation (faces origin)
    group.quaternion.copy(d.baseQuat);
    // Slow yaw drift — computer slowly spins in zero-G
    qY.setFromAxisAngle(vY, Math.sin(t * 0.09 + d.floatPhase) * 0.08);
    group.quaternion.multiply(qY);
    // Pitch nod
    qX.setFromAxisAngle(vX, Math.sin(t * d.floatSpeed * 0.72 + d.floatPhase) * 0.055);
    group.quaternion.multiply(qX);
    // Roll tilt
    qZ.setFromAxisAngle(vZ, Math.sin(t * d.floatSpeed * 0.51 + d.floatPhase + 1.5) * 0.04);
    group.quaternion.multiply(qZ);
  };
}

// ── Public builder ────────────────────────────────────────────────────────────
export function buildComputer(proj) {
  ensureLights();

  const glowHex = proj.glowColor || '#00ff41';
  const gc      = new THREE.Color(glowHex);
  const group   = new THREE.Group();

  const mBeige   = mat(COL_BEIGE,    18);
  const mBeigeL  = mat(COL_BEIGE_LT, 22);
  const mBeigeD  = mat(COL_BEIGE_DK, 12);
  const mVent    = mat(COL_VENT,      6);
  const mKeyBody = mat(COL_KEY_BODY,  12);
  const mKeyCap  = mat(COL_KEY_CAP,   8);
  const mLedGrn  = new THREE.MeshBasicMaterial({ color: gc });
  const mLedAmb  = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
  const mScreen  = new THREE.MeshBasicMaterial({
    map: makeScreenTex(glowHex), transparent: true,
  });

  // ══════════════════════════════════════════════════════════
  //  LAYOUT  (all positions in group-local space)
  //  +Z  = toward viewer (front)
  //  Y center ≈ midpoint of whole setup
  //
  //  Monitor center:    y =  0.38,  z =  0
  //  Desktop PC center: y = -0.88,  z =  0
  //  Keyboard center:   y = -1.28,  z =  1.14
  // ══════════════════════════════════════════════════════════

  // ──────────────────────────────────────────────────────────
  //  A.  CRT MONITOR
  // ──────────────────────────────────────────────────────────
  // All dimensions in Three.js world units. Monitor proportions based on a typical
  // 14-inch 4:3 CRT of the early 90s — wide bezel, deep body.
  const MON_W = 2.05, MON_H = 1.74, MON_D = 1.55;
  const MON_Y = 0.38, MON_Z = 0; // centred on Z, raised on Y to sit above the tower

  // A1 — main housing (the big boxy body)
  const monBody = mesh(box(MON_W, MON_H, MON_D), mBeige);
  monBody.position.set(0, MON_Y, MON_Z);
  group.add(monBody);

  // A2 — front bezel face plate (slightly raised from body front)
  const BEZEL_W = MON_W - 0.04, BEZEL_H = MON_H - 0.04;
  const monFace = mesh(box(BEZEL_W, BEZEL_H, 0.10), mBeigeL);
  monFace.position.set(0, MON_Y, MON_Z + MON_D/2 + 0.03);
  group.add(monFace);

  // A3 — screen depression (dark recess behind glass)
  // Screen is 70% of monitor width and 66% of height — leaves a thick bezel on all sides.
  const SCR_W = MON_W * 0.70, SCR_H = MON_H * 0.66;
  const SCR_Y = MON_Y + 0.07;
  const monRecess = mesh(box(SCR_W + 0.14, SCR_H + 0.14, 0.12), mVent);
  monRecess.position.set(0, SCR_Y, MON_Z + MON_D/2 + 0.08);
  group.add(monRecess);

  // A4 — actual CRT screen (0.01 ahead of recess front face to avoid z-fighting)
  const screen = mesh(new THREE.PlaneGeometry(SCR_W, SCR_H), mScreen);
  screen.position.set(0, SCR_Y, MON_Z + MON_D/2 + 0.155);
  group.add(screen);

  // A5 — screen glow halo
  const glowPlane = mesh(
    new THREE.PlaneGeometry(SCR_W + 0.08, SCR_H + 0.08),
    new THREE.MeshBasicMaterial({
      color: gc, transparent: true, opacity: 0.05,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
  );
  glowPlane.position.set(0, SCR_Y, MON_Z + MON_D/2 + 0.11);
  group.add(glowPlane);

  // A6 — ventilation slots on monitor TOP: 5 horizontal bars, each 55% of monitor width.
  // Offset 0.2 to the right so they don't cover the centre (mimics real CRT vent placement).
  // Spaced 0.065 apart; depth 0.07 so they face the top-front edge.
  for (let i = 0; i < 5; i++) {
    const slot = mesh(box(MON_W * 0.55, 0.025, 0.07), mVent);
    slot.position.set(0.2, MON_Y + MON_H/2 - 0.06 - i * 0.065, MON_Z + MON_D/2 - 0.18);
    group.add(slot);
  }

  // A7 — ventilation on monitor RIGHT SIDE: 7 vertical bars, height 42% of monitor height.
  // Spaced 0.055 along Z (depth), staggered slightly above centre (MON_Y + 0.1).
  for (let i = 0; i < 7; i++) {
    const slot = mesh(box(0.025, MON_H * 0.42, 0.06), mVent);
    slot.position.set(MON_W/2 - 0.05, MON_Y + 0.1, MON_Z + MON_D/2 - 0.22 - i * 0.055);
    group.add(slot);
  }

  // A8 — control buttons on lower bezel: 5 small cylinders, radius 0.04, height 0.04.
  // Spaced 0.16 apart (key pitch); range -0.28 to +0.36 across the bottom bezel.
  // rotation.x = PI/2 makes the flat face protrude from the front face.
  for (let i = 0; i < 5; i++) {
    const btn = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.04, 8), mBeigeD);
    btn.rotation.x = Math.PI / 2;
    btn.position.set(-0.28 + i * 0.16, MON_Y - MON_H/2 + 0.10, MON_Z + MON_D/2 + 0.09);
    group.add(btn);
  }

  // A9 — brand name plate: narrow panel on the right side of the lower bezel (offset +0.52 X).
  const brand = mesh(box(0.55, 0.07, 0.02), mBeigeD);
  brand.position.set(0.52, MON_Y - MON_H/2 + 0.09, MON_Z + MON_D/2 + 0.09);
  group.add(brand);

  // A10 — swivel neck: tapered cylinder (0.18→0.22 radius, 0.16 tall) connecting to base.
  // 12 sides is sufficient at this small scale — reads as round.
  const swNeck = mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.16, 12), mBeigeD);
  swNeck.position.set(0, MON_Y - MON_H/2 - 0.08, MON_Z);
  group.add(swNeck);

  // A11 — swivel base disc: wide flat cylinder (0.52→0.56 radius, 0.07 tall).
  // Radius 0.52–0.56 ≈ 26% of monitor width — proportionate to a 14" CRT base.
  const swBase = mesh(new THREE.CylinderGeometry(0.52, 0.56, 0.07, 16), mBeigeD);
  swBase.position.set(0, MON_Y - MON_H/2 - 0.19, MON_Z);
  group.add(swBase);

  // A12 — monitor point light (screen illuminates body)
  const screenLight = new THREE.PointLight(gc, 1.4, 6.0);
  screenLight.position.set(0, SCR_Y, MON_Z + MON_D/2 + 0.6);
  group.add(screenLight);

  // A13 — power indicator LED on monitor bezel (lower left)
  const monLed = mesh(new THREE.SphereGeometry(0.03, 8, 8), mLedGrn);
  monLed.position.set(-MON_W/2 + 0.22, MON_Y - MON_H/2 + 0.10, MON_Z + MON_D/2 + 0.10);
  group.add(monLed);

  // ──────────────────────────────────────────────────────────
  //  B.  DESKTOP TOWER (horizontal orientation, under monitor)
  // ──────────────────────────────────────────────────────────
  // PC_W = 2.60 — wide horizontal case (matches real "pizza-box" desktop form factor).
  // PC_H = 0.52 — low profile (≈ 25% of monitor height) — sits under the monitor.
  // PC_Y = -0.88 — centred below the monitor (MON_Y=0.38, gap ≈ 0.12 world units).
  const PC_W = 2.60, PC_H = 0.52, PC_D = 1.50;
  const PC_Y = -0.88, PC_Z = 0;

  // B1 — main case
  const pcBody = mesh(box(PC_W, PC_H, PC_D), mBeige);
  pcBody.position.set(0, PC_Y, PC_Z);
  group.add(pcBody);

  // B2 — front panel face (slightly lighter)
  const pcFront = mesh(box(PC_W - 0.02, PC_H - 0.02, 0.06), mBeigeL);
  pcFront.position.set(0, PC_Y, PC_Z + PC_D/2 + 0.02);
  group.add(pcFront);

  // B3 — 5.25" drive bay: CD-ROM slot, upper-left of the front panel.
  // Width 0.72 ≈ standard 5.25" form factor scaled to world units.
  // Dark recess box (mVent) behind a beige tray line that simulates the disc slot.
  const cdBay = mesh(box(0.72, 0.11, 0.06), mVent);
  cdBay.position.set(-0.72, PC_Y + 0.11, PC_Z + PC_D/2 + 0.06);
  group.add(cdBay);

  // CD-ROM tray line — thin bright strip across the bay opening, representing the eject tray.
  const cdTray = mesh(box(0.60, 0.016, 0.04), mBeigeD);
  cdTray.position.set(-0.72, PC_Y + 0.09, PC_Z + PC_D/2 + 0.09);
  group.add(cdTray);

  // B4 — 3.5" floppy drive bay: slightly narrower than the CD bay (0.55 vs 0.72).
  // Positioned directly below the CD-ROM (PC_Y - 0.04).
  const fdBay = mesh(box(0.55, 0.095, 0.06), mVent);
  fdBay.position.set(-0.72, PC_Y - 0.04, PC_Z + PC_D/2 + 0.06);
  group.add(fdBay);

  // Floppy slot opening — narrow horizontal slit at centre of bay.
  const fdSlot = mesh(box(0.36, 0.018, 0.04), mVent);
  fdSlot.position.set(-0.78, PC_Y - 0.04, PC_Z + PC_D/2 + 0.09);
  group.add(fdSlot);

  // B5 — blank bay covers: 2 empty 5.25" bays below the floppy (empty drive slots).
  // Spaced 0.14 apart — same pitch as the CD and floppy bays above.
  for (let i = 0; i < 2; i++) {
    const bay = mesh(box(0.72, 0.11, 0.04), mBeigeD);
    bay.position.set(-0.72, PC_Y - 0.16 - i * 0.14, PC_Z + PC_D/2 + 0.05);
    group.add(bay);
  }

  // B6 — power button: large round cylinder (r=0.07) on the right half of the front panel.
  // rotation.x = PI/2 orients it face-forward. Protrudes 0.07 from the front face.
  const pwrBtn = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 12), mBeigeD);
  pwrBtn.rotation.x = Math.PI / 2;
  pwrBtn.position.set(0.92, PC_Y + 0.10, PC_Z + PC_D/2 + 0.07);
  group.add(pwrBtn);

  // B7 — reset button: smaller cylinder (r=0.035) directly below power button.
  // 8-sided — rounder than a square but cheaper than 12 at this tiny size.
  const rstBtn = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.04, 8), mBeigeD);
  rstBtn.rotation.x = Math.PI / 2;
  rstBtn.position.set(0.92, PC_Y - 0.04, PC_Z + PC_D/2 + 0.06);
  group.add(rstBtn);

  // B8 — HDD access LED: amber rectangle (0x ffaa00) — lights when hard drive is active.
  const hddLed = mesh(new THREE.BoxGeometry(0.06, 0.022, 0.02), mLedAmb);
  hddLed.position.set(0.78, PC_Y + 0.10, PC_Z + PC_D/2 + 0.07);
  group.add(hddLed);

  // B9 — power LED: small green sphere to the left of the HDD LED.
  const pcLed = mesh(new THREE.SphereGeometry(0.025, 8, 8), mLedGrn);
  pcLed.position.set(0.68, PC_Y + 0.10, PC_Z + PC_D/2 + 0.08);
  group.add(pcLed);

  // B10 — right-side ventilation: 9 thin vertical bars, each 55% of case height.
  // Spaced 0.08 along Z (depth axis), covering the middle third of the side panel.
  for (let i = 0; i < 9; i++) {
    const vs = mesh(box(0.025, PC_H * 0.55, 0.055), mVent);
    vs.position.set(PC_W/2 - 0.055, PC_Y, PC_Z + 0.3 - i * 0.08);
    group.add(vs);
  }

  // B11 — power supply vent on rear: large dark panel on back-left.
  // Width 0.55, height 70% of case — represents the PSU exhaust grid.
  const psuVent = mesh(box(0.55, PC_H * 0.7, 0.04), mVent);
  psuVent.position.set(-0.88, PC_Y, PC_Z - PC_D/2 - 0.01);
  group.add(psuVent);

  // ──────────────────────────────────────────────────────────
  //  C.  KEYBOARD
  // ──────────────────────────────────────────────────────────
  // KB_W = 2.20 — wide enough to feel proportionate under the 2.60-wide tower.
  // KB_H_F = 0.09 (front height) / KB_H_B = 0.15 (back height) — tapered wedge profile.
  // KB_D = 0.76 — standard depth for an 101-key layout.
  // KB_Y = -1.28 — below the tower (PC_Y=-0.88, tower bottom=-1.14, small gap below).
  // KB_Z = 1.14 — pushed toward the viewer (in front of the tower case).
  const KB_W = 2.20, KB_H_F = 0.09, KB_H_B = 0.15, KB_D = 0.76;
  const KB_Y = -1.28, KB_Z = 1.14;

  // C1 — keyboard body (wedge: two boxes to approximate taper).
  // Base layer is uniform KB_H_F tall; the back riser adds extra height at the rear.
  const kbBody = mesh(box(KB_W, KB_H_F, KB_D), mKeyBody);
  kbBody.position.set(0, KB_Y, KB_Z);
  group.add(kbBody);

  // Back riser: 0.06 tall, 0.18 deep — sits at the back edge of the base, creating the wedge.
  // Centre at KB_Z - KB_D/2 + 0.09 = back edge of base, shifted forward by half of riser depth.
  const kbRiser = mesh(box(KB_W, 0.06, 0.18), mKeyBody);
  kbRiser.position.set(0, KB_Y + KB_H_F/2 + 0.03, KB_Z - KB_D/2 + 0.09);
  group.add(kbRiser);

  // C2 — key surface: slightly recessed top panel (0.02 thick, 0.01 above base top).
  // Inset 0.05 on each side so the body edge remains visible as a rim.
  const kbTop = mesh(box(KB_W - 0.1, 0.02, KB_D - 0.08), mKeyCap);
  kbTop.position.set(0, KB_Y + KB_H_F/2 + 0.01, KB_Z);
  group.add(kbTop);

  // C3 — function key row: slightly raised strip at the back of the keyed area.
  // Width and Z position match the key surface; height 0.04 = slightly proud of kbTop.
  const fnRow = mesh(box(KB_W - 0.1, 0.04, 0.09), mBeigeD);
  fnRow.position.set(0, KB_Y + KB_H_F/2 + 0.02, KB_Z - KB_D/2 + 0.10);
  group.add(fnRow);

  // C4 — key caps: 3 rows × 11 columns of individual keys (decorative only).
  // Key size: 0.14 wide × 0.11 deep; pitch: 0.20 wide / 0.18 deep (0.06 / 0.07 gap).
  // Starts at X = -1.0 so 11 keys span -1.0 to +1.0 (total width 2.0 ≈ KB_W - 0.20).
  const kGeo = new THREE.BoxGeometry(0.14, 0.03, 0.11);
  const kMat = mat(COL_BEIGE_LT, 14);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 11; col++) {
      const key = mesh(kGeo, kMat);
      key.position.set(
        -1.0 + col * 0.2,
        KB_Y + KB_H_F/2 + 0.03,
        KB_Z - 0.05 + row * 0.18
      );
      group.add(key);
    }
  }

  // C5 — spacebar: wide bar (0.82 × 0.10) centred slightly right (offset +0.08 X) of keyboard centre.
  // Positioned at the front edge of the key area (KB_Z + 0.28).
  const space = mesh(box(0.82, 0.03, 0.10), mat(COL_BEIGE_LT, 14));
  space.position.set(0.08, KB_Y + KB_H_F/2 + 0.03, KB_Z + 0.28);
  group.add(space);

  // ──────────────────────────────────────────────────────────
  //  userData — must match shape expected by frames.js / camera.js
  // ──────────────────────────────────────────────────────────
  screen.userData.frameGroup   = group;
  group.userData.panelMesh     = screen;        // used by camera fade-in/out
  group.userData.glowMesh      = glowPlane;     // used by hover glow effect
  group.userData.screenMesh    = screen;
  group.userData.isComputer    = true;
  group.userData.proj          = proj;
  group.userData.customAnimate = makeDriftAnimator(group);
  // baseQuat / baseY / floatPhase / floatAmp / floatSpeed set by frames.js

  return { group, clickTarget: screen };
}
