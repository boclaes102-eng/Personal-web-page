// @ts-check
/**
 * main.js
 * Entry point — handles auth gate, then wires all modules and runs the animation loop.
 */

import { camera, composer }   from './core/renderer.js';
import { cam, camDir }        from './core/camera.js';
import { buildEnvironment, updateEnvironment } from './scene/environment.js';
import { buildCelestials, updateCelestials }   from './scene/celestials.js';
import { buildFrames, animateFrames }          from './scene/frames.js';
import { setupInput, applyCelestialMomentum }  from './core/input.js';
import { initAudio, startAmbient, stopAmbient, setInitialTheme, setCustomTrackUrl, resumeAudio, isMusicPaused, isAudioRunning } from './audio/audio-manager.js';
import { parseHashTokens, checkSession, signOut, loadUserTheme, loadAllCustomTrackUrls } from './auth/auth.js';
import { initPresence, destroyPresence } from './presence/presence.js';
import { trackVisit }                   from './analytics/tracker.js';
import { showAuthOverlay }                     from './auth/auth-ui.js';
import { sfx }                                 from './audio/audio-manager.js';
import { initSecurityMonitor }                 from './security-monitor.js';

// ── Animation loop ────────────────────────────────────────────────────────────
let lastT = 0;

function animate(nowMs) {
  requestAnimationFrame(animate);

  const t  = nowMs * 0.001;
  const dt = Math.min(t - lastT, 0.05);
  lastT = t;

  updateEnvironment(t, dt);
  updateCelestials(t, dt);
  applyCelestialMomentum();

  if (cam.mode !== 'zoomed') {
    animateFrames(t, dt);
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
  const loading = document.getElementById('loading');
  // Reset label in case we were showing "CONNECTING..." during session check
  const label = loading.querySelector('.loading-label');
  if (label) label.textContent = 'LOADING ENVIRONMENT';
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
        destroyPresence();
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

  // Log the visit
  trackVisit(user);

  // Start live presence
  const presenceHud = document.getElementById('presence-hud');
  if (presenceHud) presenceHud.style.display = '';
  initPresence(user);

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
  // Load the user's saved music theme before starting ambient so the right
  // theme plays from the first note — no crossfade delay on entry.
  loadUserTheme().then(async theme => {
    // Custom track requires pre-loading the URL so audio can start immediately on login
    if (theme === 'custom') {
      const urls = await loadAllCustomTrackUrls().catch(() => []);
      const firstUrl = urls.find(u => u) ?? null;
      if (firstUrl) {
        setCustomTrackUrl(firstUrl);
      } else {
        theme = 'space'; // no uploads yet, fall back to default
      }
    }
    if (theme) setInitialTheme(theme);
    startAmbient();
    // After startAmbient, check if the AudioContext is still blocked.
    // If so, show the nudge so the user knows to click to enable audio.
    setTimeout(() => {
      if (_nudgeEl && !isMusicPaused() && !isAudioRunning()) {
        _nudgeEl.style.display = 'flex';
      }
    }, 800);
  }).catch(() => startAmbient());

  requestAnimationFrame(animate);
}

// ── Bootstrap: auth check then launch ────────────────────────────────────────
const _nudgeEl = document.getElementById('audio-nudge');

async function bootstrap() {
  // Start security monitoring immediately — scans URL, referrer, and hooks inputs
  initSecurityMonitor();

  // Create AudioContext eagerly — for returning users whose browsers have learned
  // this site plays audio the context may auto-resume with no gesture needed.
  initAudio();

  // On first gesture: retry resuming a suspended context so music starts without
  // requiring a second click (handles new visits or post-reload auto-login).
  function _onFirstGesture() {
    initAudio();
    resumeAudio();
    if (_nudgeEl) _nudgeEl.style.display = 'none';
  }
  window.addEventListener('pointerdown', _onFirstGesture, { once: true });
  window.addEventListener('touchstart',  _onFirstGesture, { once: true, passive: true });
  window.addEventListener('keydown',     _onFirstGesture, { once: true });
  if (_nudgeEl) _nudgeEl.addEventListener('touchstart', _onFirstGesture, { once: true, passive: true });
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

  // 2. Try to restore a saved session (refreshes token if near expiry).
  //    Show a "CONNECTING..." screen only if it takes more than 350 ms —
  //    fast auto-logins skip it entirely, first-timers see it briefly.
  const _loadEl    = document.getElementById('loading');
  const _loadLabel = _loadEl.querySelector('.loading-label');
  let   _connecting = false;
  const _connectTimer = setTimeout(() => {
    _connecting = true;
    if (_loadLabel) _loadLabel.textContent = 'CONNECTING...';
    _loadEl.style.display = 'flex';
  }, 350);

  const user = await checkSession();
  clearTimeout(_connectTimer);

  if (user) {
    startWorld(user);    // startWorld resets label and animates the bar
  } else {
    if (_connecting) _loadEl.style.display = 'none';  // hide before showing auth overlay
    showAuthOverlay(startWorld);
  }
}

bootstrap();
