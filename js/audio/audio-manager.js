/**
 * audio-manager.js
 * Procedural audio engine — every sound generated via Web Audio API.
 * No external files required. Place this file in js/audio/.
 *
 * Public API:
 *   initAudio()     – create AudioContext (call on first user gesture)
 *   startAmbient()  – begin interstellar-style ambient music
 *   duckMusic()     – lower music when entering PC / TV / Arcade
 *   unduckMusic()   – restore music on exit
 *   sfx(name, opts) – play a named sound effect
 */

// ── Audio graph ───────────────────────────────────────────────────────────────
let ctx          = null;
let masterGain   = null;
let musicGain    = null;
let sfxGain      = null;
let _musicReverb = null;

let _ambientActive  = false;
let _noteTimeout    = null;
let _pendingAmbient = false;  // true when startAmbient() was called before initAudio()

let _themeOscillators = [];    // all running oscillators for the current ambient theme
let _themeTimers      = [];    // all setTimeout / setInterval IDs for rhythmic elements
let _currentTheme     = 'space'; // active theme name
let _arpIdx           = 0;     // synthwave arpeggio note index

// ── Init (call once on first user gesture) ────────────────────────────────────
export function initAudio() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();

  masterGain = ctx.createGain();
  masterGain.gain.value = 0.90;
  masterGain.connect(ctx.destination);

  // Music chain — duckable
  musicGain = ctx.createGain();
  musicGain.gain.value = 0;      // fades in via startAmbient()
  musicGain.connect(masterGain);

  // SFX chain
  sfxGain = ctx.createGain();
  sfxGain.gain.value = 0.85;
  sfxGain.connect(masterGain);

  // Reverb used exclusively by ambient music layers
  _musicReverb = _buildReverb(4.2, 1.5);
  _musicReverb.connect(musicGain);

  // Pause audio when tab is hidden, resume on return
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    document.hidden ? ctx.suspend() : ctx.resume();
  });

  // If startAmbient() was called before the AudioContext existed (auto-login path),
  // start it now that the context is ready.
  if (_pendingAmbient) {
    _pendingAmbient = false;
    startAmbient();
  }
}

// ── Utility: synthetic reverb (random impulse response) ──────────────────────
function _buildReverb(dur, decay) {
  const conv = ctx.createConvolver();
  const sr   = ctx.sampleRate;
  const len  = Math.round(sr * dur);
  const buf  = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++)
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  conv.buffer = buf;
  return conv;
}

