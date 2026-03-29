/**
 * television.js
 * Builds a retro 1960s-70s portable CRT television in Three.js.
 * Returns { group, clickTarget } — same contract as computer.js.
 *
 * Screen face (+Z local) points toward the origin because
 * frames.js calls group.lookAt(0, 0, 0) after positioning.
 */

import * as THREE from 'three';
import { scene }  from './renderer.js';

// ── Dimensions ────────────────────────────────────────────────────────────────
const TV_W = 2.0, TV_H = 1.75, TV_D = 1.45;

// Screen sits in the upper-centre of the front face
const SCR_W = 1.28, SCR_H = 0.96;
const SCR_Y = 0.16;                   // slightly above body centre
const SCR_Z = TV_D / 2 + 0.01;       // just in front of front face

// ── Animated static texture ───────────────────────────────────────────────────
const ST_W = 192, ST_H = 144;        // small canvas, scaled up by Three.js

let _sCv  = null;   // canvas
let _sCtx = null;   // 2-d context
let _sTex = null;   // CanvasTexture

function _initStatic() {
  if (_sCv) return;
  _sCv            = document.createElement('canvas');
  _sCv.width      = ST_W;
  _sCv.height     = ST_H;
  _sCtx           = _sCv.getContext('2d');
  _drawStatic();
  _sTex               = new THREE.CanvasTexture(_sCv);
  _sTex.minFilter     = THREE.LinearFilter;
  _sTex.generateMipmaps = false;
}

function _drawStatic() {
  const id  = _sCtx.createImageData(ST_W, ST_H);
  const d   = id.data;
  const cx  = ST_W / 2, cy = ST_H / 2;
  const R   = 10;   // corner radius in canvas pixels

  for (let y = 0; y < ST_H; y++) {
    const rowBias = (Math.random() * 90) | 0;
    for (let x = 0; x < ST_W; x++) {
      const idx = (y * ST_W + x) * 4;

      // Rounded-corner mask — corners become fully transparent
      let outside = false;
      if (x < R && y < R)               outside = (x-R)**2+(y-R)**2 > R*R;
      if (x > ST_W-R && y < R)          outside = (x-(ST_W-R))**2+(y-R)**2 > R*R;
      if (x < R && y > ST_H-R)          outside = (x-R)**2+(y-(ST_H-R))**2 > R*R;
      if (x > ST_W-R && y > ST_H-R)     outside = (x-(ST_W-R))**2+(y-(ST_H-R))**2 > R*R;
      if (outside) { d[idx+3] = 0; continue; }

      // Vignette: edges 60 % darker than centre
      const dx = (x - cx) / cx, dy = (y - cy) / cy;
      const vig = Math.max(0, 1 - (dx * dx + dy * dy) * 0.62);

      const v = Math.min(255, ((Math.random() * 200) | 0) + rowBias) * vig;
      d[idx]     = (v * 0.72) | 0;   // R — cool blueish phosphor
      d[idx + 1] = (v * 0.82) | 0;   // G
      d[idx + 2] =  v | 0;           // B — dominant
      d[idx + 3] = 255;
    }
  }
  _sCtx.putImageData(id, 0, 0);
  if (_sTex) _sTex.needsUpdate = true;
}

// ── Scene lights (share with computer.js if already added) ────────────────────
let _lightsOk = false;
function _ensureLights() {
  if (_lightsOk) return;
  if (scene.getObjectByName('__compAmbient')) { _lightsOk = true; return; }
  _lightsOk = true;
  const amb  = new THREE.AmbientLight(0xffffff, 0.22);      amb.name  = '__compAmbient';
  const dir  = new THREE.DirectionalLight(0xffffff, 0.6);   dir.name  = '__compDir';   dir.position.set(5, 8, 6);
  const fill = new THREE.DirectionalLight(0x8888ff, 0.15);  fill.name = '__compFill'; fill.position.set(-4, -2, -3);
  scene.add(amb, dir, fill);
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
  let lastSt = 0;

  return (t) => {
    const d = group.userData;
    group.position.y = d.baseY + Math.sin(t * d.floatSpeed + d.floatPhase) * d.floatAmp;
    group.quaternion.copy(d.baseQuat);
    qY.setFromAxisAngle(vY, Math.sin(t * 0.08  + d.floatPhase)                    * 0.07);
    group.quaternion.multiply(qY);
    qX.setFromAxisAngle(vX, Math.sin(t * d.floatSpeed * 0.70 + d.floatPhase)      * 0.048);
    group.quaternion.multiply(qX);
    qZ.setFromAxisAngle(vZ, Math.sin(t * d.floatSpeed * 0.46 + d.floatPhase + 1.3) * 0.032);
    group.quaternion.multiply(qZ);

    // Flicker static at ~10 fps
    if (t - lastSt > 0.1) { lastSt = t; _drawStatic(); }
  };
}

