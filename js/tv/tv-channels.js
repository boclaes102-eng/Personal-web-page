/**
 * tv-channels.js
 * Retro TV channel overlay — all channels use real live data from free APIs.
 *
 * APIs used (all free, no sign-up required):
 *   Weather  : api.open-meteo.com            (no key needed)
 *   Geo      : nominatim.openstreetmap.org   (no key needed)
 *   IP geo   : ipapi.co                      (no key needed, fallback)
 *   News     : hacker-news.firebaseio.com    (no key needed)
 *   Crypto   : api.coingecko.com             (no key needed)
 *   Sports   : site.api.espn.com             (no key needed — NBA scoreboard)
 *
 * Public API:
 *   showTV(onCloseRequested)
 *   hideTV(onComplete)
 */

import { sfx } from '../audio/audio-manager.js';

const { gsap } = window;

// ── Channel catalogue ─────────────────────────────────────────────────────────
const CHANNELS = [
  { id: 'news',    num: '01', name: 'NEWS-24',     accent: '#ff4040' },
  { id: 'weather', num: '02', name: 'WEATHER',     accent: '#44aaff' },
  { id: 'markets', num: '03', name: 'MARKETS',     accent: '#00ff99' },
  { id: 'sports',  num: '04', name: 'SPORTS',      accent: '#ffaa00' },
  { id: 'test',    num: '05', name: 'TEST SIGNAL', accent: '#e8e8e8' },
];

// ── Module state ──────────────────────────────────────────────────────────────
let _overlay   = null;
let _content   = null;
let _chNum     = null;
let _chName    = null;
let _staticCv  = null;
let _staticCtx = null;
let _curIdx    = 0;
let _onClose   = null;
let _liveTimer = null;
// _epoch is incremented every time the user changes channel. Each async channel
// handler captures the epoch value at the moment it starts and bails out if it
// has changed by the time data arrives — prevents a slow response from a
// previous channel overwriting the content of the newly selected one.
let _epoch     = 0;

// ── Geolocation (fetched once, cached for session) ────────────────────────────
let _locationPromise = null;