// ── Utility: white noise buffer ───────────────────────────────────────────────
function _noise(dur) {
  const sr  = ctx.sampleRate;
  const len = Math.max(1, Math.round(sr * dur));
  const buf = ctx.createBuffer(1, len, sr);
  const d   = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

// ── Ambient music ─────────────────────────────────────────────────────────────
// Three layered voices build an interstellar-style space atmosphere:
//   1. Bass drone — deep sine waves with ultra-slow tremolo
//   2. Chord pad  — detuned triangle oscillators through reverb (A-minor voicing)
//   3. Shimmer    — high-frequency overtones barely audible in the mix
// A recursive timer adds solo melody notes from A-minor pentatonic every 4–12 s.

export function startAmbient() {
  if (!ctx) { _pendingAmbient = true; return; }  // auto-login: defer until first gesture
  if (_ambientActive) return;
  _ambientActive = true;

  // Fade music gain in from silence over 5 s so it builds gradually
  musicGain.gain.setValueAtTime(0, ctx.currentTime);
  musicGain.gain.linearRampToValueAtTime(0.55, ctx.currentTime + 5);

  _startThemeByName(_currentTheme);
}

// Layer 1 — deep bass drone (A1 = 55 Hz and A2 = 110 Hz)
function _layerDrone() {
  [55, 110].forEach((freq, idx) => {
    const osc = _trackOsc(ctx.createOscillator());
    osc.type = 'sine';
    osc.frequency.value = freq;

    // Slow amplitude tremolo — each voice at a different rate so they breathe independently
    const lfo = _trackOsc(ctx.createOscillator());
    lfo.frequency.value = 0.055 + idx * 0.028;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.10;
    lfo.connect(lfoGain);

    const gain = ctx.createGain();
    gain.gain.value = idx === 0 ? 0.38 : 0.20;
    lfoGain.connect(gain.gain);   // LFO modulates gain directly

    osc.connect(gain);
    gain.connect(musicGain);      // dry (no reverb for bass — keeps it tight)

    lfo.start();
    osc.start();
  });
}

// Layer 2 — mid chord pad (A-minor: A3 220, C4 261.6, E4 329.6, G4 392 Hz)
// Two slightly detuned oscillators per chord tone give a lush, wide sound.
function _layerPad() {
  const chord = [220, 261.6, 329.6, 392];
  chord.forEach((baseFreq, i) => {
    [-4, 4].forEach(cents => {
      const osc = _trackOsc(ctx.createOscillator());
      osc.type = 'triangle';
      osc.frequency.value = baseFreq * Math.pow(2, cents / 1200);

      // Micro frequency drift for organic evolution
      const driftLFO = _trackOsc(ctx.createOscillator());
      driftLFO.frequency.value = 0.018 + i * 0.009;
      const driftG = ctx.createGain();
      driftG.gain.value = baseFreq * 0.0018;
      driftLFO.connect(driftG);
      driftG.connect(osc.frequency);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1100;
      filter.Q.value = 0.5;

      const gain = ctx.createGain();
      gain.gain.value = 0.048;

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(_musicReverb);   // through reverb for spaciousness

      driftLFO.start();
      osc.start();
    });
  });
}

// Layer 3 — high shimmer (upper harmonics, very quiet, slowly pulsing)
function _layerShimmer() {
  [880, 1320].forEach((freq, i) => {
    const osc = _trackOsc(ctx.createOscillator());
    osc.type = 'sine';
    osc.frequency.value = freq;

    const lfo = _trackOsc(ctx.createOscillator());
    lfo.frequency.value = 0.042 + i * 0.033;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.022;
    lfo.connect(lfoG);

    const gain = ctx.createGain();
    gain.gain.value = 0.025;
    lfoG.connect(gain.gain);

    osc.connect(gain);
    gain.connect(_musicReverb);

    lfo.start();
    osc.start();
  });
}

// Occasional melody notes — A-minor pentatonic across two octaves
const _PENTA = [
  110, 130.8, 146.8, 165, 196,
  220, 261.6, 293.7, 329.6, 392,
  440, 523.3, 587.3, 659.3,
];

function _scheduleNote() {
  if (!_ambientActive || !ctx) return;
  const freq = _PENTA[Math.floor(Math.random() * _PENTA.length)];
  const vol  = 0.045 + Math.random() * 0.065;
  const dur  = 2.8 + Math.random() * 3.2;
  const now  = ctx.currentTime;

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = freq;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(vol, now + 1.0);      // slow attack
  gain.gain.setValueAtTime(vol, now + dur - 1.5);
  gain.gain.linearRampToValueAtTime(0, now + dur);         // slow release

  osc.connect(gain);
  gain.connect(_musicReverb);
  osc.start(now);
  osc.stop(now + dur + 0.1);

  // Recurse after 4–12 s
  _noteTimeout = _trackTimer(setTimeout(_scheduleNote, (4 + Math.random() * 8) * 1000));
}

// ── Music ducking ─────────────────────────────────────────────────────────────
// Fade music out over ~2 s then silence it (used on sign-out)
export function stopAmbient() {
  if (!ctx || !musicGain) return;
  musicGain.gain.cancelScheduledValues(ctx.currentTime);
  musicGain.gain.setValueAtTime(musicGain.gain.value, ctx.currentTime);
  musicGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 2.0);
  _ambientActive = false;
  _stopTheme();
}

export function duckMusic() {
  if (!ctx) return;
  musicGain.gain.cancelScheduledValues(ctx.currentTime);
  musicGain.gain.setTargetAtTime(0.08, ctx.currentTime, 0.30);
}

export function unduckMusic() {
  if (!ctx) return;
  musicGain.gain.cancelScheduledValues(ctx.currentTime);
  musicGain.gain.setTargetAtTime(0.55, ctx.currentTime, 0.55);
}

// ── Throttle helper (prevents audio spam on rapid repeated events) ────────────
const _lastPlayed = {};
function _canPlay(name, minGapMs) {
  const now = Date.now();
  if (_lastPlayed[name] && now - _lastPlayed[name] < minGapMs) return false;
  _lastPlayed[name] = now;
  return true;
}

// ── Theme-layer tracking helpers ──────────────────────────────────────────────
// Every long-running oscillator created for an ambient theme is registered here
// so it can be stopped cleanly when switching themes.
function _trackOsc(osc)  { _themeOscillators.push(osc); return osc; }
function _trackTimer(id) { _themeTimers.push(id);        return id;  }

