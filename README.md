# Deep Space — Interactive 3D Portfolio

A fully interactive 3D portfolio built from scratch with vanilla JavaScript and Three.js. No framework, no bundler, no build step — just ES modules running directly in the browser.

The world is a floating space station where everything is an interactive object: a retro PC, a TV with live news feeds, an arcade cabinet with multiplayer gaming, a jukebox, and a British phone booth — each one a fully functional application.

---

## Live Demo

**[boclaes102.netlify.app](https://boclaes102.netlify.app)**

---

## What's Inside

### 3D Environment
- Three.js scene with post-processing (bloom, anti-aliasing)
- Freelook camera with inertia and celestial momentum
- All scene objects drift on independent multi-axis sinusoidal animations
- Click-to-zoom transitions with GSAP
- Procedurally generated starfield

### PC — Hacking Workstation
A fully working retro desktop with 10 tools:

| Tool | What it does |
|---|---|
| **ARIA** | AI chatbot powered by Groq (Llama 3.1 8B) with streaming responses |
| **Password Analyzer** | Entropy calculation, pattern detection, keyboard-walk detection, HIBP breach check |
| **Hash Generator** | SHA-256, SHA-512, SHA-1, MD5 via Web Crypto API |
| **JWT Decoder** | Header/payload/signature parser with expiry validation |
| **Mail Spy** | Email format analysis, disposable domain detection, breach lookup |
| **Net Info** | IP geolocation and network data via ipapi.co |
| **Cipher** | Caesar, Vigenère, and Base64 encode/decode |
| **Pen Guide** | Penetration testing reference with command cheatsheets |
| **GitHub** | Live repository viewer |
| **CV** | Interactive résumé |

### TV — Live Broadcast Station
Channel-surf through real-time data feeds:

- **NEWS-24** — Live tech headlines from Hacker News API
- **WEATHER** — Auto-detected location with 7-day forecast from Open-Meteo
- **MARKETS** — Crypto prices (BTC, ETH, SOL) + Fear & Greed index from CoinGecko
- **SPORTS** — Live scores from ESPN API
- **NATURAL DISASTERS** — Real-time wildfire, earthquake, volcano, and storm alerts from NASA EONET

Plus a looping video news segment on the TV screen.

### Arcade Cabinet — Retro Gaming
Three single-player games built on HTML5 Canvas:
- **Pong** — Classic with scaling difficulty
- **Galaga** — Wave-based space shooter with enemy formations
- **Breakout** — Brick breaker with increasing ball speed

**Multiplayer Pong** via Supabase Realtime:
- Presence-based matchmaking — join the lobby, get paired automatically
- Host runs authoritative physics at 144 fps, broadcasts state at 30 fps
- Guest uses lerp interpolation for smooth rendering despite network jitter
- Dedicated sound relay so both players hear all SFX in sync
- Opponent disconnect detection with graceful cleanup

### Jukebox — Music Player
- Four procedurally synthesized ambient themes (Space, Synthwave, Jazz Lounge, Cyberpunk) — zero audio files, all Web Audio API
- Upload your own MP3s to personal cloud slots via Supabase Storage
- Smooth crossfade when switching themes
- Music persists across interactions with volume ducking during UI events

### Phone Booth
- Email and phone lookup tool built into a K6-style British red phone booth

---

## Tech Stack

| Layer | Technology |
|---|---|
| 3D Rendering | Three.js + custom post-processing |
| Audio | Web Audio API (procedural synthesis, no audio files) |
| Auth | Supabase Auth (JWT, email confirmation, password reset) |
| Database | Supabase Postgres (user preferences, analytics) |
| Storage | Supabase Storage with Row-Level Security |
| Realtime | Supabase Realtime (broadcast + presence) |
| AI | Groq API (Llama 3.1 8B, streaming) |
| Animations | GSAP |
| Hosting | Netlify (auto-deploy from GitHub) |
| Language | Vanilla JavaScript (ES2022 modules) |

---

## Mathematics & Physics

### Spherical coordinates → camera direction
The freelook camera stores `yaw` and `pitch` angles and converts them to a look-at unit vector every frame using the spherical-to-Cartesian formula:

```js
// camera.js
camDir() {
  return vec.set(
     Math.sin(yaw)  * Math.cos(pitch),   // X
     Math.sin(pitch),                     // Y
    -Math.cos(yaw)  * Math.cos(pitch)    // Z
  );
}
```

`pitch` is clamped to ±`Math.PI × 0.42` (±75.6°) to prevent the camera from flipping upside down.

### Polar coordinates → world positions
Each scene object (PC, TV, arcade, etc.) is placed using azimuth, elevation, and radius — converted to Cartesian XYZ:

```js
// frames.js
function polarToWorld(az_deg, el_deg, r) {
  const az = degToRad(az_deg);
  const el = degToRad(el_deg);
  return new Vector3(
     r * Math.cos(el) * Math.sin(az),
     r * Math.sin(el),
    -r * Math.cos(el) * Math.cos(az),
  );
}
```

This lets the scene be laid out in human-readable degrees rather than raw XYZ coordinates.

### Quaternion composition for 3D drift
Every floating object rotates simultaneously on three axes without gimbal lock. Three independent quaternions are built from axis-angle pairs and composed each frame:

```js
// phonebooth.js (same pattern on all objects)
_yawQ.setFromAxisAngle(Y,  Math.sin(t * 0.09         + phase) * 0.055);
_pitchQ.setFromAxisAngle(X, Math.sin(t * speed * 0.72 + phase) * 0.038);
_rollQ.setFromAxisAngle(Z,  Math.sin(t * speed * 0.48 + phase + 1.1) * 0.025);
group.quaternion.copy(baseQuat).multiply(_yawQ).multiply(_pitchQ).multiply(_rollQ);
```

Each object gets a unique `phase` offset so they drift independently despite sharing the same formula. Using quaternion multiplication avoids the gimbal lock that Euler angle composition would produce.

### Pong ball physics
Ball speed is capped using the Pythagorean vector magnitude, and the bounce angle off a paddle is proportional to where the ball hits relative to the paddle centre — higher hits go steeper:

```js
// pong-mp.js
const spd = Math.hypot(vx, vy);
if (spd > BALL_MAX) { vx = (vx / spd) * BALL_MAX; vy = (vy / spd) * BALL_MAX; }

// Deflection angle: normalised hit offset maps to vertical velocity
vy = ((by - (paddleY + PAD_H / 2)) / (PAD_H / 2)) * H * 0.014 * S;
```

### Multiplayer interpolation (lerp)
The guest client receives game state 30 times per second but renders at up to 144 fps. A lerp factor closes the gap each tick, keeping movement smooth regardless of network jitter:

```js
// pong-mp.js — guest update
const k = 0.28;  // lerp factor per tick
bx += (_targetBx - bx) * k;
by += (_targetBy - by) * k;
```

### Shannon entropy for password strength
Password bit-strength is calculated using information theory — the number of bits needed to brute-force a password drawn from a character pool of size `N`:

```
entropy = length × log₂(N)
```

```js
// panalyze.js
function calcEntropy(pw) {
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/[0-9]/.test(pw)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(pw)) pool += 32;
  return Math.floor(pw.length * Math.log2(pool));
}
```

### Exponential audio gain ramps
The Web Audio engine uses exponential (not linear) gain ramps for all volume envelopes. Human hearing is logarithmic, so exponential curves sound natural while linear ramps sound mechanical:

```js
// audio-manager.js — typical SFX envelope
gain.setValueAtTime(0.32, t);
gain.exponentialRampToValueAtTime(0.001, t + 0.050);
```

---

## Architecture Highlights

**Zero dependencies at runtime.** No npm packages are shipped to the browser — just ES modules loaded via an import map. Three.js and Supabase are loaded from CDN with pinned versions.

**No build step.** TypeScript checking runs in VS Code via `jsconfig.json` + `@ts-check` + JSDoc annotations — type safety without a compiler.

**Fully procedural audio.** All ambient music is synthesized in real time using the Web Audio API oscillator graph. No audio files are downloaded for background music — the entire soundtrack is generated from code.

**Authoritative multiplayer.** The host runs all physics deterministically and streams normalized state to the guest at 30 fps. The guest interpolates positions with lerp, keeping the game smooth even on high-latency connections. Sound events are sent on a dedicated broadcast channel so both players have identical audio.

**Content Security Policy.** Every external domain the site connects to is explicitly whitelisted in a CSP meta tag. `script-src` and `style-src` are locked down to prevent XSS.

**Row-Level Security.** Supabase Storage policies ensure users can only read/write their own jukebox folder (`{uid}/custom_*`). The anon key is intentionally public — security comes from RLS, not key secrecy.

---

## Code Quality

```bash
# Type checking (VS Code, no compilation)
# jsconfig.json + @ts-check on all modules

# Unit tests — no test framework needed
npm test
# ✓ camDir returns unit vector
# ✓ camDir points correctly at cardinal angles
# ✓ PITCH_LIMIT clamps to ±75.6°
# ✓ polarToWorld maps correctly at cardinal angles
# ... 10 tests, 10 passing
```

- JSDoc `@param` / `@returns` / `@typedef` on all exported functions
- Node.js built-in test runner (`node:test`) — zero extra dependencies
- Stale comment review pass on every major change

---

## Project Structure

```
/
├── index.html              # Entry point + CSP meta tag + import map
├── js/
│   ├── config.js           # Supabase + Groq keys (anon/rate-limited)
│   ├── main.js             # Bootstrap, auth gate, animation loop
│   ├── core/               # Camera, input, renderer, state
│   ├── scene/              # Environment, celestials, frame positioning
│   ├── audio/              # Web Audio engine (ambient + SFX)
│   ├── auth/               # Supabase auth + UI overlay
│   ├── presence/           # Realtime online indicators
│   ├── pc/                 # Computer + all 10 tools
│   ├── tv/                 # Television + 5 live channels
│   ├── arcade/             # Games + multiplayer lobby
│   ├── jukebox/            # Music player + upload
│   ├── phonebooth/         # Phone booth object
│   └── analytics/          # Visit tracking
├── tests/
│   └── unit.test.js        # Node.js built-in test runner
├── jsconfig.json           # TypeScript checking for .js files
└── package.json            # npm test script only
```

---

## Running Locally

No install step required.

1. Clone the repo
2. Serve with any static file server (VS Code Live Server, `npx serve`, etc.)
3. Open `http://localhost:5500`

To run the unit tests:

```bash
npm test
```

---

## APIs Used

| API | Used For |
|---|---|
| Groq | AI chat (Llama 3.1 streaming) |
| Supabase | Auth, database, storage, realtime |
| Hacker News Firebase | Tech news feed |
| Open-Meteo | Weather forecast |
| ipapi.co | IP geolocation |
| CoinGecko | Crypto prices |
| Alternative.me | Fear & Greed index |
| ESPN | Sports scores |
| NASA EONET | Natural disaster events |
| Have I Been Pwned | Password breach check |
