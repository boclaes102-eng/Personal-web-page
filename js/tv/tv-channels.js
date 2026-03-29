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

'use strict';

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
let _epoch     = 0;   // incremented on every channel switch; stale async ops check this

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
      { timeout: 6000 }
    );
  });
}

async function _ipGeo() {
  try {
    const r = await fetch('https://ipapi.co/json/');
    const d = await r.json();
    return { lat: d.latitude, lon: d.longitude, city: d.city, country: d.country_name, cc: d.country_code || 'US' };
  } catch {
    // Hard fallback — Brussels
    return { lat: 50.85, lon: 4.35, city: 'Brussels', country: 'Belgium', cc: 'BE' };
  }
}

// ── Public API ────────────────────────────────────────────────────────────────
export function showTV(onClose) {
  _onClose = onClose;
  _curIdx  = 0;
  _startLocation();   // kick off location fetch in background
  _build();
  gsap.fromTo(_overlay,
    { scaleY: 0.005, opacity: 1 },
    { scaleY: 1, duration: 0.5, ease: 'power2.out',
      onComplete: () => _renderChannel(0) }
  );
}

export function hideTV(onComplete) {
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
function _loading(el, msg = 'FETCHING DATA...') {
  el.innerHTML = `<div class="tv-loading"><span class="tv-blink">▌</span> ${msg}</div>`;
}
function _error(el, msg, detail = '') {
  el.innerHTML = `<div class="tv-fetch-error">${msg}${detail ? `<br><span class="tv-err-detail">${detail}</span>` : ''}</div>`;
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

  // Build the ticker once (3 copies → seamless CSS loop)
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

// ── ② WEATHER — Open-Meteo + user geolocation ────────────────────────────────
async function _weather(ch, ep) {
  const c = _div('tv-weather');
  _loading(c, 'ACQUIRING LOCATION...');
  _content.appendChild(c);

  try {
    const loc = await _locationPromise;
    if (ep !== _epoch) return;

    _loading(c, 'FETCHING WEATHER DATA...');

    const r = await fetch(
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${loc.lat}&longitude=${loc.lon}` +
      `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m` +
      `&daily=temperature_2m_max,temperature_2m_min,weather_code` +
      `&timezone=auto&forecast_days=5`
    );
    if (ep !== _epoch) return;
    const d = await r.json();
    if (ep !== _epoch) return;

    const cur  = d.current;
    const wx   = _wxInfo(cur.weather_code);
    const days = d.daily;
    const forecast = days.time.slice(0, 5).map((t, i) => ({
      day: _dayName(t),
      wx:  _wxInfo(days.weather_code[i]),
      hi:  Math.round(days.temperature_2m_max[i]),
      lo:  Math.round(days.temperature_2m_min[i]),
    }));

    const dateStr = new Date().toLocaleDateString('en-GB', { weekday: 'long', month: 'long', day: 'numeric' });

    c.innerHTML = `
      <div class="tv-wx-header">
        <div class="tv-wx-city">${loc.city.toUpperCase()}, ${loc.country.toUpperCase()}</div>
        <div class="tv-wx-date">${dateStr}</div>
      </div>
      <div class="tv-wx-current">
        <div class="tv-wx-bigicon">${wx.icon}</div>
        <div>
          <div class="tv-wx-temp">${Math.round(cur.temperature_2m)}°C
            <span class="tv-wx-c">FEELS LIKE ${Math.round(cur.apparent_temperature)}°C</span>
          </div>
          <div class="tv-wx-cond">${wx.desc}</div>
        </div>
      </div>
      <div class="tv-wx-details">
        <span>HUMIDITY: ${cur.relative_humidity_2m}%</span>
        <span>WIND: ${Math.round(cur.wind_speed_10m)} KM/H</span>
      </div>
      <div class="tv-divider" style="border-color:${ch.accent}55"></div>
      <div class="tv-section-lbl">5-DAY FORECAST</div>
      <div class="tv-wx-forecast">
        ${forecast.map(f => `
          <div class="tv-wx-day">
            <div class="tv-wx-dn">${f.day}</div>
            <div class="tv-wx-ic">${f.wx.icon}</div>
            <div class="tv-wx-hi">${f.hi}°</div>
            <div class="tv-wx-lo">${f.lo}°</div>
          </div>`).join('')}
      </div>
      <div class="tv-subtext">SOURCE: OPEN-METEO.COM — UPDATED: <span id="tv-wx-upd">${_nowTime()}</span></div>`;

    // Refresh time label every minute
    _liveTimer = setInterval(() => {
      if (ep !== _epoch) return;
      const el = c.querySelector('#tv-wx-upd');
      if (el) el.textContent = _nowTime();
    }, 60000);

  } catch (err) {
    if (ep !== _epoch) return;
    _error(c, 'WEATHER DATA UNAVAILABLE', err.message);
  }
}

// ── ③ MARKETS — CoinGecko crypto prices ──────────────────────────────────────
const COIN_IDS   = ['bitcoin', 'ethereum', 'solana', 'binancecoin', 'cardano', 'ripple'];
const COIN_LABEL = { bitcoin:'BTC', ethereum:'ETH', solana:'SOL', binancecoin:'BNB', cardano:'ADA', ripple:'XRP' };
const COIN_NAME  = { bitcoin:'Bitcoin', ethereum:'Ethereum', solana:'Solana', binancecoin:'BNB', cardano:'Cardano', ripple:'Ripple' };
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

  const fetchCoins = async () => {
    try {
      const r = await fetch(
        `https://api.coingecko.com/api/v3/coins/markets` +
        `?vs_currency=${currency}&ids=${COIN_IDS.join(',')}` +
        `&order=market_cap_desc&per_page=6&sparkline=false`
      );
      if (ep !== _epoch) return;
      const coins = await r.json();
      if (ep !== _epoch) return;
      if (!Array.isArray(coins) || !coins.length) throw new Error('Empty response');

      const rows = coins.map(coin => {
        const chg   = coin.price_change_percentage_24h || 0;
        const col   = chg >= 0 ? '#00ff99' : '#ff4444';
        const arrow = chg >= 0 ? '▲' : '▼';
        const sign  = chg >= 0 ? '+' : '';
        const price = coin.current_price >= 1000
          ? coin.current_price.toLocaleString('en-US', { maximumFractionDigits: 0 })
          : coin.current_price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
        return `<div class="tv-row">
          <span class="tv-stk-s">${COIN_LABEL[coin.id] || coin.symbol.toUpperCase()}</span>
          <span class="tv-stk-n">${COIN_NAME[coin.id] || coin.name}</span>
          <span class="tv-stk-p">${currSym}${price}</span>
          <span style="color:${col}">${arrow} ${sign}${chg.toFixed(2)}%</span>
        </div>`;
      }).join('');

      c.innerHTML = `
        <div class="tv-mkt-hdr">
          <span class="tv-mkt-title" style="color:${ch.accent}">CRYPTO MARKETS — LIVE</span>
          <span class="tv-clock">${_nowTime()}</span>
        </div>
        <div class="tv-divider" style="border-color:${ch.accent}55"></div>
        <div class="tv-stk-block">${rows}</div>
        <div class="tv-subtext">SOURCE: COINGECKO.COM — PRICES IN ${currency.toUpperCase()} — AUTO-REFRESH 60S</div>`;

    } catch (err) {
      if (ep !== _epoch) return;
      // If rate-limited, show a gentle message rather than an error
      const msg = err.message.includes('429') ? 'RATE LIMITED — RETRYING IN 60S...' : err.message;
      _error(c, 'MARKET DATA UNAVAILABLE', msg);
    }
  };

  await fetchCoins();
  _liveTimer = setInterval(fetchCoins, 60000);
}

// ── ④ SPORTS — ESPN NBA scoreboard (no key needed) ───────────────────────────
async function _sports(ch, ep) {
  const c = _div('tv-sports');
  _loading(c, 'FETCHING SPORTS DATA...');
  _content.appendChild(c);

  try {
    const r = await fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard');
    if (ep !== _epoch) return;
    const d = await r.json();
    if (ep !== _epoch) return;

    const events = (d.events || []).slice(0, 6);

    if (!events.length) {
      c.innerHTML = `
        <div class="tv-spt-hdr">
          <span class="tv-spt-title" style="color:${ch.accent}">NBA — NO GAMES TODAY</span>
          <span class="tv-clock">${_nowTime()}</span>
        </div>
        <div class="tv-divider" style="border-color:${ch.accent}55"></div>
        <div class="tv-subtext">CHECK BACK ON GAME NIGHT — SOURCE: ESPN</div>`;
      return;
    }

    const rows = events.map(ev => {
      const comp = ev.competitions[0];
      const home = comp.competitors.find(t => t.homeAway === 'home') || comp.competitors[0];
      const away = comp.competitors.find(t => t.homeAway === 'away') || comp.competitors[1];
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

    c.innerHTML = `
      <div class="tv-spt-hdr">
        <span class="tv-spt-title" style="color:${ch.accent}">NBA — SCOREBOARD</span>
        <span class="tv-clock">${_nowTime()}</span>
      </div>
      <div class="tv-divider" style="border-color:${ch.accent}55"></div>
      <div class="tv-section-lbl">TODAY'S GAMES</div>
      <div class="tv-games">${rows}</div>
      <div class="tv-subtext">SOURCE: ESPN.COM — UPDATED: ${_nowTime()}</div>`;

  } catch (err) {
    if (ep !== _epoch) return;
    _error(c, 'SPORTS DATA UNAVAILABLE', err.message);
  }
}

// ── ⑤ TEST SIGNAL ─────────────────────────────────────────────────────────────
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
  _liveTimer = setInterval(() => { if (el) el.textContent = _nowTime(); }, 1000);
}
