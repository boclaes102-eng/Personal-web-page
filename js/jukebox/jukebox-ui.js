/**
 * jukebox-ui.js
 * Music theme selector overlay — shown when the user clicks the jukebox.
 * One procedural ambient theme + 3 personal upload slots per user.
 *
 * Public API:
 *   showJukeboxUI(onEject)    — mount overlay + GSAP entrance
 *   hideJukeboxUI(onComplete) — GSAP exit, then calls onComplete
 */

import { sfx, setMusicTheme, getMusicTheme, setCustomTrackUrl, clearCustomTrackUrl, getAnalyser, toggleMusicPause, isMusicPaused, setMusicVolume, getMusicVolume, getCustomTrackCurrentTime, getCustomTrackDuration, setMusicTime } from '../audio/audio-manager.js';
import { saveUserTheme, loadUserTheme, uploadJukeboxTrack, saveCustomTrackUrl, loadAllCustomTrackUrls, deleteCustomTrack, deleteJukeboxFile } from '../auth/auth.js';

// ── Theme definitions ─────────────────────────────────────────────────────────
const THEMES = [
  {
    id:     'space',
    name:   'DEEP SPACE',
    artist: 'Procedural Engine',
    desc:   'Interstellar ambient drone // generated in real-time',
    color:  '#00ffcc',
  },
];

const MAX_MB    = 20;
const NUM_SLOTS = 3;

// ── DOM state ─────────────────────────────────────────────────────────────────
let _el          = null;
let _onEject     = null;
let _keyHandler  = null;
let _visFrame    = null;
let _trackEls    = [];

// Custom slots — parallel arrays, index 0 = slot 1
let _customUrls  = [null, null, null];   // current URL per slot
let _slotRefs    = [];                   // { row, artistEl, actionEl, uploadBtn, deleteBtn, fileInput }
let _activeSlot  = -1;                  // which slot is playing (-1 = none)
let _progressSlider   = null;            // range input for track seek
let _progressTimeEl   = null;            // time display "MM:SS / MM:SS"
let _progressDragging = false;           // true while the user drags the scrubber

// ── DOM helpers ───────────────────────────────────────────────────────────────
function el(tag, cls = '', text = '') {
  const e = document.createElement(tag);
  if (cls)  e.className   = cls;
  if (text) e.textContent = text;
  return e;
}

function _formatTime(s) {
  if (!isFinite(s) || s < 0) return '--:--';
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

// Extract a human-readable song title from a storage URL.
// Path shape: .../custom_{slot}/{safe_title}.ext  (new) or .../custom_{slot}.ext (legacy)
function _titleFromUrl(url) {
  if (!url) return '';
  try {
    const filename = decodeURIComponent(url.split('/').pop());
    const base = filename.replace(/\.[^.]+$/, '');          // strip extension
    // Legacy format "custom_1" → "YOUR TRACK 1"
    if (/^custom_\d+$/.test(base)) return `YOUR TRACK ${base.split('_')[1]}`;
    return base.replace(/[_-]+/g, ' ').trim().toUpperCase();
  } catch { return ''; }
}

// Read the ID3v2 TIT2 (title) tag from an audio File without any external library.
// Returns the tag string, or null if not found.
async function _readID3Title(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const buf = new Uint8Array(e.target.result);
        if (buf[0] !== 0x49 || buf[1] !== 0x44 || buf[2] !== 0x33) return resolve(null); // no "ID3"
        const tagSize = (buf[6] << 21) | (buf[7] << 14) | (buf[8] << 7) | buf[9];
        let i = 10;
        const limit = Math.min(10 + tagSize, buf.length);
        while (i < limit - 10) {
          const id = String.fromCharCode(buf[i], buf[i+1], buf[i+2], buf[i+3]);
          const sz = (buf[i+4] << 24) | (buf[i+5] << 16) | (buf[i+6] << 8) | buf[i+7];
          if (sz <= 0 || sz > 100000) break;
          if (id === 'TIT2') {
            const enc = buf[i + 10];
            const raw = buf.slice(i + 11, i + 10 + sz);
            let text;
            if (enc === 1 || enc === 2) text = new TextDecoder('utf-16le').decode(raw);
            else                         text = new TextDecoder('utf-8').decode(raw);
            text = text.replace(/\0/g, '').trim();
            return resolve(text || null);
          }
          i += 10 + sz;
        }
        resolve(null);
      } catch { resolve(null); }
    };
    reader.onerror = () => resolve(null);
    reader.readAsArrayBuffer(file.slice(0, 256 * 1024));
  });
}