function _stopTheme() {
  const t = ctx ? ctx.currentTime + 0.05 : 0;
  _themeOscillators.forEach(o => { try { o.stop(t); } catch {} });
  _themeOscillators = [];
  _themeTimers.forEach(id => { clearTimeout(id); clearInterval(id); });
  _themeTimers = [];
  if (_noteTimeout) { clearTimeout(_noteTimeout); _noteTimeout = null; }
}

// ═════════════════════════════════════════════════════════════════════════════
// SFX DEFINITIONS
// ═════════════════════════════════════════════════════════════════════════════

// ── General navigation ────────────────────────────────────────────────────────
function _zoomIn() {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(120, t);
  osc.frequency.exponentialRampToValueAtTime(440, t + 0.36);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.45, t + 0.07);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.40);
  osc.connect(g); g.connect(sfxGain);
  osc.start(t); osc.stop(t + 0.41);
}

function _zoomOut() {
  if (!_canPlay('zoom-out', 500)) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(380, t);
  osc.frequency.exponentialRampToValueAtTime(90, t + 0.30);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.18, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
  osc.connect(g); g.connect(sfxGain);
  osc.start(t); osc.stop(t + 0.35);
}

// ── PC / Terminal ─────────────────────────────────────────────────────────────
function _pcEnter() {
  const t = ctx.currentTime;
  // Sharp click burst (CRT relay click)
  const src = ctx.createBufferSource();
  src.buffer = _noise(0.04);
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2200; f.Q.value = 4;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.50, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
  src.connect(f); f.connect(g); g.connect(sfxGain); src.start(t);

  // Rising sawtooth hum (CRT power-on sweep)
  const osc = ctx.createOscillator(); osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(38, t + 0.015);
  osc.frequency.exponentialRampToValueAtTime(310, t + 0.40);
  const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 1600;
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0, t + 0.015); g2.gain.linearRampToValueAtTime(0.28, t + 0.18);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.44);
  osc.connect(filt); filt.connect(g2); g2.connect(sfxGain);
  osc.start(t + 0.015); osc.stop(t + 0.44);
}

function _pcType() {
  if (!_canPlay('pc-type', 35)) return;   // max ~28 clicks/s — prevents spam
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = _noise(0.012);
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2800; f.Q.value = 7;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.28, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.016);
  src.connect(f); f.connect(g); g.connect(sfxGain); src.start(t);
}

function _pcEnterKey() {
  const t = ctx.currentTime;
  // Heavier click
  const src = ctx.createBufferSource(); src.buffer = _noise(0.018);
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2100; f.Q.value = 4;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.40, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.022);
  src.connect(f); f.connect(g); g.connect(sfxGain); src.start(t);
  // Confirmation blip
  const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = 880;
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.10, t + 0.005); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.075);
  osc.connect(g2); g2.connect(sfxGain); osc.start(t + 0.005); osc.stop(t + 0.075);
}

function _pcExit() {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator(); osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(320, t); osc.frequency.exponentialRampToValueAtTime(28, t + 0.28);
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
  osc.connect(f); f.connect(g); g.connect(sfxGain);
  osc.start(t); osc.stop(t + 0.32);
}

// ── TV ────────────────────────────────────────────────────────────────────────
function _tvEnter() {
  const t = ctx.currentTime;
  // Low thunk
  const osc = ctx.createOscillator(); osc.type = 'sine';
  osc.frequency.setValueAtTime(135, t); osc.frequency.exponentialRampToValueAtTime(30, t + 0.18);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.50, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.20);
  osc.connect(g); g.connect(sfxGain); osc.start(t); osc.stop(t + 0.22);
  // Static burst
  const src = ctx.createBufferSource(); src.buffer = _noise(0.10);
  const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 900;
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.34, t + 0.02); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
  src.connect(f); f.connect(g2); g2.connect(sfxGain); src.start(t + 0.02);
}

function _tvChannel() {
  const t = ctx.currentTime;
  // Static swipe
  const src = ctx.createBufferSource(); src.buffer = _noise(0.055);
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 4000; f.Q.value = 2;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.30, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.060);
  src.connect(f); f.connect(g); g.connect(sfxGain); src.start(t);
  // Channel blip
  const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = 660;
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.14, t + 0.025); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.090);
  osc.connect(g2); g2.connect(sfxGain); osc.start(t + 0.025); osc.stop(t + 0.090);
}

function _tvExit() {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator(); osc.type = 'sine';
  osc.frequency.setValueAtTime(220, t); osc.frequency.exponentialRampToValueAtTime(22, t + 0.26);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.44, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.30);
  osc.connect(g); g.connect(sfxGain); osc.start(t); osc.stop(t + 0.30);
}

