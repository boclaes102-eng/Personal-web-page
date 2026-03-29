/**
 * frames.js
 * Project frame panels — texture generation, geometry, and scene placement.
 * Call buildFrames() once. The animate loop in main.js handles the float wobble.
 *
 * Exports:
 *   buildFrames()   — add all frames to the scene
 *   frames          — [THREE.Group]  full frame groups (for zoom fade)
 *   clickTargets    — [THREE.Mesh]   panel meshes for raycaster
 *   animateFrames(t) — float/wobble each frame (call every tick when not zoomed)
 */

import * as THREE from 'three';
import { scene }  from '../core/renderer.js';
import { PROJECTS } from '../projects.js';
import { buildComputer }    from '../pc/computer.js';
import { buildTelevision } from '../tv/television.js';

const FRAME_W = 3.2;
const FRAME_H = 2.4;

// Project positions: [azimuth_deg, elevation_deg, radius]
const FRAME_POLAR = [
  [  0,   5,  14],
  [ 62,  -6,  13],
  [128,   8,  15],
  [195,  -5,  13],
  [258,   7,  14],
  [318,  -4,  12],
];

export const frames       = [];
export const clickTargets = [];

// ── Helpers ───────────────────────────────────────────────────────────────────
function polarToWorld(az_deg, el_deg, r) {
  const az = THREE.MathUtils.degToRad(az_deg);
  const el = THREE.MathUtils.degToRad(el_deg);
  return new THREE.Vector3(
     r * Math.cos(el) * Math.sin(az),
     r * Math.sin(el),
    -r * Math.cos(el) * Math.cos(az)
  );
}

function makeFrameTexture(proj) {
  const W = 1024, H = 768;
  const cv  = document.createElement('canvas');
  cv.width  = W; cv.height = H;
  const ctx = cv.getContext('2d');

  // Background
  ctx.fillStyle = '#05080f';
  ctx.fillRect(0, 0, W, H);
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, proj.bgColorTop    + 'cc');
  bg.addColorStop(1, proj.bgColorBottom + 'aa');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Top accent bar
  ctx.fillStyle = proj.glowColor;
  ctx.fillRect(0, 0, W, 4);

  // Corner brackets (no shadowBlur — kept crisp)
  ctx.shadowBlur  = 0;
  ctx.strokeStyle = proj.glowColor;
  ctx.lineWidth   = 3;
  ctx.globalAlpha = 0.55;
  [[30,30],[W-30,30],[30,H-30],[W-30,H-30]].forEach(([cx,cy]) => {
    const sx = cx < W/2 ? 44 : -44;
    const sy = cy < H/2 ? 44 : -44;
    ctx.beginPath();
    ctx.moveTo(cx+sx, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy+sy);
    ctx.stroke();
  });
  ctx.globalAlpha = 1.0;

  // Title
  ctx.shadowBlur   = 0;
  ctx.fillStyle    = '#ffffff';
  ctx.font         = 'bold 76px "Courier New",monospace';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(proj.title, W/2, 290);

  // Divider
  ctx.strokeStyle = proj.glowColor;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth   = 1.5;
  ctx.beginPath(); ctx.moveTo(80, 318); ctx.lineTo(W-80, 318); ctx.stroke();
  ctx.globalAlpha = 1.0;

  // Tech tag pills — white text always readable, auto-shrinks if needed
  const tags    = proj.tech;
  const padX    = 22, tagH = 52, gap = 12;
  let fontSize  = 30;
  ctx.font      = `bold ${fontSize}px "Courier New",monospace`;
  let tagWidths = tags.map(t => ctx.measureText(t).width + padX * 2);
  let totalTagW = tagWidths.reduce((a, b) => a + b, 0) + gap * (tags.length - 1);

  if (totalTagW > W - 60) {
    fontSize    = Math.max(20, Math.floor(fontSize * (W - 60) / totalTagW));
    ctx.font    = `bold ${fontSize}px "Courier New",monospace`;
    tagWidths   = tags.map(t => ctx.measureText(t).width + padX * 2);
    totalTagW   = tagWidths.reduce((a, b) => a + b, 0) + gap * (tags.length - 1);
  }

  let tx = W / 2 - totalTagW / 2;
  const ty = 348;
  tags.forEach((tag, i) => {
    const tw = tagWidths[i];
    ctx.fillStyle   = 'rgba(0,0,0,0.60)';
    ctx.fillRect(tx, ty, tw, tagH);
    ctx.strokeStyle = proj.glowColor;
    ctx.lineWidth   = 1.5;
    ctx.globalAlpha = 0.8;
    ctx.strokeRect(tx + 0.75, ty + 0.75, tw - 1.5, tagH - 1.5);
    ctx.globalAlpha = 1.0;
    ctx.fillStyle   = '#ffffff';
    ctx.textAlign   = 'left';
    ctx.textBaseline = 'middle';
    ctx.font        = `bold ${fontSize}px "Courier New",monospace`;
    ctx.fillText(tag, tx + padX, ty + tagH / 2);
    tx += tw + gap;
  });

  // Explore hint
  ctx.font         = '22px "Courier New",monospace';
  ctx.fillStyle    = 'rgba(255,255,255,0.28)';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('CLICK TO EXPLORE', W/2, H - 30);

  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter      = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

