/**
 * tools/analytics.js
 * Site analytics dashboard — reads from site_visits + arcade_scores (Supabase).
 * Features:
 *   • Canvas traffic chart (area/line) with 7D / 14D / 30D period selector
 *   • Live auto-update via Supabase Realtime (postgres_changes on site_visits)
 *   • ASCII bar charts for visitor stats, room popularity, devices, browsers
 *   • Arcade leaderboard top scores
 *
 * NOTE: For live updates, enable Replication for site_visits in Supabase:
 *   Dashboard → Database → Replication → enable for site_visits
 *
 * Export: startTool(container)
 */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../config.js';

const API = SUPABASE_URL + '/rest/v1';
const HDR = {
  'apikey':        SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
};

const GREEN      = '#00ff41';
const GREEN_DIM  = '#00aa2b';
const GREEN_DARK = '#006618';
const BG         = '#040a04';

// ── ASCII chart helpers ───────────────────────────────────────────────────────

function bar(val, max, width = 20) {
  const filled = max > 0 ? Math.min(width, Math.round((val / max) * width)) : 0;
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

const SPARK = ' ▁▂▃▄▅▆▇█';
function sparkBlock(val, max) {
  if (max === 0) return '░';
  return SPARK[Math.min(8, Math.round((val / max) * 8))];
}

function pct(val, total) {
  return total ? (val / total * 100).toFixed(1) + '%' : '0.0%';
}

function fmt(n) { return Number(n).toLocaleString(); }

// ── Canvas traffic chart ──────────────────────────────────────────────────────

function drawTrafficChart(canvas, trendData, days) {
  const dpr  = window.devicePixelRatio || 1;
  const W    = canvas.parentElement?.clientWidth || 400;
  const H    = 160;

  canvas.width  = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const PAD = { top: 26, right: 16, bottom: 34, left: 38 };
  const gW  = W - PAD.left - PAD.right;
  const gH  = H - PAD.top  - PAD.bottom;

  // ─ Background ─
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  const counts = trendData.map(d => d.count);
  const maxVal = Math.max(...counts, 1);
  const n      = trendData.length;

  // ─ Compute point positions ─
  const pts = trendData.map((d, i) => ({
    x:     PAD.left + (n > 1 ? (i / (n - 1)) : 0.5) * gW,
    y:     PAD.top  + gH - (d.count / maxVal) * gH,
    count: d.count,
    label: d.label,
  }));

  // ─ Horizontal grid lines ─
  const gridSteps = 3;
  ctx.font     = `${9}px "Courier New", monospace`;
  ctx.fillStyle = GREEN_DIM;
  for (let i = 0; i <= gridSteps; i++) {
    const y = PAD.top + gH - (i / gridSteps) * gH;
    ctx.strokeStyle = i === 0 ? GREEN_DARK : 'rgba(0,102,24,0.5)';
    ctx.lineWidth   = 0.5;
    ctx.setLineDash(i === 0 ? [] : [2, 3]);
    ctx.beginPath();
    ctx.moveTo(PAD.left, y);
    ctx.lineTo(PAD.left + gW, y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Y-axis label
    const lv = Math.round((i / gridSteps) * maxVal);
    ctx.textAlign = 'right';
    ctx.fillStyle = GREEN_DIM;
    ctx.fillText(lv, PAD.left - 5, y + 3.5);
  }

  // ─ Vertical guide lines at each data point ─
  ctx.strokeStyle = 'rgba(0,102,24,0.25)';
  ctx.lineWidth   = 0.5;
  ctx.setLineDash([1, 4]);
  pts.forEach(p => {
    ctx.beginPath();
    ctx.moveTo(p.x, PAD.top);
    ctx.lineTo(p.x, PAD.top + gH);
    ctx.stroke();
  });
  ctx.setLineDash([]);

  // ─ Gradient fill under line ─
  const grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + gH);
  grad.addColorStop(0,   'rgba(0,255,65,0.20)');
  grad.addColorStop(0.6, 'rgba(0,255,65,0.06)');
  grad.addColorStop(1,   'rgba(0,255,65,0.01)');

  ctx.beginPath();
  ctx.moveTo(pts[0].x, PAD.top + gH);
  if (n === 1) {
    ctx.lineTo(pts[0].x, pts[0].y);
    ctx.lineTo(pts[0].x, PAD.top + gH);
  } else {
    pts.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(pts[n - 1].x, PAD.top + gH);
  }
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // ─ Line ─
  ctx.lineWidth   = 2;
  ctx.strokeStyle = GREEN;
  ctx.shadowColor = GREEN;
  ctx.shadowBlur  = 5;
  ctx.setLineDash([]);
  ctx.beginPath();
  if (n === 1) {
    ctx.moveTo(pts[0].x - 20, pts[0].y);
    ctx.lineTo(pts[0].x + 20, pts[0].y);
  } else {
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < n; i++) {
      const cpx = (pts[i - 1].x + pts[i].x) / 2;
      ctx.bezierCurveTo(cpx, pts[i - 1].y, cpx, pts[i].y, pts[i].x, pts[i].y);
    }
  }
  ctx.stroke();
  ctx.shadowBlur = 0;

  // ─ Dot markers ─
  pts.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle  = GREEN;
    ctx.shadowColor = GREEN;
    ctx.shadowBlur  = 7;
    ctx.fill();
    ctx.shadowBlur  = 0;
  });

  // ─ Count labels above dots (skip 0) ─
  ctx.fillStyle = GREEN;
  ctx.font      = '9px "Courier New", monospace';
  ctx.textAlign = 'center';
  pts.forEach(p => {
    if (p.count > 0) ctx.fillText(p.count, p.x, p.y - 8);
  });

  // ─ X-axis labels ─
  ctx.fillStyle = GREEN_DIM;
  ctx.font      = '9px "Courier New", monospace';
  ctx.textAlign = 'center';
  const skipEvery = days <= 7 ? 1 : days <= 14 ? 2 : 5;
  pts.forEach((p, i) => {
    if (!p.label || (days > 7 && i % skipEvery !== 0)) return;
    ctx.fillText(p.label, p.x, PAD.top + gH + 14);
  });

  // ─ Scanline CRT effect ─
  for (let y = 0; y < H; y += 3) {
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.fillRect(0, y, W, 1);
  }

  // ─ Chart border ─
  ctx.strokeStyle = GREEN_DARK;
  ctx.lineWidth   = 1;
  ctx.setLineDash([]);
  ctx.strokeRect(PAD.left, PAD.top, gW, gH);
}

