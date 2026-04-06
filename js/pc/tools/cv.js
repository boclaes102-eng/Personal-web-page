/**
 * cv.js  —  Operator CV / Résumé viewer for SecureOS
 * Two-column layout: left sidebar (contact/skills) + right main (experience/education)
 */

export function startTool(container) {
  container.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;font-family:"Courier New",monospace;font-size:12px;color:#0f3;';

  // ── Top titlebar ─────────────────────────────────────────────────────────────
  const titlebar = document.createElement('div');
  titlebar.style.cssText = `
    padding: 7px 16px;
    border-bottom: 1px solid rgba(0,255,51,.3);
    flex-shrink: 0;
    display: flex;
    align-items: center;
  `;
  titlebar.innerHTML = `
    <span style="font-size:10px;letter-spacing:2px;opacity:.5;">C:\\OPERATOR\\PERSONNEL.DAT</span>
    <span style="margin-left:auto;font-size:10px;opacity:.3;">CLASSIFICATION: PUBLIC</span>
  `;

  // ── Name banner (full width) ──────────────────────────────────────────────────
  const banner = document.createElement('div');
  banner.style.cssText = `
    flex-shrink: 0;
    padding: 20px 24px 16px;
    border-bottom: 1px solid rgba(0,255,51,.2);
    background: rgba(0,255,51,.03);
  `;
  banner.innerHTML = `
    <div style="font-size:22px;font-weight:bold;letter-spacing:8px;text-shadow:0 0 20px #0f3;line-height:1;">BO CLAES</div>
    <div style="font-size:10px;letter-spacing:4px;opacity:.6;margin-top:5px;">FULL STACK DEVELOPER  &amp;  IOT ENGINEER  &amp;  CYBERSECURITY ANALYST</div>
  `;

  // ── Two-column body ───────────────────────────────────────────────────────────
  const isMobile = window.innerWidth < 680;
  const cols = document.createElement('div');
  cols.style.cssText = `display:flex;flex:1;overflow:hidden;flex-direction:${isMobile ? 'column' : 'row'};`;

  // Left column (sidebar)
  const left = document.createElement('div');
  left.id = 'cv-left';
  if (isMobile) {
    left.style.cssText = `
      width: 100%;
      flex-shrink: 0;
      overflow-y: auto;
      max-height: 45%;
      padding: 14px 16px;
      border-bottom: 1px solid rgba(0,255,51,.2);
      background: rgba(0,255,51,.02);
      scrollbar-width: thin;
      scrollbar-color: #006618 transparent;
    `;
  } else {
    left.style.cssText = `
      width: 210px;
      flex-shrink: 0;
      overflow-y: auto;
      padding: 20px 16px;
      border-right: 1px solid rgba(0,255,51,.2);
      background: rgba(0,255,51,.02);
      scrollbar-width: thin;
      scrollbar-color: #006618 transparent;
    `;
  }
  left.innerHTML = buildLeft(isMobile);

  // Right column (main content)
  const right = document.createElement('div');
  right.id = 'cv-right';
  right.style.cssText = `
    flex: 1;
    overflow-y: auto;
    padding: ${isMobile ? '14px 16px 32px' : '20px 22px 32px'};
    scrollbar-width: thin;
    scrollbar-color: #006618 transparent;
  `;
  right.innerHTML = buildRight();

  cols.append(left, right);
  // Inject scoped scrollbar styles for webkit + Firefox
  const style = document.createElement('style');
  style.textContent = `
    #cv-left::-webkit-scrollbar,
    #cv-right::-webkit-scrollbar        { width: 3px; }
    #cv-left::-webkit-scrollbar-track,
    #cv-right::-webkit-scrollbar-track  { background: transparent; }
    #cv-left::-webkit-scrollbar-thumb,
    #cv-right::-webkit-scrollbar-thumb  { background: #006618; border-radius: 2px; }
  `;
  container.appendChild(style);

  container.append(titlebar, banner, cols);
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function sectionTitle(text) {
  return `<div style="
    font-size:9px;letter-spacing:3px;margin-bottom:10px;padding-bottom:5px;
    border-bottom:1px solid rgba(0,255,51,.3);
    text-shadow:0 0 6px #0f3;
  ">${text}</div>`;
}

// ══════════════════════════════════════════════════════════════════════════════
// LEFT COLUMN
// ══════════════════════════════════════════════════════════════════════════════

function buildLeft(isMobile = false) {
  if (isMobile) {
    // On mobile: two-column grid of sections side-by-side
    return `
<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 20px;">
  <div>${contactBlock()}${divider()}${languagesBlock()}</div>
  <div>${skillsBlock()}${divider()}${softSkillsBlock()}</div>
</div>`;
  }
  return `
    ${contactBlock()}
    ${divider()}
    ${languagesBlock()}
    ${divider()}
    ${skillsBlock()}
    ${divider()}
    ${softSkillsBlock()}
  `;
}

function divider() {
  return `<div style="margin:18px 0;border-top:1px solid rgba(0,255,51,.12);"></div>`;
}

function contactBlock() {
  const items = [
    { label: 'EMAIL',    val: 'boclaes102@gmail.com' },
    { label: 'PHONE',    val: '+32 479 05 23 04' },
    { label: 'LOCATION', val: 'Langdorp, Belgium' },
    { label: 'LINKEDIN', val: 'linkedin.com/in/bo-claes-a20695233' },
    { label: 'GITHUB',   val: 'boclaes102-eng' },
  ];
  return `
<div style="margin-bottom:0;">
  ${sectionTitle('CONTACT')}
  ${items.map(i => `
  <div style="margin-bottom:10px;">
    <div style="font-size:9px;opacity:.4;letter-spacing:2px;margin-bottom:2px;">${i.label}</div>
    <div style="opacity:.85;word-break:break-all;line-height:1.4;">${i.val}</div>
  </div>`).join('')}
</div>`;
}

function languagesBlock() {
  const langs = [
    { lang: 'Dutch',   level: 'Native',       bar: 10 },
    { lang: 'English', level: 'Professional',  bar: 8  },
  ];
  return `
<div>
  ${sectionTitle('LANGUAGES')}
  ${langs.map(l => `
  <div style="margin-bottom:10px;">
    <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
      <span>${l.lang}</span>
      <span style="opacity:.4;font-size:10px;">${l.level}</span>
    </div>
    <div style="letter-spacing:2px;font-size:11px;">
      <span style="color:#0f3;">${'█'.repeat(l.bar)}</span><span style="opacity:.2;">${'█'.repeat(10 - l.bar)}</span>
    </div>
  </div>`).join('')}
</div>`;
}

function skillsBlock() {
  const groups = [
    { label: 'CLOUD & INFRA',  items: ['AWS', 'Azure', 'Linux', 'Git'] },
    { label: 'BACKEND',        items: ['PHP', 'Python', 'C#', 'SQL', 'Supabase'] },
    { label: 'FRONTEND',       items: ['JavaScript', 'HTML/CSS', 'Three.js'] },
    { label: 'CYBERSECURITY',  items: ['Firewall Management', 'Blue Team', 'Red Team', 'AD Audit', 'OpenVAS', 'Nessus', 'Burp Suite', 'Metasploit', 'SIEM', 'Incident Response', 'OWASP', 'CTF'] },
    { label: 'NETWORK',        items: ['IDS/IPS', 'VPN', 'Network Segmentation', 'Wireshark', 'Nmap'] },
    { label: 'HARDWARE / IOT', items: ['PCB Design', 'Soldering', 'Firmware', 'Arduino'] },
  ];
  return `
<div>
  ${sectionTitle('TECHNICAL SKILLS')}
  ${groups.map(g => `
  <div style="margin-bottom:10px;">
    <div style="font-size:9px;opacity:.4;letter-spacing:2px;margin-bottom:4px;">${g.label}</div>
    <div>${g.items.map(i => `<span style="
      display:inline-block;margin:2px 3px 2px 0;
      padding:1px 6px;
      border:1px solid rgba(0,255,51,.25);
      background:rgba(0,255,51,.04);
      font-size:10px;opacity:.85;
    ">${i}</span>`).join('')}</div>
  </div>`).join('')}
</div>`;
}

function softSkillsBlock() {
  const items = ['Critical Thinking', 'Problem-Solving', 'Adaptability', 'Communication', 'Digital Marketing', 'Team Leadership'];
  return `
<div>
  ${sectionTitle('SOFT SKILLS')}
  ${items.map(i => `
  <div style="margin-bottom:5px;opacity:.8;font-size:11px;">
    <span style="opacity:.4;margin-right:6px;">&rsaquo;</span>${i}
  </div>`).join('')}
</div>`;
}

// ══════════════════════════════════════════════════════════════════════════════
// RIGHT COLUMN
// ══════════════════════════════════════════════════════════════════════════════

function buildRight() {
  return `
    ${profileBlock()}
    ${experienceBlock()}
    ${educationBlock()}
    <div style="margin-top:28px;opacity:.2;font-size:9px;letter-spacing:3px;text-align:right;">── END OF FILE ──</div>
  `;
}

function profileBlock() {
  return `
<div style="margin-bottom:26px;">
  ${sectionTitle('PROFILE')}
  <p style="opacity:.8;line-height:1.8;margin:0;">
    Full Stack Developer, IoT Engineer, and aspiring Cybersecurity Analyst with hands-on experience
    across the complete software and hardware lifecycle. Combines deep development expertise with
    applied offensive and defensive security skills — including vulnerability assessment, firewall
    management, Active Directory auditing, and red/blue team exercises. Passionate about building
    secure, resilient systems and uncovering weaknesses before adversaries do.
  </p>
</div>`;
}

function experienceBlock() {
  const jobs = [
    {
      company: 'Cybersecurity Research &amp; Practice',
      role:    'Security Analyst — Independent &amp; Syntra Applied Projects',
      period:  '2025 — Present',
      bullets: [
        'Conducted vulnerability assessments on Windows and Linux server environments using OpenVAS and Nessus, producing detailed remediation reports with risk scoring and prioritised action plans.',
        'Performed Active Directory audits — identifying misconfigurations, privilege escalation paths, and stale account risks; implemented Group Policy hardening recommendations.',
        'Executed blue team exercises: configured and tuned firewall rulesets, deployed IDS/IPS monitoring, analysed SIEM logs, and led incident response simulations under realistic threat scenarios.',
        'Participated in red team engagements: internal network reconnaissance, exploitation with Metasploit and Burp Suite, lateral movement mapping, and post-engagement reporting.',
        'Competed in multiple Capture The Flag (CTF) competitions, gaining hands-on experience in web exploitation, reverse engineering, and cryptographic challenges.',
      ],
    },
    {
      company: 'Agilica',
      role:    'Fullstack Developer &amp; Software/Hardware Engineer',
      period:  '2024 — 2025',
      bullets: [
        'Architected and delivered full-stack feature expansions for mission-critical client software, improving performance and UX across production environments.',
        'Designed and assembled custom embedded hardware solutions including PCB soldering and low-level firmware integration.',
        'Led end-to-end webshop development and digital marketing strategy, driving measurable growth in online presence.',
      ],
    },
    {
      company: 'Karel de Grote Hogeschool',
      role:    'Lecturer — Programming &amp; IoT',
      period:  '2023 — 2024',
      bullets: [
        'Independently designed and delivered a full curriculum in introductory programming and IoT fundamentals to bachelor-level students.',
        'Mentored project teams and evaluated coursework, guiding students from concept to working prototype.',
      ],
    },
    {
      company: 'MyPitch',
      role:    'Cloud Architect',
      period:  '2022',
      bullets: [
        'Engineered an automated AWS-based video transcoding and cloud storage pipeline, significantly reducing content management overhead.',
        'Developed tooling for AI-assisted media quality enhancement across image and video processing workflows.',
        'Coordinated on-site hardware installation and infrastructure setup.',
      ],
    },
  ];

  return `
<div style="margin-bottom:26px;">
  ${sectionTitle('EXPERIENCE')}
  ${jobs.map(j => `
  <div style="margin-bottom:20px;">
    <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:6px;margin-bottom:2px;">
      <span style="font-weight:bold;text-shadow:0 0 8px #0f3;">${j.company}</span>
      <span style="font-size:9px;letter-spacing:1px;opacity:.4;">${j.period}</span>
    </div>
    <div style="font-size:10px;opacity:.55;letter-spacing:.5px;margin-bottom:7px;">${j.role}</div>
    <ul style="margin:0;padding-left:16px;opacity:.8;line-height:1.7;">
      ${j.bullets.map(b => `<li style="margin-bottom:2px;">${b}</li>`).join('')}
    </ul>
  </div>`).join('')}
</div>`;
}

function educationBlock() {
  const items = [
    {
      degree: 'Cybersecurity Analyst &amp; Engineer',
      school: 'Syntra',
      period: '2025 — 2026',
      note:   'Currently enrolled · offensive security, network defence &amp; compliance',
    },
    {
      degree: 'Professional Bachelor — Multimedia &amp; Creative Technologies: Web Development',
      school: 'Karel de Grote Hogeschool',
      period: '2022 — 2024',
    },
    {
      degree: 'Graduate — Internet of Things',
      school: 'Karel de Grote Hogeschool',
      period: '2020 — 2022',
    },
  ];

  return `
<div>
  ${sectionTitle('EDUCATION')}
  ${items.map(i => `
  <div style="margin-bottom:16px;">
    <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:6px;margin-bottom:2px;">
      <span style="text-shadow:0 0 5px #0f3;">${i.degree}</span>
      <span style="font-size:9px;letter-spacing:1px;opacity:.4;white-space:nowrap;">${i.period}</span>
    </div>
    <div style="font-size:10px;opacity:.5;">${i.school}${i.note ? ` &mdash; <em>${i.note}</em>` : ''}</div>
  </div>`).join('')}
</div>`;
}