// ── Built-in theme play/pause button refresh ──────────────────────────────────
function _refreshBuiltinThemeBtns() {
  _trackEls.forEach(({ trackEl, actionEl, theme }) => {
    const isActive = theme.id === getMusicTheme() && _activeSlot === -1;
    trackEl.classList.toggle('jk-track-active', isActive);
    if (isActive) {
      actionEl.textContent = isMusicPaused() ? '[ ▶ PLAY ]' : '[ ⏸ PAUSE ]';
    } else {
      actionEl.textContent = '[ SELECT ]';
    }
  });
}

// ── Built-in theme selection ──────────────────────────────────────────────────
function _selectTheme(id) {
  sfx('pc-enter-key');
  setMusicTheme(id);
  saveUserTheme(id);
  _activeSlot = -1;
  _refreshBuiltinThemeBtns();
  _refreshAllSlots();
  _updateVisPanel(THEMES.find(t => t.id === id));
}

// ── Custom slot selection ─────────────────────────────────────────────────────
function _selectSlot(idx) {
  const url = _customUrls[idx];
  if (!url) return;
  sfx('pc-enter-key');

  // Tell audio-manager which URL to play then switch theme
  setCustomTrackUrl(url);
  if (getMusicTheme() !== 'custom') {
    setMusicTheme('custom');
  } else {
    // Already on 'custom' — force a reload in case it was a different slot
    setCustomTrackUrl(url);
  }
  saveUserTheme('custom');
  _activeSlot = idx;

  _refreshBuiltinThemeBtns();
  _refreshAllSlots();
  _updateVisPanel({ name: _titleFromUrl(url), artist: `SLOT ${idx + 1} OF ${NUM_SLOTS}`, color: '#00ffcc' });
}

// ── Visualizer side-panel ─────────────────────────────────────────────────────
function _updateVisPanel(info) {
  if (!_el || !info) return;
  const lbl = _el.querySelector('.jk-vis-label');
  const sub = _el.querySelector('.jk-vis-sublabel');
  if (lbl) { lbl.textContent = info.name;   lbl.style.color = info.color; }
  if (sub) { sub.textContent = info.artist; }
}

// ── Visualizer canvas animation ───────────────────────────────────────────────
function _startVis(canvas) {
  const c2      = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const BARS    = 20;
  const bw      = (W - (BARS + 1)) / BARS;
  const analyser = getAnalyser();
  const dataArr  = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;

  function frame(ms) {
    if (!_el) return;
    const t     = ms * 0.001;
    const theme = THEMES.find(t2 => t2.id === getMusicTheme());
    const color = theme?.color ?? '#00ffcc';

    // Update progress scrubber (skip while dragging to avoid fighting the user)
    if (_progressSlider && !_progressDragging) {
      const cur = getCustomTrackCurrentTime();
      const dur = getCustomTrackDuration();
      if (dur > 0 && isFinite(dur)) _progressSlider.max = String(Math.ceil(dur));
      _progressSlider.value = String(cur);
      if (_progressTimeEl) {
        _progressTimeEl.textContent = `${_formatTime(cur)} / ${_formatTime(dur > 0 ? dur : NaN)}`;
      }
    }

    c2.fillStyle = '#04000c';
    c2.fillRect(0, 0, W, H);

    if (analyser && dataArr) {
      // Real frequency data from Web Audio API
      analyser.getByteFrequencyData(dataArr);
      const bins = dataArr.length;
      for (let i = 0; i < BARS; i++) {
        // Map bars to frequency bins, skew toward lower bins (more musical)
        const binIdx = Math.floor(Math.pow(i / BARS, 1.5) * bins);
        const v = dataArr[Math.min(binIdx, bins - 1)] / 255;
        const bh = Math.max(2, v * (H - 4));
        c2.globalAlpha = 0.35 + 0.65 * v;
        c2.fillStyle = color;
        c2.fillRect(1 + i * (bw + 1), H - bh, bw, bh);
      }
    } else {
      // Fallback: subtle animated placeholder when AudioContext not ready
      for (let i = 0; i < BARS; i++) {
        const ph = i * 0.68;
        const v  = 0.12 + 0.08 * Math.abs(Math.sin(t * 0.5 + ph));
        const bh = Math.max(2, v * H);
        c2.globalAlpha = 0.25;
        c2.fillStyle = color;
        c2.fillRect(1 + i * (bw + 1), H - bh, bw, bh);
      }
    }
    c2.globalAlpha = 1;
    _visFrame = requestAnimationFrame(frame);
  }
  _visFrame = requestAnimationFrame(frame);
}

