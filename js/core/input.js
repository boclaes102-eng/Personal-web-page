// @ts-check
/**
 * input.js
 * All pointer, touch, and keyboard event handling.
 * Delegates zoom actions to camera.js.
 *
 * Prop dragging — clicking and holding the BODY of a floating prop
 * (anywhere except its screen/clickTarget) lets you grab and throw it.
 * It drifts away with momentum and the drift animator picks back up
 * from wherever it lands.
 */

import * as THREE from 'three';
import { camera, renderer, composer, hdrTarget, bloomPass } from './renderer.js';
import { shared }                       from './state.js';
import { cam, camDir, updateCameraMatrix,
         zoomIn, zoomToCelestial, zoomOut, PITCH_LIMIT,
         currentCelestialTarget } from './camera.js';
import { frames, clickTargets, resetAllFrames } from '../scene/frames.js';
import { celestialTargets, celestialMeshes } from '../scene/celestials.js';

const { gsap } = window;

const DRAG_THRESH = 8; // px — below this distance a pointerup counts as a click, not a drag

const raycaster = new THREE.Raycaster();
const ndcMouse  = new THREE.Vector2();

const pointerDownOrigin = { x: 0, y: 0 };
let lastDragX  = 0, lastDragY = 0;
let isDragging = false;
let dragDist   = 0;

// Celestial momentum — velocity carries on after pointer release
let _celVelX = 0, _celVelY = 0;
const _CEL_DAMPING = 0.90;

// ── Prop-drag state ───────────────────────────────────────────────────────────
// When the user grabs the body of a floating prop (not its screen), we enter
// prop-drag mode: the prop follows the cursor on a plane facing the camera.
// On release, the last measured velocity is handed to propVel in userData so
// the prop drifts away with momentum (applied + damped in animateFrames).

let _propDragGroup    = null;               // the group being dragged (or null)
const _propDragPlane  = new THREE.Plane();  // world plane at prop depth, normal = camFwd
const _propDragOffset = new THREE.Vector3();// group centre → hit-point offset (stays constant)
const _propDragHit    = new THREE.Vector3();// scratch: ray-plane intersection
const _propDragPrev   = new THREE.Vector3();// position last frame (for velocity)
const _propDragVel    = new THREE.Vector3();// linear velocity sampled during drag
const _propDragAngVel = new THREE.Vector3();// angular velocity accumulator during drag
const _leverArm       = new THREE.Vector3();// scratch: centre → grab point
const _torque         = new THREE.Vector3();// scratch: cross product result
const _MAX_PROP_SPEED = 0.35;              // world-units/frame cap so props can't warp away
const _MAX_ANG_SPEED  = 0.06;             // rad/frame cap (~3.6 rad/s at 60 fps)

// ── Face-camera: smoothly rotate a prop so its screen points at the camera ───
const _tempLookObj = new THREE.Object3D();

function _faceCamera(group) {
  const { gsap } = window;
  // Build the quaternion that makes local +Z aim at the camera (same convention
  // as group.lookAt() used in buildFrames when props are first placed).
  _tempLookObj.position.copy(group.position);
  _tempLookObj.lookAt(camera.position);
  const targetQuat = _tempLookObj.quaternion.clone();

  const startQuat = group.userData.baseQuat.clone();
  const proxy = { t: 0 };
  group.userData.propVel?.set(0, 0, 0);
  group.userData.angVel?.set(0, 0, 0);

  gsap.to(proxy, {
    t: 1, duration: 0.85, ease: 'power2.out',
    onUpdate() {
      group.userData.baseQuat.slerpQuaternions(startQuat, targetQuat, proxy.t);
    },
    onComplete() {
      group.userData.baseQuat.copy(targetQuat);
    },
  });
}

// Walk up the object graph to find which frame group owns a mesh
function _findFrameGroup(obj) {
  let o = obj;
  while (o) {
    if (frames.includes(o)) return o;
    o = o.parent;
  }
  return null;
}

