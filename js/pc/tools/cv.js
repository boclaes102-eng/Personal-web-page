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
    { label: 'CLOUD & INFRA',  items: ['AWS', 'Linux', 'Git'] },
    { label: 'BACKEND',        items: ['PHP', 'Python', 'C#', 'SQL', 'Supabase'] },
    { label: 'FRONTEND',       items: ['JavaScript', 'HTML/CSS', 'Three.js'] },
    { label: 'CYBERSECURITY',  items: ['Firewall Management', 'AD Audit', 'OpenVAS', 'Nessus', 'Burp Suite', 'Metasploit', 'SIEM', 'OWASP', 'CTF'] },
    { label: 'NETWORK',        items: ['IDS/IPS', 'VPN', 'Network Segmentation', 'Wireshark', 'Nmap'] },
    { label: 'HARDWARE / IOT', items: ['PCB Design', 'Soldering', 'Firmware', 'Arduino', 'Raspberry Pi', 'Sensors'] },
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
    ${projectsBlock()}
    <div style="margin-top:28px;opacity:.2;font-size:9px;letter-spacing:3px;text-align:right;">── END OF FILE ──</div>
  `;
}

function profileBlock() {
  return `
<div style="margin-bottom:26px;">
  ${sectionTitle('PROFILE')}
  <p style="opacity:.8;line-height:1.8;margin:0;">
    Full Stack Developer, IoT Engineer, and Cybersecurity Analyst with hands-on experience building
    complete systems from the ground up. At an early-stage startup, acted as sole engineer responsible
    for an entire AI-powered sports analytics platform — from physical camera installation through
    computer vision pipelines to the coaching dashboard. Builds sensor-driven automation with
    Raspberry Pi and embedded hardware, architects cloud infrastructure, and conducts real-world
    penetration tests on live production environments. Currently completing a Cybersecurity Analyst
    &amp; Engineer programme alongside active professional work.
  </p>
