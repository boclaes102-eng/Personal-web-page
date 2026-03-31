/**
 * github.js
 * GitHub profile launcher — boots a dramatic hype sequence, asks for confirmation,
 * then fires a glitch-transition to boclaes102-eng's GitHub page.
 *
 * Follows the startTool(container) contract used by all PC desktop tools.
 */

import { sfx } from '../../audio/audio-manager.js';

const GITHUB_URL = 'https://github.com/boclaes102-eng';

export function startTool(container) {
  container.innerHTML = '';

  const out = document.createElement('div');
  out.style.cssText = [
    'font-family: "Courier New", monospace',
    'font-size: 13px',
    'line-height: 1.65',
    'padding: 14px 18px',
    'height: 100%',
    'overflow-y: auto',
    'color: #00ff41',
    'box-sizing: border-box',
  ].join(';');
  container.appendChild(out);

  function line(text, color) {
    const d = document.createElement('div');
    d.textContent = text;
    if (color) d.style.color = color;
    out.appendChild(d);
    out.scrollTop = out.scrollHeight;
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  async function typeLine(text, color, delay = 13) {
    const d = document.createElement('div');
    if (color) d.style.color = color;
    out.appendChild(d);
    for (const ch of text) {
      d.textContent += ch;
      sfx('pc-type');
      out.scrollTop = out.scrollHeight;
      await sleep(delay);
    }
  }

  async function run() {
    await typeLine('SECUREOS NETWORK BROWSER v1.0');
    await sleep(220);
    await typeLine('');
    await typeLine('> Resolving host: github.com/boclaes102-eng ...');
    await sleep(500);
    await typeLine('> Connection established  [ 200 OK ]', '#00ff41');
    await sleep(300);
    await typeLine('> Fetching profile data ...');
    await sleep(600);
    await typeLine('');
    line('╔══════════════════════════════════════════════╗', '#00ff41');
    line('║         GITHUB PROFILE  //  CLASSIFIED       ║', '#00ff41');
    line('╚══════════════════════════════════════════════╝', '#00ff41');
    line('');
    await sleep(200);

    // ASCII octocat
    const art = [
      '           .---.           ',
      '          /o   o\\          ',
      '         |  ---  |         ',
      '          \\ ___ /          ',
      '          )  |  (          ',
      '         /_) | (_\\         ',
      '           GITHUB           ',
    ];
    for (const row of art) {
      line(row, '#ffcc00');
      await sleep(55);
    }
    await sleep(300);
    line('');
    await typeLine('  USER     :  boclaes102-eng', '#aaffaa');
    await sleep(80);
    await typeLine('  STATUS   :  LEGENDARY', '#ffff00');
    await sleep(80);
    await typeLine('  THREAT   :  MAXIMUM AWESOMENESS', '#ff8800');
    await sleep(80);
    await typeLine('  REPOS    :  ALL BANGERS, NO FILLERS', '#aaffaa');
    await sleep(200);
    line('');
    line('  ── INDEPENDENT REVIEW BOARD FINDINGS ────────', '#555555');
    line('');
    await typeLine('  "Quite possibly the greatest GitHub page');
    await typeLine('   ever to grace the internet."');
    await typeLine('   — Anonymous senior dev, 2025', '#555555');
    line('');
    await typeLine('  "10 out of 10. Would fork again."', '#ffaa00');
    await typeLine('   — The entire developer community', '#555555');
    line('');
    await typeLine('  "I opened one repo and immediately');
    await typeLine('   reconsidered my life choices."', '#ff6666');
    await typeLine('   — A very humbled engineer', '#555555');
    line('');
    line('  ── WARNING ────────────────────────────────', '#ff4444');
    await typeLine('  Visiting this profile may cause:');
    await typeLine('  · Sudden inspiration', '#ffff44');
    await typeLine('  · Uncontrollable urge to star everything', '#ffff44');
    await typeLine('  · Career-path reconsideration', '#ffff44');
    await typeLine('  · Feelings of inadequacy (yours, not his)', '#ffff44');
    line('');
    line('══════════════════════════════════════════════', '#00ff41');
    line('');
    await typeLine('  Do you REALLY want to proceed?', '#ffff00', 16);
    await typeLine('  There is no going back from what you', '#ffff00', 16);
    await typeLine('  are about to witness.', '#ffff00', 16);
    line('');

    // Confirmation buttons
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:20px;padding:6px 0 10px 14px;';

    const yes = document.createElement('button');
    yes.textContent = '[ Y ]  YES, SHOW ME THE GREATNESS';
    yes.style.cssText = [
      'background: #001a00',
      'border: 1px solid #00ff41',
      'color: #00ff41',
      'font-family: "Courier New",monospace',
      'font-size: 13px',
      'padding: 7px 18px',
      'cursor: pointer',
      'letter-spacing: 0.5px',
    ].join(';');

    const no = document.createElement('button');
    no.textContent = '[ N ]  ABORT  (coward)';
    no.style.cssText = [
      'background: #1a0000',
      'border: 1px solid #ff4444',
      'color: #ff4444',
      'font-family: "Courier New",monospace',
      'font-size: 13px',
      'padding: 7px 18px',
      'cursor: pointer',
      'letter-spacing: 0.5px',
    ].join(';');

    btnRow.append(yes, no);
    out.appendChild(btnRow);
    out.scrollTop = out.scrollHeight;

    yes.addEventListener('click', async () => {
      btnRow.remove();
      sfx('pc-enter-key');
      line('');
      await typeLine('  AUTHENTICATION PASSED.', '#00ff41');
      await sleep(150);
      await typeLine('  PREPARING LAUNCH SEQUENCE ...', '#00ff41');
      await sleep(120);

      // Progress bar
      const pbWrap = document.createElement('div');
      pbWrap.style.cssText = 'padding:4px 0 4px 14px;font-size:13px;color:#00ff41;font-family:monospace;';
      const pbFill = document.createElement('span');
      pbFill.textContent = '  [';
      const pbBar = document.createElement('span');
      pbBar.textContent = '                    ';
      const pbEnd = document.createElement('span');
      pbEnd.textContent = '] 0%';
      pbWrap.append(pbFill, pbBar, pbEnd);
      out.appendChild(pbWrap);
      out.scrollTop = out.scrollHeight;

      await new Promise(resolve => {
        let pct = 0;
        const id = setInterval(() => {
          pct += Math.floor(Math.random() * 18) + 8;
          if (pct >= 100) { pct = 100; clearInterval(id); resolve(); }
          const filled = Math.round(pct / 5);
          pbBar.textContent = '█'.repeat(filled) + ' '.repeat(20 - filled);
          pbEnd.textContent = `] ${pct}%`;
          out.scrollTop = out.scrollHeight;
        }, 60);
      });

      await sleep(120);
      line('  LAUNCHING ...', '#ffff00');
      out.scrollTop = out.scrollHeight;
      await sleep(250);
      _launchGlitch(GITHUB_URL);
    });

    no.addEventListener('click', async () => {
      btnRow.remove();
      sfx('pc-exit');
      line('');
      await typeLine('  ABORT CONFIRMED.', '#ff4444');
      await sleep(180);
      await typeLine('  Disappointing. Truly.', '#555555');
      await sleep(160);
      await typeLine('  The greatness will still be there', '#555555');
      await typeLine('  whenever you find your courage.', '#555555');
    });
  }

  run();
}

function _launchGlitch(url) {
  const overlay = document.createElement('div');
  overlay.style.cssText = [
    'position:fixed', 'top:0', 'left:0', 'width:100%', 'height:100%',
    'background:#000000', 'z-index:99999',
    'display:flex', 'align-items:center', 'justify-content:center',
    'flex-direction:column', 'gap:18px',
    'font-family:"Courier New",monospace',
  ].join(';');

  const msg = document.createElement('div');
  msg.style.cssText = 'color:#00ff41;font-size:22px;letter-spacing:3px;';
  msg.textContent = 'LAUNCHING...';

  const subMsg = document.createElement('div');
  subMsg.style.cssText = 'color:#555555;font-size:12px;letter-spacing:2px;';
  subMsg.textContent = 'github.com/boclaes102-eng';

  const barWrap = document.createElement('div');
  barWrap.style.cssText = 'width:360px;height:3px;background:#001800;border:1px solid #003300;';
  const barFill = document.createElement('div');
  barFill.style.cssText = 'height:100%;width:0%;background:#00ff41;transition:width 0.9s linear;';
  barWrap.appendChild(barFill);

  overlay.append(msg, barWrap, subMsg);
  document.body.appendChild(overlay);

  // Kick off fill bar
  requestAnimationFrame(() => { barFill.style.width = '100%'; });

  // Glitch flicker on the message
  const GLITCH_CHARS = '█▓▒░│╡╢╣║╗╝╜╛┐└┴┬├─┼╞╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌';
  let gi = 0;
  const glitch = setInterval(() => {
    if (gi >= 10) { clearInterval(glitch); msg.textContent = 'LAUNCHING...'; return; }
    if (gi % 2 === 0) {
      msg.textContent = Array.from({ length: 12 }, () =>
        GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)]
      ).join('');
    } else {
      msg.textContent = 'LAUNCHING...';
    }
    gi++;
  }, 70);

  setTimeout(() => {
    clearInterval(glitch);
    msg.textContent = '>> ACCESS GRANTED <<';
    msg.style.color = '#ffff00';
    setTimeout(() => {
      window.open(url, '_blank');
      overlay.remove();
    }, 380);
  }, 1050);
}