// ── Public builder ────────────────────────────────────────────────────────────
export function buildTelevision(proj) {
  _initStatic();
  _ensureLights();

  const gc    = new THREE.Color(proj.glowColor || '#88aaff');
  const group = new THREE.Group();

  // ── Materials ──────────────────────────────────────────────────────────────
  const mBody   = _mat(0x282320, 16);   // dark charcoal-brown housing
  const mBodyLt = _mat(0x363028, 20);   // slightly lighter front face
  const mBezel  = _mat(0x141210, 10);   // near-black screen surround
  const mKnob   = _mat(0x3a3530, 14);   // dark control knobs
  const mAnt    = _mat(0x888070, 24);   // silver antenna
  const mVent   = _mat(0x100e0c,  4);   // very dark vent slots

  const mScreen = new THREE.MeshBasicMaterial({ map: _sTex });

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
  const glowPlane = _mesh(new THREE.PlaneGeometry(SCR_W + 0.5, SCR_H + 0.5), mGlow);
  glowPlane.position.set(0, SCR_Y, TV_D / 2 + 0.08);
  group.add(glowPlane);

  // A6 — screen point light (phosphor-coloured)
  const scrLight = new THREE.PointLight(gc, 1.0, 5.0);
  scrLight.position.set(0, SCR_Y, SCR_Z + 0.5);
  group.add(scrLight);

  // A7 — top vent slots (5 thin horizontal bars across top face)
  for (let i = 0; i < 5; i++) {
    const s = _mesh(_box(TV_W * 0.50, 0.022, 0.06), mVent);
    s.position.set(0, TV_H / 2 - 0.045 - i * 0.060, TV_D / 2 - 0.14);
    group.add(s);
  }

  // A8 — side vent strips (right side, vertical bars)
  for (let i = 0; i < 6; i++) {
    const s = _mesh(_box(0.022, TV_H * 0.38, 0.05), mVent);
    s.position.set(TV_W / 2 - 0.04, SCR_Y + 0.08, TV_D / 2 - 0.18 - i * 0.055);
    group.add(s);
  }

  // ══════════════════════════════════════════════════════════
  //  B.  SPEAKER GRILLE (horizontal slots, lower-left of front)
  // ══════════════════════════════════════════════════════════
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
  const KX     = TV_W * 0.36;
  const knobGo = new THREE.CylinderGeometry(0.092, 0.092, 0.062, 16);

  // Channel selector (upper knob)
  const chK = _mesh(knobGo, mKnob);
  chK.rotation.x = Math.PI / 2;
  chK.position.set(KX, SCR_Y + 0.10, TV_D / 2 + 0.052);
  group.add(chK);
  // Indicator notch
  const chMark = _mesh(_box(0.011, 0.060, 0.018), mAnt);
  chMark.position.set(KX, SCR_Y + 0.145, TV_D / 2 + 0.090);
  group.add(chMark);

  // Volume knob (lower)
  const volK = _mesh(knobGo, mKnob);
  volK.rotation.x = Math.PI / 2;
  volK.position.set(KX, SCR_Y - 0.14, TV_D / 2 + 0.052);
  group.add(volK);
  const volMark = _mesh(_box(0.011, 0.060, 0.018), mAnt);
  volMark.position.set(KX, SCR_Y - 0.095, TV_D / 2 + 0.090);
  group.add(volMark);

  // Recessed panel between knobs
  const ctrlPnl = _mesh(_box(TV_W * 0.19, 0.32, 0.018), mBezel);
  ctrlPnl.position.set(KX, SCR_Y - 0.02, TV_D / 2 + 0.048);
  group.add(ctrlPnl);

  // ══════════════════════════════════════════════════════════
  //  D.  RABBIT-EAR ANTENNA
  // ══════════════════════════════════════════════════════════
  const ANT_Y = TV_H / 2 + 0.035;
  const antBase = _mesh(_box(0.30, 0.070, 0.18), mKnob);
  antBase.position.set(0, ANT_Y, 0);
  group.add(antBase);

  const rodGeo = new THREE.CylinderGeometry(0.014, 0.019, 1.40, 8);

  const ant1 = _mesh(rodGeo, mAnt);
  ant1.position.set(-0.11, ANT_Y + 0.72, 0.01);
  ant1.rotation.z = -(Math.PI / 10);
  group.add(ant1);

  const ant2 = _mesh(rodGeo, mAnt);
  ant2.position.set( 0.11, ANT_Y + 0.72, 0.01);
  ant2.rotation.z =  (Math.PI / 10);
  group.add(ant2);

  // ══════════════════════════════════════════════════════════
  //  E.  CARRY HANDLE (across top)
  // ══════════════════════════════════════════════════════════
  const hp1 = _mesh(_box(0.075, 0.11, 0.065), mKnob); hp1.position.set(-0.34, TV_H / 2 + 0.055, 0); group.add(hp1);
  const hp2 = _mesh(_box(0.075, 0.11, 0.065), mKnob); hp2.position.set( 0.34, TV_H / 2 + 0.055, 0); group.add(hp2);
  const hBar = _mesh(_box(0.60, 0.052, 0.052), mKnob);
  hBar.position.set(0, TV_H / 2 + 0.14, 0);
  group.add(hBar);

  // ══════════════════════════════════════════════════════════
  //  F.  FEET (4 stubby corners)
  // ══════════════════════════════════════════════════════════
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
