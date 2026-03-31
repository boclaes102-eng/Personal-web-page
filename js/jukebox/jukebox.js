/**
 * jukebox.js
 * Builds a classic Wurlitzer-style 1950s "Bubbler" jukebox floating in space.
 * Exports buildJukebox(proj) → { group, clickTarget }
 *
 * userData contract (same shape as other 3D objects):
 *   group.userData.isJukebox      = true
 *   group.userData.panelMesh      = signMesh   (camera fade target)
 *   group.userData.glowMesh       = glowPlane  (hover glow)
 *   group.userData.screenMesh     = clickPlane (camera look-at target)
 *   group.userData.recordMesh     = recordDisc (spun by customAnimate)
 *   group.userData.customAnimate  = driftFn(t)
 */

import * as THREE from 'three';

// ── Dimensions ────────────────────────────────────────────────────────────────
const W   = 1.20;   // width
const H   = 2.20;   // total height
const D   = 0.56;   // depth (front-to-back)

// ── Materials ─────────────────────────────────────────────────────────────────
function makeMats(glowColor) {
  return {
    wood:   new THREE.MeshStandardMaterial({ color: 0x3a1206, roughness: 0.80, metalness: 0.05 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xc8c8c8, roughness: 0.18, metalness: 0.92 }),
    gold:   new THREE.MeshStandardMaterial({ color: 0xd4a020, roughness: 0.28, metalness: 0.85 }),
    glass:  new THREE.MeshStandardMaterial({
      color: 0x99ddff, transparent: true, opacity: 0.28,
      roughness: 0.04, metalness: 0.10, side: THREE.DoubleSide,
    }),
    grille: new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.95 }),
    neonA:  new THREE.MeshStandardMaterial({ color: 0xff44bb, emissive: new THREE.Color(0xff44bb), emissiveIntensity: 1.5 }),
    neonB:  new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: new THREE.Color(0x00ffff), emissiveIntensity: 1.5 }),
    neonC:  new THREE.MeshStandardMaterial({ color: 0xffcc00, emissive: new THREE.Color(0xffcc00), emissiveIntensity: 1.2 }),
    record: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.58, metalness: 0.30 }),
    label:  new THREE.MeshStandardMaterial({ color: 0xff3333, roughness: 0.95 }),
    dark:   new THREE.MeshStandardMaterial({ color: 0x060606, roughness: 0.92 }),
    inner:  new THREE.MeshStandardMaterial({ color: 0x0a0416, roughness: 0.95 }),
  };
}

function M(geo, mat) { return new THREE.Mesh(geo, mat); }
function box(w, h, d) { return new THREE.BoxGeometry(w, h, d); }
function cyl(rt, rb, h, s = 12) { return new THREE.CylinderGeometry(rt, rb, h, s); }

// ── Sign canvas (visible through the glass window) ────────────────────────────
function makeSignTexture(glowColor) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 320;
  const c = cv.getContext('2d');

  c.fillStyle = '#04000e';
  c.fillRect(0, 0, 256, 320);

  // Scanlines
  for (let y = 0; y < 320; y += 3) {
    c.fillStyle = 'rgba(0,0,0,0.14)';
    c.fillRect(0, y, 256, 1);
  }

  // Border
  c.strokeStyle = glowColor;
  c.lineWidth = 2;
  c.strokeRect(8, 8, 240, 304);

  c.fillStyle = glowColor;
  c.textAlign = 'center';

  // Music notes header
  c.font = 'bold 28px serif';
  c.shadowBlur = 14; c.shadowColor = glowColor;
  c.fillText('♪  ♫  ♪', 128, 52);
  c.shadowBlur = 0;

  // Title
  c.font = 'bold 20px "Courier New",monospace';
  c.fillText('SPACE', 128, 86);
  c.fillText('JUKEBOX', 128, 112);

  // Divider
  c.strokeStyle = glowColor;
  c.globalAlpha = 0.40;
  c.lineWidth = 1;
  c.beginPath(); c.moveTo(28, 124); c.lineTo(228, 124); c.stroke();
  c.globalAlpha = 1;

  // Theme list
  c.font = '11px "Courier New",monospace';
  c.fillStyle = glowColor;
  c.globalAlpha = 0.75;
  const themes = ['01  DEEP SPACE', '02  SYNTHWAVE', '03  JAZZ LOUNGE', '04  CYBERPUNK'];
  themes.forEach((t, i) => c.fillText(t, 128, 152 + i * 20));
  c.globalAlpha = 1;

  // Bottom label
  c.font = 'bold 11px "Courier New",monospace';
  c.fillStyle = glowColor;
  c.shadowBlur = 8; c.shadowColor = glowColor;
  c.fillText('MUSIC THEME SELECTOR', 128, 278);
  c.shadowBlur = 0;
  c.font = '9px "Courier New",monospace';
  c.fillStyle = 'rgba(255,255,255,0.35)';
  c.fillText('CLICK TO EXPLORE', 128, 298);

  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

