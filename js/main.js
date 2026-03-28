/**
 * Deep Space Portfolio  —  main.js
 * ES module. Requires Three.js r160 via importmap + GSAP global.
 */

import * as THREE              from 'three';
import { EffectComposer }      from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }          from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass }     from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass }          from 'three/addons/postprocessing/OutputPass.js';
import { PROJECTS }            from './projects.js';

const { gsap } = window;

// ══════════════════════════════════════════════════════════════════
//  CONSTANTS
// ══════════════════════════════════════════════════════════════════

const FRAME_W      = 3.2;
const FRAME_H      = 2.4;
const PITCH_LIMIT  = Math.PI * 0.42;
const DRAG_THRESH  = 8;   // px — below this a pointerup counts as a click

// Project positions: [azimuth_deg, elevation_deg, radius]
// Spread around the full 360° so the player must look around
const FRAME_POLAR = [
  [  0,   5,  14],   // straight ahead on load
  [ 62,  -6,  13],   // right-forward
  [128,   8,  15],   // right-behind
  [195,  -5,  13],   // directly behind
  [258,   7,  14],   // left-behind
  [318,  -4,  12],   // left-forward
];

// Lore data for each clickable celestial body
const CELESTIAL_LORE = {
  sun: {
    name: "HD-7819  ·  'The Ember'",
    type: "G-TYPE MAIN SEQUENCE STAR",
    glowColor: "#ffaa33",
    desc: "Catalogued as HD-7819 by the Outer Survey Authority, this aging yellow dwarf was informally named 'The Ember' by deep-range explorers who noted its unusually turbulent chromosphere. A major coronal mass ejection circa 6,000 BCE is thought to have sterilised the inner system, leaving vitrified silicate plains on its two nearest neighbours.",
    stats: [
      { label: "AGE",      value: "4.8 billion yrs" },
      { label: "RADIUS",   value: "0.97 R☉" },
      { label: "SURFACE",  value: "5,720 K" },
      { label: "DISTANCE", value: "2.4 ly" },
    ],
  },
  gasGiant: {
    name: "Veranthos-IV",
    type: "CLASS-J GAS GIANT",
    glowColor: "#aa77ff",
    desc: "The largest body in this system, distinguished by a 40,000 km anticyclonic storm — the 'Eye' — active for over 900 years of recorded observation. The innermost ring band was artificially seeded in 2251 by the Kepler Mining Consortium before the operation was abandoned. Salvage rights remain disputed under Sector 9 treaty law.",
    stats: [
      { label: "MASS",   value: "318 M⊕" },
      { label: "RADIUS", value: "11.2 R⊕" },
      { label: "ORBIT",  value: "84.3 std. years" },
      { label: "MOONS",  value: "63 confirmed" },
    ],
  },
  rockyPlanet: {
    name: "Cinder",
    type: "BARREN TERRESTRIAL",
    glowColor: "#ff6633",
    desc: "Once theorised to harbour microbial life in subsurface thermal vents, Cinder was stripped of its atmosphere during a solar ejection event. Its three large impact craters were formed by a single fragmented asteroid whose trajectory suggests an extrasystem origin. The resonance frequency of the central basin served as a navigational beacon until relay station decommission in 2298.",
    stats: [
      { label: "RADIUS",  value: "0.73 R⊕" },
      { label: "SURFACE", value: "412°C mean" },
      { label: "GRAVITY", value: "0.61 g" },
      { label: "CRATERS", value: "3 major basins" },
    ],
  },
  iceGiant: {
    name: "Solace",
    type: "ICE GIANT",
    glowColor: "#66ccff",
    desc: "Outermost confirmed planet of the HD-7819 system. Early deep-space travellers used it as a waypoint, giving rise to the name. Probe data from 2247 detected a liquid water ocean beneath roughly 80 km of compressed ice. The probe was lost before a second contact window; no follow-up mission has received funding.",
    stats: [
      { label: "MASS",    value: "17.1 M⊕" },
      { label: "TEMP",    value: "−218°C deck" },
      { label: "ORBIT",   value: "164 std. years" },
      { label: "OCEAN",   value: "Subsurface ?" },
    ],
  },
  redDwarf: {
    name: "Mira's Lantern",
    type: "ROGUE M-TYPE RED DWARF",
    glowColor: "#ff5522",
    desc: "A rogue stellar object not gravitationally bound to HD-7819. First catalogued by xenocartographer Mira Osei in 2189, who plotted its transit trajectory through this sector. It will clear the outer system boundary in approximately 4,200 years. Intense flare activity cycling every ~37 hours makes nearby habitation impractical. The eastern approach corridor carries a permanent AMBER hazard rating on its account.",
    stats: [
      { label: "MASS",     value: "0.18 M☉" },
      { label: "SURFACE",  value: "3,200 K" },
      { label: "FLARE",    value: "~37 hr cycle" },
      { label: "VELOCITY", value: "114 km/s rel." },
    ],
  },
};

// ══════════════════════════════════════════════════════════════════
//  RENDERER + SCENE
// ══════════════════════════════════════════════════════════════════

const canvas   = document.getElementById('canvas');
const scene    = new THREE.Scene();
const camera   = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 1200);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
// Tone mapping is applied by OutputPass — keep renderer at NoToneMapping
// so the HDR bloom buffer is NOT compressed before bloom fires.
renderer.toneMapping         = THREE.NoToneMapping;
renderer.outputColorSpace    = THREE.SRGBColorSpace;

scene.fog = new THREE.FogExp2(0x000008, 0.004);

// ══════════════════════════════════════════════════════════════════
//  POST-PROCESSING  (HDR bloom)
// ══════════════════════════════════════════════════════════════════

// Float render target so HDR values > 1 survive through the bloom pass
const hdrTarget = new THREE.WebGLRenderTarget(innerWidth, innerHeight, {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  type:      THREE.HalfFloatType,
  format:    THREE.RGBAFormat,
});

const composer = new EffectComposer(renderer, hdrTarget);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(innerWidth, innerHeight),
  0.75,  // strength
  0.35,  // radius
  1.01   // threshold — ABOVE 1.0, so SDR panels/text are NEVER bloomed
);
composer.addPass(bloomPass);

// OutputPass applies Reinhard tone-mapping + sRGB encoding to the final canvas
const outputPass = new OutputPass();
composer.addPass(outputPass);
// Set tone mapping AFTER OutputPass is created — it reads the renderer at render time
renderer.toneMapping         = THREE.ReinhardToneMapping;
renderer.toneMappingExposure = 1.1;

// ══════════════════════════════════════════════════════════════════
//  CAMERA STATE  (freelook or zoom transition)
// ══════════════════════════════════════════════════════════════════