function _startLocation() {
  if (_locationPromise) return;
  _locationPromise = new Promise((resolve) => {
    if (!navigator.geolocation) { _ipGeo().then(resolve); return; }
    navigator.geolocation.getCurrentPosition(
      async ({ coords: { latitude: lat, longitude: lon } }) => {
        try {
          const r = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`
          );
          const d = await r.json();
          const a = d.address;
          resolve({
            lat, lon,
            city:    a.city || a.town || a.village || a.county || 'Unknown',
            country: a.country || '',
            cc:      (a.country_code || 'us').toUpperCase(),
          });
        } catch {
          resolve({ lat, lon, city: 'Your Location', country: '', cc: 'XX' });
        }
      },
      () => _ipGeo().then(resolve),
      { timeout: 6000 } // 6 s — browser default is infinite; cap it so we fall back promptly
    );
  });
}

async function _ipGeo() {
  try {
    const r = await fetch('https://ipapi.co/json/');
    const d = await r.json();
    return { lat: d.latitude, lon: d.longitude, city: d.city, country: d.country_name, cc: d.country_code || 'US' };
  } catch {
    // Last-resort fallback when both GPS and IP geo fail (e.g. offline, blocked).
    return { lat: 50.85, lon: 4.35, city: 'Brussels', country: 'Belgium', cc: 'BE' };
  }
}

// ── Public API ────────────────────────────────────────────────────────────────
export function showTV(onClose) {
  _onClose = onClose;
  _curIdx  = 0;
  sfx('tv-enter');
  _startLocation();   // kick off location fetch in background
  _build();
  gsap.fromTo(_overlay,
    { scaleY: 0.005, opacity: 1 },
    { scaleY: 1, duration: 0.5, ease: 'power2.out',
      onComplete: () => _renderChannel(0) }
  );
}

export function hideTV(onComplete) {
  sfx('tv-exit');
  _clearLive();
  document.removeEventListener('keydown', _onKey);
  gsap.to(_overlay, {
    scaleY: 0.005, duration: 0.28, ease: 'power2.in',
    onComplete: () => gsap.to(_overlay, {
      opacity: 0, duration: 0.18,
      onComplete: () => { _overlay?.remove(); _overlay = null; onComplete?.(); }
    })
  });
}

// ── DOM builder ───────────────────────────────────────────────────────────────
function _build() {
  _overlay = document.createElement('div');
  _overlay.className = 'tv-overlay';

  ['tv-scanlines', 'tv-vignette'].forEach(cls => {
    const d = document.createElement('div'); d.className = cls; _overlay.appendChild(d);
  });

  _staticCv           = document.createElement('canvas');
  _staticCv.className = 'tv-static-cv';
  _staticCv.width     = 256;
  _staticCv.height    = 192;
  _staticCtx          = _staticCv.getContext('2d');
  _overlay.appendChild(_staticCv);

  const inner = document.createElement('div');
  inner.className = 'tv-inner';
  _overlay.appendChild(inner);

  const topbar = document.createElement('div');
  topbar.className = 'tv-topbar';
  _chNum  = document.createElement('span'); _chNum.className  = 'tv-ch-num';
  _chName = document.createElement('span'); _chName.className = 'tv-ch-name';
  topbar.append(
    _chNum, _chName,
    _btn('&#9664;', 'tv-nav-btn',  () => _changeChannel(-1)),
    _btn('&#9654;', 'tv-nav-btn',  () => _changeChannel( 1)),
    _btn('[ POWER OFF ]', 'tv-exit-btn', () => _onClose?.()),
  );
  inner.appendChild(topbar);

  _content = document.createElement('div');
  _content.className = 'tv-content';
  inner.appendChild(_content);

  const hint = document.createElement('div');
  hint.className   = 'tv-hint';
  hint.textContent = '◀ ▶  change channels  •  1-5  jump  •  ESC  power off';
  inner.appendChild(hint);

  document.body.appendChild(_overlay);
  document.addEventListener('keydown', _onKey);
}

function _btn(html, cls, onClick) {
  const b = document.createElement('button');
  b.className = cls; b.innerHTML = html;
  b.addEventListener('click', onClick);
  return b;
}

// ── Navigation ────────────────────────────────────────────────────────────────
function _onKey(e) {
  if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')    { e.stopPropagation(); _changeChannel(-1); return; }
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown')  { e.stopPropagation(); _changeChannel( 1); return; }
  if (e.key >= '1' && e.key <= '5') { e.stopPropagation(); _switchTo(parseInt(e.key) - 1); return; }
  if (e.key === 'Escape')           { e.stopPropagation(); _onClose?.(); }
}
function _changeChannel(dir) { _switchTo((_curIdx + dir + CHANNELS.length) % CHANNELS.length); }
function _switchTo(idx) {
  if (idx === _curIdx) return;
  sfx('tv-channel');
  _clearLive(); _curIdx = idx;
  _staticFlash(() => _renderChannel(idx));
}
function _staticFlash(cb) {
  const W = _staticCv.width, H = _staticCv.height;
  const id = _staticCtx.createImageData(W, H);
  const d  = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = (Math.random() * 220) | 0;
    d[i] = (v * 0.78)|0; d[i+1] = (v * 0.83)|0; d[i+2] = v; d[i+3] = 255;
  }
  _staticCtx.putImageData(id, 0, 0);
  _staticCv.style.display = 'block';
  gsap.fromTo(_staticCv,
    { opacity: 0.88 },
    { opacity: 0, duration: 0.38, ease: 'power1.in',
      onComplete: () => { _staticCv.style.display = 'none'; cb(); } }
  );
}

// ── Channel dispatcher ────────────────────────────────────────────────────────
function _renderChannel(idx) {
  const ch = CHANNELS[idx];
  _chNum.textContent  = `CH ${ch.num}`;
  _chName.textContent = ch.name;
  _chNum.style.color  = ch.accent;
  _chName.style.color = ch.accent;
  _content.innerHTML  = '';
  _epoch++;
  const ep = _epoch;
  ({ news: _news, weather: _weather, markets: _markets, sports: _sports, test: _test })[ch.id](ch, ep);
}

// ── Shared helpers ────────────────────────────────────────────────────────────
function _clearLive()   { if (_liveTimer) { clearInterval(_liveTimer); _liveTimer = null; } }
function _nowTime()     { return new Date().toLocaleTimeString('en-GB', { hour12: false }); }
function _div(cls)      { const d = document.createElement('div'); d.className = cls; return d; }
function _esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}
function _loading(el, msg = 'FETCHING DATA...') {
  el.innerHTML = `<div class="tv-loading"><span class="tv-blink">▌</span> ${msg}</div>`;
}
function _error(el, msg, detail = '') {
  el.innerHTML = `<div class="tv-fetch-error">${msg}${detail ? `<br><span class="tv-err-detail">${_esc(detail)}</span>` : ''}</div>`;
}

// WMO weather codes → display info
function _wxInfo(code) {
  if (code === 0)  return { icon: '☀',  desc: 'CLEAR SKY' };
  if (code <= 2)   return { icon: '⛅', desc: 'PARTLY CLOUDY' };
  if (code === 3)  return { icon: '☁',  desc: 'OVERCAST' };
  if (code <= 48)  return { icon: '≋',  desc: 'FOGGY' };
  if (code <= 55)  return { icon: '💧', desc: 'DRIZZLE' };
  if (code <= 65)  return { icon: '☂',  desc: 'RAIN' };
  if (code <= 75)  return { icon: '❄',  desc: 'SNOW' };
  if (code <= 82)  return { icon: '☂',  desc: 'SHOWERS' };
  if (code <= 86)  return { icon: '❄',  desc: 'SNOW SHOWERS' };
  return                { icon: '⚡', desc: 'THUNDERSTORM' };
}
function _dayName(dateStr) {
  return ['SUN','MON','TUE','WED','THU','FRI','SAT'][new Date(dateStr + 'T12:00:00').getDay()];
}

// ── ① NEWS — Hacker News top stories via Firebase API ────────────────────────
const _NEWS_CONNECTING = [
  'CONNECTING TO SATELLITE...', 'ACQUIRING SIGNAL...',
  'TUNING FREQUENCY...', 'SYNCING WITH FEED...',
  'HANDSHAKING WITH SERVER...', 'BUFFERING NEWS STREAM...',
  'DECODING TRANSMISSION...', 'PLEASE STAND BY...',
  'CALIBRATING RECEIVER...', 'ESTABLISHING UPLINK...',
  'SEARCHING FOR SIGNAL...', 'ADJUSTING ANTENNA...',
  'DOWNLOADING HEADLINES...', 'RECEIVING BROADCAST...',
  'ROUTING VIA SATELLITE...', 'AUTHENTICATING FEED...',
  'LOCKING ONTO TRANSPONDER...', 'SIGNAL DETECTED...',
  'UPLINK ESTABLISHED...', 'DECRYPTING STREAM...',
];

async function _news(ch, ep) {
  const c = _div('tv-news');
  _loading(c, _NEWS_CONNECTING[(Math.random() * _NEWS_CONNECTING.length) | 0]);
  _content.appendChild(c);

  let headlines = [];
  try {
    const idsRes = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
    if (ep !== _epoch) return;
    const ids = await idsRes.json();
    // Fetch the top 12 stories in parallel. Individual failures return null and
    // are filtered out below — one bad story doesn't kill the whole feed.
    const stories = await Promise.all(
      ids.slice(0, 12).map(id =>
        fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)
          .then(r => r.json()).catch(() => null)
      )
    );
    if (ep !== _epoch) return;
    headlines = stories.filter(s => s && s.title).map(s => s.title.toUpperCase());
  } catch { /* fall through to error message */ }

  if (!headlines.length) headlines = ['NEWS FEED CURRENTLY UNAVAILABLE'];
  if (ep !== _epoch) return;

  // The ticker CSS animation slides the text left by 33.33%, so we need 3 copies
  // of the source string to fill the full width and loop seamlessly.
  const tickerSrc = headlines.join('  ▶  ') + '  ▶  ';
  let hlIdx = 0;

  c.innerHTML = `
    <div class="tv-news-hdr">
      <span class="tv-live" style="background:${ch.accent}">● LIVE</span>
      <span class="tv-news-label">HACKER NEWS — TOP STORIES</span>
      <span class="tv-clock" id="tv-clk">${_nowTime()}</span>
    </div>
    <div class="tv-divider" style="border-color:${ch.accent}55"></div>
    <div class="tv-headline" id="tv-hl">${headlines[0]}</div>
    <div class="tv-news-anchor">NEWS-24 — LIVE TECH COVERAGE — NEWS.YCOMBINATOR.COM</div>
    <div class="tv-ticker-wrap" style="border-top:1px solid ${ch.accent}44">
      <span class="tv-ticker-tag" style="background:${ch.accent};color:#000">NEWS</span>
      <div class="tv-ticker-txt">${(tickerSrc + tickerSrc + tickerSrc)}</div>
    </div>`;

  // Update clock every second; cycle headline every 6 s
  let sec = 0;
  _liveTimer = setInterval(() => {
    if (ep !== _epoch) return;
    sec++;
    const clk = c.querySelector('#tv-clk');
    if (clk) clk.textContent = _nowTime();
    if (sec % 6 === 0) {
      const hl = c.querySelector('#tv-hl');
      if (hl) hl.textContent = headlines[hlIdx++ % headlines.length];
    }
  }, 1000);
}

// ── ② WEATHER — Open-Meteo + 4 nearby cities via Nominatim ──────────────────
// EONET category → retro-safe emoji icon
const EONET_ICON = {
  wildfires:    '🔥', severeStorms: '⛈', volcanoes:  '🌋',
  earthquakes:  '🌍', floods:       '💧', drought:   '☀',
  landslides:   '⛰',  snow:         '❄', seaLakeIce: '🧊',
  dustHaze:     '🌫', tempExtremes: '🌡', manmade:    '⚠',
  waterColor:   '🌊',
};

// Fixed 6-box grid — always shown even when a category has zero events.
// "clear" is the message displayed when nothing is happening in that category.
const DISASTER_GRID = [
  { id: 'wildfires',    icon: '🔥', name: 'WILDFIRES',     clear: 'NO ACTIVE FIRES — ALL CLEAR' },
  { id: 'earthquakes',  icon: '🌍', name: 'EARTHQUAKES',   clear: 'GROUND STABLE — NO SEISMIC ACTIVITY' },
  { id: 'volcanoes',    icon: '🌋', name: 'VOLCANOES',     clear: "NO POMPEII TODAY — VOLCANOES DORMANT" },
  { id: 'severeStorms', icon: '⛈', name: 'SEVERE STORMS', clear: 'BLUE SKIES — NO MAJOR STORM SYSTEMS' },
  { id: 'floods',       icon: '💧', name: 'FLOODS',        clear: 'STAYING DRY — NO FLOOD EVENTS' },
  { id: 'seaLakeIce',   icon: '🌊', name: 'SEA EVENTS',    clear: 'CALM WATERS — NO TSUNAMI ACTIVITY' },
];
function _relDate(iso) {
  const diff = Math.floor((Date.now() - new Date(iso)) / 86400000);
  if (diff <= 0) return 'TODAY';
  if (diff === 1) return '1D AGO';
  return `${diff}D AGO`;
}
async function _weather(ch, ep) {
  const c = _div('tv-weather');
  _loading(c, 'ACQUIRING LOCATION...');
  _content.appendChild(c);

  try {
    const loc = await _locationPromise;
    if (ep !== _epoch) return;

    _loading(c, 'FINDING NEARBY LOCATIONS...');

    // Build a list of 4 locations: user's city + 3 nearby cities.
    // Reverse-geocode 3 offset points at city zoom-level via Nominatim.
    // zoom=10 always returns the municipality/city that contains that coordinate.
    let locations = [{ lat: loc.lat, lon: loc.lon, city: loc.city }];
    try {
      const R = 0.40; // ~44 km per degree of lat
      const offsets = [[R, R * 1.1], [R, -R * 1.1], [-R * 0.85, R * 0.6]]; // NE, NW, S
      const reverseResults = await Promise.all(
        offsets.map(([dlat, dlon]) => {
          const lat2 = +(loc.lat + dlat).toFixed(5);
          const lon2 = +(loc.lon + dlon).toFixed(5);
          return fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat2}&lon=${lon2}&format=json&zoom=10`
          )
            .then(r => r.json())
            .then(d => {
              const a    = d.address || {};
              const name = a.city || a.town || a.village || a.county || null;
              return name ? { lat: lat2, lon: lon2, city: name } : null;
            })
            .catch(() => null);
        })
      );
      if (ep !== _epoch) return;
      const seen = new Set([loc.city.toLowerCase()]);
      for (const nearby of reverseResults) {
        if (!nearby || seen.has(nearby.city.toLowerCase())) continue;
        seen.add(nearby.city.toLowerCase());
        locations.push(nearby);
      }
    } catch { /* fall back to user location only */ }

    // Last-resort pad if all 3 reverse geocodes failed or returned the same city
    const PADS = [[0.4, 0.5], [0.4, -0.5], [-0.35, 0.3]];
    for (let i = 0; locations.length < 4; i++) {
      const [dlat, dlon] = PADS[i] || [0.4, 0];
      locations.push({ lat: loc.lat + dlat, lon: loc.lon + dlon, city: '...' });
    }

    if (ep !== _epoch) return;
    _loading(c, 'FETCHING WEATHER DATA...');

    // Fetch weather for all 4 locations + EONET disaster events in parallel
    const [wxData, eonetRes] = await Promise.all([
      Promise.all(
        locations.map(l =>
          fetch(`https://api.open-meteo.com/v1/forecast` +
            `?latitude=${l.lat}&longitude=${l.lon}` +
            `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m` +
            `&daily=temperature_2m_max,temperature_2m_min,weather_code` +
            `&timezone=auto&forecast_days=5`)
            .then(r => r.json()).catch(() => null)
        )
      ),
      fetch('https://eonet.gsfc.nasa.gov/api/v3/events?days=7&limit=50')
        .then(r => r.json()).catch(() => null),
    ]);
    if (ep !== _epoch) return;

    const cityCards = locations.map((l, i) => {
      const d = wxData[i];
      if (!d) return `<div class="tv-wx-city-card"><div class="tv-wx-card-name">${l.city.toUpperCase()}</div><div class="tv-wx-card-cond">UNAVAILABLE</div></div>`;
      const cur = d.current;
      const wx  = _wxInfo(cur.weather_code);
      return `
        <div class="tv-wx-city-card">
          <div class="tv-wx-card-name">${l.city.toUpperCase()}</div>
          <div class="tv-wx-card-main">
            <span class="tv-wx-card-icon">${wx.icon}</span>
            <span class="tv-wx-card-temp">${Math.round(cur.temperature_2m)}°C</span>
            <span class="tv-wx-card-feel">/ ${Math.round(cur.apparent_temperature)}°</span>
          </div>
          <div class="tv-wx-card-cond">${wx.desc}</div>
          <div class="tv-wx-card-detail">
            <span>💧 ${cur.relative_humidity_2m}%</span>
            <span>💨 ${Math.round(cur.wind_speed_10m)} km/h</span>
          </div>
        </div>`;
    }).join('');

    // 5-day forecast from primary location
    const primary  = wxData[0];
    const days     = primary?.daily;
    const forecast = days ? days.time.slice(0, 5).map((t, i) => ({
      day: _dayName(t),
      wx:  _wxInfo(days.weather_code[i]),
      hi:  Math.round(days.temperature_2m_max[i]),
      lo:  Math.round(days.temperature_2m_min[i]),
    })) : [];

    const dateStr = new Date().toLocaleDateString('en-GB', { weekday: 'long', month: 'long', day: 'numeric' });

    // ── Natural disaster grid (EONET) ─────────────────────────────────────────
    // Bucket incoming events by category, capped at 5 per type so one busy
    // category (e.g. wildfires) can never crowd out all the others.
    const eonetEvents = eonetRes?.events || [];
    const _evBucket = {};
    const _fixedIds = new Set(DISASTER_GRID.map(c => c.id));
    for (const ev of eonetEvents) {
      const catId = ev.categories?.[0]?.id || 'unknown';
      if (!_evBucket[catId]) _evBucket[catId] = [];
      if (_evBucket[catId].length < 5) _evBucket[catId].push(ev);
    }

    function _disasterBox(icon, name, events, clearMsg) {
      const hdr = `<div class="tv-dis-box-hdr">
        <span class="tv-disaster-icon">${icon}</span>
        <span class="tv-disaster-cat">${name}</span>
        ${events.length > 1 ? `<span class="tv-disaster-count">×${events.length}</span>` : ''}
      </div>`;
      if (!events.length) {
        return `<div class="tv-dis-box">${hdr}<div class="tv-dis-clear">${clearMsg}</div></div>`;
      }
      const rows = events.map(ev => {
        const lastGeo = ev.geometry?.[ev.geometry.length - 1];
        const date    = lastGeo?.date ? _relDate(lastGeo.date) : '';
        const title   = ev.title.length > 36 ? ev.title.slice(0, 33) + '...' : ev.title;
        return `<div class="tv-disaster-row">
          <span class="tv-disaster-title">${title.toUpperCase()}</span>
          <span class="tv-disaster-date">${date}</span>
        </div>`;
      }).join('');
      return `<div class="tv-dis-box">${hdr}${rows}</div>`;
    }

    // Fixed 6 boxes (always present)
    const fixedBoxes = DISASTER_GRID
      .map(c => _disasterBox(c.icon, c.name, _evBucket[c.id] || [], c.clear))
      .join('');

    // Any extra categories returned by EONET that aren't in the fixed grid
    const extraBoxes = Object.entries(_evBucket)
      .filter(([id]) => !_fixedIds.has(id))
      .map(([catId, events]) => {
        const icon = EONET_ICON[catId] || '⚠';
        const name = (events[0]?.categories?.[0]?.title || catId).toUpperCase();
        return _disasterBox(icon, name, events, '');
      }).join('');

    const disasterHtml = `
      <div class="tv-divider" style="border-color:rgba(255,120,50,0.4)"></div>
      <div class="tv-section-lbl" style="color:#ff8844">⚠ NATURAL EVENTS — PAST 7 DAYS</div>
      <div class="tv-disaster-grid">${fixedBoxes}${extraBoxes}</div>`;

    c.innerHTML = `
      <div class="tv-wx-header">
        <div class="tv-wx-city">${loc.city.toUpperCase()} REGION</div>
        <div class="tv-wx-date">${dateStr} — <span id="tv-wx-upd">${_nowTime()}</span></div>
      </div>
      <div class="tv-wx-city-grid">${cityCards}</div>
      ${forecast.length ? `
        <div class="tv-divider" style="border-color:${ch.accent}55"></div>
        <div class="tv-section-lbl">5-DAY FORECAST — ${locations[0].city.toUpperCase()}</div>
        <div class="tv-wx-forecast">
          ${forecast.map(f => `
            <div class="tv-wx-day">
              <div class="tv-wx-dn">${f.day}</div>
              <div class="tv-wx-ic">${f.wx.icon}</div>
              <div class="tv-wx-hi">${f.hi}°</div>
              <div class="tv-wx-lo">${f.lo}°</div>
            </div>`).join('')}
        </div>` : ''}
      ${disasterHtml}
      <div class="tv-subtext">OPEN-METEO.COM · NOMINATIM.OSM.ORG · NASA EONET — UPDATED: <span id="tv-wx-upd2">${_nowTime()}</span></div>`;

    _liveTimer = setInterval(() => {
      if (ep !== _epoch) return;
      ['#tv-wx-upd', '#tv-wx-upd2'].forEach(sel => {
        const el = c.querySelector(sel); if (el) el.textContent = _nowTime();
      });
    }, 60000);

  } catch (err) {
    if (ep !== _epoch) return;
    _error(c, 'WEATHER DATA UNAVAILABLE', err.message);
  }
}

