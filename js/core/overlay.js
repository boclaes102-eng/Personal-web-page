/**
 * overlay.js
 * Show / hide the project detail overlay and the celestial lore panel.
 * Pure DOM — no Three.js dependency.
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

function isVideo(src) {
  return /\.(mp4|webm|ogg|mov)$/i.test(src);
}

function makeMediaEl(src) {
  if (isVideo(src)) {
    const v = document.createElement('video');
    v.src = src;
    v.controls = true;
    v.muted    = true;
    v.className = 'carousel-media';
    return v;
  }
  const img = document.createElement('img');
  img.src = src;
  img.alt = '';
  img.className = 'carousel-media';
  return img;
}

function buildCarousel(container, mediaList, glowColor) {
  container.innerHTML = '';
  if (!mediaList || mediaList.length === 0) return;

  let idx = 0;

  const wrapper = document.createElement('div');
  wrapper.className = 'carousel-wrapper';

  const track = document.createElement('div');
  track.className = 'carousel-track';

  function renderCurrent() {
    // pause any playing video before replacing
    const old = track.querySelector('video');
    if (old) old.pause();
    track.innerHTML = '';
    track.appendChild(makeMediaEl(mediaList[idx]));
  }

  renderCurrent();
  wrapper.appendChild(track);
  container.appendChild(wrapper);

  // Single item — no controls needed
  if (mediaList.length === 1) return;

  // Arrows
  const svgPrev = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`;
  const svgNext = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;

  const prev = document.createElement('button');
  prev.className = 'carousel-btn carousel-prev';
  prev.innerHTML = svgPrev;
  prev.style.setProperty('--glow', glowColor);

  const next = document.createElement('button');
  next.className = 'carousel-btn carousel-next';
  next.innerHTML = svgNext;
  next.style.setProperty('--glow', glowColor);

  // Bottom bar: dots + counter
  const bottom = document.createElement('div');
  bottom.className = 'carousel-bottom';

  const dotsWrap = document.createElement('div');
  dotsWrap.className = 'carousel-dots';

  const counter = document.createElement('div');
  counter.className = 'carousel-counter';

  function buildDots() {
    dotsWrap.innerHTML = '';
    mediaList.forEach((_, i) => {
      const d = document.createElement('span');
      d.className = 'carousel-dot' + (i === idx ? ' active' : '');
      d.style.setProperty('--glow', glowColor);
      d.addEventListener('click', () => { idx = i; update(); });
      dotsWrap.appendChild(d);
    });
  }

  function update() {
    renderCurrent();
    counter.textContent = `${idx + 1} / ${mediaList.length}`;
    buildDots();
  }

  prev.addEventListener('click', () => {
    idx = (idx - 1 + mediaList.length) % mediaList.length;
    update();
  });
  next.addEventListener('click', () => {
    idx = (idx + 1) % mediaList.length;
    update();
  });

  buildDots();
  counter.textContent = `1 / ${mediaList.length}`;

  bottom.appendChild(dotsWrap);
  bottom.appendChild(counter);

  wrapper.appendChild(prev);
  wrapper.appendChild(next);
  container.appendChild(bottom);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function showOverlay(proj) {
  const overlay = document.getElementById('overlay');
  const panel   = overlay.querySelector('.overlay-panel');
  panel.style.setProperty('--glow', proj.glowColor);
  overlay.querySelector('.overlay-title').textContent = proj.title;
  overlay.querySelector('.overlay-desc').textContent  = proj.description;

  const techWrap = overlay.querySelector('.overlay-tech');
  techWrap.innerHTML = '';
  proj.tech.forEach(t => {
    const s = document.createElement('span');
    s.className = 'tech-tag';
    s.textContent = t;
    s.style.setProperty('--glow', proj.glowColor);
    techWrap.appendChild(s);
  });

  const mediaWrap = overlay.querySelector('.overlay-media');
  buildCarousel(mediaWrap, proj.media || [], proj.glowColor);

  const link = overlay.querySelector('.overlay-link');
  if (proj.link && proj.link !== '#') {
    link.href = proj.link; link.style.display = '';
    link.style.setProperty('--glow', proj.glowColor);
  } else {
    link.style.display = 'none';
  }

  overlay.classList.add('visible');
}

export function hideOverlay() {
  const overlay = document.getElementById('overlay');
  // pause any playing video when closing
  overlay.querySelectorAll('video').forEach(v => v.pause());
  overlay.classList.remove('visible');
}

export function showLore(lore) {
  const panel = document.getElementById('lore-panel');
  panel.style.setProperty('--lore-glow', lore.glowColor);
  panel.querySelector('.lore-tag').textContent   = '// CLASSIFIED RECORD';
  panel.querySelector('.lore-name').textContent  = lore.name;
  panel.querySelector('.lore-class').textContent = lore.type;
  panel.querySelector('.lore-desc').textContent  = lore.desc;

  const statsList = panel.querySelector('.lore-stats');
  statsList.innerHTML = '';
  lore.stats.forEach(s => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="lore-stat-label">${s.label}</span><span class="lore-stat-value">${s.value}</span>`;
    statsList.appendChild(li);
  });

  panel.classList.add('visible');
}

export function hideLore() {
  document.getElementById('lore-panel').classList.remove('visible');
}