// ── Arcade ────────────────────────────────────────────────────────────────────
function _arcadeEnter() {
  // 8-bit C-major arpeggio (coin-insert energy)
  const t = ctx.currentTime;
  [261.6, 329.6, 392.0, 523.3].forEach((freq, i) => {
    const st = t + i * 0.082;
    const osc = ctx.createOscillator(); osc.type = 'square'; osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, st); g.gain.linearRampToValueAtTime(0.18, st + 0.010);
    g.gain.exponentialRampToValueAtTime(0.001, st + 0.130);
    osc.connect(g); g.connect(sfxGain); osc.start(st); osc.stop(st + 0.130);
  });
}

function _arcadeMenuMove() {
  if (!_canPlay('arcade-menu-move', 80)) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator(); osc.type = 'square'; osc.frequency.value = 440;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.13, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.065);
  osc.connect(g); g.connect(sfxGain); osc.start(t); osc.stop(t + 0.065);
}

function _arcadeMenuSelect() {
  const t = ctx.currentTime;
  [440, 660].forEach((freq, i) => {
    const st = t + i * 0.072;
    const osc = ctx.createOscillator(); osc.type = 'square'; osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.16, st); g.gain.exponentialRampToValueAtTime(0.001, st + 0.100);
    osc.connect(g); g.connect(sfxGain); osc.start(st); osc.stop(st + 0.100);
  });
}

function _arcadeExit() {
  if (!_canPlay('arcade-exit', 500)) return;
  const t = ctx.currentTime;
  [523.3, 392.0, 329.6, 261.6].forEach((freq, i) => {
    const st = t + i * 0.065;
    const osc = ctx.createOscillator(); osc.type = 'square'; osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.14, st); g.gain.exponentialRampToValueAtTime(0.001, st + 0.090);
    osc.connect(g); g.connect(sfxGain); osc.start(st); osc.stop(st + 0.090);
  });
}

// ── Pong ──────────────────────────────────────────────────────────────────────
function _pongPaddle() {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator(); osc.type = 'square'; osc.frequency.value = 220;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.32, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.050);
  osc.connect(g); g.connect(sfxGain); osc.start(t); osc.stop(t + 0.050);
}

function _pongWall() {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator(); osc.type = 'square'; osc.frequency.value = 350;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.22, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.038);
  osc.connect(g); g.connect(sfxGain); osc.start(t); osc.stop(t + 0.040);
}

function _pongScore() {
  const t = ctx.currentTime;
  [330, 440, 660].forEach((freq, i) => {
    const st = t + i * 0.090;
    const osc = ctx.createOscillator(); osc.type = 'square'; osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.22, st); g.gain.exponentialRampToValueAtTime(0.001, st + 0.140);
    osc.connect(g); g.connect(sfxGain); osc.start(st); osc.stop(st + 0.140);
  });
}

// ── Galaga ────────────────────────────────────────────────────────────────────
function _galagaShoot() {
  if (!_canPlay('galaga-shoot', 80)) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator(); osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(1400, t); osc.frequency.exponentialRampToValueAtTime(180, t + 0.105);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.22, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.110);
  osc.connect(g); g.connect(sfxGain); osc.start(t); osc.stop(t + 0.110);
}

function _galagaEnemyDie() {
  const t = ctx.currentTime;
  const src = ctx.createBufferSource(); src.buffer = _noise(0.18);
  const f = ctx.createBiquadFilter(); f.type = 'bandpass';
  f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(80, t + 0.18);
  f.Q.value = 3;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.44, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.200);
  src.connect(f); f.connect(g); g.connect(sfxGain); src.start(t);
}

function _galagaPlayerDie() {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator(); osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(900, t); osc.frequency.exponentialRampToValueAtTime(55, t + 0.65);
  // Vibrato for dramatic effect
  const vib = ctx.createOscillator(); vib.frequency.value = 22;
  const vibG = ctx.createGain(); vibG.gain.value = 90;
  vib.connect(vibG); vibG.connect(osc.frequency);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.38, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.70);
  osc.connect(g); g.connect(sfxGain);
  vib.start(t); osc.start(t); vib.stop(t + 0.70); osc.stop(t + 0.70);
}

function _galagaWaveClear() {
  const t = ctx.currentTime;
  [330, 415, 494, 659, 880].forEach((freq, i) => {
    const st = t + i * 0.075;
    const osc = ctx.createOscillator(); osc.type = 'square'; osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.18, st); g.gain.exponentialRampToValueAtTime(0.001, st + 0.110);
    osc.connect(g); g.connect(sfxGain); osc.start(st); osc.stop(st + 0.110);
  });
}