// ── ③ MARKETS — CoinGecko crypto + Yahoo Finance equities ────────────────────
const COIN_IDS   = ['bitcoin','ethereum','solana','binancecoin','cardano','ripple','dogecoin','avalanche-2','chainlink','polkadot'];
const COIN_LABEL = { bitcoin:'BTC', ethereum:'ETH', solana:'SOL', binancecoin:'BNB', cardano:'ADA', ripple:'XRP', dogecoin:'DOGE', 'avalanche-2':'AVAX', chainlink:'LINK', polkadot:'DOT' };
const COIN_NAME  = { bitcoin:'Bitcoin', ethereum:'Ethereum', solana:'Solana', binancecoin:'BNB', cardano:'Cardano', ripple:'Ripple', dogecoin:'Dogecoin', 'avalanche-2':'Avalanche', chainlink:'Chainlink', polkadot:'Polkadot' };
// ISO 3166-1 alpha-2 codes for Eurozone countries — used to show EUR instead of USD.
const EUROZONE   = new Set(['AT','BE','CY','EE','FI','FR','DE','GR','IE','IT','LV','LT','LU','MT','NL','PT','SK','SI','ES']);

async function _markets(ch, ep) {
  const c = _div('tv-stocks');
  _loading(c, 'FETCHING MARKET DATA...');
  _content.appendChild(c);

  // Determine currency from user location (EUR for Eurozone, else USD)
  let currency = 'usd', currSym = '$';
  try {
    const loc = await _locationPromise;
    if (EUROZONE.has(loc.cc)) { currency = 'eur'; currSym = '€'; }
  } catch { /* default USD */ }

  const _fmtPrice = (p, sym) => {
    const s = p >= 1000
      ? p.toLocaleString('en-US', { maximumFractionDigits: 0 })
      : p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    return `${sym}${s}`;
  };

  const _chgHtml = chg => {
    const col = chg >= 0 ? '#00ff99' : '#ff4444';
    return `<span style="color:${col}">${chg >= 0 ? '▲' : '▼'} ${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%</span>`;
  };

  const fetchAll = async () => {
    // ── Crypto prices (CoinGecko) ───────────────────────────────────────────
    let coins = [];
    let cryptoRows = '';
    try {
      const r = await fetch(
        `https://api.coingecko.com/api/v3/coins/markets` +
        `?vs_currency=${currency}&ids=${COIN_IDS.join(',')}` +
        `&order=market_cap_desc&per_page=10&sparkline=false`
      );
      if (ep !== _epoch) return;
      coins = await r.json();
      if (ep !== _epoch) return;
      if (!Array.isArray(coins) || !coins.length) throw new Error('Empty response');
      cryptoRows = coins.map(coin => {
        const chg = coin.price_change_percentage_24h || 0;
        return `<div class="tv-row">
          <span class="tv-stk-s">${COIN_LABEL[coin.id] || coin.symbol.toUpperCase()}</span>
          <span class="tv-stk-n">${COIN_NAME[coin.id] || coin.name}</span>
          <span class="tv-stk-p">${_fmtPrice(coin.current_price, currSym)}</span>
          ${_chgHtml(chg)}
        </div>`;
      }).join('');
    } catch (err) {
      if (ep !== _epoch) return;
      const msg = err.message.includes('429') ? 'RATE LIMITED — RETRYING IN 60S...' : err.message;
      cryptoRows = `<div class="tv-mkt-err">CRYPTO DATA UNAVAILABLE — ${msg}</div>`;
    }

    // ── Global market overview (CoinGecko global + Fear & Greed) ────────────
    let overviewRows = '';
    const [globalRes, fngRes] = await Promise.all([
      fetch('https://api.coingecko.com/api/v3/global').then(r => r.json()).catch(() => null),
      fetch('https://api.alternative.me/fng/?limit=1').then(r => r.json()).catch(() => null),
    ]);
    if (ep !== _epoch) return;

    if (globalRes?.data) {
      const g    = globalRes.data;
      const mcap = g.total_market_cap?.[currency] ?? 0;
      const vol  = g.total_volume?.[currency] ?? 0;
      const btc  = g.market_cap_percentage?.btc ?? 0;
      const mcapChg = g.market_cap_change_percentage_24h_usd ?? 0;
      const fng  = fngRes?.data?.[0];
      const _big = n => n >= 1e12 ? `${(n / 1e12).toFixed(2)}T`
                      : n >= 1e9  ? `${(n / 1e9).toFixed(1)}B`
                      : `${n}`;
      // Derive top gainer / loser from coin data already fetched
      const sorted     = [...coins].sort((a, b) => (b.price_change_percentage_24h || 0) - (a.price_change_percentage_24h || 0));
      const topGainer  = sorted[0];
      const topLoser   = sorted[sorted.length - 1];

      overviewRows = `
        <div class="tv-row">
          <span class="tv-stk-s">MCAP</span>
          <span class="tv-stk-n">Global Market Cap</span>
          <span class="tv-stk-p">${currSym}${_big(mcap)}</span>
          ${_chgHtml(mcapChg)}
        </div>
        <div class="tv-row">
          <span class="tv-stk-s">VOL</span>
          <span class="tv-stk-n">24H Trading Volume</span>
          <span class="tv-stk-p">${currSym}${_big(vol)}</span>
          <span style="color:var(--tv-ph-dim)">— —</span>
        </div>
        <div class="tv-row">
          <span class="tv-stk-s">BTC</span>
          <span class="tv-stk-n">BTC Dominance</span>
          <span class="tv-stk-p">${btc.toFixed(1)}%</span>
          <span style="color:var(--tv-ph-dim)">— —</span>
        </div>
        ${fng ? `<div class="tv-row">
          <span class="tv-stk-s">F&amp;G</span>
          <span class="tv-stk-n">Fear &amp; Greed Index</span>
          <span class="tv-stk-p">${fng.value} — ${fng.value_classification.toUpperCase()}</span>
          <span style="color:var(--tv-ph-dim)">— —</span>
        </div>` : ''}
        ${topGainer ? `<div class="tv-row">
          <span class="tv-stk-s" style="color:#00ff99">↑ TOP</span>
          <span class="tv-stk-n">${COIN_NAME[topGainer.id] || topGainer.name}</span>
          <span class="tv-stk-p">${_fmtPrice(topGainer.current_price, currSym)}</span>
          ${_chgHtml(topGainer.price_change_percentage_24h || 0)}
        </div>` : ''}
        ${topLoser ? `<div class="tv-row">
          <span class="tv-stk-s" style="color:#ff4444">↓ BOT</span>
          <span class="tv-stk-n">${COIN_NAME[topLoser.id] || topLoser.name}</span>
          <span class="tv-stk-p">${_fmtPrice(topLoser.current_price, currSym)}</span>
          ${_chgHtml(topLoser.price_change_percentage_24h || 0)}
        </div>` : ''}`;
    }

    if (ep !== _epoch) return;
    c.innerHTML = `
      <div class="tv-mkt-hdr">
        <span class="tv-mkt-title" style="color:${ch.accent}">MARKETS — LIVE</span>
        <span class="tv-clock" id="tv-mkt-clk">${_nowTime()}</span>
      </div>
      <div class="tv-divider" style="border-color:${ch.accent}55"></div>
      <div class="tv-mkt-scroll">
        <div class="tv-section-lbl">CRYPTOCURRENCY (${currency.toUpperCase()})</div>
        <div class="tv-stk-block">${cryptoRows}</div>
        <div class="tv-section-lbl" style="margin-top:0.55rem">MARKET OVERVIEW</div>
        <div class="tv-stk-block">${overviewRows}</div>
      </div>
      <div class="tv-subtext">COINGECKO.COM · ALTERNATIVE.ME — AUTO-REFRESH 60S</div>`;
  };

  await fetchAll();
  // Single timer: tick clock every second, re-fetch data every 60 ticks
  let _tick = 0;
  _liveTimer = setInterval(() => {
    if (ep !== _epoch) return;
    const clk = document.querySelector('#tv-mkt-clk');
    if (clk) clk.textContent = _nowTime();
    if (++_tick % 60 === 0) fetchAll();
  }, 1000);
}

