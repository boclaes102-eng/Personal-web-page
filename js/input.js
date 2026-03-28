/**
 * input.js
 * All pointer, touch, and keyboard event handling.
 * Delegates zoom actions to camera.js.
 */

import * as THREE from 'three';
import { camera, renderer, composer, hdrTarget, bloomPass } from './renderer.js';
import { shared }                       from './state.js';
import { cam, camDir, updateCameraMatrix,
         zoomIn, zoomToCelestial, zoomOut, PITCH_LIMIT } from './camera.js';
import { frames, clickTargets }         from './frames.js';
import { celestialTargets, celestialMeshes } from './celestials.js';

const { gsap } = window;

const DRAG_THRESH = 8; // px — below this a pointerup is a click

const raycaster = new THREE.Raycaster();
const ndcMouse  = new THREE.Vector2();

let pointerDownOrigin = { x: 0, y: 0 };
let lastDragX  = 0, lastDragY = 0;
let isDragging = false;
let dragDist   = 0;

// ── Hover detection ───────────────────────────────────────────────────────────
function checkHover() {
  updateCameraMatrix();
  raycaster.setFromCamera(ndcMouse, camera);

  const frameHits = raycaster.intersectObjects(clickTargets);
  const hit = frameHits.length ? frameHits[0].object.userData.frameGroup : null;

  if (hit !== shared.hoveredFrame) {
    if (shared.hoveredFrame) {
      gsap.to(shared.hoveredFrame.userData.glowMesh.material, { opacity: 0.07, duration: 0.3 });
      gsap.to(shared.hoveredFrame.scale, { x: 1, y: 1, z: 1, duration: 0.3 });
    }
    shared.hoveredFrame = hit;
    if (shared.hoveredFrame) {
      gsap.to(shared.hoveredFrame.userData.glowMesh.material, { opacity: 0.28, duration: 0.3 });
      gsap.to(shared.hoveredFrame.scale, { x: 1.05, y: 1.05, z: 1.05, duration: 0.3 });
    }
  }

  const overCelestial = !hit && raycaster.intersectObjects(celestialMeshes).length > 0;
  document.body.classList.toggle('hovering', !!(hit || overCelestial));
}

// ── Click handling ────────────────────────────────────────────────────────────
function handleClick() {
  if (cam.mode !== 'freelook') return;
  updateCameraMatrix();
  raycaster.setFromCamera(ndcMouse, camera);

  const frameHits = raycaster.intersectObjects(clickTargets);
  if (frameHits.length) { zoomIn(frameHits[0].object.userData.frameGroup); return; }

  const celHits = raycaster.intersectObjects(celestialMeshes);
  if (celHits.length) {
    const target = celestialTargets.find(c => c.mesh === celHits[0].object);
    if (target) zoomToCelestial(target);
  }
}

// ── Event listeners ───────────────────────────────────────────────────────────
export function setupInput() {
  const canvas = renderer.domElement;

  // Mouse
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    isDragging = true;
    dragDist   = 0;
    pointerDownOrigin = { x: e.clientX, y: e.clientY };
    lastDragX = e.clientX;
    lastDragY = e.clientY;
    document.body.classList.add('dragging');
  });

  window.addEventListener('pointermove', e => {
    ndcMouse.set(
      (e.clientX / innerWidth)  * 2 - 1,
     -(e.clientY / innerHeight) * 2 + 1
    );
    if (isDragging && cam.mode === 'freelook') {
      dragDist = Math.hypot(e.clientX - pointerDownOrigin.x, e.clientY - pointerDownOrigin.y);
      cam.yaw  -= (e.clientX - lastDragX) * 0.004;
      cam.pitch = THREE.MathUtils.clamp(
        cam.pitch + (e.clientY - lastDragY) * 0.004,
        -PITCH_LIMIT, PITCH_LIMIT
      );
      lastDragX = e.clientX;
      lastDragY = e.clientY;
    } else if (cam.mode === 'freelook' && !isDragging) {
      checkHover();
    }
  });

  window.addEventListener('pointerup', e => {
    if (e.button !== 0) return;
    const wasDrag = isDragging;
    isDragging = false;
    document.body.classList.remove('dragging');
    if (wasDrag && dragDist < DRAG_THRESH) handleClick();
  });

  // Touch
  let lastTX = 0, lastTY = 0, touchDist = 0;
  canvas.addEventListener('touchstart', e => {
    const t = e.touches[0];
    lastTX = t.clientX; lastTY = t.clientY; touchDist = 0;
    ndcMouse.set((t.clientX / innerWidth) * 2 - 1, -(t.clientY / innerHeight) * 2 + 1);
  }, { passive: true });

  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    const t = e.touches[0];
    const dx = t.clientX - lastTX, dy = t.clientY - lastTY;
    touchDist += Math.hypot(dx, dy);
    ndcMouse.set((t.clientX / innerWidth) * 2 - 1, -(t.clientY / innerHeight) * 2 + 1);
    if (cam.mode === 'freelook') {
      cam.yaw   -= dx * 0.005;
      cam.pitch  = THREE.MathUtils.clamp(cam.pitch + dy * 0.005, -PITCH_LIMIT, PITCH_LIMIT);
    }
    lastTX = t.clientX; lastTY = t.clientY;
  }, { passive: false });

  canvas.addEventListener('touchend', () => {
    if (touchDist < 12) handleClick();
  });

  // Keyboard
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && cam.mode === 'zoomed') zoomOut();
  });

  // Overlay / lore close buttons
  document.querySelector('.overlay-close')  .addEventListener('click', zoomOut);
  document.querySelector('.overlay-backdrop').addEventListener('click', zoomOut);
  document.querySelector('.lore-close')      .addEventListener('click', zoomOut);

  // Resize
  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    composer.setSize(innerWidth, innerHeight);
    hdrTarget.setSize(innerWidth, innerHeight);
    bloomPass.resolution.set(innerWidth / 2, innerHeight / 2);
  });
}