const cam = {
  yaw: 0, pitch: 0,
  savedYaw: 0, savedPitch: 0,
  // GSAP writes directly to pos/target during zoom transitions
  pos:    new THREE.Vector3(0, 0, 0),
  target: new THREE.Vector3(0, 0, -1),
  mode: 'freelook', // 'freelook' | 'transitioning' | 'zoomed'
};

function camDir() {
  return new THREE.Vector3(
    Math.sin(cam.yaw)  * Math.cos(cam.pitch),
    Math.sin(cam.pitch),
   -Math.cos(cam.yaw)  * Math.cos(cam.pitch)
  );
}

// ══════════════════════════════════════════════════════════════════
//  STAR FIELD
// ══════════════════════════════════════════════════════════════════

let starUniforms;

function buildStars() {
  const N = 6000;
  const positions = new Float32Array(N * 3);
  const sizes     = new Float32Array(N);
  const colors    = new Float32Array(N * 3);

  // HDR star colours (values > 1.0) so stars still bloom at threshold 1.01
  const palette = [
    [1.6, 1.6, 1.6],   // bright white
    [0.8, 1.0, 1.6],   // blue-white
    [1.6, 1.6, 0.8],   // warm yellow
    [1.6, 0.8, 0.6],   // orange giant
    [0.7, 0.9, 1.6],   // blue
  ];

  for (let i = 0; i < N; i++) {
    // Uniform spherical distribution
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    const r     = 250 + Math.random() * 400;
    positions[i*3]   = r * Math.sin(phi) * Math.cos(theta);
    positions[i*3+1] = r * Math.cos(phi);
    positions[i*3+2] = r * Math.sin(phi) * Math.sin(theta);
    sizes[i] = 0.6 + Math.random() * 3.0;
    const c = palette[Math.floor(Math.random() * palette.length)];
    colors[i*3]   = c[0];
    colors[i*3+1] = c[1];
    colors[i*3+2] = c[2];
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position',   new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('starSize',   new THREE.BufferAttribute(sizes,     1));
  geo.setAttribute('starColor',  new THREE.BufferAttribute(colors,    3));

  starUniforms = { time: { value: 0 } };

  const mat = new THREE.ShaderMaterial({
    uniforms: starUniforms,
    vertexShader: `
      attribute float starSize;
      attribute vec3  starColor;
      uniform   float time;
      varying   vec3  vColor;
      varying   float vAlpha;
      void main() {
        // Unique twinkle per star using position as a seed
        float tw = 0.55 + 0.45 * sin(time * 1.8 + position.x * 13.7 + position.y * 9.1 + position.z * 7.3);
        vAlpha  = tw;
        vColor  = starColor * tw;
        gl_PointSize = starSize * tw;
        gl_Position  = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3  vColor;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = (1.0 - smoothstep(0.25, 1.0, d)) * vAlpha;
        gl_FragColor = vec4(vColor, a);
      }
    `,
    transparent: true,
    depthWrite:  false,
    blending:    THREE.AdditiveBlending,
  });

  scene.add(new THREE.Points(geo, mat));
}

// ══════════════════════════════════════════════════════════════════
//  NEBULA SPRITES
// ══════════════════════════════════════════════════════════════════

function makeNebulaCanvas(r, g, b) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 512;
  const ctx = cv.getContext('2d');
  // Multiple soft blobs for a more organic look
  const blobs = [
    { x: 256, y: 256, r: 230 },
    { x: 180, y: 180, r: 150 },
    { x: 320, y: 300, r: 130 },
  ];
  blobs.forEach(blob => {
    const g2 = ctx.createRadialGradient(blob.x, blob.y, 0, blob.x, blob.y, blob.r);
    g2.addColorStop(0,    `rgba(${r},${g},${b},0.35)`);
    g2.addColorStop(0.4,  `rgba(${r},${g},${b},0.12)`);
    g2.addColorStop(1,    `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, 512, 512);
  });
  return new THREE.CanvasTexture(cv);
}

function buildNebulas() {
  const defs = [
    { r:80,  g:20,  b:160, pos:[ 60, -10, -140], sz:220, rot: 0.4  },
    { r:0,   g:60,  b:130, pos:[-110, 30, -180], sz:260, rot:-0.6  },
    { r:150, g:40,  b:10,  pos:[ 110,-50, -200], sz:190, rot: 0.9  },
    { r:20,  g:90,  b:110, pos:[ -40,-30, -110], sz:160, rot:-0.25 },
    { r:70,  g:0,   b:110, pos:[ -20, 50, -160], sz:180, rot: 1.2  },
  ];
  defs.forEach(d => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map:         makeNebulaCanvas(d.r, d.g, d.b),
      transparent: true,
      blending:    THREE.AdditiveBlending,
      depthWrite:  false,
      opacity:     0.65,
      rotation:    d.rot,
    }));
    sprite.position.set(...d.pos);
    sprite.scale.set(d.sz, d.sz, 1);
    scene.add(sprite);
  });
}

// ══════════════════════════════════════════════════════════════════
//  SUN  (animated FBM shader, HDR colours > 1 for bloom)
// ══════════════════════════════════════════════════════════════════

let sunUniforms;

function buildSun() {
  const SUN_POS = new THREE.Vector3(180, -50, -320);

  // ── Body ──
  sunUniforms = { time: { value: 0 } };
  const sunMat = new THREE.ShaderMaterial({
    uniforms: sunUniforms,
    vertexShader: `
      varying vec3 vN;
      varying vec3 vP;
      void main() {
        vN = normalize(normalMatrix * normal);
        vP = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      varying vec3 vN;
      varying vec3 vP;

      // Value noise
      float hash(vec3 p) {
        p = fract(p * vec3(443.8975,397.2973,491.1871));
        p += dot(p.xyz, p.yzx + 19.19);
        return fract(p.x * p.y * p.z);
      }
      float vnoise(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f*f*(3.0-2.0*f);
        return mix(
          mix(mix(hash(i),        hash(i+vec3(1,0,0)),f.x),
              mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
          mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),
              mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),
          f.z);
      }
      float fbm(vec3 p) {
        float v=0.0,a=0.5;
        for(int i=0;i<6;i++){v+=a*vnoise(p);p*=2.1;a*=0.5;}
        return v;
      }

      void main() {
        vec3 p  = vP * 0.04 + vec3(time * 0.018);
        float n = fbm(p + vec3(fbm(p + time*0.012), fbm(p*1.3 - time*0.008), 0.0));

        // HDR colour palette — values > 1 drive bloom
        vec3 cCool = vec3(1.4, 0.25, 0.02);   // deep red-orange
        vec3 cMid  = vec3(3.2, 1.4,  0.05);   // warm orange
        vec3 cHot  = vec3(5.0, 3.8,  0.8);    // blazing yellow-white

        vec3 col = mix(cCool, cMid, smoothstep(0.30, 0.58, n));
        col      = mix(col,  cHot, smoothstep(0.55, 0.82, n));

        // Limb darkening
        float limb = abs(dot(vN, normalize(vec3(0.0,0.0,1.0))));
        col *= 0.35 + 0.65 * limb;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const sun = new THREE.Mesh(new THREE.SphereGeometry(28, 64, 64), sunMat);
  sun.position.copy(SUN_POS);
  scene.add(sun);
  celestialTargets.push({ mesh: sun, lore: CELESTIAL_LORE.sun, pos: SUN_POS.clone(), zoomDist: 65 });
  celestialMeshes.push(sun);

  // ── Corona glow sprite ──
  const coronaCv = document.createElement('canvas');
  coronaCv.width = coronaCv.height = 256;
  const ctx = coronaCv.getContext('2d');
  const cg = ctx.createRadialGradient(128,128,8, 128,128,128);
  cg.addColorStop(0,    'rgba(255, 210, 100, 1.0)');
  cg.addColorStop(0.12, 'rgba(255, 150,  30, 0.85)');
  cg.addColorStop(0.40, 'rgba(255,  70,   5, 0.3)');
  cg.addColorStop(1,    'rgba(200,  20,   0, 0)');
  ctx.fillStyle = cg;
  ctx.fillRect(0, 0, 256, 256);

  const corona = new THREE.Sprite(new THREE.SpriteMaterial({
    map:         new THREE.CanvasTexture(coronaCv),
    transparent: true,
    blending:    THREE.AdditiveBlending,
    depthWrite:  false,
    opacity:     0.95,
  }));
  corona.scale.set(220, 220, 1);
  corona.position.copy(SUN_POS);
  scene.add(corona);
}

// ══════════════════════════════════════════════════════════════════
//  PLANETS
// ══════════════════════════════════════════════════════════════════

const planetMats = [];

function buildPlanets() {
  // ── Gas giant (purple/blue bands + rings) ──
  {
    const pos = new THREE.Vector3(-110, 18, -190);
    const mat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: `
        varying vec2 vUV;
        varying vec3 vN;
        void main(){
          vUV = uv;
          vN  = normalize(normalMatrix*normal);
          gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        varying vec2 vUV;
        varying vec3 vN;
        float hash2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        void main(){
          float lat = vUV.y;
          float lon = vUV.x;
          float b1 = sin(lat*22.0 + sin(lon*6.28+time*0.018)*0.6 + time*0.035);
          float b2 = sin(lat*9.0  - time*0.022)*0.5;
          float b3 = sin(lat*55.0 + lon*28.0)*0.08;  // fine streaks
          float t  = clamp((b1*0.55 + b2*0.35 + b3 + 1.0)*0.5, 0.0, 1.0);

          vec3 c1 = vec3(0.10,0.08,0.28);
          vec3 c2 = vec3(0.35,0.25,0.55);
          vec3 c3 = vec3(0.55,0.38,0.68);
          vec3 c4 = vec3(0.72,0.50,0.38);  // tan storm band

          vec3 col = mix(c1,c2,smoothstep(0.18,0.42,t));
          col = mix(col,c3,smoothstep(0.42,0.62,t));
          col = mix(col,c4,smoothstep(0.68,0.82,t));

          // Great spot
          vec2 spot = vec2(0.52,0.38);
          float d = length(vec2(lon-spot.x,lat-spot.y)*vec2(1.0,1.8));
          col = mix(col, vec3(0.65,0.32,0.22), smoothstep(0.07,0.04,d)*0.7);

          float lt = max(0.0,dot(vN,normalize(vec3(1.2,0.3,0.6))));
          col *= 0.22 + 0.78*lt;
          gl_FragColor = vec4(col,1.0);
        }
      `,
    });
    const planet = new THREE.Mesh(new THREE.SphereGeometry(16, 64, 64), mat);
    planet.position.copy(pos);
    planet.rotation.z = 0.14;
    scene.add(planet);
    planetMats.push(mat);
    celestialTargets.push({ mesh: planet, lore: CELESTIAL_LORE.gasGiant, pos: pos.clone(), zoomDist: 38 });
    celestialMeshes.push(planet);

    // Rings
    const ringGeo = new THREE.RingGeometry(20, 34, 128);
    // Remap UVs so the ring has a radial gradient texture
    const rp = ringGeo.attributes.position;
    const ruv = ringGeo.attributes.uv;
    const _v = new THREE.Vector3();
    for (let i = 0; i < rp.count; i++) {
      _v.fromBufferAttribute(rp, i);
      ruv.setXY(i, (_v.length() - 20) / 14, 0);
    }

    const ringCv = document.createElement('canvas');
    ringCv.width = 256; ringCv.height = 4;
    const rctx = ringCv.getContext('2d');
    const rg = rctx.createLinearGradient(0,0,256,0);
    rg.addColorStop(0,    'rgba(100,70,150,0)');
    rg.addColorStop(0.1,  'rgba(130,90,180,0.55)');
    rg.addColorStop(0.45, 'rgba(160,120,200,0.7)');
    rg.addColorStop(0.7,  'rgba(140,105,170,0.45)');
    rg.addColorStop(1,    'rgba(90, 60,130,0)');
    rctx.fillStyle = rg;
    rctx.fillRect(0,0,256,4);

    const ringMat = new THREE.MeshBasicMaterial({
      map:         new THREE.CanvasTexture(ringCv),
      side:        THREE.DoubleSide,
      transparent: true,
      depthWrite:  false,
      blending:    THREE.NormalBlending,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.copy(pos);
    ring.rotation.x = Math.PI / 2.1;
    ring.rotation.z = 0.14;
    scene.add(ring);
  }

  // ── Rocky planet ──
  {
    const pos = new THREE.Vector3(130, -28, -220);
    const mat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: `
        varying vec2 vUV;
        varying vec3 vN;
        void main(){
          vUV = uv;
          vN  = normalize(normalMatrix*normal);
          gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        varying vec2 vUV;
        varying vec3 vN;
        float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float n2(vec2 p){
          vec2 i=floor(p),f=fract(p);
          f=f*f*(3.0-2.0*f);
          return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);
        }
        void main(){
          vec2 uv = vUV*9.0;
          float n = n2(uv)*0.5 + n2(uv*2.1)*0.25 + n2(uv*4.3)*0.125 + n2(uv*8.7)*0.0625;
          vec3 c1 = vec3(0.22,0.10,0.09);
          vec3 c2 = vec3(0.38,0.20,0.15);
          vec3 c3 = vec3(0.15,0.13,0.13);
          vec3 col = mix(c1,c2,smoothstep(0.32,0.62,n));
          col = mix(col,c3,smoothstep(0.62,0.80,n)*0.45);
          // Three crater circles
          float cr = 0.0;
          cr += (1.0-smoothstep(0.045,0.065,length(vUV-vec2(0.28,0.60))))*0.5;
          cr += (1.0-smoothstep(0.030,0.050,length(vUV-vec2(0.68,0.32))))*0.5;
          cr += (1.0-smoothstep(0.025,0.040,length(vUV-vec2(0.50,0.72))))*0.5;
          col *= 1.0 - clamp(cr,0.0,1.0)*0.45;
          float lt = max(0.0,dot(vN,normalize(vec3(-0.9,0.3,0.5))));
          col *= 0.12 + 0.88*lt;
          gl_FragColor = vec4(col,1.0);
        }
      `,
    });
    const planet = new THREE.Mesh(new THREE.SphereGeometry(9, 48, 48), mat);
    planet.position.copy(pos);
    scene.add(planet);
    planetMats.push(mat);
    celestialTargets.push({ mesh: planet, lore: CELESTIAL_LORE.rockyPlanet, pos: pos.clone(), zoomDist: 22 });
    celestialMeshes.push(planet);
  }
}

// ══════════════════════════════════════════════════════════════════
//  BACK-HEMISPHERE OBJECTS  (visible when the player turns around)
// ══════════════════════════════════════════════════════════════════

function buildBackObjects() {
  // ── Extra nebulas behind the camera (positive Z) ──
  const backNebDefs = [
    { r: 0,   g: 80,  b: 200, pos: [ -65, 25,  155], sz: 210, rot:  0.5 },
    { r: 120, g: 0,   b: 90,  pos: [  95,-35,  185], sz: 250, rot: -0.8 },
    { r: 15,  g: 120, b: 70,  pos: [-140, 45,  230], sz: 185, rot:  1.3 },
    { r: 80,  g: 40,  b: 0,   pos: [  30, 60,  120], sz: 160, rot: -0.3 },
  ];
  backNebDefs.forEach(d => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map:         makeNebulaCanvas(d.r, d.g, d.b),
      transparent: true,
      blending:    THREE.AdditiveBlending,
      depthWrite:  false,
      opacity:     0.55,
      rotation:    d.rot,
    }));
    sprite.position.set(...d.pos);
    sprite.scale.set(d.sz, d.sz, 1);
    scene.add(sprite);
  });

  // ── Ice giant (blue banded, icy poles) ──
  {
    const pos = new THREE.Vector3(-95, 14, 175);
    const mat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: `
        varying vec2 vUV; varying vec3 vN;
        void main(){
          vUV = uv; vN = normalize(normalMatrix*normal);
          gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);
        }
      `,
      fragmentShader: `
        uniform float time; varying vec2 vUV; varying vec3 vN;
        float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float n2(vec2 p){
          vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);
        }
        void main(){
          float lat = vUV.y;
          float b1 = sin(lat*16.0 + time*0.020)*0.5 + 0.5;
          float b2 = sin(lat*5.0  - time*0.015)*0.3;
          float n  = n2(vUV*8.0)*0.35 + n2(vUV*16.0)*0.15;
          float t  = clamp(b1*0.55 + b2*0.25 + n, 0.0, 1.0);
          vec3 c1  = vec3(0.04, 0.10, 0.30);
          vec3 c2  = vec3(0.12, 0.32, 0.58);
          vec3 c3  = vec3(0.60, 0.80, 0.95);  // icy white caps
          vec3 col = mix(c1, c2, smoothstep(0.28, 0.60, t));
          float pole = abs(lat * 2.0 - 1.0);
          col = mix(col, c3, smoothstep(0.68, 0.86, t) * (1.0 - pole * 0.4));
          float lt = max(0.0, dot(vN, normalize(vec3(0.5, 0.2, -0.9))));
          col *= 0.14 + 0.86 * lt;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const planet = new THREE.Mesh(new THREE.SphereGeometry(13, 56, 56), mat);
    planet.position.copy(pos);
    planet.rotation.z = 0.08;
    scene.add(planet);
    planetMats.push(mat);
    celestialTargets.push({ mesh: planet, lore: CELESTIAL_LORE.iceGiant, pos: pos.clone(), zoomDist: 30 });
    celestialMeshes.push(planet);

    // Faint icy ring
    const ringGeo = new THREE.RingGeometry(17, 27, 96);
    const rp = ringGeo.attributes.position;
    const ruv = ringGeo.attributes.uv;
    const _rv = new THREE.Vector3();
    for (let i = 0; i < rp.count; i++) {
      _rv.fromBufferAttribute(rp, i);
      ruv.setXY(i, (_rv.length() - 17) / 10, 0);
    }
    const ringCv = document.createElement('canvas');
    ringCv.width = 256; ringCv.height = 4;
    const rctx = ringCv.getContext('2d');
    const rg = rctx.createLinearGradient(0, 0, 256, 0);
    rg.addColorStop(0,    'rgba(80,140,200,0)');
    rg.addColorStop(0.1,  'rgba(120,180,240,0.40)');
    rg.addColorStop(0.5,  'rgba(180,220,255,0.55)');
    rg.addColorStop(0.85, 'rgba(100,160,210,0.30)');
    rg.addColorStop(1,    'rgba(60, 100,160,0)');
    rctx.fillStyle = rg; rctx.fillRect(0, 0, 256, 4);
    const ringMat = new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(ringCv),
      side: THREE.DoubleSide, transparent: true, depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.copy(pos);
    ring.rotation.x = Math.PI / 2.3;
    ring.rotation.z = 0.08;
    scene.add(ring);
  }

  // ── Red dwarf star (dim, reddish FBM, with corona glow) ──
  {
    const POS = new THREE.Vector3(75, 28, 235);
    const mat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: `
        varying vec3 vN; varying vec3 vP;
        void main(){
          vN = normalize(normalMatrix*normal); vP = position;
          gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);
        }
      `,
      fragmentShader: `
        uniform float time; varying vec3 vN; varying vec3 vP;
        float hash(vec3 p){p=fract(p*vec3(443.8975,397.2973,491.1871));p+=dot(p.xyz,p.yzx+19.19);return fract(p.x*p.y*p.z);}
        float vn(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
          return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                     mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
        float fbm(vec3 p){float v=0.0,a=0.5;for(int i=0;i<5;i++){v+=a*vn(p);p*=2.1;a*=0.5;}return v;}
        void main(){
          vec3 p = vP * 0.065 + vec3(time * 0.020);
          float n = fbm(p + vec3(fbm(p + time * 0.013)));
          vec3 cCool = vec3(2.0, 0.12, 0.03);
          vec3 cHot  = vec3(4.0, 0.90, 0.08);
          vec3 col   = mix(cCool, cHot, smoothstep(0.32, 0.70, n));
          float limb = abs(dot(vN, normalize(vec3(0.0, 0.0, 1.0))));
          col *= 0.28 + 0.72 * limb;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const star = new THREE.Mesh(new THREE.SphereGeometry(9, 48, 48), mat);
    star.position.copy(POS);
    scene.add(star);
    planetMats.push(mat);
    celestialTargets.push({ mesh: star, lore: CELESTIAL_LORE.redDwarf, pos: POS.clone(), zoomDist: 22 });
    celestialMeshes.push(star);

    // Corona glow
    const glowCv = document.createElement('canvas');
    glowCv.width = glowCv.height = 256;
    const ctx = glowCv.getContext('2d');
    const cg = ctx.createRadialGradient(128, 128, 6, 128, 128, 128);
    cg.addColorStop(0,    'rgba(255, 130, 40, 1.0)');
    cg.addColorStop(0.14, 'rgba(200, 55,  10, 0.75)');
    cg.addColorStop(0.45, 'rgba(140, 15,   0, 0.22)');
    cg.addColorStop(1,    'rgba(70,   0,   0, 0)');
    ctx.fillStyle = cg;
    ctx.fillRect(0, 0, 256, 256);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(glowCv),
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.88,
    }));
    glow.scale.set(110, 110, 1);
    glow.position.copy(POS);
    scene.add(glow);
  }

  // ── Distant blue-white star cluster (a few bright point sprites) ──
  {
    const clusterCenter = new THREE.Vector3(-30, -20, 210);
    const clusterCv = document.createElement('canvas');
    clusterCv.width = clusterCv.height = 64;
    const cctx = clusterCv.getContext('2d');
    const ccg = cctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    ccg.addColorStop(0,   'rgba(200, 225, 255, 1)');
    ccg.addColorStop(0.3, 'rgba(140, 190, 255, 0.5)');
    ccg.addColorStop(1,   'rgba(80,  130, 255, 0)');
    cctx.fillStyle = ccg;
    cctx.fillRect(0, 0, 64, 64);
    const clusterTex = new THREE.CanvasTexture(clusterCv);

    const offsets = [
      [0, 0, 0], [8, 5, -4], [-6, -8, 3], [12, -3, 6], [-10, 7, -2],
      [4, 12, -7], [-3, -12, 5], [15, 2, -9], [-14, -4, 8], [6, -6, 12],
    ];
    const scales = [18, 10, 14, 8, 12, 7, 9, 11, 13, 8];
    offsets.forEach((off, idx) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: clusterTex, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false,
        opacity: 0.5 + Math.random() * 0.4,
      }));
      const sc = scales[idx];
      s.scale.set(sc, sc, 1);
      s.position.set(clusterCenter.x + off[0], clusterCenter.y + off[1], clusterCenter.z + off[2]);
      scene.add(s);
    });
  }
}