// ── Custom slot rows ──────────────────────────────────────────────────────────
function _refreshSlot(idx) {
  const refs = _slotRefs[idx];
  if (!refs) return;
  const { row, nameEl, artistEl, actionEl, playPauseBtn, uploadBtn, deleteBtn } = refs;
  const url      = _customUrls[idx];
  const isActive = _activeSlot === idx && getMusicTheme() === 'custom';

  if (url) {
    const title = _titleFromUrl(url);
    nameEl.textContent   = title || `YOUR TRACK ${idx + 1}`;
    artistEl.textContent = `SLOT ${idx + 1} OF ${NUM_SLOTS}`;
    actionEl.textContent = '';
    playPauseBtn.textContent = (isActive && !isMusicPaused()) ? '[ ⏸ PAUSE ]' : '[ ▶ PLAY ]';
    playPauseBtn.style.display = '';
    deleteBtn.style.display = '';
    uploadBtn.style.display = '';
  } else {
    nameEl.textContent   = `YOUR TRACK ${idx + 1}`;
    artistEl.textContent = 'No track uploaded';
    actionEl.textContent = '[ UPLOAD ]';
    playPauseBtn.style.display = 'none';
    deleteBtn.style.display = 'none';
    uploadBtn.style.display = 'none';
  }

  row.classList.toggle('jk-track-active', isActive);
}

function _refreshAllSlots() {
  _refreshBuiltinThemeBtns();
  for (let i = 0; i < NUM_SLOTS; i++) {
    _refreshSlot(i);
    // A slot is visible only if it's the first slot, or the previous slot has a track
    const refs = _slotRefs[i];
    if (refs) {
      const visible = i === 0 || _customUrls[i - 1] !== null;
      refs.row.style.display = visible ? '' : 'none';
    }
  }
  // Progress slider only works for custom tracks
  const canSeek = _activeSlot !== -1 && getMusicTheme() === 'custom';
  if (_progressSlider) _progressSlider.disabled = !canSeek;
  if (_progressTimeEl && !canSeek) _progressTimeEl.textContent = '--:-- / --:--';
}