// ── Breakout ──────────────────────────────────────────────────────────────────
// Brick pitch varies by row: top row (gold) = highest pitch, bottom (green) = lowest.
function _breakoutBrick({ pitch = 440 } = {}) {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator(); osc.type = 'square'; osc.frequency.value = pitch;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.24, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
  osc.connect(g); g.connect(sfxGain); osc.start(t); osc.stop(t + 0.045);
}

function _breakoutWall() {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = 200;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.20, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.038);
  osc.connect(g); g.connect(sfxGain); osc.start(t); osc.stop(t + 0.040);
}

function _breakoutPaddle() {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = 140;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.30, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.055);
  osc.connect(g); g.connect(sfxGain); osc.start(t); osc.stop(t + 0.055);
}

function _breakoutLifeLost() {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator(); osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(660, t); osc.frequency.exponentialRampToValueAtTime(75, t + 0.55);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.32, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.58);
  osc.connect(g); g.connect(sfxGain); osc.start(t); osc.stop(t + 0.58);
}

function _breakoutLevelClear() {
  const t = ctx.currentTime;
  [261.6, 329.6, 392.0, 523.3, 659.3].forEach((freq, i) => {
    const st = t + i * 0.085;
    const osc = ctx.createOscillator(); osc.type = 'square'; osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.20, st); g.gain.exponentialRampToValueAtTime(0.001, st + 0.130);
    osc.connect(g); g.connect(sfxGain); osc.start(st); osc.stop(st + 0.130);
  });
}

// ── Theme dispatcher ─────────────────────────────────────────────────────────
function _startThemeByName(name) {
  if      (name === 'synthwave') { _layerSynthBass(); _layerSynthPad(); _scheduleSynthArp(); }
  else if (name === 'jazz')      { _layerJazzBass();  _layerJazzPad();  _scheduleJazzNote(); }
  else if (name === 'cyberpunk') { _layerCyberSub();  _layerCyberDrone(); _scheduleCyberPulse(); }
  else                           { _layerDrone(); _layerPad(); _layerShimmer(); _scheduleNote(); }
}

// ── Synthwave theme ───────────────────────────────────────────────────────────
// Pulsing filtered bass + detuned sawtooth pad + ascending D-minor arpeggio
function _layerSynthBass() {
  const osc = _trackOsc(ctx.createOscillator());
  osc.type = 'sawtooth';
  osc.frequency.value = 65.4;          // C2 — punchy analog bass root

  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass'; filt.frequency.value = 280; filt.Q.value = 8;  // resonant Moog character

  const lfo = _trackOsc(ctx.createOscillator());
  lfo.frequency.value = 0.45;
  const lfoG = ctx.createGain(); lfoG.gain.value = 200;
  lfo.connect(lfoG); lfoG.connect(filt.frequency);

  const g = ctx.createGain(); g.gain.value = 0.28;
  osc.connect(filt); filt.connect(g); g.connect(musicGain);
  lfo.start(); osc.start();
}

function _layerSynthPad() {
  const chord = [220, 261.6, 329.6, 440];   // A3 C4 E4 A4 — A minor
  chord.forEach(base => {
    [-10, 10].forEach(cents => {
      const osc = _trackOsc(ctx.createOscillator());
      osc.type = 'sawtooth';
      osc.frequency.value = base * Math.pow(2, cents / 1200);

      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass'; filt.frequency.value = 900; filt.Q.value = 1.2;

      const g = ctx.createGain(); g.gain.value = 0.020;
      osc.connect(filt); filt.connect(g); g.connect(_musicReverb);
      osc.start();
    });
  });
}

// D-minor ascending: D4 F4 G4 A4 C5 D5 F5 G5
const _SYNTH_ARP = [293.7, 349.2, 392, 440, 523.3, 587.3, 698.5, 783.9];
function _scheduleSynthArp() {
  if (!_ambientActive || !ctx || _currentTheme !== 'synthwave') return;
  const freq = _SYNTH_ARP[_arpIdx++ % _SYNTH_ARP.length];
  const now  = ctx.currentTime;
  const osc  = ctx.createOscillator();
  osc.type = 'square'; osc.frequency.value = freq;

  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass'; filt.frequency.value = 2400;

  const g = ctx.createGain();
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(0.048, now + 0.008);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

  osc.connect(filt); filt.connect(g); g.connect(musicGain);
  osc.start(now); osc.stop(now + 0.24);

  // ~130 BPM 8th note with slight humanise
  _trackTimer(setTimeout(_scheduleSynthArp, (228 + (Math.random() - 0.5) * 20)));
}