// Begin dragging a prop: build the camera-facing plane and record offset
function _startPropDrag(group, cx, cy) {
  _propDragGroup = group;
  group.userData._isDragging = true;
  group.userData.propVel.set(0, 0, 0);        // cancel existing linear momentum
  if (group.userData.angVel) group.userData.angVel.set(0, 0, 0); // cancel spin
  _propDragAngVel.set(0, 0, 0);

  // Plane at the prop's depth, facing the camera
  const camFwd = new THREE.Vector3();
  camera.getWorldDirection(camFwd);
  _propDragPlane.setFromNormalAndCoplanarPoint(camFwd, group.position);

  // Find the world point under the cursor on that plane
  ndcMouse.set((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndcMouse, camera);
  raycaster.ray.intersectPlane(_propDragPlane, _propDragHit);

  // Offset keeps the prop from snapping its centre to the cursor
  _propDragOffset.subVectors(group.position, _propDragHit);
  _propDragPrev.copy(group.position);
  _propDragVel.set(0, 0, 0);
}

// Move the prop to follow the cursor (called on every pointermove/touchmove)
function _movePropDrag(cx, cy) {
  if (!_propDragGroup) return;
  ndcMouse.set((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndcMouse, camera);
  if (!raycaster.ray.intersectPlane(_propDragPlane, _propDragHit)) return;

  const newPos = _propDragHit.clone().add(_propDragOffset);

  // Track linear velocity (delta per pointer event)
  _propDragVel.subVectors(newPos, _propDragPrev);
  if (_propDragVel.length() > _MAX_PROP_SPEED) {
    _propDragVel.normalize().multiplyScalar(_MAX_PROP_SPEED);
  }
  _propDragPrev.copy(newPos);

  // Angular velocity: torque = (centre→grab) × linear_velocity
  // _propDragOffset = group.position − hit, so centre→grab = −_propDragOffset
  _leverArm.copy(_propDragOffset).negate();
  _torque.crossVectors(_leverArm, _propDragVel).multiplyScalar(3.5);
  _propDragAngVel.lerp(_torque, 0.5); // smooth over consecutive events
  if (_propDragAngVel.length() > _MAX_ANG_SPEED) {
    _propDragAngVel.normalize().multiplyScalar(_MAX_ANG_SPEED);
  }

  _propDragGroup.position.copy(newPos);
  _propDragGroup.userData.baseY = newPos.y; // drift sine wave picks up from here
}

// Release: hand measured linear + angular throw velocity to the prop
function _endPropDrag() {
  if (!_propDragGroup) return;
  _propDragGroup.userData._isDragging = false;
  _propDragGroup.userData.propVel.copy(_propDragVel);
  if (_propDragGroup.userData.angVel) {
    _propDragGroup.userData.angVel.copy(_propDragAngVel);
  }
  _propDragGroup = null;
  document.body.classList.remove('dragging');
}

// ── Hover detection ───────────────────────────────────────────────────────────
function checkHover() {
  updateCameraMatrix();
  raycaster.setFromCamera(ndcMouse, camera);

  const frameHits = raycaster.intersectObjects(clickTargets);
  const hit = frameHits.length ? frameHits[0].object.userData.frameGroup : null;

  if (hit !== shared.hoveredFrame) {
    if (shared.hoveredFrame) {
      const restOpacity = shared.hoveredFrame.userData.glowBaseOpacity ?? 0.07;
      gsap.to(shared.hoveredFrame.userData.glowMesh.material, { opacity: restOpacity, duration: 0.3 });
      gsap.to(shared.hoveredFrame.scale, { x: 1, y: 1, z: 1, duration: 0.3 });
    }
    shared.hoveredFrame = hit;
    if (shared.hoveredFrame) {
      gsap.to(shared.hoveredFrame.userData.glowMesh.material, { opacity: 0.28, duration: 0.3 });
      gsap.to(shared.hoveredFrame.scale, { x: 1.05, y: 1.05, z: 1.05, duration: 0.3 });
    }
  }

  const overCelestial = !hit && raycaster.intersectObjects(celestialMeshes).length > 0;

  // Also show grab cursor when hovering any prop body
  let overPropBody = false;
  if (!hit && !overCelestial && cam.mode === 'freelook') {
    const bodyHits = raycaster.intersectObjects(frames, true);
    overPropBody = bodyHits.length > 0 && !clickTargets.includes(bodyHits[0].object);
  }

  document.body.classList.toggle('hovering', !!(hit || overCelestial || overPropBody));
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

  // ── Pointer (mouse) ─────────────────────────────────────────────────────────
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;

    // Check if we're clicking the body of a prop (not its interactive screen)
    if (cam.mode === 'freelook') {
      updateCameraMatrix();
      ndcMouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      raycaster.setFromCamera(ndcMouse, camera);

      const allHits = raycaster.intersectObjects(frames, true);
      if (allHits.length && !clickTargets.includes(allHits[0].object)) {
        const group = _findFrameGroup(allHits[0].object);
        if (group) {
          _startPropDrag(group, e.clientX, e.clientY);
          dragDist = 0;
          pointerDownOrigin.x = e.clientX; pointerDownOrigin.y = e.clientY;
          document.body.classList.add('dragging');
          return; // suppress camera drag
        }
      }
    }

    isDragging = true;
    dragDist   = 0;
    pointerDownOrigin.x = e.clientX; pointerDownOrigin.y = e.clientY;
    lastDragX = e.clientX;
    lastDragY = e.clientY;
    _celVelX  = 0;
    _celVelY  = 0;
    document.body.classList.add('dragging');
  });

  window.addEventListener('pointermove', e => {
    ndcMouse.set(
      (e.clientX / innerWidth)  * 2 - 1,
     -(e.clientY / innerHeight) * 2 + 1
    );

    // Prop drag takes priority
    if (_propDragGroup) {
      dragDist = Math.hypot(e.clientX - pointerDownOrigin.x, e.clientY - pointerDownOrigin.y);
      _movePropDrag(e.clientX, e.clientY);
      return;
    }

    if (isDragging && cam.mode === 'freelook') {
      dragDist = Math.hypot(e.clientX - pointerDownOrigin.x, e.clientY - pointerDownOrigin.y);
      cam.yaw  -= (e.clientX - lastDragX) * 0.004;
      cam.pitch = THREE.MathUtils.clamp(
        cam.pitch + (e.clientY - lastDragY) * 0.004,
        -PITCH_LIMIT, PITCH_LIMIT
      );
      lastDragX = e.clientX;
      lastDragY = e.clientY;
    } else if (isDragging && cam.mode === 'zoomed' && currentCelestialTarget) {
      const dx = e.clientX - lastDragX;
      const dy = e.clientY - lastDragY;
      _celVelX = dx * 0.005;
      _celVelY = dy * 0.005;
      currentCelestialTarget.mesh.rotation.y += _celVelX;
      currentCelestialTarget.mesh.rotation.x += _celVelY;
      lastDragX = e.clientX;
      lastDragY = e.clientY;
    } else if (cam.mode === 'freelook' && !isDragging) {
      checkHover();
    }
  }, { passive: true });

  window.addEventListener('pointerup', e => {
    if (e.button !== 0) return;

    // Release prop drag
    if (_propDragGroup) {
      if (dragDist < DRAG_THRESH) {
        // Tap on the body (no real movement) — spin to face camera
        _faceCamera(_propDragGroup);
        _propDragGroup.userData._isDragging = false;
        _propDragGroup.userData.propVel.set(0, 0, 0);
        if (_propDragGroup.userData.angVel) _propDragGroup.userData.angVel.set(0, 0, 0);
        _propDragGroup = null;
        document.body.classList.remove('dragging');
      } else {
        // Real throw — hand velocity to the prop
        _endPropDrag();
      }
      return;
    }

    const wasDrag = isDragging;
    isDragging = false;
    document.body.classList.remove('dragging');
    if (wasDrag && dragDist < DRAG_THRESH) handleClick();
  });

  // ── Touch ───────────────────────────────────────────────────────────────────
  let lastTX = 0, lastTY = 0, touchDist = 0;
  let _touchPropDrag = false; // true when a touch is driving a prop drag

  canvas.addEventListener('touchstart', e => {
    const t = e.touches[0];
    lastTX = t.clientX; lastTY = t.clientY; touchDist = 0;
    ndcMouse.set((t.clientX / innerWidth) * 2 - 1, -(t.clientY / innerHeight) * 2 + 1);

    _celVelX = 0; _celVelY = 0;

    // Check for prop body hit on touch
    if (cam.mode === 'freelook') {
      updateCameraMatrix();
      raycaster.setFromCamera(ndcMouse, camera);
      const allHits = raycaster.intersectObjects(frames, true);
      if (allHits.length && !clickTargets.includes(allHits[0].object)) {
        const group = _findFrameGroup(allHits[0].object);
        if (group) {
          _startPropDrag(group, t.clientX, t.clientY);
          _touchPropDrag = true;
          return;
        }
      }
    }
    _touchPropDrag = false;
  }, { passive: true });

  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    const t = e.touches[0];
    const dx = t.clientX - lastTX, dy = t.clientY - lastTY;
    touchDist += Math.hypot(dx, dy);
    ndcMouse.set((t.clientX / innerWidth) * 2 - 1, -(t.clientY / innerHeight) * 2 + 1);

    if (_touchPropDrag && _propDragGroup) {
      _movePropDrag(t.clientX, t.clientY);
    } else if (cam.mode === 'freelook') {
      cam.yaw   -= dx * 0.005;
      cam.pitch  = THREE.MathUtils.clamp(cam.pitch + dy * 0.005, -PITCH_LIMIT, PITCH_LIMIT);
    } else if (cam.mode === 'zoomed' && currentCelestialTarget) {
      _celVelX = dx * 0.005;
      _celVelY = dy * 0.005;
      currentCelestialTarget.mesh.rotation.y += _celVelX;
      currentCelestialTarget.mesh.rotation.x += _celVelY;
    }
    lastTX = t.clientX; lastTY = t.clientY;
  }, { passive: false });

  canvas.addEventListener('touchend', () => {
    if (_touchPropDrag) {
      if (touchDist < 12) {
        // Tap on the body — spin to face camera
        if (_propDragGroup) {
          _faceCamera(_propDragGroup);
          _propDragGroup.userData._isDragging = false;
          _propDragGroup.userData.propVel.set(0, 0, 0);
          if (_propDragGroup.userData.angVel) _propDragGroup.userData.angVel.set(0, 0, 0);
          _propDragGroup = null;
          document.body.classList.remove('dragging');
        }
      } else {
        _endPropDrag();
      }
      _touchPropDrag = false;
      return;
    }
    if (touchDist < 12) handleClick();
  });

  // ── Keyboard ─────────────────────────────────────────────────────────────────
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && cam.mode === 'zoomed') zoomOut();
  });

  // Update hint text for touch devices
  const hintEl = document.querySelector('.hint');
  if (hintEl && ('ontouchstart' in window || navigator.maxTouchPoints > 0)) {
    hintEl.textContent = 'SWIPE TO LOOK  ·  TAP A PROJECT';
  }

  // Reset button — returns all props to their spawn positions
  document.getElementById('btn-reset')?.addEventListener('click', resetAllFrames);

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

// Called every animation frame from main.js — applies inertia after drag release.
export function applyCelestialMomentum() {
  if (isDragging || !currentCelestialTarget) return;
  if (Math.abs(_celVelX) < 0.00005 && Math.abs(_celVelY) < 0.00005) return;
  currentCelestialTarget.mesh.rotation.y += _celVelX;
  currentCelestialTarget.mesh.rotation.x += _celVelY;
  _celVelX *= _CEL_DAMPING;
  _celVelY *= _CEL_DAMPING;
}
