/**
 * tools/panalyze.js
 * Password strength analyzer + HIBP breach check.
 * Renders into a .pc-window-content container.
 *
 * Export: startTool(container)
 */

import { sfx } from '../../audio/audio-manager.js';

// ── Password analysis helpers ─────────────────────────────────────────────────

const COMMON_PW = new Set([
  'password','password1','password123','123456','12345678','123456789',
  '1234567890','12345','1234567','qwerty','qwerty123','abc123',
  'iloveyou','admin','welcome','monkey','dragon','master','sunshine',
  'princess','shadow','superman','michael','jessica','football',
  'baseball','soccer','hockey','batman','letmein','passw0rd',
  'trustno1','1q2w3e4r','1qaz2wsx','qazwsx','asdfgh','zxcvbn',
  'qwertyuiop','111111','222222','333333','444444','555555','666666',
  '777777','888888','999999','000000','aaaaaa','123123','121212',
  '112233','123321','password2','p@ssword','p@ssw0rd','pass123',
  'login','hello','guest','test','root','admin123','abcdef',
  'love','money','freedom','summer','winter','changeme','secret',
]);
const KB_ROWS = ['qwertyuiop','asdfghjkl','zxcvbnm','1234567890'];

function calcEntropy(pw) {
  let pool = 0;
  if (/[a-z]/.test(pw))         pool += 26;
  if (/[A-Z]/.test(pw))         pool += 26;
  if (/[0-9]/.test(pw))         pool += 10;
  if (/[^a-zA-Z0-9]/.test(pw)) pool += 32;
  return pool > 0 ? Math.floor(pw.length * Math.log2(pool)) : 0;
}

function detectPatterns(pw) {
  const issues = [], lo = pw.toLowerCase();
  if (COMMON_PW.has(lo))          issues.push({ sev:'high',   text:'Very common password — in breach databases' });
  if (/(.)\1{2,}/.test(pw))       issues.push({ sev:'medium', text:'Repeated characters  (aaa / 111)' });
  let seqL = false;
  for (let i = 0; i <= lo.length-3; i++) {
    const a=lo.charCodeAt(i),b=lo.charCodeAt(i+1),c=lo.charCodeAt(i+2);
    const al=v=>v>=97&&v<=122;
    if (al(a)&&al(b)&&al(c)&&(b===a+1&&c===b+1||b===a-1&&c===b-1)){seqL=true;break;}
  }
  if (seqL) issues.push({ sev:'low', text:'Sequential letters  (abc / cba)' });
  let seqD = false;
  for (let i = 0; i <= pw.length-3; i++) {
    const a=pw.charCodeAt(i),b=pw.charCodeAt(i+1),c=pw.charCodeAt(i+2);
    const dg=v=>v>=48&&v<=57;
    if (dg(a)&&dg(b)&&dg(c)&&(b===a+1&&c===b+1||b===a-1&&c===b-1)){seqD=true;break;}
  }
  if (seqD) issues.push({ sev:'low', text:'Sequential digits  (123 / 321)' });
  let kbWalk=false;
  outer: for (const row of KB_ROWS) {
    const rev=row.split('').reverse().join('');
    for (let i=0;i<=lo.length-4;i++){
      const s=lo.slice(i,i+4);
      if(row.includes(s)||rev.includes(s)){kbWalk=true;break outer;}
    }
  }
  if (kbWalk)              issues.push({ sev:'medium', text:'Keyboard walk  (qwert / asdf)' });
  if (/^[0-9]+$/.test(pw)) issues.push({ sev:'medium', text:'Digits only' });
  if (/^[a-zA-Z]+$/.test(pw)) issues.push({ sev:'low', text:'Letters only' });
  return issues;
}

function calcScore(pw, ent, pats) {
  const len=pw.length; let s=0;
  s+=len>=16?25:len>=12?20:len>=10?15:len>=8?10:len>=5?5:0;
  const t=[/[a-z]/,/[A-Z]/,/[0-9]/,/[^a-zA-Z0-9]/].filter(r=>r.test(pw)).length;
  s+=({4:25,3:18,2:10,1:0,0:0})[t]??0;
  s+=ent>=80?30:ent>=60?25:ent>=50?20:ent>=36?15:ent>=28?8:0;
  let ps=20;
  for (const p of pats) ps-=p.sev==='high'?20:p.sev==='medium'?10:5;
  s+=Math.max(0,ps);
  return Math.min(100,s);
}