// ── Jazz Lounge theme ─────────────────────────────────────────────────────────
// Slow walking bass + Bb major-7 pad through reverb + sparse melody
const _JAZZ_BASS_NOTES = [116.5, 130.8, 146.8, 155.6, 174.6, 196, 207.7, 233.1, 261.6];

function _layerJazzBass() {
  function _walk() {
    if (!_ambientActive || !ctx || _currentTheme !== 'jazz') return;
    const freq = _JAZZ_BASS_NOTES[Math.floor(Math.random() * _JAZZ_BASS_NOTES.length)];
    const now  = ctx.currentTime;
    const dur  = 0.55 + Math.random() * 0.50;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq * (1 + (Math.random() - 0.5) * 0.006); // slight detune for upright feel

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.30, now + 0.04);
    g.gain.setValueAtTime(0.30, now + dur - 0.12);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);

    osc.connect(g); g.connect(musicGain);
    osc.start(now); osc.stop(now + dur + 0.02);
    _trackTimer(setTimeout(_walk, (dur - 0.06) * 1000));
  }
  _walk();
}

function _layerJazzPad() {
  // Bb major-7 voicing: Bb2 D3 F3 A3 D4 — soft triangles through reverb
  [116.5, 146.8, 174.6, 220, 293.7].forEach((base, i) => {
    const osc = _trackOsc(ctx.createOscillator());
    osc.type = 'triangle'; osc.frequency.value = base;

    const driftLFO = _trackOsc(ctx.createOscillator());
    driftLFO.frequency.value = 0.015 + i * 0.006;
    const dG = ctx.createGain(); dG.gain.value = base * 0.002;
    driftLFO.connect(dG); dG.connect(osc.frequency);

    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 1100;

    const g = ctx.createGain(); g.gain.value = 0.038;
    osc.connect(filt); filt.connect(g); g.connect(_musicReverb);
    driftLFO.start(); osc.start();
  });
}

// Bb major pentatonic melody: Bb D Eb F Ab across two octaves
const _JAZZ_MELODY = [116.5, 146.8, 155.6, 174.6, 207.7, 233.1, 293.7, 311.1, 349.2, 415.3, 466.2];
function _scheduleJazzNote() {
  if (!_ambientActive || !ctx || _currentTheme !== 'jazz') return;
  const freq = _JAZZ_MELODY[Math.floor(Math.random() * _JAZZ_MELODY.length)];
  const vol  = 0.028 + Math.random() * 0.030;
  const dur  = 1.0 + Math.random() * 2.5;
  const now  = ctx.currentTime;

  const osc = ctx.createOscillator();
  osc.type = 'sine'; osc.frequency.value = freq;

  const vib = ctx.createOscillator(); vib.frequency.value = 5.2;
  const vibG = ctx.createGain(); vibG.gain.value = freq * 0.004;
  vib.connect(vibG); vibG.connect(osc.frequency);

  const g = ctx.createGain();
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(vol, now + 0.18);
  g.gain.setValueAtTime(vol, now + dur - 0.45);
  g.gain.linearRampToValueAtTime(0, now + dur);

  osc.connect(g); g.connect(_musicReverb);
  vib.start(now); osc.start(now);
  vib.stop(now + dur + 0.1); osc.stop(now + dur + 0.1);

  _trackTimer(setTimeout(_scheduleJazzNote, (1500 + Math.random() * 4000)));
}

// ── Cyberpunk theme ───────────────────────────────────────────────────────────
// Heavy E1 sub + dark Bm drone + irregular industrial noise stabs
function _layerCyberSub() {
  const osc = _trackOsc(ctx.createOscillator());
  osc.type = 'sine'; osc.frequency.value = 41.2;  // E1

  const lfo = _trackOsc(ctx.createOscillator());
  lfo.frequency.value = 0.06;
  const lfoG = ctx.createGain(); lfoG.gain.value = 12;
  lfo.connect(lfoG); lfoG.connect(osc.frequency);

  const g = ctx.createGain(); g.gain.value = 0.44;
  osc.connect(g); g.connect(musicGain);
  lfo.start(); osc.start();
}