function _buildSlotRow(trackList, idx) {
  const slotNum  = idx + 1;
  const trackNum = String(THEMES.length + slotNum).padStart(2, '0');

  const row      = el('div', 'jk-track jk-track-custom');
  const numEl    = el('div', 'jk-track-num', trackNum);
  const infoEl   = el('div', 'jk-track-info');
  const nameEl   = el('div', 'jk-track-name', `YOUR TRACK ${slotNum}`);
  nameEl.style.color = '#00ffcc';
  const artistEl = el('div', 'jk-track-artist', 'No track uploaded');
  const descEl   = el('div', 'jk-track-desc', `Upload slot ${slotNum} of ${NUM_SLOTS} — max ${MAX_MB} MB`);
  infoEl.append(nameEl, artistEl, descEl);

  const btnGroup     = el('div', 'jk-custom-btns');
  const actionEl     = el('div', 'jk-track-action', '[ UPLOAD ]');
  const playPauseBtn = el('button', 'jk-upload-btn jk-pp-btn', '[ ▶ PLAY ]');
  playPauseBtn.title = `Play / pause slot ${slotNum}`;
  playPauseBtn.style.display = 'none';
  const uploadBtn    = el('button', 'jk-upload-btn', '[ CHANGE ]');
  uploadBtn.title    = `Upload MP3 to slot ${slotNum} (max ${MAX_MB} MB)`;
  uploadBtn.style.display = 'none';
  const deleteBtn    = el('button', 'jk-upload-btn jk-delete-btn', '[ DELETE ]');
  deleteBtn.title    = `Remove slot ${slotNum} track`;
  deleteBtn.style.display = 'none';
  btnGroup.append(actionEl, playPauseBtn, uploadBtn, deleteBtn);

  const fileInput = document.createElement('input');
  fileInput.type   = 'file';
  fileInput.accept = 'audio/mpeg,audio/mp3,.mp3,audio/*';
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);

  row.append(numEl, infoEl, btnGroup);
  trackList.appendChild(row);

  _slotRefs[idx] = { row, nameEl, artistEl, actionEl, playPauseBtn, uploadBtn, deleteBtn, fileInput };

  // ── Upload ────────────────────────────────────────────────────────────────
  async function _doUpload(file) {
    if (!file) return;
    if (!file.type.startsWith('audio/')) {
      actionEl.textContent = 'AUDIO FILES ONLY';
      setTimeout(() => _refreshSlot(idx), 2000);
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      actionEl.textContent = `MAX ${MAX_MB} MB`;
      setTimeout(() => _refreshSlot(idx), 2000);
      return;
    }
    actionEl.textContent = '  READING...';
    uploadBtn.disabled = true;
    deleteBtn.disabled = true;
    try {
      // Read ID3 title first (or clean up filename as fallback)
      const id3Title = await _readID3Title(file);
      const title    = id3Title
        ? id3Title.trim()
        : file.name.replace(/\.[^.]+$/, '').replace(/[_\-]+/g, ' ').trim();

      // If a previous file exists at a different path, delete it from storage first
      const oldUrl = _customUrls[idx];
      if (oldUrl) await deleteJukeboxFile(oldUrl).catch(() => {});

      actionEl.textContent = '  UPLOADING...';
      const url = await uploadJukeboxTrack(file, slotNum, title);
      _customUrls[idx] = url;
      await saveCustomTrackUrl(url, slotNum);
      _selectSlot(idx);
    } catch {
      actionEl.textContent = 'UPLOAD FAILED';
      setTimeout(() => _refreshSlot(idx), 2000);
    } finally {
      uploadBtn.disabled = false;
      deleteBtn.disabled = false;
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async function _doDelete() {
    const url = _customUrls[idx];
    if (!url) return;
    actionEl.textContent = ' DELETING...';
    uploadBtn.disabled = true;
    deleteBtn.disabled = true;
    try {
      await deleteCustomTrack(url, slotNum);
      _customUrls[idx] = null;

      // If this slot was playing, fall back to space theme
      if (_activeSlot === idx && getMusicTheme() === 'custom') {
        clearCustomTrackUrl();
        _activeSlot = -1;
        _refreshBuiltinThemeBtns();
        _updateVisPanel(THEMES.find(t => t.id === 'space'));
      }
      _refreshSlot(idx);
    } catch {
      actionEl.textContent = 'DELETE FAILED';
      setTimeout(() => _refreshSlot(idx), 2000);
    } finally {
      uploadBtn.disabled = false;
      deleteBtn.disabled = false;
    }
  }

  fileInput.addEventListener('change', () => {
    _doUpload(fileInput.files?.[0]);
    fileInput.value = '';
  });

  playPauseBtn.addEventListener('click', e => {
    e.stopPropagation();
    if (!_customUrls[idx]) return;
    if (_activeSlot === idx && getMusicTheme() === 'custom') {
      // This slot is active — toggle pause/resume
      toggleMusicPause();
      _refreshAllSlots();
    } else {
      // Play this slot
      _selectSlot(idx);
    }
  });

  uploadBtn.addEventListener('click', e => { e.stopPropagation(); fileInput.click(); });
  deleteBtn.addEventListener('click', e => { e.stopPropagation(); _doDelete(); });

  row.addEventListener('click', () => {
    if (_customUrls[idx]) _selectSlot(idx);
    else fileInput.click();
  });
}

// ── Build DOM ─────────────────────────────────────────────────────────────────
function _build(currentTheme) {
  _el = el('div', 'jk-overlay');
  _el.appendChild(el('div', 'crt-scanlines'));
  _el.appendChild(el('div', 'crt-vignette'));

  const topbar   = el('div', 'jk-topbar');
  const logo     = el('span', 'jk-logo',     '♫  SPACE JUKEBOX');
  const sub      = el('span', 'jk-logo-sub', '// MUSIC THEME SELECTOR v1.0');
  const ejectBtn = el('button', 'jk-eject-btn', '[ ⏏ EJECT ]');
  ejectBtn.title = 'Exit (ESC)';
  topbar.append(logo, sub, ejectBtn);
  _el.appendChild(topbar);

  const body = el('div', 'jk-body');
  _slotRefs  = [];

  const trackList = el('div', 'jk-tracklist');
  _trackEls = THEMES.map((theme, i) => {
    const isActive = theme.id === currentTheme;
    const trackEl  = el('div', 'jk-track' + (isActive ? ' jk-track-active' : ''));
    const numEl    = el('div', 'jk-track-num', String(i + 1).padStart(2, '0'));
    const infoEl   = el('div', 'jk-track-info');
    const nameEl   = el('div', 'jk-track-name', theme.name);
    nameEl.style.color = theme.color;
    const artistEl = el('div', 'jk-track-artist', theme.artist);
    const descEl   = el('div', 'jk-track-desc',   theme.desc);
    infoEl.append(nameEl, artistEl, descEl);

    const actionEl = el('button', 'jk-upload-btn jk-theme-pp-btn',
      isActive ? (isMusicPaused() ? '[ ▶ PLAY ]' : '[ ⏸ PAUSE ]') : '[ SELECT ]');
    trackEl.append(numEl, infoEl, actionEl);

    actionEl.addEventListener('click', e => {
      e.stopPropagation();
      if (theme.id === getMusicTheme() && _activeSlot === -1) {
        // This theme is active — toggle pause
        toggleMusicPause();
        _refreshAllSlots();
      } else {
        _selectTheme(theme.id);
      }
    });

    trackEl.addEventListener('click', () => {
      if (theme.id === getMusicTheme() && _activeSlot === -1) return;
      _selectTheme(theme.id);
    });
    trackList.appendChild(trackEl);
    return { trackEl, actionEl, theme };
  });

  // 3 custom upload slots
  for (let i = 0; i < NUM_SLOTS; i++) _buildSlotRow(trackList, i);
  _refreshAllSlots();

  // Visualizer panel
  const visPanel = el('div', 'jk-visualizer');
  const visTitle = el('div', 'jk-vis-title', '// SPECTRUM');
  const visCv    = document.createElement('canvas');
  visCv.className = 'jk-vis-canvas';
  visCv.width = 180; visCv.height = 180;

  const activeTheme = THEMES.find(t => t.id === currentTheme);
  const visLabel    = el('div', 'jk-vis-label', activeTheme?.name ?? '');
  visLabel.style.color = activeTheme?.color ?? '#00ffcc';
  const visSub = el('div', 'jk-vis-sublabel', activeTheme?.artist ?? '');

  // Volume control
  const volWrap   = el('div', 'jk-vol-wrap');
  const volTitle  = el('div', 'jk-vol-title', '// VOL');
  const volSlider = document.createElement('input');
  volSlider.type      = 'range';
  volSlider.className = 'jk-vol-slider';
  volSlider.min       = '0';
  volSlider.max       = '100';
  volSlider.value     = String(Math.round(getMusicVolume() * 100));
  const volValEl  = el('div', 'jk-vol-value', `${volSlider.value}%`);
  volSlider.addEventListener('input', () => {
    const v = Number(volSlider.value) / 100;
    setMusicVolume(v);
    volValEl.textContent = `${volSlider.value}%`;
  });
  volWrap.append(volTitle, volSlider, volValEl);

  // Progress / seek bar — active only when a custom track is loaded
  const progressWrap  = el('div', 'jk-seek-wrap');
  const progressTitle = el('div', 'jk-vol-title', '// TRACK');
  const slider = document.createElement('input');
  slider.type      = 'range';
  slider.className = 'jk-vol-slider jk-progress-slider';
  slider.min       = '0';
  slider.max       = '100';
  slider.value     = '0';
  slider.disabled  = true;
  const timeEl = el('div', 'jk-vol-value', '--:-- / --:--');
  timeEl.className = 'jk-progress-time';

  slider.addEventListener('pointerdown', () => { _progressDragging = true; });
  slider.addEventListener('input', () => {
    // Live-update time label while dragging
    const v = Number(slider.value);
    const dur = getCustomTrackDuration();
    if (_progressTimeEl) {
      _progressTimeEl.textContent = `${_formatTime(v)} / ${_formatTime(dur > 0 ? dur : NaN)}`;
    }
  });
  slider.addEventListener('pointerup', () => {
    setMusicTime(Number(slider.value));
    _progressDragging = false;
  });

  _progressSlider = slider;
  _progressTimeEl = timeEl;
  progressWrap.append(progressTitle, slider, timeEl);

  visPanel.append(visTitle, visCv, visLabel, visSub, volWrap, progressWrap);
  body.append(trackList, visPanel);
  _el.appendChild(body);

  const status = el('div', 'jk-status-bar',
    `SELECT A THEME TO CHANGE THE MUSIC  //  UP TO ${NUM_SLOTS} PERSONAL TRACKS  //  SAVED TO YOUR PROFILE`);
  _el.appendChild(status);

  ejectBtn.addEventListener('click', () => _onEject?.());
  _keyHandler = e => {
    if (e.key === 'Escape') { e.stopPropagation(); _onEject?.(); }
  };
  window.addEventListener('keydown', _keyHandler);
  document.body.appendChild(_el);

  _startVis(visCv);
}

// ── Public API ────────────────────────────────────────────────────────────────
export function showJukeboxUI(onEject) {
  _onEject    = onEject;
  _activeSlot = -1;
  sfx('arcade-enter');

  const current = getMusicTheme();
  _build(current);

  // Restore saved theme + all 3 slot URLs from DB
  Promise.all([
    loadUserTheme().catch(() => null),
    loadAllCustomTrackUrls().catch(() => [null, null, null]),
  ]).then(([savedTheme, savedUrls]) => {
    // Populate slot URLs
    savedUrls.forEach((url, i) => {
      if (url) _customUrls[i] = url;
    });

    // Restore active theme
    if (savedTheme === 'custom') {
      const firstFilled = savedUrls.findIndex(u => u);
      if (firstFilled !== -1) {
        _activeSlot = firstFilled;
        setCustomTrackUrl(savedUrls[firstFilled]);
        if (getMusicTheme() !== 'custom') setMusicTheme('custom');
        _updateVisPanel({
          name:   _titleFromUrl(savedUrls[firstFilled]),
          artist: `SLOT ${firstFilled + 1} OF ${NUM_SLOTS}`,
          color:  '#00ffcc',
        });
      }
    } else if (savedTheme && savedTheme !== getMusicTheme()) {
      // Treat legacy 'synthwave' saves as 'space' (theme was renamed)
      const resolvedTheme = savedTheme === 'synthwave' ? 'space' : savedTheme;
      if (THEMES.find(t => t.id === resolvedTheme)) _selectTheme(resolvedTheme);
    }

    // Always refresh all slots so URLs and row visibility are correct
    _refreshAllSlots();
  });

  _el.style.transformOrigin = 'center center';
  const { gsap } = window;
  gsap.fromTo(_el,
    { scaleY: 0.005, opacity: 1 },
    { scaleY: 1, duration: 0.45, ease: 'power2.out',
      onComplete: () => sfx('phone-pickup') }
  );
}

export function hideJukeboxUI(onComplete) {
  if (!_el) { onComplete?.(); return; }
  if (_keyHandler) { window.removeEventListener('keydown', _keyHandler); _keyHandler = null; }
  if (_visFrame)   { cancelAnimationFrame(_visFrame); _visFrame = null; }

  // Clean up all hidden file inputs
  _slotRefs.forEach(refs => refs?.fileInput?.remove());
  _slotRefs = [];

  sfx('zoom-out');
  const domEl = _el;
  _el = null; _trackEls = [];
  _progressSlider = null; _progressTimeEl = null; _progressDragging = false;

  const { gsap } = window;
  gsap.timeline({ onComplete: () => { domEl.remove(); onComplete?.(); } })
    .to(domEl, { scaleY: 0.005, duration: 0.28, ease: 'power2.in' })
    .to(domEl, { opacity: 0,    duration: 0.18, ease: 'power1.in' });
}