// ── Compute trend for N days ──────────────────────────────────────────────────

function computeTrend(visits, days) {
  const now = new Date();
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d  = new Date(now);
    d.setDate(d.getDate() - i);
    const ds = d.toISOString().slice(0, 10);

    let label;
    if (days <= 7) {
      label = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
    } else {
      label = `${d.getMonth() + 1}/${d.getDate()}`;
    }

    result.push({
      label,
      date:  ds,
      count: visits.filter(v => v.created_at.slice(0, 10) === ds).length,
    });
  }
  return result;
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchTotalCount() {
  const res = await fetch(`${API}/site_visits?select=id&limit=1`, {
    headers: { ...HDR, 'Prefer': 'count=exact' },
  });
  const cr = res.headers.get('content-range'); // "0-0/TOTAL"
  return cr ? parseInt(cr.split('/')[1], 10) || 0 : 0;
}

async function fetchRecentVisits() {
  // Fetch last 30 days — covers all period options (7D / 14D / 30D)
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const url = `${API}/site_visits`
    + `?created_at=gte.${encodeURIComponent(since)}`
    + `&select=session_id,room,device,browser,created_at`
    + `&order=created_at.asc`
    + `&limit=5000`;
  const res = await fetch(url, { headers: HDR });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchArcadeTop() {
  const games   = ['pong', 'galaga', 'breakout'];
  const results = {};
  await Promise.all(games.map(async game => {
    const url = `${API}/arcade_scores`
      + `?game=eq.${game}`
      + `&order=score.desc`
      + `&limit=1`
      + `&select=player_name,score`;
    const res = await fetch(url, { headers: HDR });
    if (res.ok) {
      const data = await res.json();
      results[game] = data[0] ?? null;
    }
  }));
  return results;
}

// ── Data processing ───────────────────────────────────────────────────────────

function processData(visits) {
  const now      = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const weekAgo  = new Date(now - 7 * 86400000);

  const todayVisits    = visits.filter(v => v.created_at.slice(0, 10) === todayStr);
  const weekVisits     = visits.filter(v => new Date(v.created_at) >= weekAgo);
  const uniqueSessions = new Set(visits.map(v => v.session_id)).size;

  // 7-day trend for the ASCII sparkline/bar section (kept as-is)
  const trend = computeTrend(visits, 7);

  // Room breakdown
  const roomMap = {};
  for (const v of visits) roomMap[v.room] = (roomMap[v.room] || 0) + 1;
  const rooms = Object.entries(roomMap)
    .sort((a, b) => b[1] - a[1])
    .map(([room, count]) => ({ room: room.toUpperCase(), count }));

  // Device breakdown
  const devMap = {};
  for (const v of visits) {
    const k = v.device || 'unknown';
    devMap[k] = (devMap[k] || 0) + 1;
  }
  const devices = Object.entries(devMap)
    .sort((a, b) => b[1] - a[1])
    .map(([device, count]) => ({ device: device.toUpperCase(), count }));

  // Browser breakdown
  const brMap = {};
  for (const v of visits) {
    const k = v.browser || 'unknown';
    brMap[k] = (brMap[k] || 0) + 1;
  }
  const browsers = Object.entries(brMap)
    .sort((a, b) => b[1] - a[1])
    .map(([browser, count]) => ({ browser: browser.toUpperCase(), count }));

  return { todayCount: todayVisits.length, weekCount: weekVisits.length,
           total30days: visits.length, uniqueSessions, trend, rooms, devices, browsers };
}

// ── Render stats (ASCII sections) ─────────────────────────────────────────────

function renderStats(statsOutput, totalCount, data, arcade) {
  statsOutput.innerHTML = '';

  function el(tag, cls = '', text = '') {
    const e = document.createElement(tag);
    if (cls)  e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  function section(title) {
    const s = el('div', 'pc-tool-section');
    s.appendChild(el('div', 'pc-tool-header', title));
    statsOutput.appendChild(s);
    return s;
  }

  function line(parent, text, cls = 'pc-tool-dim') {
    const d = el('div', cls);
    d.style.cssText = 'white-space:pre;font-size:0.8em;line-height:1.65;font-family:inherit;';
    d.textContent = text;
    parent.appendChild(d);
  }

  // ── OVERVIEW ──
  const ov    = section('OVERVIEW');
  const ovMax = Math.max(totalCount, data.weekCount, data.todayCount, 1);
  line(ov, `  TOTAL SESSIONS      ${bar(totalCount,          ovMax, 16)}  ${fmt(totalCount).padStart(6)}`);
  line(ov, `  THIS WEEK           ${bar(data.weekCount,      ovMax, 16)}  ${fmt(data.weekCount).padStart(6)}`);
  line(ov, `  TODAY               ${bar(data.todayCount,     ovMax, 16)}  ${fmt(data.todayCount).padStart(6)}`);
  line(ov, `  UNIQUE (30D)        ${bar(data.uniqueSessions, ovMax, 16)}  ${fmt(data.uniqueSessions).padStart(6)}`);

  // ── 7-DAY TREND (ASCII) ──
  const tr   = section('7-DAY  TREND');
  const tMax = Math.max(...data.trend.map(t => t.count), 1);

  const sparks = data.trend.map(t => sparkBlock(t.count, tMax)).join('    ');
  line(tr, `  ${sparks}`);
  const lblRow = data.trend.map(t => t.label.slice(0, 3).padStart(1)).join('    ');
  line(tr, `  ${lblRow}`, 'pc-tool-dim');
  line(tr, '');
  for (const t of data.trend) {
    const b = bar(t.count, tMax, 14);
    line(tr, `  ${t.label.padEnd(3)}  ${b}  ${String(t.count).padStart(4)}`);
  }

  // ── ROOMS ──
  if (data.rooms.length) {
    const rm     = section('ROOMS  (LAST 30 DAYS)');
    const rMax   = data.rooms[0].count;
    const rTotal = data.rooms.reduce((s, r) => s + r.count, 0);
    for (const r of data.rooms) {
      line(rm,
        `  ${r.room.padEnd(12)} ${bar(r.count, rMax, 14)}  ${String(r.count).padStart(5)}  ${pct(r.count, rTotal).padStart(6)}`
      );
    }
  }

  // ── DEVICES ──
  if (data.devices.length) {
    const dv      = section('DEVICES');
    const dvMax   = data.devices[0].count;
    const dvTotal = data.devices.reduce((s, d) => s + d.count, 0);
    for (const d of data.devices) {
      line(dv, `  ${d.device.padEnd(10)} ${bar(d.count, dvMax, 18)}  ${pct(d.count, dvTotal)}`);
    }
  }

  // ── BROWSERS ──
  if (data.browsers.length) {
    const br      = section('BROWSERS');
    const brMax   = data.browsers[0].count;
    const brTotal = data.browsers.reduce((s, b) => s + b.count, 0);
    for (const b of data.browsers) {
      line(br, `  ${b.browser.padEnd(10)} ${bar(b.count, brMax, 18)}  ${pct(b.count, brTotal)}`);
    }
  }

  // ── ARCADE STATS ──
  const ar = section('ARCADE  STATS');
  for (const [game, top] of Object.entries(arcade)) {
    if (top) {
      line(ar,
        `  ${game.toUpperCase().padEnd(10)}  TOP: ${top.player_name.padEnd(16)}  ${fmt(top.score)} PTS`,
        'pc-tool-success'
      );
    } else {
      line(ar, `  ${game.toUpperCase().padEnd(10)}  —  no scores yet`);
    }
  }
}

// ── Tool entry point ──────────────────────────────────────────────────────────

export function startTool(container) {
  container.style.display       = 'flex';
  container.style.flexDirection = 'column';

  // ── State ──
  let _visits     = [];   // last fetched 30-day visits
  let _total      = 0;
  let _arcade     = {};
  let _period     = 7;    // active chart period: 7 | 14 | 30
  let _debounce   = null;
  let _rtChannel  = null;
  let _rtClient   = null;
  let _destroyed  = false;

  // ── Control bar ──
  const ctrlBar = document.createElement('div');
  ctrlBar.style.cssText = 'display:flex;align-items:center;gap:0.5rem;margin-bottom:0.45rem;flex-shrink:0;flex-wrap:wrap;row-gap:0.3rem;';

  const titleEl = document.createElement('span');
  titleEl.className = 'pc-tool-dim';
  titleEl.style.cssText = 'font-size:0.75em;letter-spacing:0.1em;margin-right:0.3rem;';
  titleEl.textContent = '⬡ ANALYTICS.EXE';

  // Period buttons
  const periodWrap = document.createElement('div');
  periodWrap.style.cssText = 'display:flex;gap:2px;';

  const periods = [7, 14, 30];
  const periodBtns = {};
  periods.forEach(d => {
    const btn = document.createElement('button');
    btn.className   = 'pc-tool-btn';
    btn.textContent = `${d}D`;
    btn.style.cssText = 'padding:0.15rem 0.45rem;font-size:0.75em;';
    btn.addEventListener('click', () => {
      if (_period === d) return;
      _period = d;
      updatePeriodBtns();
      if (_visits.length) redrawChart();
    });
    periodBtns[d] = btn;
    periodWrap.appendChild(btn);
  });

  function updatePeriodBtns() {
    periods.forEach(d => {
      const btn = periodBtns[d];
      btn.style.color       = d === _period ? BG : '';
      btn.style.background  = d === _period ? GREEN : '';
      btn.style.borderColor = d === _period ? GREEN : '';
    });
  }
  updatePeriodBtns();

  // Live indicator
  const liveEl = document.createElement('span');
  liveEl.style.cssText = 'font-size:0.75em;letter-spacing:0.06em;transition:color 0.3s;flex-shrink:0;';
  setLiveState('off');

  function setLiveState(state) {
    if      (state === 'on')   { liveEl.style.color = GREEN;      liveEl.textContent = '● LIVE'; liveEl.style.textShadow = `0 0 8px ${GREEN}`; }
    else if (state === 'wait') { liveEl.style.color = GREEN_DIM;  liveEl.textContent = '○ CONNECTING'; liveEl.style.textShadow = 'none'; }
    else                       { liveEl.style.color = '#f7d05a';  liveEl.textContent = '○ OFFLINE';    liveEl.style.textShadow = 'none'; }
  }

  const refreshBtn = document.createElement('button');
  refreshBtn.className   = 'pc-tool-btn';
  refreshBtn.textContent = '[ REFRESH ]';
  refreshBtn.style.marginLeft = 'auto';

  const statusEl = document.createElement('span');
  statusEl.className = 'pc-tool-dim';
  statusEl.style.cssText = 'font-size:0.72em;flex-shrink:0;';

  ctrlBar.append(titleEl, periodWrap, liveEl, refreshBtn, statusEl);
  container.appendChild(ctrlBar);

  // ── Scrollable body ──
  const scrollWrap = document.createElement('div');
  scrollWrap.style.cssText = 'flex:1;overflow-y:auto;display:flex;flex-direction:column;';
  container.appendChild(scrollWrap);

  // ── Chart section (persists between data reloads) ──
  const chartWrap = document.createElement('div');
  chartWrap.style.cssText = 'flex-shrink:0;margin-bottom:0.5rem;';

  const chartHeader = document.createElement('div');
  chartHeader.className = 'pc-tool-header';
  chartHeader.textContent = 'TRAFFIC  CHART';
  chartWrap.appendChild(chartHeader);

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;background:' + BG + ';border:1px solid ' + GREEN_DARK + ';';
  chartWrap.appendChild(canvas);
  scrollWrap.appendChild(chartWrap);

  // ── Stats section ──
  const statsOutput = document.createElement('div');
  scrollWrap.appendChild(statsOutput);

  // ── Chart draw ──
  function redrawChart() {
    const trend = computeTrend(_visits, _period);
    drawTrafficChart(canvas, trend, _period);
  }

  // ── Full render ──
  function renderAll() {
    redrawChart();
    renderStats(statsOutput, _total, processData(_visits), _arcade);
  }

  // ── Load data ──
  async function load() {
    refreshBtn.disabled = true;
    statusEl.textContent = '';

    // Show loading placeholder in stats area only
    statsOutput.innerHTML = '';
    const loadEl = document.createElement('div');
    loadEl.className = 'pc-tool-dim';
    loadEl.style.cssText = 'white-space:pre;font-size:0.82em;padding-top:0.4rem;';
    loadEl.textContent = '  Fetching analytics data…';
    statsOutput.appendChild(loadEl);

    try {
      const [total, recent, arcadeTop] = await Promise.all([
        fetchTotalCount(),
        fetchRecentVisits(),
        fetchArcadeTop(),
      ]);
      _total  = total;
      _visits = recent;
      _arcade = arcadeTop;
      renderAll();
      statusEl.textContent = `↺ ${new Date().toLocaleTimeString()}`;
    } catch (err) {
      statsOutput.innerHTML = '';
      const errEl = document.createElement('div');
      errEl.className = 'pc-tool-warn';
      errEl.style.cssText = 'font-size:0.82em;padding-top:0.5rem;white-space:pre;';
      errEl.textContent = `  ✗  ${err.message || 'Load failed'}`;
      statsOutput.appendChild(errEl);
      statusEl.textContent = 'ERROR';
    }

    refreshBtn.disabled = false;
  }

  // ── Supabase Realtime subscription ──
  function subscribeRealtime() {
    if (!window.supabase?.createClient) {
      setLiveState('off');
      return;
    }
    setLiveState('wait');

    _rtClient  = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    _rtChannel = _rtClient
      .channel('analytics-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'site_visits' },
        () => {
          if (_destroyed) return;
          // Debounce: wait 2 s for any additional inserts before re-fetching
          clearTimeout(_debounce);
          _debounce = setTimeout(() => {
            if (!_destroyed) load();
          }, 2000);
        }
      )
      .subscribe(status => {
        if (_destroyed) return;
        if      (status === 'SUBSCRIBED')   setLiveState('on');
        else if (status === 'CLOSED')       setLiveState('off');
        else if (status === 'CHANNEL_ERROR') setLiveState('off');
        else                                setLiveState('wait');
      });
  }

  // ── Cleanup when window is closed ──
  const observer = new MutationObserver(() => {
    if (!document.contains(container)) {
      _destroyed = true;
      clearTimeout(_debounce);
      if (_rtChannel) { _rtChannel.unsubscribe(); _rtChannel = null; }
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // ── Wire up & start ──
  refreshBtn.addEventListener('click', load);
  subscribeRealtime();
  load();
}