</div>`;
}

function experienceBlock() {
  const jobs = [
    {
      company: 'Fire Station Leuven',
      role:    'Cybersecurity Consultant — Independent Engagement',
      period:  '2026 · 3 months',
      bullets: [
        'Independently arranged and executed a 3-month security assessment of a public safety facility — scanning the full network with OpenVAS and Nessus, delivering detailed remediation reports with risk scoring across Windows and Linux environments.',
        'Performed a full Active Directory audit — uncovering misconfigurations, privilege escalation paths, and stale account risks; produced a prioritised hardening report with Group Policy recommendations.',
        'Conducted an authorised penetration test, successfully breaching the facility network and identifying critical weaknesses in the firewall configuration.',
        'Implemented firewall hardening measures based on findings and validated fixes through follow-up testing.',
      ],
    },
    {
      company: 'Agilica',
      role:    'Fullstack Developer &amp; Software/Hardware Engineer',
      period:  '2024 — 2025',
      bullets: [
        'Designed and built an offline Three.js application for drone fleet management — featuring a custom spatial anchor system, real-time GPS coordinate tracking, and automated optimal landing point selection for connected drones.',
        'Rebuilt the company website with an SEO-first approach and implemented a full analytics pipeline (click tracking, session flow, exit-rate analysis) — driving a ~30% increase in sales.',
        'Architected and delivered full-stack feature expansions for mission-critical client software across multiple production environments.',
        'Assembled custom embedded hardware including PCB soldering and board-level improvements for drone systems.',
      ],
    },
    {
      company: 'Karel de Grote Hogeschool',
      role:    'Lecturer — Programming &amp; IoT',
      period:  '2023 — 2024',
      bullets: [
        'Independently designed and delivered a full programming and IoT curriculum to bachelor-level students — introducing AWS cloud infrastructure and Node-RED automation as core course tools.',
        'Mentored student project teams from concept to working prototype, evaluating technical deliverables and guiding hands-on hardware builds.',
      ],
    },
    {
      company: 'MyPitch',
      role:    'Software &amp; Infrastructure Engineer',
      period:  '2022',
      bullets: [
        'Sole engineer for an AI-powered soccer analytics platform at an early-stage startup — responsible for the entire system from hardware to application.',
        'Installed and configured AI-enabled cameras at soccer facilities; built a fully automated pipeline routing footage to AWS S3 via an SQS queue that triggered a custom Linux VM when capacity was available.',
        'Wrote Python video analysis code using OpenCV, later evolving the system to a pre-trained ML model for improved player detection — extracting per-player performance metrics by jersey number from every match.',
        'Data was stored back to S3 and consumed by a coaching app, giving coaching staff a full breakdown of each player\'s performance per match.',
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

function projectsBlock() {
  const projects = [
    {
      name:   'The Deep Space Project',
      url:    'thedeepspaceproject.be',
      period: '2025 — Present',
      tags:   ['Three.js', 'JavaScript', 'Supabase', 'Web Audio API', 'Groq AI', 'GLSL'],
      bullets: [
        'Built a fully interactive 3D portfolio environment from scratch in Three.js — a rotating space scene with dynamic lighting, custom GLSL shaders, and interactive objects placed across the environment.',
        'Working in-world PC with real tools: SHA-1 k-anonymity password breach checker (HIBP API), JWT decoder, network scanner, mailspy, and this CV viewer.',
        'Multiplayer Pong over Supabase Realtime with authoritative host physics, lerp interpolation for the guest, and synchronised sound effects via dedicated broadcast events.',
        'Jukebox system with Supabase cloud storage — users can upload and stream their own tracks from within the 3D world.',
        'Full authentication system (sign up / log in / auto-session) and an AI chat terminal powered by the Groq API.',
      ],
    },
    {
      name:   'CyberSuite Pro',
      url:    'github.com/boclaes102-eng/Cybersecurity-software',
      period: '2025 — Present',
      tags:   ['Python', 'CustomTkinter', 'Scapy', 'YARA', 'HIBP', 'PyInstaller', 'pytest'],
      bullets: [
        'Unified GUI launcher for six professional security tools — NIDS, Password Auditing, Static Malware Analyzer, Web App Tester, Payload Generator, and Custom Exploit Helper — plus a Recon Workspace page that is the desktop client of a three-platform attack pipeline.',
        'Recon Workspace fetches saved sessions from the shared Threat Intel Platform backend; one click sets the active target and copies it to the clipboard for instant use in any tool — full offline fallback included.',
        'Tools run in-process via importlib; a custom threading.local() stdout interceptor captures per-thread output without modifying any tool\'s source. Two-layer stop: cooperative stop_event + ctypes.PyThreadState_SetAsyncExc as a pre-emptive fallback.',
        'NIDS detects six attack types (port scan, SYN flood, DNS tunneling, ARP poisoning, ICMP amplification, statistical anomaly); Static Malware Analyzer maps to 18 MITRE ATT&CK behavioural rules with YARA scanning and VirusTotal lookup — no binary execution.',
        '147 pytest tests run headless by stubbing CustomTkinter; ships as a portable standalone .exe via PyInstaller.',
      ],
    },
    {
      name:   'CyberOps Dashboard',
      url:    'github.com/boclaes102-eng/Online-Cyber-dashboard',
      period: '2025 — Present',
      tags:   ['Next.js 15', 'TypeScript', 'Tailwind CSS', 'Vercel', 'Edge Middleware', 'OSINT'],
      bullets: [
        'One node of a three-platform ecosystem: 50+ recon and intel tools save results to a shared PostgreSQL backend (Threat Intel Platform), which the CyberSuite Pro desktop app loads directly as pre-filled attack targets — a complete recon-to-exploitation pipeline across web, backend, and desktop.',
        'Zero third-party UI or HTTP libraries — every non-trivial algorithm is built from scratch: Wagner-Fischer edit distance for SSDEEP fuzzy hash comparison, MurmurHash3 for favicon fingerprinting, full CVSS v3.1 scoring with vector string round-trip, sliding-window rate limiter running at Vercel\'s Edge layer.',
        'All backend calls proxied server-side via a Next.js catch-all route — the browser never sees the API key or upstream URL; CORS is structurally impossible. TypeScript strict mode with zero any escapes throughout.',
        'Tools span OSINT, recon, BGP/ASN, web analysis, threat intelligence, forensics, and automation — with a workflow builder for chaining steps into sequential recon pipelines.',
        'No authentication by design — private operator tool. Clerk was removed entirely; the middleware does nothing but rate-limit at the Edge.',
      ],
    },
    {
      name:   'Threat Intel Platform',
      url:    'threat-intel-platform-production-eb1b.up.railway.app/docs',
      period: '2025 — Present',
      tags:   ['Fastify', 'TypeScript', 'PostgreSQL', 'Redis', 'BullMQ', 'Docker', 'Railway', 'Vitest'],
      bullets: [
        'Shared backend for a three-platform security ecosystem — stores recon sessions from the CyberOps Dashboard so CyberSuite Pro can load them as attack targets, and continuously monitors registered assets with CVE correlation and IOC enrichment.',
        'IOC enrichment fan-out: checks Redis cache first, serves stale Postgres records instantly while queueing a background refresh, then fans out to AbuseIPDB, VirusTotal, and AlienVault OTX in parallel — the API never blocks on external calls.',
        'CVE feed worker pages the full NIST NVD API (~2,000 pages) with exponential backoff and randomised jitter on rate limits; asset-to-CVE correlation engine links CVEs to registered assets via CPE string matching entirely in-database.',
        'Two Docker build targets (API + Worker) sharing one Postgres and one Redis on Railway; 8-panel Grafana dashboard pre-provisioned via Prometheus — tracking p50/p95/p99 latency, IOC cache hit rate, and open alerts by severity.',
        'X-Request-ID tracing flows through the Next.js proxy, Fastify request log, BullMQ worker log, and email send log — a single dashboard request is fully traceable end-to-end by one UUID.',
      ],
    },
    {
      name:   'Real-Time Data Pipeline',
      url:    'github.com/boclaes102-eng/Real-time-data-pipeline',
      period: '2025',
      tags:   ['Python', 'FastAPI', 'asyncio', 'WebSockets', 'SQLite', 'Chart.js', 'Kafka'],
      bullets: [
        'Production-style streaming pipeline ingesting live stock, crypto, and Reddit sentiment data through a Kafka-inspired async message broker built on asyncio.Queue.',
        'Three concurrent async producers feed a consumer that routes, transforms, and persists to SQLite — then broadcasts via WebSocket to a live Chart.js dashboard.',
        'Broker abstraction is intentionally thin: swapping asyncio.Queue for real Confluent Kafka requires changing only one file; all producer and consumer code stays untouched.',
        'Stocks fall back to Gaussian random-walk simulation outside NYSE trading hours, keeping the pipeline live 24/7.',
      ],
    },
    {
      name:   'Telecom Churn Predictor',
      url:    'github.com/boclaes102-eng/Telecom-churn-predictor',
      period: '2025',
      tags:   ['Python', 'XGBoost', 'Streamlit', 'Scikit-learn', 'Pandas', 'Machine Learning'],
      bullets: [
        'XGBoost classification model trained on 7,043 customers and 20 features from IBM\'s public Telco dataset — achieving 0.84 ROC-AUC and 79.7% accuracy with cross-validation stability of ±0.010.',
        'Streamlit interface accepts customer input and returns a live probability gauge with Low / Medium / High risk classification, primary churn risk factors, and a top-15 feature importance chart.',
      ],
    },
    {
      name:   'PyMind — AI Python Assistant',
      url:    'github.com/boclaes102-eng/ML-python-tool',
      period: '2025',
      tags:   ['Python', 'Claude API', 'Anthropic', 'Tool Use', 'Prompt Caching', 'Agentic AI'],
      bullets: [
        'Agentic CLI assistant powered by Claude Sonnet with tool use, prompt caching, and multi-step reasoning loops — reads actual codebases, searches code, and runs snippets before responding.',
        'Built on the Anthropic SDK with prompt caching to reduce latency and cost on repeated context; supports Windows and Linux path conventions transparently.',
      ],
    },
    {
      name:   'Sub-Checker',
      url:    'github.com/boclaes102-eng/Sub-checker',
      period: '2025',
      tags:   ['Python', 'Gmail API', 'Google Cloud', 'OAuth2'],
      bullets: [
        'Scans 2 years of Gmail via Google\'s read-only API to detect and categorise recurring subscriptions into five statuses: active, likely active, inactive, cancelled, and one-time.',
        'Fully local processing — no passwords stored, no data leaves the machine. Includes a setup wizard that automates Google Cloud configuration and OAuth credential setup end-to-end.',
      ],
    },
  ];

  return `
<div style="margin-top:28px;margin-bottom:26px;">
  ${sectionTitle('PROJECTS')}
  ${projects.map(p => `
  <div style="margin-bottom:22px;">
    <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:6px;margin-bottom:2px;">
      <span style="font-weight:bold;text-shadow:0 0 8px #0f3;">${p.name}</span>
      <span style="font-size:9px;letter-spacing:1px;opacity:.4;">${p.period}</span>
    </div>
    <div style="font-size:10px;opacity:.5;margin-bottom:6px;">${p.url}</div>
    <div style="margin-bottom:7px;">
      ${p.tags.map(t => `<span style="
        display:inline-block;margin:2px 3px 2px 0;
        padding:1px 6px;
        border:1px solid rgba(0,255,51,.2);
        background:rgba(0,255,51,.03);
        font-size:10px;opacity:.7;
      ">${t}</span>`).join('')}
    </div>
    <ul style="margin:0;padding-left:16px;opacity:.8;line-height:1.7;">
      ${p.bullets.map(b => `<li style="margin-bottom:2px;">${b}</li>`).join('')}
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