function _layerCyberDrone() {
  // Bm: B2(123.5) D3(146.8) F#3(185) — sawtooth through resonant bandpass
  [123.5, 146.8, 185].forEach((base, i) => {
    const osc = _trackOsc(ctx.createOscillator());
    osc.type = 'sawtooth';
    osc.frequency.value = base * (1 + (Math.random() - 0.5) * 0.012);

    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass'; filt.frequency.value = 500 + i * 200; filt.Q.value = 3.5;

    const g = ctx.createGain(); g.gain.value = 0.050;
    osc.connect(filt); filt.connect(g); g.connect(_musicReverb);
    osc.start();
  });

  // Dissonant high shimmer: tritone B4(493.9) F5(698.5)
  [493.9, 698.5].forEach((freq, i) => {
    const osc = _trackOsc(ctx.createOscillator());
    osc.type = 'sine'; osc.frequency.value = freq;

    const lfo = _trackOsc(ctx.createOscillator());
    lfo.frequency.value = 0.14 + i * 0.07;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.016;
    lfo.connect(lfoG);

    const g = ctx.createGain(); g.gain.value = 0.016;
    lfoG.connect(g.gain);
    osc.connect(g); g.connect(_musicReverb);
    lfo.start(); osc.start();
  });
}

function _scheduleCyberPulse() {
  if (!_ambientActive || !ctx || _currentTheme !== 'cyberpunk') return;
  const now = ctx.currentTime;

  // Industrial noise stab
  const src = ctx.createBufferSource();
  src.buffer = _noise(0.09);
  const filt = ctx.createBiquadFilter();
  filt.type = 'bandpass'; filt.frequency.value = 700 + Math.random() * 800; filt.Q.value = 5;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.14, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
  src.connect(filt); filt.connect(g); g.connect(musicGain); src.start(now);

  // Occasional tritone synth stab
  if (Math.random() > 0.55) {
    const stab = ctx.createOscillator();
    stab.type = 'sawtooth';
    stab.frequency.value = 220 * (Math.random() > 0.5 ? 1.0 : 1.414);  // root or tritone
    const sf = ctx.createBiquadFilter();
    sf.type = 'lowpass'; sf.frequency.value = 1400; sf.Q.value = 2;
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.09, now); sg.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    stab.connect(sf); sf.connect(sg); sg.connect(musicGain);
    stab.start(now); stab.stop(now + 0.15);
  }

  _trackTimer(setTimeout(_scheduleCyberPulse, 480 + Math.random() * 720));
}

// ── Theme public API ──────────────────────────────────────────────────────────

/** Pre-select a theme before startAmbient() is called (e.g. on page load from saved pref). */
export function setInitialTheme(name) {
  if (name) _currentTheme = name;
}

/** Crossfade to a new theme while ambient is playing. */
export function setMusicTheme(name) {
  if (!ctx || !musicGain) return;
  if (name === _currentTheme) return;
  _currentTheme = name;
  _arpIdx = 0;

  musicGain.gain.cancelScheduledValues(ctx.currentTime);
  musicGain.gain.setTargetAtTime(0, ctx.currentTime, 0.22);

  _trackTimer(setTimeout(() => {
    _stopTheme();
    if (!_ambientActive) return;
    musicGain.gain.cancelScheduledValues(ctx.currentTime);
    musicGain.gain.linearRampToValueAtTime(0.55, ctx.currentTime + 2.0);
    _startThemeByName(name);
  }, 700));
}

export function getMusicTheme() { return _currentTheme; }

// ── Phone booth SFX ──────────────────────────────────────────────────────────

// Classic telephone ring — two alternating tones (480 Hz + 620 Hz)
// patterned as: 0.4s on · 0.2s gap · 0.4s on  (one double-ring)
function _phoneRing() {
  const t = ctx.currentTime;
  [0, 0.6].forEach(offset => {
    const dur = 0.4;
    const st  = t + offset;
    [480, 620].forEach(freq => {
      const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = freq;
      const g   = ctx.createGain();
      g.gain.setValueAtTime(0, st);
      g.gain.linearRampToValueAtTime(0.18, st + 0.02);
      g.gain.setValueAtTime(0.18, st + dur - 0.03);
      g.gain.linearRampToValueAtTime(0, st + dur);
      osc.connect(g); g.connect(sfxGain);
      osc.start(st); osc.stop(st + dur);
    });
  });
}