// ══════════════════════════════════════════════════════════════════
//  COMET  (animated vertex-colour trail)
// ══════════════════════════════════════════════════════════════════

const comet = (() => {
  const TRAIL = 90;
  const trailPos = new Float32Array(TRAIL * 3);
  const trailCol = new Float32Array(TRAIL * 3);

  // Head mesh + glow sprite
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  head.visible = false;
  scene.add(head);

  const glowCv = document.createElement('canvas');
  glowCv.width = glowCv.height = 64;
  const gctx = glowCv.getContext('2d');
  const gg = gctx.createRadialGradient(32,32,0, 32,32,32);
  gg.addColorStop(0,   'rgba(210,235,255,1)');
  gg.addColorStop(0.4, 'rgba(120,190,255,0.5)');
  gg.addColorStop(1,   'rgba(60,100,255,0)');
  gctx.fillStyle = gg;
  gctx.fillRect(0,0,64,64);

  const glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(glowCv),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }));
  glowSprite.scale.set(5, 5, 1);
  glowSprite.visible = false;
  scene.add(glowSprite);

  // Trail geometry
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  trailGeo.setAttribute('color',    new THREE.BufferAttribute(trailCol, 3));
  const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent:  true,
    blending:     THREE.AdditiveBlending,
    depthWrite:   false,
    opacity:      0.85,
  }));
  trail.visible = false;
  scene.add(trail);

  // State
  const s = {
    active: false, t: 0,
    restTimer: 10, restDuration: 22,
    start: new THREE.Vector3(), end: new THREE.Vector3(),
    duration: 9, // seconds to cross
  };

  function spawn() {
    const sign = Math.random() > 0.5 ? 1 : -1;
    s.start.set(sign * -210, 35 + Math.random()*40, -70  - Math.random()*50);
    s.end.set(  sign *  210, -25 - Math.random()*25, -110 - Math.random()*60);
    s.t = 0;
    s.active = true;
    // Seed trail at start position
    for (let i = 0; i < TRAIL*3; i += 3) {
      trailPos[i]   = s.start.x;
      trailPos[i+1] = s.start.y;
      trailPos[i+2] = s.start.z;
    }
    head.visible = glowSprite.visible = trail.visible = true;
  }

  return {
    update(dt) {
      if (!s.active) {
        s.restTimer += dt;
        if (s.restTimer >= s.restDuration) { s.restTimer = 0; spawn(); }
        return;
      }
      s.t += dt / s.duration;
      if (s.t >= 1) {
        s.active = false; s.restTimer = 0;
        head.visible = glowSprite.visible = trail.visible = false;
        return;
      }
      const p = s.start.clone().lerp(s.end, s.t);
      head.position.copy(p);
      glowSprite.position.copy(p);

      // Shift ring buffer
      for (let i = TRAIL - 1; i > 0; i--) {
        trailPos[i*3]   = trailPos[(i-1)*3];
        trailPos[i*3+1] = trailPos[(i-1)*3+1];
        trailPos[i*3+2] = trailPos[(i-1)*3+2];
      }
      trailPos[0] = p.x; trailPos[1] = p.y; trailPos[2] = p.z;

      // Fade colours from head (bright) to tail (dark)
      for (let i = 0; i < TRAIL; i++) {
        const fade = Math.pow(1 - i / TRAIL, 1.6);
        trailCol[i*3]   = 0.75 * fade + 0.22;
        trailCol[i*3+1] = 0.88 * fade + 0.12;
        trailCol[i*3+2] = 1.0;
      }
      trailGeo.attributes.position.needsUpdate = true;
      trailGeo.attributes.color.needsUpdate    = true;
    }
  };
})();

