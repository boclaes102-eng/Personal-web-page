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
    id: 6,
    arcade: true,            // renders as a 3D retro arcade cabinet in the scene
    title: "Arcade",
    glowColor: "#ff44ff",    // neon magenta
  },
  {
    id: 7,
    phoneBooth: true,        // renders as a 3D retro phone booth in the scene
    title: "Phone Booth",
    glowColor: "#ffaa00",    // warm amber
  },
  {
    id: 8,
    jukebox: true,           // renders as a 3D Wurlitzer-style jukebox in the scene
    title: "Jukebox",
    glowColor: "#ff44bb",    // neon pink/magenta
  }
];
