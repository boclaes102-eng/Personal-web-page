// ============================================================
//  EDIT THIS FILE to add your own projects.
// ============================================================

export const PROJECTS = [
  {
    id: 0,
    computer: true,           // renders as a 3D retro CRT computer in the scene
    title: "Password Analyzer",
    description:
      "A client-side password strength analyzer. Runs entirely in the browser — entropy calculation, pattern detection, composition breakdown, and k-anonymity HIBP breach checking.",
    tech: ["JavaScript", "SHA-1", "HIBP API", "CSS"],
    bgColorTop:    "#001a00",
    bgColorBottom: "#002800",
    glowColor:     "#00ff41",
    media: [],
    link: "#"
  },
  {
    id: 1,
    television: true,         // renders as a 3D retro CRT television in the scene
    title: "Retro TV",
    description:
      "A retro 1970s television floating in space. Tune through channels — breaking news, weather forecast, live market data, sports scores, and a broadcast test signal.",
    tech: ["JavaScript", "Canvas API", "CSS", "HTML"],
    glowColor: "#88aaff",     // phosphor blue-white
    media: [],
    link: "#"
  },
  {
    id: 2,
    title: "Project Gamma",
    description:
      "An open-source CLI tool that automates development-environment setup. Supports macOS and Linux, with 500+ GitHub stars and active community contributions.",
    tech: ["Go", "Bash", "YAML", "GitHub Actions"],
    bgColorTop:    "#041a10",
    bgColorBottom: "#072a18",
    glowColor:     "#00ff88",
    media: [
      "https://picsum.photos/seed/gamma1/640/360",
      "https://www.w3schools.com/html/mov_bbb.mp4"
    ],
    link: "#"
  },
  {
    id: 3,
    title: "Project Delta",
    description:
      "A mobile game built in Unity where players navigate a procedurally generated dungeon. Includes a custom physics system and adaptive difficulty AI.",
    tech: ["Unity", "C#", "Procedural Gen", "Mobile"],
    bgColorTop:    "#2a0a04",
    bgColorBottom: "#3a1004",
    glowColor:     "#ff4400",
    media: [
      "https://picsum.photos/seed/delta1/640/360",
      "https://picsum.photos/seed/delta2/640/360",
      "https://picsum.photos/seed/delta3/640/360",
      "https://picsum.photos/seed/delta4/640/360"
    ],
    link: "#"
  },
  {
    id: 4,
    title: "Project Epsilon",
    description:
      "A real-time collaborative whiteboard supporting simultaneous editing by hundreds of users, built on WebSockets with operational-transform conflict resolution.",
    tech: ["TypeScript", "WebSockets", "Canvas API", "Redis"],
    bgColorTop:    "#1a1400",
    bgColorBottom: "#2a2000",
    glowColor:     "#ffcc00",
    media: [
      "https://picsum.photos/seed/eps1/640/360",
      "https://picsum.photos/seed/eps2/640/360"
    ],
    link: "#"
  },
  {
    id: 6,
    arcade: true,            // renders as a 3D retro arcade cabinet in the scene
    title: "Arcade",
    glowColor: "#ff44ff",    // neon magenta
  },
  {
    id: 5,
    title: "Project Zeta",
    description:
      "A browser extension that summarises articles using a local LLM, keeping all data on-device. Works fully offline and supports multiple languages.",
    tech: ["JavaScript", "WebLLM", "Chrome API", "WASM"],
    bgColorTop:    "#001a14",
    bgColorBottom: "#002a20",
    glowColor:     "#00ffcc",
    media: [
      "https://picsum.photos/seed/zeta1/640/360",
      "https://picsum.photos/seed/zeta2/640/360",
      "https://picsum.photos/seed/zeta3/640/360"
    ],
    link: "#"
  }
];