// ══════════════════════════════════════════════════════════════════
//  PROJECT FRAMES
// ══════════════════════════════════════════════════════════════════

const frames           = [];
const clickTargets     = [];
const celestialTargets = [];   // { mesh, lore, pos, zoomDist }
const celestialMeshes  = [];   // flat list for raycaster
let   currentZoomType  = 'project'; // 'project' | 'celestial'

function polarToWorld(az_deg, el_deg, r) {
  const az = THREE.MathUtils.degToRad(az_deg);
  const el = THREE.MathUtils.degToRad(el_deg);
  return new THREE.Vector3(
     r * Math.cos(el) * Math.sin(az),
     r * Math.sin(el),
    -r * Math.cos(el) * Math.cos(az)
  );
}

function makeFrameTexture(proj) {
  const W = 1024, H = 768;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');

  // ── Background: solid dark fill + subtle gradient overlay ──
  ctx.fillStyle = '#05080f';
  ctx.fillRect(0, 0, W, H);
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, proj.bgColorTop   + 'cc'); // semi-transparent so base shows
  bg.addColorStop(1, proj.bgColorBottom + 'aa');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // ── Top accent bar ──
  ctx.fillStyle = proj.glowColor;
  ctx.fillRect(0, 0, W, 4);

  // ── Corner brackets ──
  ctx.shadowBlur = 0; // NO canvas shadow — it was blurring everything
  ctx.strokeStyle = proj.glowColor;
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.55;
  [[30,30],[W-30,30],[30,H-30],[W-30,H-30]].forEach(([cx,cy]) => {
    const sx = cx < W/2 ? 44 : -44;
    const sy = cy < H/2 ? 44 : -44;
    ctx.beginPath();
    ctx.moveTo(cx+sx, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy+sy);
    ctx.stroke();
  });
  ctx.globalAlpha = 1.0;

  // ── Title ── (no shadowBlur — keep text crisp)
  ctx.shadowBlur  = 0;
  ctx.fillStyle   = '#ffffff';
  ctx.font        = 'bold 76px "Courier New",monospace';
  ctx.textAlign   = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(proj.title, W/2, 290);

  // ── Divider ──
  ctx.strokeStyle  = proj.glowColor;
  ctx.globalAlpha  = 0.45;
  ctx.lineWidth    = 1.5;
  ctx.beginPath(); ctx.moveTo(80, 318); ctx.lineTo(W-80, 318); ctx.stroke();
  ctx.globalAlpha  = 1.0;

  // ── Tech tags — individual pill badges ──
  const tags      = proj.tech;
  const padX      = 22, tagH = 52, gap = 12;
  let   fontSize  = 30;
  ctx.font        = `bold ${fontSize}px "Courier New",monospace`;
  let tagWidths   = tags.map(t => ctx.measureText(t).width + padX * 2);
  let totalTagW   = tagWidths.reduce((a, b) => a + b, 0) + gap * (tags.length - 1);

  // Shrink font if all tags don't fit
  if (totalTagW > W - 60) {
    fontSize    = Math.max(20, Math.floor(fontSize * (W - 60) / totalTagW));
    ctx.font    = `bold ${fontSize}px "Courier New",monospace`;
    tagWidths   = tags.map(t => ctx.measureText(t).width + padX * 2);
    totalTagW   = tagWidths.reduce((a, b) => a + b, 0) + gap * (tags.length - 1);
  }

  let tx = W / 2 - totalTagW / 2;
  const ty = 348;
  tags.forEach((tag, i) => {
    const tw = tagWidths[i];
    // Dark solid pill background — high contrast base
    ctx.fillStyle = 'rgba(0,0,0,0.60)';
    ctx.fillRect(tx, ty, tw, tagH);
    // Coloured border
    ctx.strokeStyle  = proj.glowColor;
    ctx.lineWidth    = 1.5;
    ctx.globalAlpha  = 0.8;
    ctx.strokeRect(tx + 0.75, ty + 0.75, tw - 1.5, tagH - 1.5);
    ctx.globalAlpha  = 1.0;
    // Tag text — white so it's always readable regardless of glowColor
    ctx.fillStyle    = '#ffffff';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';
    ctx.font         = `bold ${fontSize}px "Courier New",monospace`;
    ctx.fillText(tag, tx + padX, ty + tagH / 2);
    tx += tw + gap;
  });

  // ── Explore hint ──
  ctx.font         = '22px "Courier New",monospace';
  ctx.fillStyle    = 'rgba(255,255,255,0.28)';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('CLICK TO EXPLORE', W/2, H - 30);

  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter      = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

