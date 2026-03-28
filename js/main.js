/**
 * main.js
 * Entry point — wires all modules together and runs the animation loop.
 */

import { camera, composer }   from './renderer.js';
import { cam, camDir }        from './camera.js';
import { buildEnvironment, updateEnvironment } from './environment.js';
import { buildCelestials, updateCelestials }   from './celestials.js';
import { buildFrames, animateFrames }          from './frames.js';
import { setupInput }                          from './input.js';

// ── Animation loop ────────────────────────────────────────────────────────────
let lastT = 0;

function animate(nowMs) {
  requestAnimationFrame(animate);

  const t  = nowMs * 0.001;
  const dt = Math.min(t - lastT, 0.05); // cap spikes on tab-refocus
  lastT = t;

  // Update all scene systems
  updateEnvironment(t, dt);     // star twinkle + comet
  updateCelestials(t, dt);      // planet shader time + rotation

  if (cam.mode !== 'zoomed') {
    animateFrames(t);           // panel float / tilt wobble
  }

  // Sync Three.js camera to logical cam state
  camera.position.copy(cam.pos);
  if (cam.mode === 'freelook') {
    cam.target.copy(camDir());
  }
  camera.lookAt(cam.target);

  composer.render();
}

// ── Init ──────────────────────────────────────────────────────────────────────
function init() {
  buildEnvironment();
  buildCelestials();
  buildFrames();
  setupInput();

  const { gsap } = window;
  const bar = document.querySelector('.loading-bar');
  gsap.to(bar, {
    width: '100%',
    duration: 1.4,
    ease: 'power2.out',
    onComplete: () => {
      setTimeout(() => {
        const loading = document.getElementById('loading');
        loading.classList.add('hidden');
        setTimeout(() => { loading.style.display = 'none'; }, 950);
      }, 250);
    },
  });

  requestAnimationFrame(animate);
}

init();