function strengthLabel(sc) {
  if (sc>=80) return ['VERY STRONG','pc-tool-success'];
  if (sc>=60) return ['STRONG',     'pc-tool-success'];
  if (sc>=40) return ['FAIR',       'pc-tool-warn'];
  if (sc>=20) return ['WEAK',       'pc-tool-danger'];
  return              ['VERY WEAK', 'pc-tool-danger'];
}

function getComp(pw) {
  let lo=0,up=0,di=0,sy=0;
  for (const ch of pw) {
    if (/[a-z]/.test(ch)) lo++;
    else if (/[A-Z]/.test(ch)) up++;
    else if (/[0-9]/.test(ch)) di++;
    else sy++;
  }
  return {lo,up,di,sy};
}

function bar(n, max, w=18) {
  const f=max>0?Math.round((n/max)*w):0;
  return '█'.repeat(f)+'░'.repeat(w-f);
}

function getSuggestions(pw, sc, ent, pats, cm) {
  const s=[];
  if (pw.length<12)   s.push('Use at least 12 characters');
  if (cm.up===0)      s.push('Add uppercase letters  (A-Z)');
  if (cm.di===0)      s.push('Include at least one digit  (0-9)');
  if (cm.sy===0)      s.push('Add special characters  (!@#$%^&*)');
  if (pats.some(p=>p.sev==='high'||p.sev==='medium')) s.push('Avoid predictable patterns');
  if (s.length===0&&sc>=80) s.push('Strong password! Store in a password manager.');
  if (s.length===0&&sc>=60) s.push('Good — adding a symbol would make it stronger.');
  return s;
}