function makeNeonBorder(w, h, color) {
  const hw = w/2 + 0.06, hh = h/2 + 0.06;
  const pts = [
    [-hw,-hh,0],[hw,-hh,0],[hw,hh,0],[-hw,hh,0],[-hw,-hh,0]
  ].map(p => new THREE.Vector3(...p));
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  return new THREE.Line(geo, new THREE.LineBasicMaterial({ color: new THREE.Color(color) }));
}

function makeGlowBg(w, h, color) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w+0.6, h+0.6),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      transparent: true, opacity: 0.07,
      blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide,
    })
  );
  m.position.z = -0.02;
  return m;
}

// Reusable quaternion objects for float animation (avoid per-frame allocation)
const _tiltQ    = new THREE.Quaternion();
const _tiltAxis = new THREE.Vector3(1, 0, 0);

function buildFrames() {
  PROJECTS.forEach((proj, i) => {
    if (i >= FRAME_POLAR.length) return;
    const [az, el, r] = FRAME_POLAR[i];
    const wp = polarToWorld(az, el, r);

    const group = new THREE.Group();
    group.position.copy(wp);
    group.lookAt(0, 0, 0);  // face the camera origin — stored in userData below
    group.userData = {
      proj,
      baseQuat:   group.quaternion.clone(),
      baseY:      wp.y,
      floatPhase: Math.random() * Math.PI * 2,
      floatAmp:   0.07 + Math.random() * 0.055,
      floatSpeed: 0.32 + Math.random() * 0.22,
      glowMesh:   null,
      panelMesh:  null,
    };

    // Panel
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(FRAME_W, FRAME_H),
      new THREE.MeshBasicMaterial({ map: makeFrameTexture(proj), side: THREE.DoubleSide })
    );
    panel.userData.frameGroup = group;
    group.userData.panelMesh  = panel;
    group.add(panel);
    clickTargets.push(panel);

    // Border
    group.add(makeNeonBorder(FRAME_W, FRAME_H, proj.glowColor));

    // Glow background
    const glow = makeGlowBg(FRAME_W, FRAME_H, proj.glowColor);
    group.userData.glowMesh = glow;
    group.add(glow);

    scene.add(group);
    frames.push(group);
  });
}

