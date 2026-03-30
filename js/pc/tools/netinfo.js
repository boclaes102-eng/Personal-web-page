/**
 * tools/netinfo.js
 * Network / system info:
 *   • Fetches public IP + geolocation via ipapi.co (HTTPS, no key needed)
 *   • Shows browser / platform fingerprint (no tracking — runs client-side only)
 *
 * Export: startTool(container)
 */

// ── DOM helpers ───────────────────────────────────────────────────────────────

function el(tag, cls='', text='') {
  const e = document.createElement(tag);
  if (cls)  e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function row(parent, label, value, cls='pc-tool-value') {
  const wrap = el('div','pc-tool-row');
  wrap.style.marginBottom = '0.2rem';

  const lbl = el('span','pc-tool-label', label);
  const val = el('span', cls, String(value ?? 'N/A'));
  wrap.append(lbl, val);
  parent.appendChild(wrap);
  return val;
}

// ── Browser fingerprint (client-side only) ─────────────────────────────────

function getBrowserInfo() {
  const nav = navigator;
  const ua  = nav.userAgent;

  // Best-effort browser name
  let browser = 'Unknown';
  if      (ua.includes('Firefox'))  browser = 'Firefox';
  else if (ua.includes('Edg/'))     browser = 'Edge';
  else if (ua.includes('OPR/'))     browser = 'Opera';
  else if (ua.includes('Chrome'))   browser = 'Chrome';
  else if (ua.includes('Safari'))   browser = 'Safari';

  // OS
  let os = 'Unknown';
  if      (ua.includes('Windows NT 10')) os = 'Windows 10/11';
  else if (ua.includes('Windows NT 6.3')) os = 'Windows 8.1';
  else if (ua.includes('Windows'))        os = 'Windows';
  else if (ua.includes('Mac OS X'))       os = 'macOS';
  else if (ua.includes('Linux'))          os = 'Linux';
  else if (ua.includes('Android'))        os = 'Android';
  else if (ua.includes('iPhone'))         os = 'iOS';

  const cookies  = nav.cookieEnabled ? 'Enabled' : 'Disabled';
  const lang     = nav.language || 'N/A';
  const langs    = (nav.languages||[]).join(', ') || lang;
  const cores    = nav.hardwareConcurrency || 'N/A';
  const mem      = nav.deviceMemory ? nav.deviceMemory + ' GB' : 'N/A';
  const screen_  = `${screen.width}×${screen.height}  (${screen.colorDepth}bpp)`;
  const tz       = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dnt      = nav.doNotTrack === '1' ? 'Enabled' : nav.doNotTrack === '0' ? 'Disabled' : 'N/A';

  return { browser, os, cookies, lang, langs, cores, mem, screen: screen_, tz, dnt };
}

// ── Tool entry point ──────────────────────────────────────────────────────────

export function startTool(container) {
  container.style.display    = 'flex';
  container.style.flexDirection = 'column';

  const output = el('div');
  output.style.cssText = 'flex:1;overflow-y:auto;';
  container.appendChild(output);

  function section(title) {
    const s = el('div','pc-tool-section');
    s.appendChild(el('div','pc-tool-header', title));
    output.appendChild(s);
    return s;
  }

  function status(text, cls='pc-tool-dim') {
    output.innerHTML = '';
    output.appendChild(el('div', cls, text));
  }

  // ─ Browser info (instant, no network) ─
  function renderBrowser() {
    const info = getBrowserInfo();
    const s = section('SYSTEM  &  BROWSER');

    row(s, 'Browser',   info.browser);
    row(s, 'OS',        info.os);
    row(s, 'Screen',    info.screen);
    row(s, 'CPU cores', info.cores);
    row(s, 'RAM',       info.mem);
    row(s, 'Language',  info.lang);
    row(s, 'Timezone',  info.tz);
    row(s, 'Cookies',   info.cookies);
    row(s, 'DNT flag',  info.dnt);

    const uaDiv = el('div');
    uaDiv.style.marginTop = '0.4rem';
    uaDiv.appendChild(el('div','pc-tool-dim','User-Agent:'));
    const uaVal = el('div','pc-tool-value pc-tool-mono');
    uaVal.style.cssText = 'font-size:0.72em;word-break:break-all;cursor:pointer;';
    uaVal.textContent = navigator.userAgent;
    uaVal.title = 'Click to copy';
    uaVal.addEventListener('click', () => {
      navigator.clipboard.writeText(navigator.userAgent).catch(()=>{});
      uaVal.textContent = '✓ copied!';
      setTimeout(() => { uaVal.textContent = navigator.userAgent; }, 1400);
    });
    uaDiv.appendChild(uaVal);
    s.appendChild(uaDiv);
  }

  // ─ IP / geo lookup ─
  async function fetchIP(targetIP='') {
    const ipSection = section('PUBLIC  IP  &  GEOLOCATION');
    const loadingEl = el('div','pc-tool-dim','  Fetching…');
    ipSection.appendChild(loadingEl);

    try {
      const url = targetIP
        ? `https://ipapi.co/${encodeURIComponent(targetIP)}/json/`
        : 'https://ipapi.co/json/';
      const res  = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const d = await res.json();

      if (d.error) throw new Error(d.reason || 'Invalid IP');

      loadingEl.remove();

      row(ipSection, 'IP Address', d.ip);
      row(ipSection, 'Type',       d.version || 'IPv4');
      row(ipSection, 'Country',    `${d.country_name} (${d.country_code})`);
      row(ipSection, 'Region',     d.region || 'N/A');
      row(ipSection, 'City',       d.city || 'N/A');
      row(ipSection, 'Postcode',   d.postal || 'N/A');
      row(ipSection, 'Latitude',   d.latitude ?? 'N/A');
      row(ipSection, 'Longitude',  d.longitude ?? 'N/A');
      row(ipSection, 'Timezone',   d.timezone || 'N/A');
      row(ipSection, 'UTC offset', d.utc_offset || 'N/A');
      row(ipSection, 'ISP / Org',  d.org || 'N/A');
      row(ipSection, 'ASN',        d.asn || 'N/A');

      const privacy = [];
      if (d.is_proxy)   privacy.push('PROXY');
      if (d.is_tor)     privacy.push('TOR');
      if (d.is_vpn)     privacy.push('VPN');
      if (d.is_hosting) privacy.push('HOSTING/DATACENTER');
      row(ipSection, 'Privacy flags', privacy.length ? privacy.join(', ') : 'None detected',
          privacy.length ? 'pc-tool-warn' : 'pc-tool-success');
    } catch (err) {
      loadingEl.className = 'pc-tool-warn';
      loadingEl.textContent = `  ✗  ${err.message || 'Lookup failed'}`;
    }
  }

  // ─ Lookup controls ─
  const lookupSection = el('div','pc-tool-section');
  lookupSection.style.flexShrink = '0';
  lookupSection.style.order = '-1'; // put at top before output

  // Actually, let's render browser info first, then add lookup form, then IP result
  renderBrowser();

  // Lookup row
  const ipSection2 = el('div','pc-tool-section');
  ipSection2.appendChild(el('div','pc-tool-header','LOOKUP A SPECIFIC IP'));

  const lookupRow = el('div','pc-tool-row');
  const ipInp = document.createElement('input');
  ipInp.className = 'pc-tool-input';
  ipInp.style.cssText = 'margin:0;flex:1;';
  ipInp.placeholder = 'Enter IP address (leave empty for your own)…';
  ipInp.setAttribute('autocomplete','off');
  ipInp.setAttribute('spellcheck','false');

  const lookupBtn = el('button','pc-tool-btn','[ LOOKUP ]');
  lookupBtn.style.flexShrink = '0';
  lookupRow.append(ipInp, lookupBtn);
  ipSection2.appendChild(lookupRow);
  output.appendChild(ipSection2);

  // ─ Initial load ─
  fetchIP();

  lookupBtn.addEventListener('click', () => {
    // Remove any previous IP section before fetching again
    const prev = output.querySelector('.pc-ip-result');
    if (prev) prev.remove();
    fetchIP(ipInp.value.trim());
  });

  ipInp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.stopPropagation(); lookupBtn.click(); }
  });
}