async function hibpCheck(pw) {
  const buf  = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(pw));
  const hex  = Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
  const prefix=hex.slice(0,5), suffix=hex.slice(5);
  const res  = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`,{headers:{'Add-Padding':'true'}});
  if (!res.ok) throw new Error('HTTP '+res.status);
  for (const line of (await res.text()).split('\r\n')) {
    const [s,c]=line.split(':');
    if (s===suffix) return parseInt(c,10);
  }
  return 0;
}

// ── Tool entry point ──────────────────────────────────────────────────────────

export function startTool(container) {
  // ─ Layout: prompt on top, scrollable output below ─
  const prompt = document.createElement('div');
  prompt.style.cssText = 'flex-shrink:0;margin-bottom:0.5rem;';

  const inputRow = document.createElement('div');
  inputRow.className = 'pc-tool-row';
  inputRow.style.flexWrap = 'nowrap';

  const promptLabel = document.createElement('span');
  promptLabel.className = 'pc-tool-label';
  promptLabel.textContent = 'C:\\PANALYZE> ';
  promptLabel.style.minWidth = 'auto';

  const inp = document.createElement('input');
  inp.className = 'pc-tool-input';
  inp.type = 'password';
  inp.placeholder = 'type password…';
  inp.setAttribute('autocomplete','off');
  inp.setAttribute('autocorrect','off');
  inp.setAttribute('autocapitalize','off');
  inp.setAttribute('spellcheck','false');
  inp.style.marginBottom = '0';

  const checkBtn = document.createElement('button');
  checkBtn.className = 'pc-tool-btn';
  checkBtn.textContent = '[ HIBP ]';
  checkBtn.title = 'Check breach database (Enter)';
  checkBtn.style.flexShrink = '0';

  inputRow.append(promptLabel, inp, checkBtn);
  prompt.appendChild(inputRow);

  const hint = document.createElement('div');
  hint.className = 'pc-tool-dim';
  hint.style.cssText = 'font-size:0.72em;margin-top:0.2rem;';
  hint.textContent = 'Analysis runs locally. Breach check uses k-anonymity (HIBP). Press ENTER or [ HIBP ] to scan.';
  prompt.appendChild(hint);

  const output = document.createElement('div');
  output.className = 'pc-tool-result';
  output.style.cssText = 'flex:1;overflow-y:auto;white-space:pre-wrap;word-break:break-word;';

  container.appendChild(prompt);
  container.appendChild(output);
  container.style.display = 'flex';
  container.style.flexDirection = 'column';

  // ─ Helpers ─
  function line(text='', cls='') {
    const d = document.createElement('div');
    if (cls) d.className = cls;
    d.textContent = text;
    output.appendChild(d);
    output.scrollTop = output.scrollHeight;
  }

  function showAnalysis(pw) {
    const ent=calcEntropy(pw), pats=detectPatterns(pw);
    const sc=calcScore(pw,ent,pats), cm=getComp(pw);
    const sugg=getSuggestions(pw,sc,ent,pats,cm);
    const [slabel,scls]=strengthLabel(sc);
    const total=pw.length||1;
    output.innerHTML='';
    line();
    line(`  SCORE    [${bar(sc,100,22)}]  ${sc}/100`);
    line(`  STRENGTH  ${slabel}`, scls);
    line();
    line(`  ENTROPY   ${ent} bits`);
    line(`  LENGTH    ${pw.length} chars`);
    line();
    line('  COMPOSITION:');
    line(`   a-z  [${bar(cm.lo,total,14)}]  ${cm.lo}`);
    line(`   A-Z  [${bar(cm.up,total,14)}]  ${cm.up}`);
    line(`   0-9  [${bar(cm.di,total,14)}]  ${cm.di}`);
    line(`   !@#  [${bar(cm.sy,total,14)}]  ${cm.sy}`);
    line();
    line('  PATTERNS:');
    if (pats.length===0) {
      line('   ✓ None detected','pc-tool-success');
    } else {
      for (const p of pats) {
        const icon=p.sev==='high'?'✗':p.sev==='medium'?'⚠':'·';
        const cls=p.sev==='high'?'pc-tool-danger':p.sev==='medium'?'pc-tool-warn':'pc-tool-dim';
        line(`   ${icon} ${p.text}`,cls);
      }
    }
    line();
    line('  SUGGESTIONS:');
    for (const s of sugg) line(`   > ${s}`,'pc-tool-dim');
    line();
    line('  ─────────────────────────────────────────────','pc-tool-dim');
    line('  Press ENTER or [ HIBP ] for breach scan','pc-tool-dim');
  }

  let _running=false;
  async function doHibp() {
    const pw=inp.value;
    if (!pw) { line(); line('  > Type a password first.','pc-tool-warn'); return; }
    if (_running) return;
    _running=true;
    checkBtn.textContent='[ SCANNING… ]';
    checkBtn.disabled=true;
    line();
    line('  ── HIBP BREACH CHECK ─────────────────────────','pc-tool-dim');
    line(`  Checking "${pw.slice(0,2)}${'*'.repeat(Math.max(0,pw.length-2))}"…`,'pc-tool-dim');
    try {
      const count=await hibpCheck(pw);
      if (count>0) {
        line(`  ✗  COMPROMISED — found ${count.toLocaleString()} times!`,'pc-tool-danger');
        line('  Do NOT use this password.','pc-tool-danger');
      } else {
        line('  ✓  Not found in known breach databases.','pc-tool-success');
        line('  (Still use a unique password everywhere.)','pc-tool-dim');
      }
    } catch {
      line('  ✗  Network error — check your connection.','pc-tool-warn');
    }
    line(); _running=false;
    checkBtn.textContent='[ HIBP ]'; checkBtn.disabled=false;
  }

  // ─ Events ─
  inp.addEventListener('input', () => {
    sfx('pc-type');
    const val=inp.value;
    if (!val) { output.innerHTML=''; return; }
    showAnalysis(val);
  });

  inp.addEventListener('keydown', e => {
    if (e.key==='Enter') { e.stopPropagation(); sfx('pc-enter-key'); doHibp(); }
  });

  checkBtn.addEventListener('click', doHibp);

  // Focus the input
  setTimeout(() => inp.focus(), 80);
}