// ══════════════════════════════════════════════════════════════════
//  INTERACTION  (pointer events)
// ══════════════════════════════════════════════════════════════════

const raycaster   = new THREE.Raycaster();
const ndcMouse    = new THREE.Vector2();
let   hoveredFrame = null;

let pointerDownOrigin = { x: 0, y: 0 };
let lastDragX  = 0, lastDragY = 0;
let isDragging = false;
let dragDist   = 0;

function updateCameraMatrix() {
  camera.position.copy(cam.pos);
  if (cam.mode === 'freelook') {
    cam.target.copy(camDir()); // direction = lookAt when pos is origin
  }
  camera.lookAt(cam.target);
  camera.updateMatrixWorld();
}

function checkHover() {
  updateCameraMatrix();
  raycaster.setFromCamera(ndcMouse, camera);
  const frameHits = raycaster.intersectObjects(clickTargets);
  const hit = frameHits.length ? frameHits[0].object.userData.frameGroup : null;

  // Update frame glow on change
  if (hit !== hoveredFrame) {
    if (hoveredFrame) {
      gsap.to(hoveredFrame.userData.glowMesh.material, { opacity: 0.07, duration: 0.3 });
      gsap.to(hoveredFrame.scale, { x: 1, y: 1, z: 1, duration: 0.3 });
    }
    hoveredFrame = hit;
    if (hoveredFrame) {
      gsap.to(hoveredFrame.userData.glowMesh.material, { opacity: 0.28, duration: 0.3 });
      gsap.to(hoveredFrame.scale, { x: 1.05, y: 1.05, z: 1.05, duration: 0.3 });
    }
  }

  // Show pointer cursor when over any frame or celestial body
  const overCelestial = !hit && raycaster.intersectObjects(celestialMeshes).length > 0;
  document.body.classList.toggle('hovering', !!(hit || overCelestial));
}

