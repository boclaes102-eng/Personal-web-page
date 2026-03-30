/**
 * main.js
 * Entry point — handles auth gate, then wires all modules and runs the animation loop.
 */

import { camera, composer }   from './core/renderer.js';
import { cam, camDir }        from './core/camera.js';
import { buildEnvironment, updateEnvironment } from './scene/environment.js';
import { buildCelestials, updateCelestials }   from './scene/celestials.js';
import { buildFrames, animateFrames }          from './scene/frames.js';
import { setupInput }                          from './core/input.js';
import { initAudio, startAmbient, stopAmbient } from './audio/audio-manager.js';
import { parseHashTokens, checkSession, signOut } from './auth/auth.js';
import { showAuthOverlay }                     from './auth/auth-ui.js';
import { sfx }                                 from './audio/audio-manager.js';

// ── Animation loop ────────────────────────────────────────────────────────────
let lastT = 0;

function animate(nowMs) {
  requestAnimationFrame(animate);

  const t  = nowMs * 0.001;
  const dt = Math.min(t - lastT, 0.05);
  lastT = t;

  updateEnvironment(t, dt);
  updateCelestials(t, dt);

  if (cam.mode !== 'zoomed') {
    animateFrames(t);
  }

  camera.position.copy(cam.pos);
  if (cam.mode === 'freelook') {
    cam.target.copy(camDir());
  }
  camera.lookAt(cam.target);

  composer.render();
}

// ── Start 3D world (called after successful auth) ─────────────────────────────
function startWorld(user) {
  // Show loading screen (was hidden before auth)
  const loading = document.getElementById('loading');
  loading.style.display = 'flex';

  // Show username + sign-out in the 3D world header
  const username = user?.user_metadata?.username ?? user?.email ?? '';
  document.getElementById('header-username').textContent = username
    ? username.toUpperCase()
    : '';

  document.getElementById('header-signout').addEventListener('click', () => {
    sfx('pc-exit');   // CRT power-down sound
    stopAmbient();    // slow 2 s fade-out — curtain takes 0.35 s so music is still fading as it closes

    // CRT-style power-off curtain — squash to a line then expand to black
    const curtain = document.createElement('div');
    curtain.style.cssText =
      'position:fixed;inset:0;background:#000;z-index:5000;transform-origin:center center;pointer-events:all;';
    document.body.appendChild(curtain);

    const { gsap } = window;
    gsap.fromTo(curtain,
      { scaleY: 0.005 },
      { scaleY: 1, duration: 0.35, ease: 'power2.in', onComplete: async () => {
        await signOut();
        // Auth overlay sits above the curtain (z-index 9999) — remove curtain once visible
        showAuthOverlay(newUser => {
          curtain.remove();
          // Reload so the 3D world reinitialises cleanly for the new session
          window.location.reload();
        });
      }}
    );
  });

  // Build scene
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
        loading.classList.add('hidden');
        setTimeout(() => { loading.style.display = 'none'; }, 950);
      }, 250);
    },
  });

  // AudioContext was already created on the first auth-screen gesture.
  // Call startAmbient() directly — no second click required.
  startAmbient();

  requestAnimationFrame(animate);
}

// ── Bootstrap: auth check then launch ────────────────────────────────────────
async function bootstrap() {
  // Init AudioContext on the very first user gesture anywhere on the page.
  // The auth screen (button clicks, key presses) satisfies the browser autoplay policy,
  // so by the time the 3D world loads the context is ready and music can start immediately.
  window.addEventListener('pointerdown', initAudio, { once: true });
  window.addEventListener('keydown',     initAudio, { once: true });
  // 1. Check for Supabase callback tokens in the URL hash
  //    (password recovery or email confirmation links redirect here)
  const hashData = parseHashTokens();

  if (hashData?.type === 'recovery') {
    // User clicked "Reset password" link in their email — show set-new-password form
    showAuthOverlay(startWorld, { mode: 'reset-password', resetToken: hashData.access_token });
    return;
  }

  if (hashData?.type === 'signup') {
    // User clicked the email confirmation link — prompt them to sign in
    showAuthOverlay(startWorld, { mode: 'login', message: 'Email confirmed! You can now sign in.' });
    return;
  }

  // 2. Try to restore a saved session (refreshes token if near expiry)
  const user = await checkSession();

  if (user) {
    startWorld(user);
  } else {
    showAuthOverlay(startWorld);
  }
}

bootstrap();