// ── Drift + record-spin animator ──────────────────────────────────────────────
function _makeDriftAnimator(group) {
  const _tiltQ = new THREE.Quaternion();
  const _tiltAx = new THREE.Vector3(1, 0, 0);
  const _spinQ  = new THREE.Quaternion();
  const _spinAx = new THREE.Vector3(0, 0, 1);

  return function animate(t) {
    const { baseQuat, baseY, floatPhase: ph, floatAmp: amp, floatSpeed: spd, recordMesh } = group.userData;
    group.position.y = baseY + Math.sin(t * spd + ph) * amp;
    group.quaternion.copy(baseQuat);
    _tiltQ.setFromAxisAngle(_tiltAx, Math.sin(t * spd * 0.65 + ph) * 0.013);
    group.quaternion.multiply(_tiltQ);
    if (recordMesh) {
      _spinQ.setFromAxisAngle(_spinAx, t * 1.4);
      recordMesh.quaternion.copy(_spinQ);
    }
  };
}

// ── Builder ───────────────────────────────────────────────────────────────────
export function buildJukebox(proj) {
  const group = new THREE.Group();
  const mat   = makeMats(proj.glowColor);
  const FT    = 0.038;  // chrome frame strip thickness

  // ── Base platform ──────────────────────────────────────────────────────────
  const base = M(box(W + 0.10, 0.10, D + 0.10), mat.chrome);
  base.position.y = -H / 2 + 0.05;
  group.add(base);

  // Four small feet
  [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([sx, sz]) => {
    const foot = M(cyl(0.04, 0.05, 0.08, 8), mat.chrome);
    foot.position.set(sx * (W / 2 - 0.13), -H / 2 - 0.03, sz * (D / 2 - 0.09));
    group.add(foot);
  });

  // ── Lower cabinet — speaker grille area ────────────────────────────────────
  const loH = 0.70;
  const loY = -H / 2 + 0.10 + loH / 2;
  const loCab = M(box(W, loH, D), mat.wood);
  loCab.position.set(0, loY, 0);
  group.add(loCab);

  // Speaker grille slits (6 horizontal dark bars on the front face)
  for (let r = 0; r < 6; r++) {
    const slit = M(box(W * 0.72, 0.020, 0.014), mat.grille);
    slit.position.set(0, loY - loH / 2 + 0.09 + r * 0.096, D / 2 + 0.001);
    group.add(slit);
  }

  // Chrome trim at top of lower section
  const loTrim = M(box(W + 0.02, 0.030, D + 0.02), mat.chrome);
  loTrim.position.y = loY + loH / 2 + 0.015;
  group.add(loTrim);

  // ── Middle section — button panel + record window ──────────────────────────
  const midH = 0.64;
  const midY = loY + loH / 2 + midH / 2;
  const midCab = M(box(W, midH, D), mat.wood);
  midCab.position.set(0, midY, 0);
  group.add(midCab);

  // Dark button panel inset on the lower half of the middle section
  const btnPanelH = midH * 0.46;
  const btnPanelY = midY - midH / 2 + btnPanelH / 2 + 0.02;
  const btnPanel  = M(box(W * 0.66, btnPanelH, 0.022), mat.dark);
  btnPanel.position.set(0, btnPanelY, D / 2 + 0.004);
  group.add(btnPanel);

  // Eight selector buttons (2 rows × 4 cols)
  const BTN_MATS = [mat.neonA, mat.neonC, mat.neonB, mat.chrome];
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 4; c++) {
      const btn = M(cyl(0.024, 0.024, 0.018, 8), BTN_MATS[c]);
      btn.rotation.x = Math.PI / 2;
      btn.position.set((c - 1.5) * 0.112, btnPanelY + 0.04 - r * 0.12, D / 2 + 0.020);
      group.add(btn);
    }
  }

  // Coin slot
  const coinSlot = M(box(0.09, 0.018, 0.018), mat.dark);
  coinSlot.position.set(W * 0.24, btnPanelY - 0.01, D / 2 + 0.005);
  group.add(coinSlot);
  const coinTrim = M(box(0.11, 0.034, 0.014), mat.chrome);
  coinTrim.position.set(W * 0.24, btnPanelY - 0.01, D / 2 + 0.009);
  group.add(coinTrim);

  // ── Glass window (sign canvas visible through glass) ───────────────────────
  const winH = 0.50;
  const winW = W * 0.68;
  const winY = midY + midH / 2 - winH / 2 - 0.02;

  // Dark backing behind the sign
  const backing = M(box(winW + 0.02, winH + 0.02, 0.038), mat.inner);
  backing.position.set(0, winY, D / 2 - 0.06);
  group.add(backing);

  // Sign canvas mesh
  const signTex  = makeSignTexture(proj.glowColor);
  const signMesh = M(
    box(winW - 0.04, winH - 0.04, 0.010),
    new THREE.MeshBasicMaterial({ map: signTex, transparent: true })
  );
  signMesh.position.set(0, winY, D / 2 - 0.04);
  group.add(signMesh);

  // Spinning record (visible through glass to the left of the sign)
  const recordDisc = M(new THREE.CylinderGeometry(0.14, 0.14, 0.010, 32), mat.record);
  recordDisc.rotation.x = Math.PI / 2;
  recordDisc.position.set(-winW / 2 + 0.18, winY + 0.04, D / 2 - 0.028);
  group.add(recordDisc);

  const recLabel = M(new THREE.CylinderGeometry(0.050, 0.050, 0.012, 24), mat.label);
  recLabel.rotation.x = Math.PI / 2;
  recLabel.position.set(-winW / 2 + 0.18, winY + 0.04, D / 2 - 0.024);
  group.add(recLabel);

  // Glass pane
  const glassMesh = M(box(winW, winH, 0.014), mat.glass);
  glassMesh.position.set(0, winY, D / 2 + 0.004);
  group.add(glassMesh);

  // Chrome window frame strips
  [
    [winW + FT * 2, FT, 0.032,  0,              winY + winH / 2 + FT / 2, D / 2 + 0.008],
    [winW + FT * 2, FT, 0.032,  0,              winY - winH / 2 - FT / 2, D / 2 + 0.008],
    [FT, winH,          0.032, -winW / 2 - FT / 2, winY,                  D / 2 + 0.008],
    [FT, winH,          0.032,  winW / 2 + FT / 2, winY,                  D / 2 + 0.008],
  ].forEach(([w, h, d, x, y, z]) => {
    const f = M(box(w, h, d), mat.chrome);
    f.position.set(x, y, z);
    group.add(f);
  });

  // ── Upper section ──────────────────────────────────────────────────────────
  const upH = 0.36;
  const upY = winY + winH / 2 + FT + upH / 2;
  const upCab = M(box(W, upH, D), mat.wood);
  upCab.position.set(0, upY, 0);
  group.add(upCab);

  const upTrim = M(box(W + 0.02, 0.028, D + 0.02), mat.chrome);
  upTrim.position.y = upY - upH / 2 - 0.014;
  group.add(upTrim);

  // ── Marquee — glowing title panel at the very top of the upper section ─────
  const marqH = 0.155;
  const marqY = upY + upH / 2 - marqH / 2 - 0.008;
  const marqCv = document.createElement('canvas');
  marqCv.width = 512; marqCv.height = 128;
  const mc = marqCv.getContext('2d');
  mc.fillStyle = '#000008';
  mc.fillRect(0, 0, 512, 128);
  mc.fillStyle = proj.glowColor;
  mc.font = 'bold 50px serif';
  mc.textAlign = 'center'; mc.textBaseline = 'middle';
  mc.shadowBlur = 22; mc.shadowColor = proj.glowColor;
  mc.fillText('♫  JUKEBOX  ♫', 256, 64);
  const marqTex = new THREE.CanvasTexture(marqCv);
  marqTex.minFilter = THREE.LinearFilter;
  const marqMesh = M(box(W * 0.82, marqH, 0.022),
    new THREE.MeshBasicMaterial({ map: marqTex }));
  marqMesh.position.set(0, marqY, D / 2 + 0.001);
  group.add(marqMesh);
  const marqFrame = M(box(W * 0.84 + 0.04, marqH + 0.04, 0.018), mat.chrome);
  marqFrame.position.set(0, marqY, D / 2 - 0.002);
  group.add(marqFrame);

  // ── Arch dome ─────────────────────────────────────────────────────────────
  const archH = 0.22;
  const archY = upY + upH / 2 + archH / 2;
  const archMesh = M(new THREE.CylinderGeometry(W * 0.38, W * 0.50, archH, 18, 1, false), mat.wood);
  archMesh.position.y = archY;
  group.add(archMesh);

  const archCap = M(cyl(0.09, W * 0.38, 0.055, 16), mat.chrome);
  archCap.position.y = archY + archH / 2 + 0.027;
  group.add(archCap);

  const finial = M(cyl(0.020, 0.065, 0.110, 8), mat.gold);
  finial.position.y = archY + archH / 2 + 0.082 + 0.055;
  group.add(finial);
  const finialBall = M(new THREE.SphereGeometry(0.038, 8, 8), mat.gold);
  finialBall.position.y = archY + archH / 2 + 0.082 + 0.115 + 0.038;
  group.add(finialBall);

  // ── Side pillars with neon tubes ───────────────────────────────────────────
  const pilH = H * 0.66;
  const pilY = -H / 2 + 0.10 + pilH / 2;
  const NEON = [mat.neonA, mat.neonB, mat.neonC];

  [-1, 1].forEach((side, si) => {
    const px = side * (W / 2 + 0.040);

    // Chrome outer pillar
    const pil = M(cyl(0.052, 0.058, pilH, 8), mat.chrome);
    pil.position.set(px, pilY, 0);
    group.add(pil);

    // Neon inner tube
    const tube = M(cyl(0.022, 0.022, pilH * 0.90, 8), NEON[si % 2]);
    tube.position.set(px, pilY, 0);
    group.add(tube);

    // Two decorative neon rings per pillar
    [0.18, -0.08].forEach((yOff, ri) => {
      const ring = M(new THREE.TorusGeometry(0.052, 0.011, 6, 16), NEON[(si + ri + 1) % 3]);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(px, pilY + pilH * yOff, 0);
      group.add(ring);
    });
  });

  // ── Side fins ─────────────────────────────────────────────────────────────
  [-1, 1].forEach(side => {
    const fx = side * (W / 2 + 0.026);
    const fin = M(box(0.048, 0.30, D * 0.52), mat.wood);
    fin.position.set(fx, upY, 0);
    group.add(fin);
    const finStrip = M(box(0.018, 0.24, 0.013), mat.chrome);
    finStrip.position.set(fx + side * 0.014, upY, D * 0.22);
    group.add(finStrip);
  });

  // ── Interior warm point light (shines through glass) ──────────────────────
  const innerLight = new THREE.PointLight(new THREE.Color(proj.glowColor), 0.9, 1.4);
  innerLight.position.set(0, winY, D / 2 - 0.10);
  group.add(innerLight);

  // ── Glow plane (hover / active glow, sized to glass window) ───────────────
  const glowPlane = M(
    new THREE.PlaneGeometry(winW - 0.06, winH - 0.06),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(proj.glowColor),
      transparent: true, opacity: 0.08,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
  );
  glowPlane.position.set(0, winY, D / 2 + 0.026);
  group.add(glowPlane);

  // ── Invisible click plane (raycaster target) ───────────────────────────────
  const clickPlane = M(
    new THREE.PlaneGeometry(W, H),
    new THREE.MeshBasicMaterial({ visible: false, side: THREE.FrontSide })
  );
  clickPlane.position.z = D / 2 + 0.055;
  clickPlane.userData.frameGroup = group;
  group.add(clickPlane);

  // ── userData wiring ────────────────────────────────────────────────────────
  group.userData.isJukebox      = true;
  group.userData.panelMesh      = signMesh;
  group.userData.glowMesh       = glowPlane;
  group.userData.screenMesh     = clickPlane;
  group.userData.recordMesh     = recordDisc;
  group.userData.customAnimate  = _makeDriftAnimator(group);

  return { group, clickTarget: clickPlane };
}