function _phonePickup() {
  const t = ctx.currentTime;
  // Short click + rising tone: handset lifted
  const noise = ctx.createBufferSource();
  noise.buffer = _noise(0.04);
  const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 1800;
  const ng = ctx.createGain(); ng.gain.setValueAtTime(0.25, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
  noise.connect(nf); nf.connect(ng); ng.connect(sfxGain); noise.start(t);
  // Dial tone snippet (350 Hz + 440 Hz) fades in
  [350, 440].forEach(freq => {
    const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t + 0.05);
    g.gain.linearRampToValueAtTime(0.08, t + 0.18);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    osc.connect(g); g.connect(sfxGain); osc.start(t + 0.05); osc.stop(t + 0.45);
  });
}

function _phoneHangup() {
  const t = ctx.currentTime;
  // Mechanical clack: sharp noise burst (handset hitting cradle)
  const clack = ctx.createBufferSource();
  clack.buffer = _noise(0.08);
  const cf = ctx.createBiquadFilter(); cf.type = 'bandpass'; cf.frequency.value = 1200; cf.Q.value = 2;
  const cg = ctx.createGain();
  cg.gain.setValueAtTime(0.55, t); cg.gain.exponentialRampToValueAtTime(0.001, t + 0.065);
  clack.connect(cf); cf.connect(cg); cg.connect(sfxGain); clack.start(t);
  // Heavy thud (low-end body of the slam)
  const thud = ctx.createOscillator(); thud.type = 'sine';
  thud.frequency.setValueAtTime(180, t); thud.frequency.exponentialRampToValueAtTime(35, t + 0.20);
  const tg = ctx.createGain();
  tg.gain.setValueAtTime(0.48, t); tg.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
  thud.connect(tg); tg.connect(sfxGain); thud.start(t); thud.stop(t + 0.24);
  // Brief dial tone that cuts off abruptly (350+440 Hz — classic North American dial tone)
  [350, 440].forEach(freq => {
    const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.07, t + 0.09);
    g.gain.setValueAtTime(0.07, t + 0.20);
    g.gain.linearRampToValueAtTime(0, t + 0.23);
    osc.connect(g); g.connect(sfxGain); osc.start(t + 0.09); osc.stop(t + 0.24);
  });
}

// DTMF-style cell phone keypress tone (randomised dial tone pair for variety)
const _DTMF_PAIRS = [
  [697, 1209], [697, 1336], [697, 1477],
  [770, 1209], [770, 1336], [770, 1477],
  [852, 1209], [852, 1336], [852, 1477],
  [941, 1209], [941, 1336],
];
function _phoneKeypress() {
  if (!_canPlay('phone-keypress', 45)) return;
  const t = ctx.currentTime;
  const [f1, f2] = _DTMF_PAIRS[Math.floor(Math.random() * _DTMF_PAIRS.length)];
  [f1, f2].forEach(freq => {
    const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.11, t);
    g.gain.setValueAtTime(0.11, t + 0.075);
    g.gain.linearRampToValueAtTime(0, t + 0.110);
    osc.connect(g); g.connect(sfxGain); osc.start(t); osc.stop(t + 0.115);
  });
}

// ── SFX dispatcher ────────────────────────────────────────────────────────────
const _sfxMap = {
  'zoom-in':              _zoomIn,
  'zoom-out':             _zoomOut,
  'pc-enter':             _pcEnter,
  'pc-type':              _pcType,
  'pc-enter-key':         _pcEnterKey,
  'pc-exit':              _pcExit,
  'tv-enter':             _tvEnter,
  'tv-channel':           _tvChannel,
  'tv-exit':              _tvExit,
  'arcade-enter':         _arcadeEnter,
  'arcade-menu-move':     _arcadeMenuMove,
  'arcade-menu-select':   _arcadeMenuSelect,
  'arcade-exit':          _arcadeExit,
  'pong-paddle':          _pongPaddle,
  'pong-wall':            _pongWall,
  'pong-score':           _pongScore,
  'galaga-shoot':         _galagaShoot,
  'galaga-enemy-die':     _galagaEnemyDie,
  'galaga-player-die':    _galagaPlayerDie,
  'galaga-wave-clear':    _galagaWaveClear,
  'breakout-brick':       _breakoutBrick,
  'breakout-wall':        _breakoutWall,
  'breakout-paddle':      _breakoutPaddle,
  'breakout-life-lost':   _breakoutLifeLost,
  'breakout-level-clear': _breakoutLevelClear,
  'phone-ring':           _phoneRing,
  'phone-pickup':         _phonePickup,
  'phone-hangup':         _phoneHangup,
  'phone-keypress':       _phoneKeypress,
};

export function sfx(name, opts = {}) {
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();
  const fn = _sfxMap[name];
  if (fn) fn(opts);
}
