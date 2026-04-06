/**
 * television.js
 * Builds a retro 1960s-70s portable CRT television in Three.js.
 * Returns { group, clickTarget } — same contract as computer.js.
 *
 * Screen face (+Z local) points toward the origin because
 * frames.js calls group.lookAt(0, 0, 0) after positioning.
 */

import * as THREE from 'three';
import { scene, ensureLights } from '../core/renderer.js';

// ── Dimensions (all in Three.js world units) ──────────────────────────────────
const TV_W = 2.0, TV_H = 1.75, TV_D = 1.45; // outer body — proportions of a typical 1960s portable

// Screen is 4:3, inset into the upper-centre of the front face.
const SCR_W = 1.28, SCR_H = 0.96;
const SCR_Y = 0.16;  // offset above group centre to leave room for knobs below
const SCR_Z = TV_D / 2 + 0.01; // just in front of the body's front face

// ── Video texture (plays videoplayback.mp4 on the TV screen) ─────────────────
let _videoEl  = null;
let _videoTex = null;

function _initVideo() {
  if (_videoTex) return _videoTex;

  _videoEl             = document.createElement('video');
  _videoEl.src         = 'news.mp4';
  _videoEl.loop        = true;
  _videoEl.muted       = true;    // muted = autoplay allowed without gesture
  _videoEl.playsInline = true;
  _videoEl.style.display = 'none';
  document.body.appendChild(_videoEl);

  _videoTex               = new THREE.VideoTexture(_videoEl);
  _videoTex.minFilter     = THREE.LinearFilter;
  _videoTex.generateMipmaps = false;

  // Play immediately (muted)
  _videoEl.play().catch(() => {
    const retry = () => { _videoEl.play().catch(() => {}); };
    window.addEventListener('pointerdown', retry, { once: true });
  });

  return _videoTex;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function _mat(color, shin = 18) { return new THREE.MeshPhongMaterial({ color, shininess: shin }); }
function _mesh(geo, mat)        { return new THREE.Mesh(geo, mat); }
function _box(w, h, d)          { return new THREE.BoxGeometry(w, h, d); }

// ── Drift animator (multi-axis, per-instance closure) ─────────────────────────
function _makeDriftAnimator(group) {
  const qY = new THREE.Quaternion(), vY = new THREE.Vector3(0, 1, 0);
  const qX = new THREE.Quaternion(), vX = new THREE.Vector3(1, 0, 0);
  const qZ = new THREE.Quaternion(), vZ = new THREE.Vector3(0, 0, 1);

  return (t) => {
    const d = group.userData;
    group.position.y = d.baseY + Math.sin(t * d.floatSpeed + d.floatPhase) * d.floatAmp;
    group.quaternion.copy(d.baseQuat);
    qY.setFromAxisAngle(vY, Math.sin(t * 0.08  + d.floatPhase)                     * 0.07);
    group.quaternion.multiply(qY);
    qX.setFromAxisAngle(vX, Math.sin(t * d.floatSpeed * 0.70 + d.floatPhase)       * 0.048);
    group.quaternion.multiply(qX);
    qZ.setFromAxisAngle(vZ, Math.sin(t * d.floatSpeed * 0.46 + d.floatPhase + 1.3) * 0.032);
    group.quaternion.multiply(qZ);
    // VideoTexture updates itself automatically each frame — no manual redraw needed
  };
}

// ── Public builder ────────────────────────────────────────────────────────────
export function buildTelevision(proj) {
  const videoTex = _initVideo();
  ensureLights();

  const gc    = new THREE.Color(proj.glowColor || '#88aaff');
  const group = new THREE.Group();

  // ── Materials ──────────────────────────────────────────────────────────────
  const mBody   = _mat(0x282320, 16);   // dark charcoal-brown housing
  const mBodyLt = _mat(0x363028, 20);   // slightly lighter front face
  const mBezel  = _mat(0x141210, 10);   // near-black screen surround
  const mKnob   = _mat(0x3a3530, 14);   // dark control knobs
  const mAnt    = _mat(0x888070, 24);   // silver antenna
  const mVent   = _mat(0x100e0c,  4);   // very dark vent slots

  const mScreen = new THREE.MeshBasicMaterial({ map: videoTex });

  const mGlow = new THREE.MeshBasicMaterial({
    color: gc, transparent: true, opacity: 0.07,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });

  // ══════════════════════════════════════════════════════════
  //  A.  OUTER BODY
  // ══════════════════════════════════════════════════════════

  // A1 — main housing
  group.add(_mesh(_box(TV_W, TV_H, TV_D), mBody));

  // A2 — front face plate (very thin, slightly lighter)
  const front = _mesh(_box(TV_W - 0.02, TV_H - 0.02, 0.06), mBodyLt);
  front.position.z = TV_D / 2 + 0.02;
  group.add(front);

  // A3 — screen bezel / recess
  const bezel = _mesh(_box(SCR_W + 0.18, SCR_H + 0.14, 0.10), mBezel);
  bezel.position.set(0, SCR_Y, TV_D / 2 + 0.02);
  group.add(bezel);

  // A4 — CRT screen (animated static)
  // Must sit in front of the bezel box whose front face is at TV_D/2 + 0.07
  const screenMesh = _mesh(new THREE.PlaneGeometry(SCR_W, SCR_H), mScreen);
  screenMesh.position.set(0, SCR_Y, TV_D / 2 + 0.09);
  group.add(screenMesh);

  // A5 — screen glow halo (fades with zoom)
  const glowPlane = _mesh(new THREE.PlaneGeometry(SCR_W + 0.10, SCR_H + 0.08), mGlow);
  glowPlane.position.set(0, SCR_Y, TV_D / 2 + 0.08);
  glowPlane.raycast = () => {};   // prevent glow from blocking screen clicks
  group.add(glowPlane);

  // A6 — screen point light (phosphor-coloured)
  const scrLight = new THREE.PointLight(gc, 1.0, 5.0);
  scrLight.position.set(0, SCR_Y, SCR_Z + 0.5);
  group.add(scrLight);

  // A7 — top vent slots: 5 thin horizontal bars, each 50% of TV width.
  // Spaced 0.060 apart (gap ≈ 0.038 between 0.022-thick bars) starting just inside the top edge.
  // Positioned on the top-front edge (TV_D/2 - 0.14) so they read as top-face slots when viewed from above.
  for (let i = 0; i < 5; i++) {
    const s = _mesh(_box(TV_W * 0.50, 0.022, 0.06), mVent);
    s.position.set(0, TV_H / 2 - 0.045 - i * 0.060, TV_D / 2 - 0.14);
    group.add(s);
  }

  // A8 — side vent strips: 6 vertical bars on the right side face.
  // Height 38% of TV_H; depth 0.05 gives a shallow slot appearance.
  // Evenly spaced along Z (0.055 apart) centered around SCR_Y height.
  // Only on the right side — the left side has the speaker grille.
  for (let i = 0; i < 6; i++) {
    const s = _mesh(_box(0.022, TV_H * 0.38, 0.05), mVent);
    s.position.set(TV_W / 2 - 0.04, SCR_Y + 0.08, TV_D / 2 - 0.18 - i * 0.055);
    group.add(s);
  }

  // ══════════════════════════════════════════════════════════
  //  B.  SPEAKER GRILLE (horizontal slots, lower-left of front)
  // ══════════════════════════════════════════════════════════
  // GX: left of centre at 34% of half-width — aligned to the left third of the front face.
  // GY: starts below screen centre (SCR_Y - SCR_H*0.40) so the grille spans the lower-left area.
  // 8 slots × 0.028 height × 0.078 pitch = total grille height ≈ 0.55 units.
  // Slot depth 0.035 — shallow recess, just enough to read as a grille at zoom distance.
  const GX = -TV_W * 0.34;
  const GY =  SCR_Y - SCR_H * 0.40;
  for (let i = 0; i < 8; i++) {
    const slot = _mesh(_box(TV_W * 0.21, 0.028, 0.035), mVent);
    slot.position.set(GX, GY + i * 0.078, TV_D / 2 + 0.06);
    group.add(slot);
  }

  // ══════════════════════════════════════════════════════════
  //  C.  CONTROL KNOBS (right of front, below bezel)
  // ══════════════════════════════════════════════════════════
  // KX: 36% of half-width to the right — symmetric to the speaker grille on the left.
  // knobGo: radius 0.092, height 0.062 — matches scale of 1960s channel/volume knobs on a portable set.
  // rotation.x = PI/2 rotates the cylinder so its flat face protrudes from the front face (+Z).
  const KX     = TV_W * 0.36;
  const knobGo = new THREE.CylinderGeometry(0.092, 0.092, 0.062, 16);

  // Channel selector (upper knob) — positioned above screen centre.
  const chK = _mesh(knobGo, mKnob);
  chK.rotation.x = Math.PI / 2;
  chK.position.set(KX, SCR_Y + 0.10, TV_D / 2 + 0.052);
  group.add(chK);
  // Indicator notch: thin silver bar above the knob marks the selected channel position.
  // Sits 0.038 above knob top and 0.038 in front of it.
  const chMark = _mesh(_box(0.011, 0.060, 0.018), mAnt);
  chMark.position.set(KX, SCR_Y + 0.145, TV_D / 2 + 0.090);
  group.add(chMark);

  // Volume knob (lower) — same geometry, placed 0.24 below channel knob.
  const volK = _mesh(knobGo, mKnob);
  volK.rotation.x = Math.PI / 2;
  volK.position.set(KX, SCR_Y - 0.14, TV_D / 2 + 0.052);
  group.add(volK);
  const volMark = _mesh(_box(0.011, 0.060, 0.018), mAnt);
  volMark.position.set(KX, SCR_Y - 0.095, TV_D / 2 + 0.090);
  group.add(volMark);

  // Recessed dark panel behind both knobs — provides visual separation from the main body.
  // Width 19% of TV_W covers both knobs; height 0.32 spans both knobs with some clearance.
  const ctrlPnl = _mesh(_box(TV_W * 0.19, 0.32, 0.018), mBezel);
  ctrlPnl.position.set(KX, SCR_Y - 0.02, TV_D / 2 + 0.048);
  group.add(ctrlPnl);

  // ══════════════════════════════════════════════════════════
  //  D.  RABBIT-EAR ANTENNA
  // ══════════════════════════════════════════════════════════
  // ANT_Y: sits just above the top face (TV_H/2 + 0.035 clearance).
  const ANT_Y = TV_H / 2 + 0.035;
  // Rectangular base that both rods mount into — centred on the TV top.
  const antBase = _mesh(_box(0.30, 0.070, 0.18), mKnob);
  antBase.position.set(0, ANT_Y, 0);
  group.add(antBase);

  // Tapered rod: top radius 0.014, bottom 0.019 — slight taper like a real telescopic antenna.
  // Length 1.40 world units ≈ 70% of TV height, giving a tall, visible silhouette.
  // 8-sided cylinder is sufficient at this scale — looks round from any viewing angle.
  const rodGeo = new THREE.CylinderGeometry(0.014, 0.019, 1.40, 8);

  // Left rod — centre at 0.72 above ANT_Y (half of rod length = 0.70, plus small overlap into base).
  // rotation.z = -PI/10 = -18° — spreads the ears outward for the classic V shape.
  const ant1 = _mesh(rodGeo, mAnt);
  ant1.position.set(-0.11, ANT_Y + 0.72, 0.01);
  ant1.rotation.z = -(Math.PI / 10);
  group.add(ant1);

  // Right rod — mirrored: +18° and offset +X.
  const ant2 = _mesh(rodGeo, mAnt);
  ant2.position.set( 0.11, ANT_Y + 0.72, 0.01);
  ant2.rotation.z =  (Math.PI / 10);
  group.add(ant2);

  // ══════════════════════════════════════════════════════════
  //  E.  CARRY HANDLE (across top)
  // ══════════════════════════════════════════════════════════
  // Two mount posts at ±0.34 X (just inside the body edges) rise from the top face.
  // The horizontal bar sits 0.085 above the top face, spanning 0.60 world units (≈ 30% of TV_W).
  const hp1 = _mesh(_box(0.075, 0.11, 0.065), mKnob); hp1.position.set(-0.34, TV_H / 2 + 0.055, 0); group.add(hp1);
  const hp2 = _mesh(_box(0.075, 0.11, 0.065), mKnob); hp2.position.set( 0.34, TV_H / 2 + 0.055, 0); group.add(hp2);
  const hBar = _mesh(_box(0.60, 0.052, 0.052), mKnob);
  hBar.position.set(0, TV_H / 2 + 0.14, 0);
  group.add(hBar);

  // ══════════════════════════════════════════════════════════
  //  F.  FEET (4 stubby corners)
  // ══════════════════════════════════════════════════════════
  // Slightly darker than the body (0x1c1814) and low shininess (8) — rubber feet.
  // Positioned at ±36% X (near the side edges) × ±30% Z (front and back thirds).
  // Each foot hangs 0.05 below the bottom face so the body appears to stand clear of the ground.
  const footGeo  = new THREE.BoxGeometry(0.14, 0.10, 0.14);
  const footMat  = _mat(0x1c1814, 8);
  [
    [-TV_W * 0.36,  TV_D * 0.30],
    [ TV_W * 0.36,  TV_D * 0.30],
    [-TV_W * 0.36, -TV_D * 0.30],
    [ TV_W * 0.36, -TV_D * 0.30],
  ].forEach(([fx, fz]) => {
    const f = _mesh(footGeo, footMat);
    f.position.set(fx, -TV_H / 2 - 0.05, fz);
    group.add(f);
  });

  // ── userData wiring ────────────────────────────────────────────────────────
  screenMesh.userData.frameGroup = group;
  group.userData.panelMesh       = screenMesh;
  group.userData.glowMesh        = glowPlane;
  group.userData.screenMesh      = screenMesh;
  group.userData.isTelevision    = true;
  group.userData.proj            = proj;
  group.userData.customAnimate   = _makeDriftAnimator(group);
  // baseQuat / baseY / floatPhase / floatAmp / floatSpeed set by frames.js

  return { group, clickTarget: screenMesh };
}