function handleClick() {
  if (cam.mode !== 'freelook') return;
  updateCameraMatrix();
  raycaster.setFromCamera(ndcMouse, camera);

  // Project frames take priority
  const frameHits = raycaster.intersectObjects(clickTargets);
  if (frameHits.length) {
    zoomIn(frameHits[0].object.userData.frameGroup);
    return;
  }

  // Celestial easter eggs
  const celHits = raycaster.intersectObjects(celestialMeshes);
  if (celHits.length) {
    const target = celestialTargets.find(c => c.mesh === celHits[0].object);
    if (target) zoomToCelestial(target);
  }
}

function setupInput() {
  // ── Mouse / pointer ──
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    isDragging = true;
    dragDist   = 0;
    pointerDownOrigin = { x: e.clientX, y: e.clientY };
    lastDragX = e.clientX;
    lastDragY = e.clientY;
    document.body.classList.add('dragging');
  });

  window.addEventListener('pointermove', e => {
    ndcMouse.set(
      (e.clientX / innerWidth)  * 2 - 1,
      -(e.clientY / innerHeight) * 2 + 1
    );

    if (isDragging && cam.mode === 'freelook') {
      // Accumulate total distance from mousedown for click-vs-drag detection
      dragDist = Math.hypot(
        e.clientX - pointerDownOrigin.x,
        e.clientY - pointerDownOrigin.y
      );
      // Incremental delta for smooth rotation
      cam.yaw  -= (e.clientX - lastDragX) * 0.004;
      cam.pitch = THREE.MathUtils.clamp(
        cam.pitch + (e.clientY - lastDragY) * 0.004,
        -PITCH_LIMIT, PITCH_LIMIT
      );
      lastDragX = e.clientX;
      lastDragY = e.clientY;
    } else if (cam.mode === 'freelook' && !isDragging) {
      checkHover();
    }
  });

  window.addEventListener('pointerup', e => {
    if (e.button !== 0) return;
    const wasDrag = isDragging;
    isDragging = false;
    document.body.classList.remove('dragging');
    if (wasDrag && dragDist < DRAG_THRESH) handleClick();
  });

  // ── Touch (mobile) ──
  let lastTX = 0, lastTY = 0, touchDist = 0;
  canvas.addEventListener('touchstart', e => {
    const t = e.touches[0];
    lastTX = t.clientX; lastTY = t.clientY; touchDist = 0;
    ndcMouse.set((t.clientX/innerWidth)*2-1, -(t.clientY/innerHeight)*2+1);
  }, { passive: true });

  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    const t = e.touches[0];
    const dx = t.clientX - lastTX, dy = t.clientY - lastTY;
    touchDist += Math.hypot(dx, dy);
    ndcMouse.set((t.clientX/innerWidth)*2-1, -(t.clientY/innerHeight)*2+1);
    if (cam.mode === 'freelook') {
      cam.yaw   -= dx * 0.005;
      cam.pitch  = THREE.MathUtils.clamp(cam.pitch + dy * 0.005, -PITCH_LIMIT, PITCH_LIMIT);
    }
    lastTX = t.clientX; lastTY = t.clientY;
  }, { passive: false });

  canvas.addEventListener('touchend', () => {
    if (touchDist < 12) handleClick();
  });

  // ── Keyboard ──
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && cam.mode === 'zoomed') zoomOut();
  });

  // ── Overlay close ──
  document.querySelector('.overlay-close')  .addEventListener('click', zoomOut);
  document.querySelector('.overlay-backdrop').addEventListener('click', zoomOut);
  document.querySelector('.lore-close')      .addEventListener('click', zoomOut);

  // ── Resize ──
  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    composer.setSize(innerWidth, innerHeight);
    hdrTarget.setSize(innerWidth, innerHeight);
    bloomPass.resolution.set(innerWidth, innerHeight);
  });
}

// ══════════════════════════════════════════════════════════════════
//  ZOOM IN / OUT
// ══════════════════════════════════════════════════════════════════

function zoomIn(group) {
  cam.mode = 'transitioning';
  cam.savedYaw   = cam.yaw;
  cam.savedPitch = cam.pitch;
  document.getElementById('header').classList.add('hidden');
  document.body.classList.remove('hovering');
  hoveredFrame = null;

  // Camera target: 3.6 units in front of the frame
  const worldPos = new THREE.Vector3();
  group.getWorldPosition(worldPos);
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(group.quaternion);
  const camTarget = worldPos.clone().addScaledVector(fwd, 3.6);

  const tl = gsap.timeline({
    onComplete: () => {
      cam.mode = 'zoomed';
      showOverlay(group.userData.proj);
    }
  });
  tl.to(cam.pos,    { x: camTarget.x, y: camTarget.y, z: camTarget.z, duration: 1.5, ease: 'power3.inOut' }, 0);
  tl.to(cam.target, { x: worldPos.x,  y: worldPos.y,  z: worldPos.z,  duration: 1.5, ease: 'power3.inOut' }, 0);

  frames.forEach(f => {
    if (f === group) return;
    f.userData.panelMesh.material.transparent = true;
    gsap.to(f.userData.panelMesh.material, { opacity: 0.07, duration: 0.9 });
    gsap.to(f.userData.glowMesh.material,  { opacity: 0,    duration: 0.7 });
  });
}