function makeNeonBorder(w, h, color) {
  const hw = w/2 + 0.06, hh = h/2 + 0.06;
  const pts = [[-hw,-hh,0],[hw,-hh,0],[hw,hh,0],[-hw,hh,0],[-hw,-hh,0]]
    .map(p => new THREE.Vector3(...p));
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: new THREE.Color(color) })
  );
}

function makeGlowBg(w, h, color) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w + 0.6, h + 0.6),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      transparent: true, opacity: 0.07,
      blending:    THREE.AdditiveBlending,
      depthWrite:  false, side: THREE.DoubleSide,
    })
  );
  m.position.z = -0.02;
  return m;
}

// Reusable quaternion objects — allocated once to avoid per-frame GC pressure
const _tiltQ    = new THREE.Quaternion();
const _tiltAxis = new THREE.Vector3(1, 0, 0);

// ── Public API ────────────────────────────────────────────────────────────────
export function buildFrames() {
  PROJECTS.forEach((proj, i) => {
    if (i >= FRAME_POLAR.length) return;
    const [az, el, r] = FRAME_POLAR[i];
    const wp = polarToWorld(az, el, r);

    // ── Computer variant ──────────────────────────────────────────────────────
    if (proj.computer) {
      const { group, clickTarget } = buildComputer(proj);
      group.position.copy(wp);
      group.lookAt(0, 0, 0);
      Object.assign(group.userData, {
        baseQuat:   group.quaternion.clone(),
        baseY:      wp.y,
        floatPhase: Math.random() * Math.PI * 2,
        floatAmp:   0.28 + Math.random() * 0.10,  // larger drift than flat panels
        floatSpeed: 0.14 + Math.random() * 0.08,  // slower = weightier feel
      });
      clickTarget.userData.frameGroup = group;
      clickTargets.push(clickTarget);
      scene.add(group);
      frames.push(group);
      return;
    }

    // ── Television variant ────────────────────────────────────────────────────
    if (proj.television) {
      const { group, clickTarget } = buildTelevision(proj);
      group.position.copy(wp);
      group.lookAt(0, 0, 0);
      Object.assign(group.userData, {
        baseQuat:   group.quaternion.clone(),
        baseY:      wp.y,
        floatPhase: Math.random() * Math.PI * 2,
        floatAmp:   0.24 + Math.random() * 0.09,
        floatSpeed: 0.15 + Math.random() * 0.07,
      });
      clickTarget.userData.frameGroup = group;
      clickTargets.push(clickTarget);
      scene.add(group);
      frames.push(group);
      return;
    }

    // ── Flat panel (default) ──────────────────────────────────────────────────
    const group = new THREE.Group();
    group.position.copy(wp);
    group.lookAt(0, 0, 0);
    group.userData = {
      proj,
      baseQuat:   group.quaternion.clone(),
      baseY:      wp.y,
      floatPhase: Math.random() * Math.PI * 2,
      floatAmp:   0.07 + Math.random() * 0.055,
      floatSpeed: 0.32 + Math.random() * 0.22,
      glowMesh:   null,
      panelMesh:  null,
    };

    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(FRAME_W, FRAME_H),
      new THREE.MeshBasicMaterial({ map: makeFrameTexture(proj), side: THREE.DoubleSide })
    );
    panel.userData.frameGroup = group;
    group.userData.panelMesh  = panel;
    group.add(panel);
    clickTargets.push(panel);

    group.add(makeNeonBorder(FRAME_W, FRAME_H, proj.glowColor));

    const glow = makeGlowBg(FRAME_W, FRAME_H, proj.glowColor);
    group.userData.glowMesh = glow;
    group.add(glow);

    scene.add(group);
    frames.push(group);
  });
}

export function animateFrames(t) {
  frames.forEach(f => {
    // Computer has its own multi-axis drift animator
    if (typeof f.userData.customAnimate === 'function') {
      f.userData.customAnimate(t);
      return;
    }
    const d = f.userData;
    f.position.y = d.baseY + Math.sin(t * d.floatSpeed + d.floatPhase) * d.floatAmp;
    f.quaternion.copy(d.baseQuat);
    _tiltQ.setFromAxisAngle(_tiltAxis, Math.sin(t * d.floatSpeed * 0.65 + d.floatPhase) * 0.014);
    f.quaternion.multiply(_tiltQ);
  });
}
