/**
 * camera.js
 * Logical camera state (yaw/pitch/pos) and all zoom transitions.
 * The actual THREE.PerspectiveCamera lives in renderer.js.
 */

import * as THREE from 'three';
import { camera }                              from './renderer.js';
import { shared }                              from './state.js';
import { frames }                              from '../scene/frames.js';
import { showOverlay, hideOverlay,
         showLore,    hideLore }               from './overlay.js';
import { showTerminal, hideTerminal }          from '../pc/terminal.js';
import { showTV, hideTV }                      from '../tv/tv-channels.js';

const { gsap } = window;

// Clamp vertical look to ±75.6° — prevents flipping upside down.
const PITCH_LIMIT = Math.PI * 0.42;

// ── Logical camera state ──────────────────────────────────────────────────────
export const cam = {
  yaw: 0, pitch: 0,
  savedYaw: 0, savedPitch: 0,
  pos:    new THREE.Vector3(0, 0, 0),
  target: new THREE.Vector3(0, 0, -1),
  mode:   'freelook', // 'freelook' | 'transitioning' | 'zoomed'
};

export function camDir() {
  return new THREE.Vector3(
     Math.sin(cam.yaw)  * Math.cos(cam.pitch),
     Math.sin(cam.pitch),
    -Math.cos(cam.yaw)  * Math.cos(cam.pitch)
  );
}

export function updateCameraMatrix() {
  camera.position.copy(cam.pos);
  if (cam.mode === 'freelook') cam.target.copy(camDir());
  camera.lookAt(cam.target);
  camera.updateMatrixWorld();
}

// ── Zoom in to a project frame ────────────────────────────────────────────────
export function zoomIn(group) {
  cam.mode = 'transitioning';
  cam.savedYaw   = cam.yaw;
  cam.savedPitch = cam.pitch;
  document.getElementById('header').classList.add('hidden');
  document.body.classList.remove('hovering');
  shared.hoveredFrame = null;

  const isComputer    = !!group.userData.isComputer;
  const isTelevision  = !!group.userData.isTelevision;
  const worldPos      = new THREE.Vector3();
  // For the computer and TV, target the screen mesh so the camera centres
  // on the actual display rather than the group's geometric midpoint.
  if ((isComputer || isTelevision) && group.userData.screenMesh) {
    group.userData.screenMesh.getWorldPosition(worldPos);
  } else {
    group.getWorldPosition(worldPos);
  }
  const fwd       = new THREE.Vector3(0, 0, 1).applyQuaternion(group.quaternion);
  // Zoom distances tuned so each device fills the viewport comfortably.
  // Computer: 2.2 (smaller model), TV: 2.5, flat project panel: 3.6.
  const zoomDist  = isComputer ? 2.2 : isTelevision ? 2.5 : 3.6;
  const camTarget = worldPos.clone().addScaledVector(fwd, zoomDist);

  const tl = gsap.timeline({
    onComplete: () => {
      cam.mode = 'zoomed';
      if (isComputer) {
        _currentZoomType = 'computer';
        showTerminal(() => zoomOut());
      } else if (isTelevision) {
        _currentZoomType = 'television';
        showTV(() => zoomOut());
      } else {
        _currentZoomType = 'project';
        showOverlay(group.userData.proj);
      }
    },
  });
  tl.to(cam.pos,    { x: camTarget.x, y: camTarget.y, z: camTarget.z, duration: 1.5, ease: 'power3.inOut' }, 0);
  tl.to(cam.target, { x: worldPos.x,  y: worldPos.y,  z: worldPos.z,  duration: 1.5, ease: 'power3.inOut' }, 0);

  frames.forEach(f => {
    if (f === group) return;
    f.userData.panelMesh.material.transparent = true;
    gsap.to(f.userData.panelMesh.material, { opacity: 0.07, duration: 0.9 });
    gsap.to(f.userData.glowMesh.material,  { opacity: 0,    duration: 0.7 });
  });
}

// ── Zoom in to a celestial body (easter egg) ──────────────────────────────────
// 'target' shape: { mesh, lore, pos:THREE.Vector3, zoomDist:number, rotSpeed:number }
let _currentZoomType = 'project'; // kept private — only zoom functions need it

export function zoomToCelestial(target) {
  cam.mode = 'transitioning';
  _currentZoomType = 'celestial';
  cam.savedYaw   = cam.yaw;
  cam.savedPitch = cam.pitch;
  document.getElementById('header').classList.add('hidden');
  document.body.classList.remove('hovering');
  shared.hoveredFrame = null;

  const dir    = target.pos.clone().normalize();
  const camPos = target.pos.clone().sub(dir.multiplyScalar(target.zoomDist));

  const tl = gsap.timeline({
    onComplete: () => { cam.mode = 'zoomed'; showLore(target.lore); },
  });
  tl.to(cam.pos,    { x: camPos.x,      y: camPos.y,      z: camPos.z,      duration: 1.8, ease: 'power3.inOut' }, 0);
  tl.to(cam.target, { x: target.pos.x,  y: target.pos.y,  z: target.pos.z,  duration: 1.8, ease: 'power3.inOut' }, 0);

  frames.forEach(f => {
    f.userData.panelMesh.material.transparent = true;
    gsap.to(f.userData.panelMesh.material, { opacity: 0.04, duration: 0.9 });
    gsap.to(f.userData.glowMesh.material,  { opacity: 0,    duration: 0.7 });
  });
}

// ── Zoom back to freelook ─────────────────────────────────────────────────────
export function zoomOut() {
  if (cam.mode !== 'zoomed') return;   // guard: prevent re-entry
  cam.mode = 'transitioning';

  if (_currentZoomType === 'computer') {
    // CRT shutdown plays first, camera flies back after
    hideTerminal(_doZoomOut);
  } else if (_currentZoomType === 'television') {
    hideTV(_doZoomOut);
  } else {
    if (_currentZoomType === 'celestial') hideLore(); else hideOverlay();
    _doZoomOut();
  }
}

function _doZoomOut() {
  const restoredTarget = new THREE.Vector3(
     Math.sin(cam.savedYaw)  * Math.cos(cam.savedPitch),
     Math.sin(cam.savedPitch),
    -Math.cos(cam.savedYaw)  * Math.cos(cam.savedPitch)
  );

  const tl = gsap.timeline({
    onComplete: () => {
      cam.yaw          = cam.savedYaw;
      cam.pitch        = cam.savedPitch;
      cam.mode         = 'freelook';
      _currentZoomType = 'project';
      document.getElementById('header').classList.remove('hidden');
      shared.hoveredFrame = null;
    },
  });
  tl.to(cam.pos,    { x: 0, y: 0, z: 0,                                              duration: 1.5, ease: 'power3.inOut' }, 0);
  tl.to(cam.target, { x: restoredTarget.x, y: restoredTarget.y, z: restoredTarget.z, duration: 1.5, ease: 'power3.inOut' }, 0);

  frames.forEach(f => {
    gsap.to(f.userData.panelMesh.material, { opacity: 1,    duration: 0.9 });
    gsap.to(f.userData.glowMesh.material,  { opacity: 0.07, duration: 0.9 });
    gsap.to(f.scale, { x: 1, y: 1, z: 1,                   duration: 0.3 });
  });
}

export { PITCH_LIMIT };