// ── ④ SPORTS — ESPN NBA + NFL + NHL scoreboards ───────────────────────────────
async function _sports(ch, ep) {
  const c = _div('tv-sports');
  _loading(c, 'FETCHING SPORTS DATA...');
  _content.appendChild(c);

  try {
    const [nba, nfl, nhl] = await Promise.all([
      fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard').then(r => r.json()).catch(() => null),
      fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard').then(r => r.json()).catch(() => null),
      fetch('https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard').then(r => r.json()).catch(() => null),
    ]);
    if (ep !== _epoch) return;

    const _renderLeague = (data, limit = 5) => {
      const events = (data?.events || []).slice(0, limit);
      if (!events.length) return `<div class="tv-no-games">NO GAMES SCHEDULED</div>`;
      return events.map(ev => {
        const comp   = ev.competitions[0];
        const home   = comp.competitors.find(t => t.homeAway === 'home') || comp.competitors[0];
        const away   = comp.competitors.find(t => t.homeAway === 'away') || comp.competitors[1];
        const status = ev.status?.type?.shortDetail || ev.status?.type?.description || '';
        return `
          <div class="tv-game">
            <div class="tv-game-teams">
              <div class="tv-team">${away.team.abbreviation}<span class="tv-score">${away.score ?? '-'}</span></div>
              <div class="tv-team">${home.team.abbreviation}<span class="tv-score">${home.score ?? '-'}</span></div>
            </div>
            <span class="tv-game-st">${status}</span>
          </div>`;
      }).join('');
    };

    c.innerHTML = `
      <div class="tv-spt-hdr">
        <span class="tv-spt-title" style="color:${ch.accent}">SPORTS ROUNDUP</span>
        <span class="tv-clock">${_nowTime()}</span>
      </div>
      <div class="tv-divider" style="border-color:${ch.accent}55"></div>
      <div class="tv-spt-scroll">
        <div class="tv-section-lbl">🏀 NBA</div>
        <div class="tv-games">${_renderLeague(nba)}</div>
        <div class="tv-section-lbl" style="margin-top:0.6rem">🏈 NFL</div>
        <div class="tv-games">${_renderLeague(nfl)}</div>
        <div class="tv-section-lbl" style="margin-top:0.6rem">🏒 NHL</div>
        <div class="tv-games">${_renderLeague(nhl)}</div>
      </div>
      <div class="tv-subtext">SOURCE: ESPN.COM — UPDATED: ${_nowTime()}</div>`;

  } catch (err) {
    if (ep !== _epoch) return;
    _error(c, 'SPORTS DATA UNAVAILABLE', err.message);
  }
}

