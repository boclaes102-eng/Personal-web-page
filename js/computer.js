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
import { scene }  from './renderer.js';

// ── Scene lights (added once; ShaderMaterial stars ignore them) ───────────────
let _lightsAdded = false;
function ensureLights() {
  if (_lightsAdded) return;
  _lightsAdded = true;
  const amb = new THREE.AmbientLight(0xffffff, 0.22);
  amb.name = '__compAmbient';
  scene.add(amb);
  const dir = new THREE.DirectionalLight(0xffffff, 0.6);
  dir.position.set(5, 8, 6);
  dir.name = '__compDir';
  scene.add(dir);
  const fill = new THREE.DirectionalLight(0x8888ff, 0.15);
  fill.position.set(-4, -2, -3);
  fill.name = '__compFill';
  scene.add(fill);
}

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
function makeScreenTex(hexGlow) {
  const W = 512, H = 400;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');

  // CRT phosphor background
  ctx.fillStyle = '#050c05';
  ctx.fillRect(0, 0, W, H);

  // Subtle scanlines
  for (let y = 0; y < H; y += 3) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, y, W, 1);
  }

  // Vignette
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

  // Corner brackets
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
  const MON_W = 2.05, MON_H = 1.74, MON_D = 1.55;
  const MON_Y = 0.38, MON_Z = 0;

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
  const SCR_W = MON_W * 0.70, SCR_H = MON_H * 0.66;
  const SCR_Y = MON_Y + 0.07;
  const monRecess = mesh(box(SCR_W + 0.14, SCR_H + 0.14, 0.12), mVent);
  monRecess.position.set(0, SCR_Y, MON_Z + MON_D/2 + 0.08);
  group.add(monRecess);

  // A4 — actual CRT screen
  const screen = mesh(new THREE.PlaneGeometry(SCR_W, SCR_H), mScreen);
  screen.position.set(0, SCR_Y, MON_Z + MON_D/2 + 0.14);
  group.add(screen);

  // A5 — screen glow halo
  const glowPlane = mesh(
    new THREE.PlaneGeometry(SCR_W + 0.45, SCR_H + 0.45),
    new THREE.MeshBasicMaterial({
      color: gc, transparent: true, opacity: 0.05,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
  );
  glowPlane.position.set(0, SCR_Y, MON_Z + MON_D/2 + 0.11);
  group.add(glowPlane);

  // A6 — ventilation slots on monitor TOP (5 thin horizontal bars)
  for (let i = 0; i < 5; i++) {
    const slot = mesh(box(MON_W * 0.55, 0.025, 0.07), mVent);
    slot.position.set(0.2, MON_Y + MON_H/2 - 0.06 - i * 0.065, MON_Z + MON_D/2 - 0.18);
    group.add(slot);
  }

  // A7 — ventilation on monitor RIGHT SIDE (7 thin vertical bars)
  for (let i = 0; i < 7; i++) {
    const slot = mesh(box(0.025, MON_H * 0.42, 0.06), mVent);
    slot.position.set(MON_W/2 - 0.05, MON_Y + 0.1, MON_Z + MON_D/2 - 0.22 - i * 0.055);
    group.add(slot);
  }

  // A8 — control buttons on lower bezel (5 small buttons)
  for (let i = 0; i < 5; i++) {
    const btn = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.04, 8), mBeigeD);
    btn.rotation.x = Math.PI / 2;
    btn.position.set(-0.28 + i * 0.16, MON_Y - MON_H/2 + 0.10, MON_Z + MON_D/2 + 0.09);
    group.add(btn);
  }

  // A9 — brand name plate (slightly inset panel at bottom of bezel)
  const brand = mesh(box(0.55, 0.07, 0.02), mBeigeD);
  brand.position.set(0.52, MON_Y - MON_H/2 + 0.09, MON_Z + MON_D/2 + 0.09);
  group.add(brand);

  // A10 — swivel neck (short cylinder connecting monitor to base disc)
  const swNeck = mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.16, 12), mBeigeD);
  swNeck.position.set(0, MON_Y - MON_H/2 - 0.08, MON_Z);
  group.add(swNeck);

  // A11 — swivel base disc
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

  // B3 — 5.25" drive bay (CD-ROM slot, upper)
  const cdBay = mesh(box(0.72, 0.11, 0.06), mVent);
  cdBay.position.set(-0.72, PC_Y + 0.11, PC_Z + PC_D/2 + 0.06);
  group.add(cdBay);

  // CD-ROM tray line
  const cdTray = mesh(box(0.60, 0.016, 0.04), mBeigeD);
  cdTray.position.set(-0.72, PC_Y + 0.09, PC_Z + PC_D/2 + 0.09);
  group.add(cdTray);

  // B4 — 3.5" floppy drive bay (below CD-ROM)
  const fdBay = mesh(box(0.55, 0.095, 0.06), mVent);
  fdBay.position.set(-0.72, PC_Y - 0.04, PC_Z + PC_D/2 + 0.06);
  group.add(fdBay);

  // Floppy slot opening
  const fdSlot = mesh(box(0.36, 0.018, 0.04), mVent);
  fdSlot.position.set(-0.78, PC_Y - 0.04, PC_Z + PC_D/2 + 0.09);
  group.add(fdSlot);

  // B5 — blank bay covers (2 empty 5.25" bays on left side)
  for (let i = 0; i < 2; i++) {
    const bay = mesh(box(0.72, 0.11, 0.04), mBeigeD);
    bay.position.set(-0.72, PC_Y - 0.16 - i * 0.14, PC_Z + PC_D/2 + 0.05);
    group.add(bay);
  }

  // B6 — power button (large round, right side of front panel)
  const pwrBtn = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 12), mBeigeD);
  pwrBtn.rotation.x = Math.PI / 2;
  pwrBtn.position.set(0.92, PC_Y + 0.10, PC_Z + PC_D/2 + 0.07);
  group.add(pwrBtn);

  // B7 — reset button (smaller, below power)
  const rstBtn = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.04, 8), mBeigeD);
  rstBtn.rotation.x = Math.PI / 2;
  rstBtn.position.set(0.92, PC_Y - 0.04, PC_Z + PC_D/2 + 0.06);
  group.add(rstBtn);

  // B8 — HDD access LED (amber)
  const hddLed = mesh(new THREE.BoxGeometry(0.06, 0.022, 0.02), mLedAmb);
  hddLed.position.set(0.78, PC_Y + 0.10, PC_Z + PC_D/2 + 0.07);
  group.add(hddLed);

  // B9 — power LED (green)
  const pcLed = mesh(new THREE.SphereGeometry(0.025, 8, 8), mLedGrn);
  pcLed.position.set(0.68, PC_Y + 0.10, PC_Z + PC_D/2 + 0.08);
  group.add(pcLed);

  // B10 — ventilation slots on right side of PC case (horizontal bars)
  for (let i = 0; i < 9; i++) {
    const vs = mesh(box(0.025, PC_H * 0.55, 0.055), mVent);
    vs.position.set(PC_W/2 - 0.055, PC_Y, PC_Z + 0.3 - i * 0.08);
    group.add(vs);
  }

  // B11 — power supply vent on back (grid of dots implied by large dark panel)
  const psuVent = mesh(box(0.55, PC_H * 0.7, 0.04), mVent);
  psuVent.position.set(-0.88, PC_Y, PC_Z - PC_D/2 - 0.01);
  group.add(psuVent);

  // ──────────────────────────────────────────────────────────
  //  C.  KEYBOARD
  // ──────────────────────────────────────────────────────────
  const KB_W = 2.20, KB_H_F = 0.09, KB_H_B = 0.15, KB_D = 0.76;
  const KB_Y = -1.28, KB_Z = 1.14;

  // C1 — keyboard body (wedge: two boxes to approximate taper)
  const kbBody = mesh(box(KB_W, KB_H_F, KB_D), mKeyBody);
  kbBody.position.set(0, KB_Y, KB_Z);
  group.add(kbBody);

  // Back riser (thicker at back to create the wedge profile)
  const kbRiser = mesh(box(KB_W, 0.06, 0.18), mKeyBody);
  kbRiser.position.set(0, KB_Y + KB_H_F/2 + 0.03, KB_Z - KB_D/2 + 0.09);
  group.add(kbRiser);

  // C2 — key surface area (slightly recessed top panel)
  const kbTop = mesh(box(KB_W - 0.1, 0.02, KB_D - 0.08), mKeyCap);
  kbTop.position.set(0, KB_Y + KB_H_F/2 + 0.01, KB_Z);
  group.add(kbTop);

  // C3 — function key row (slightly raised strip at top of keyboard)
  const fnRow = mesh(box(KB_W - 0.1, 0.04, 0.09), mBeigeD);
  fnRow.position.set(0, KB_Y + KB_H_F/2 + 0.02, KB_Z - KB_D/2 + 0.10);
  group.add(fnRow);

  // C4 — key rows (3 rows of individual key caps, purely decorative)
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

  // C5 — spacebar
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