function zoomToCelestial(target) {
  cam.mode = 'transitioning';
  currentZoomType = 'celestial';
  cam.savedYaw    = cam.yaw;
  cam.savedPitch  = cam.pitch;
  document.getElementById('header').classList.add('hidden');
  document.body.classList.remove('hovering');
  hoveredFrame = null;

  // Approach from the origin-side so the planet is lit and centred
  const dir    = target.pos.clone().normalize();
  const camPos = target.pos.clone().sub(dir.multiplyScalar(target.zoomDist));

  const tl = gsap.timeline({
    onComplete: () => { cam.mode = 'zoomed'; showLore(target.lore); }
  });
  tl.to(cam.pos,    { x: camPos.x,      y: camPos.y,      z: camPos.z,      duration: 1.8, ease: 'power3.inOut' }, 0);
  tl.to(cam.target, { x: target.pos.x,  y: target.pos.y,  z: target.pos.z,  duration: 1.8, ease: 'power3.inOut' }, 0);

  // Fade project frames out of the way
  frames.forEach(f => {
    f.userData.panelMesh.material.transparent = true;
    gsap.to(f.userData.panelMesh.material, { opacity: 0.04, duration: 0.9 });
    gsap.to(f.userData.glowMesh.material,  { opacity: 0,    duration: 0.7 });
  });
}

function zoomOut() {
  cam.mode = 'transitioning';
  if (currentZoomType === 'celestial') {
    hideLore();
  } else {
    hideOverlay();
  }

  // Restore look direction from saved yaw/pitch
  const restoredTarget = new THREE.Vector3(
    Math.sin(cam.savedYaw) * Math.cos(cam.savedPitch),
    Math.sin(cam.savedPitch),
   -Math.cos(cam.savedYaw) * Math.cos(cam.savedPitch)
  );

  const tl = gsap.timeline({
    onComplete: () => {
      cam.yaw        = cam.savedYaw;
      cam.pitch      = cam.savedPitch;
      cam.mode       = 'freelook';
      currentZoomType = 'project';
      document.getElementById('header').classList.remove('hidden');
      hoveredFrame = null;
    }
  });
  tl.to(cam.pos,    { x: 0, y: 0, z: 0, duration: 1.5, ease: 'power3.inOut' }, 0);
  tl.to(cam.target, { x: restoredTarget.x, y: restoredTarget.y, z: restoredTarget.z, duration: 1.5, ease: 'power3.inOut' }, 0);

  frames.forEach(f => {
    gsap.to(f.userData.panelMesh.material, { opacity: 1,    duration: 0.9 });
    gsap.to(f.userData.glowMesh.material,  { opacity: 0.07, duration: 0.9 });
    gsap.to(f.scale, { x: 1, y: 1, z: 1, duration: 0.3 });
  });
}

// ══════════════════════════════════════════════════════════════════
//  OVERLAY HTML
// ══════════════════════════════════════════════════════════════════

function showOverlay(proj) {
  const overlay = document.getElementById('overlay');
  const panel   = overlay.querySelector('.overlay-panel');
  panel.style.setProperty('--glow', proj.glowColor);
  overlay.querySelector('.overlay-title').textContent = proj.title;
  overlay.querySelector('.overlay-desc').textContent  = proj.description;

  const techWrap = overlay.querySelector('.overlay-tech');
  techWrap.innerHTML = '';
  proj.tech.forEach(t => {
    const s = document.createElement('span');
    s.className = 'tech-tag';
    s.textContent = t;
    s.style.setProperty('--glow', proj.glowColor);
    techWrap.appendChild(s);
  });

  const imgWrap = overlay.querySelector('.overlay-images');
  imgWrap.innerHTML = '';
  (proj.images || []).forEach(src => {
    const img = document.createElement('img');
    img.src = src; img.alt = proj.title;
    imgWrap.appendChild(img);
  });

  const link = overlay.querySelector('.overlay-link');
  if (proj.link && proj.link !== '#') {
    link.href = proj.link; link.style.display = '';
    link.style.setProperty('--glow', proj.glowColor);
  } else {
    link.style.display = 'none';
  }

  overlay.classList.add('visible');
}

function hideOverlay() {
  document.getElementById('overlay').classList.remove('visible');
}

function showLore(lore) {
  const panel = document.getElementById('lore-panel');
  panel.style.setProperty('--lore-glow', lore.glowColor);
  panel.querySelector('.lore-tag').textContent  = '// CLASSIFIED RECORD';
  panel.querySelector('.lore-name').textContent  = lore.name;
  panel.querySelector('.lore-class').textContent = lore.type;
  panel.querySelector('.lore-desc').textContent  = lore.desc;

  const statsList = panel.querySelector('.lore-stats');
  statsList.innerHTML = '';
  lore.stats.forEach(s => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="lore-stat-label">${s.label}</span><span class="lore-stat-value">${s.value}</span>`;
    statsList.appendChild(li);
  });

  panel.classList.add('visible');
}

function hideLore() {
  document.getElementById('lore-panel').classList.remove('visible');
}

// ══════════════════════════════════════════════════════════════════
//  ANIMATION LOOP
// ══════════════════════════════════════════════════════════════════

let lastT = 0;

function animate(nowMs) {
  requestAnimationFrame(animate);

  const t  = nowMs * 0.001;          // seconds
  const dt = Math.min(t - lastT, 0.05); // cap spike on tab-refocus
  lastT = t;

  // 1 ── Update time uniforms
  if (starUniforms) starUniforms.time.value = t;
  if (sunUniforms)  sunUniforms.time.value  = t;
  planetMats.forEach(m => { m.uniforms.time.value = t; });

  // 2 ── Float project frames (only in freelook / not zoomed)
  if (cam.mode !== 'zoomed') {
    frames.forEach(f => {
      const d = f.userData;
      f.position.y = d.baseY + Math.sin(t * d.floatSpeed + d.floatPhase) * d.floatAmp;
      // Gentle tilt wobble — restore base quat first so it doesn't accumulate
      f.quaternion.copy(d.baseQuat);
      _tiltQ.setFromAxisAngle(_tiltAxis, Math.sin(t * d.floatSpeed * 0.65 + d.floatPhase) * 0.014);
      f.quaternion.multiply(_tiltQ);
    });
  }

  // 3 ── Comet
  comet.update(dt);

  // 4 ── Camera
  camera.position.copy(cam.pos);
  if (cam.mode === 'freelook') {
    cam.target.copy(camDir());
  }
  camera.lookAt(cam.target);

  // 5 ── Render through post-processing
  composer.render();
}

// ══════════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════════

function init() {
  buildStars();
  buildNebulas();
  buildSun();
  buildPlanets();
  buildBackObjects();
  buildFrames();
  setupInput();

  // Loading bar then reveal
  const bar = document.querySelector('.loading-bar');
  gsap.to(bar, {
    width: '100%',
    duration: 1.4,
    ease: 'power2.out',
    onComplete: () => {
      setTimeout(() => {
        const loading = document.getElementById('loading');
        loading.classList.add('hidden');
        setTimeout(() => { loading.style.display = 'none'; }, 950);
      }, 250);
    }
  });

  requestAnimationFrame(animate);
}

init();
