/**
 * phonebooth.js
 * Builds a classic red British K6-style phone booth floating in space.
 * Exports buildPhoneBooth(proj) → { group, clickTarget }
 */

import * as THREE from 'three';

// ── Materials ─────────────────────────────────────────────────────────────────

function makeMats() {
  return {
    red:   new THREE.MeshStandardMaterial({ color: 0xcc1111, roughness: 0.45, metalness: 0.08 }),
    darkRed: new THREE.MeshStandardMaterial({ color: 0x880808, roughness: 0.5, metalness: 0.1 }),
    glass: new THREE.MeshStandardMaterial({
      color: 0xaaddff, transparent: true, opacity: 0.22,
      roughness: 0.05, metalness: 0.15, side: THREE.DoubleSide,
    }),
    dark:  new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.85 }),
    phone: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.75 }),
    cream: new THREE.MeshStandardMaterial({ color: 0xfff8e7, roughness: 0.9 }),
  };
}

// ── Canvas texture for the sign panel inside the booth ───────────────────────

function makeSignTexture() {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 320;
  const c = cv.getContext('2d');

  c.fillStyle = '#0d0800';
  c.fillRect(0, 0, 256, 320);

  // Scanlines
  for (let y = 0; y < 320; y += 3) {
    c.fillStyle = 'rgba(0,0,0,0.18)';
    c.fillRect(0, y, 256, 1);
  }

  // Border
  c.strokeStyle = '#ffaa00';
  c.lineWidth = 3;
  c.strokeRect(8, 8, 240, 304);

  // Title
  c.fillStyle = '#ffaa00';
  c.font = 'bold 20px "Courier New",monospace';
  c.textAlign = 'center';
  c.fillText('DIRECTORY', 128, 55);
  c.fillText('ENQUIRIES', 128, 80);

  // Divider
  c.strokeStyle = '#ffaa00';
  c.globalAlpha = 0.4;
  c.lineWidth = 1;
  c.beginPath(); c.moveTo(28, 96); c.lineTo(228, 96); c.stroke();
  c.globalAlpha = 1;

  // Phone ASCII art
  c.font = '13px "Courier New",monospace';
  c.fillStyle = '#cc8800';
  const art = [
    ' .------.',
    '(  ☎    )',
    ' |      |',
    ' |  DP  |',
    " '------'",
  ];
  art.forEach((line, i) => c.fillText(line, 128, 124 + i * 18));

  // Subtitle
  c.fillStyle = '#ffaa00';
  c.font = 'bold 13px "Courier New",monospace';
  c.fillText('PHONE LOOKUP', 128, 232);
  c.font = '11px "Courier New",monospace';
  c.fillStyle = '#cc8800';
  c.fillText('BREACH CHECK', 128, 252);
  c.fillText('SPAM GUARD', 128, 270);

  // Click hint
  c.font = '10px "Courier New",monospace';
  c.fillStyle = 'rgba(255,170,0,0.45)';
  c.fillText('PICK UP TO DIAL', 128, 302);

  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

// ── Drift animator (multi-axis, same pattern as TV/Computer) ─────────────────

function _makeDriftAnimator(group) {
  // userData values (baseQuat, baseY, floatPhase, floatAmp, floatSpeed) are
  // assigned by frames.js AFTER buildPhoneBooth returns, so read them lazily
  // from group.userData inside the animation callback rather than capturing here.
  const _yawQ   = new THREE.Quaternion();
  const _pitchQ = new THREE.Quaternion();
  const _rollQ  = new THREE.Quaternion();
  const _yAxis  = new THREE.Vector3(0, 1, 0);
  const _xAxis  = new THREE.Vector3(1, 0, 0);
  const _zAxis  = new THREE.Vector3(0, 0, 1);

  return function animate(t) {
    const { baseQuat, baseY, floatPhase: phase, floatAmp: amp, floatSpeed: speed } = group.userData;
    group.position.y = baseY + Math.sin(t * speed + phase) * amp;
    _yawQ.setFromAxisAngle(_yAxis,   Math.sin(t * 0.09         + phase) * 0.055);
    _pitchQ.setFromAxisAngle(_xAxis, Math.sin(t * speed * 0.72 + phase) * 0.038);
    _rollQ.setFromAxisAngle(_zAxis,  Math.sin(t * speed * 0.48 + phase + 1.1) * 0.025);
    group.quaternion.copy(baseQuat)
      .multiply(_yawQ).multiply(_pitchQ).multiply(_rollQ);
  };
}

// ── Builder ───────────────────────────────────────────────────────────────────

export function buildPhoneBooth(proj) {
  const group = new THREE.Group();
  const m = makeMats();

  const W = 1.15, H = 2.75, D = 1.15;
  const FT = 0.075; // frame thickness

  // ─ Base step ─
  const base = new THREE.Mesh(new THREE.BoxGeometry(W + 0.18, 0.10, D + 0.18), m.red);
  base.position.y = -(H / 2) + 0.05;
  group.add(base);

  const step = new THREE.Mesh(new THREE.BoxGeometry(W + 0.06, 0.06, D + 0.06), m.darkRed);
  step.position.y = -(H / 2) + 0.13;
  group.add(step);

  // ─ Four corner posts ─
  const postGeo = new THREE.BoxGeometry(FT, H, FT);
  [
    [ W / 2 - FT / 2, 0,  D / 2 - FT / 2],
    [-W / 2 + FT / 2, 0,  D / 2 - FT / 2],
    [ W / 2 - FT / 2, 0, -D / 2 + FT / 2],
    [-W / 2 + FT / 2, 0, -D / 2 + FT / 2],
  ].forEach(([x, y, z]) => {
    const p = new THREE.Mesh(postGeo, m.red);
    p.position.set(x, y, z);
    group.add(p);
  });

  // ─ Horizontal rails (top / upper-mid / lower-mid / bottom) on all 4 sides ─
  const railHeights = [H / 2 - FT / 2, H / 6, -H / 6, -(H / 2 - 0.10 - FT / 2)];
  // Front & back rails (along X)
  railHeights.forEach(ry => {
    [-1, 1].forEach(side => {
      const r = new THREE.Mesh(new THREE.BoxGeometry(W, FT, FT), m.red);
      r.position.set(0, ry, side * (D / 2 - FT / 2));
      group.add(r);
    });
  });
  // Left & right rails (along Z)
  railHeights.forEach(ry => {
    [-1, 1].forEach(side => {
      const r = new THREE.Mesh(new THREE.BoxGeometry(FT, FT, D), m.red);
      r.position.set(side * (W / 2 - FT / 2), ry, 0);
      group.add(r);
    });
  });

  // ─ Glass panes — 3 sections per side (between rails) ─
  const glassW  = W - FT * 2;
  const glassD  = D - FT * 2;
  const sections = [
    // [yCenter, height]
    [(H / 2 - FT / 2 + H / 6) / 2,  (H / 2 - FT / 2 - H / 6) - FT],
    [0,                               H / 3 - FT],
    [(H / 6 + (-(H / 2 - 0.10 - FT / 2))) / 2, (H / 3 - 0.10) - FT],
  ];

  sections.forEach(([cy, gh]) => {
    // Front & back
    [-1, 1].forEach(side => {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(glassW, gh), m.glass.clone());
      g.position.set(0, cy, side * (D / 2 - FT / 2));
      if (side === -1) g.rotation.y = Math.PI;
      group.add(g);
    });
    // Left & right
    [-1, 1].forEach(side => {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(glassD, gh), m.glass.clone());
      g.position.set(side * (W / 2 - FT / 2), cy, 0);
      g.rotation.y = side * Math.PI / 2;
      group.add(g);
    });
  });

  // ─ Crown box ─
  const crownBox = new THREE.Mesh(new THREE.BoxGeometry(W + 0.04, 0.22, D + 0.04), m.red);
  crownBox.position.y = H / 2 - 0.11;
  group.add(crownBox);

  // Crown pyramid (CylinderGeometry with 4 sides = pyramid)
  const crownPyramid = new THREE.Mesh(
    new THREE.CylinderGeometry(0.01, (W + 0.04) / 2 * 1.42, 0.28, 4),
    m.darkRed
  );
  crownPyramid.position.y = H / 2 + 0.14;
  crownPyramid.rotation.y = Math.PI / 4;
  group.add(crownPyramid);

  // Finial
  const finial = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.18, 8), m.red);
  finial.position.y = H / 2 + 0.37;
  group.add(finial);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), m.darkRed);
  ball.position.y = H / 2 + 0.50;
  group.add(ball);

  // ─ Sign panel (inside booth, facing front) ─
  const signMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.65, 0.82),
    new THREE.MeshBasicMaterial({ map: makeSignTexture(), transparent: true })
  );
  signMesh.position.set(0, 0.15, D / 2 - FT - 0.01);
  group.add(signMesh);

  // ─ Phone handset (inside) ─
  const handsetBody = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.42, 0.07), m.phone);
  handsetBody.position.set(-0.28, 0.10, D / 2 - FT - 0.06);
  handsetBody.rotation.z = 0.28;
  group.add(handsetBody);
  // earpiece
  const ear = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.10, 0.10), m.phone);
  ear.position.set(-0.32, 0.30, D / 2 - FT - 0.06);
  ear.rotation.z = 0.28;
  group.add(ear);
  // mouthpiece
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.10, 0.10), m.phone);
  mouth.position.set(-0.24, -0.10, D / 2 - FT - 0.06);
  mouth.rotation.z = 0.28;
  group.add(mouth);
  // hook
  const hook = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.04), m.darkRed);
  hook.position.set(-0.38, 0.08, D / 2 - FT - 0.06);
  group.add(hook);

  // ─ Interior warm light ─
  const light = new THREE.PointLight(0xffaa44, 1.2, 2.5);
  light.position.set(0, 0, 0);
  group.add(light);

  // ─ Click target — large invisible plane covering front face ─
  const clickPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(W, H),
    new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
  );
  clickPlane.position.set(0, 0, D / 2 + 0.01);
  group.add(clickPlane);

  // ─ Glow halo — matches the sign panel size so it doesn't bleed outside
  //   the enquiries box. Positioned just in front of the sign.
  const glowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(0.60, 0.76),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(proj.glowColor),
      transparent: true, opacity: 0.07,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  glowPlane.position.set(0, 0.15, D / 2 + 0.02);
  group.add(glowPlane);

  // ─ userData wiring ─
  // panelMesh must be a visible, fadeable mesh so camera.js can dim the booth
  // when zooming into another frame. signMesh (the canvas display) is the most
  // prominent front-facing element. clickPlane stays invisible for raycasting.
  clickPlane.userData.frameGroup  = group;
  group.userData.panelMesh        = signMesh;
  group.userData.glowMesh         = glowPlane;
  group.userData.screenMesh       = clickPlane;
  group.userData.isPhoneBooth     = true;
  group.userData.proj             = proj;
  group.userData.customAnimate    = _makeDriftAnimator(group);

  return { group, clickTarget: clickPlane };
}