// ── ⑤ TEST SIGNAL ─────────────────────────────────────────────────────────────
// Colours approximate the SMPTE EG 1-1990 colour bar standard used by broadcast
// engineers to calibrate monitors. Exact SMPTE levels (75% saturation) would be
// #C0C000 etc. — here they are left at full-saturation CSS hex for visual impact.
const BARS = [
  ['#c0c0c0','WHITE'], ['#c0c000','YELLOW'], ['#00c0c0','CYAN'],   ['#00c000','GREEN'],
  ['#c000c0','MAGENTA'],['#c00000','RED'],   ['#0000c0','BLUE'],   ['#000000','BLACK'],
];

function _test(/* ch, ep */) {
  const barsHtml = BARS.map(([bg, lbl]) =>
    `<div class="tv-bar" style="background:${bg}"><span>${lbl}</span></div>`
  ).join('');
  const c = _div('tv-test');
  c.innerHTML = `
    <div class="tv-bars">${barsHtml}</div>
    <div class="tv-test-body">
      <div class="tv-test-title">THIS IS A TEST SIGNAL</div>
      <div class="tv-test-sub">PLEASE STAND BY</div>
      <div class="tv-test-time" id="tv-tt">${_nowTime()}</div>
      <div class="tv-subtext">CH 05 — BROADCAST TEST PATTERN — ACME TELEVISION INC.</div>
    </div>`;
  _content.appendChild(c);
  const el = c.querySelector('#tv-tt');
  // Update the clock every 1000 ms — the only live element on this channel.
  _liveTimer = setInterval(() => { if (el) el.textContent = _nowTime(); }, 1000);
}
