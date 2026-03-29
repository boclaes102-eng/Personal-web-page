/**
 * celestials.js
 * Sun, planets, back-hemisphere objects, and their lore data.
 * Call buildCelestials() once, then updateCelestials(t, dt) each frame.
 *
 * Exports:
 *   buildCelestials()  — add all bodies to the scene
 *   updateCelestials(t, dt) — update shader time uniforms + mesh rotation
 *   celestialTargets   — [{ mesh, lore, pos, zoomDist, rotSpeed }]  for click/zoom
 *   celestialMeshes    — flat mesh list for raycaster hover detection
 */

import * as THREE         from 'three';
import { scene }          from '../core/renderer.js';
import { makeNebulaCanvas } from './environment.js';

// ── Lore database ─────────────────────────────────────────────────────────────
const CELESTIAL_LORE = {
  sun: {
    name: "HD-7819  ·  'The Ember'",
    type: "G-TYPE MAIN SEQUENCE STAR",
    glowColor: "#ffaa33",
    desc: "Catalogued as HD-7819 by the Outer Survey Authority, this aging yellow dwarf was informally named 'The Ember' by deep-range explorers who noted its unusually turbulent chromosphere. A major coronal mass ejection circa 6,000 BCE is thought to have sterilised the inner system, leaving vitrified silicate plains on its two nearest neighbours.",
    stats: [
      { label: "AGE",      value: "4.8 billion yrs" },
      { label: "RADIUS",   value: "0.97 R☉"         },
      { label: "SURFACE",  value: "5,720 K"          },
      { label: "DISTANCE", value: "2.4 ly"           },
    ],
  },
  gasGiant: {
    name: "Veranthos-IV",
    type: "CLASS-J GAS GIANT",
    glowColor: "#aa77ff",
    desc: "The largest body in this system, distinguished by a 40,000 km anticyclonic storm — the 'Eye' — active for over 900 years of recorded observation. The innermost ring band was artificially seeded in 2251 by the Kepler Mining Consortium before the operation was abandoned. Salvage rights remain disputed under Sector 9 treaty law.",
    stats: [
      { label: "MASS",   value: "318 M⊕"          },
      { label: "RADIUS", value: "11.2 R⊕"         },
      { label: "ORBIT",  value: "84.3 std. years"  },
      { label: "MOONS",  value: "63 confirmed"     },
    ],
  },
  rockyPlanet: {
    name: "Cinder",
    type: "BARREN TERRESTRIAL",
    glowColor: "#ff6633",
    desc: "Once theorised to harbour microbial life in subsurface thermal vents, Cinder was stripped of its atmosphere during a solar ejection event. Its three large impact craters were formed by a single fragmented asteroid whose trajectory suggests an extrasystem origin. The resonance frequency of the central basin served as a navigational beacon until relay station decommission in 2298.",
    stats: [
      { label: "RADIUS",  value: "0.73 R⊕"    },
      { label: "SURFACE", value: "412°C mean"  },
      { label: "GRAVITY", value: "0.61 g"      },
      { label: "CRATERS", value: "3 major basins" },
    ],
  },
  iceGiant: {
    name: "Solace",
    type: "ICE GIANT",
    glowColor: "#66ccff",
    desc: "Outermost confirmed planet of the HD-7819 system. Early deep-space travellers used it as a waypoint, giving rise to the name. Probe data from 2247 detected a liquid water ocean beneath roughly 80 km of compressed ice. The probe was lost before a second contact window; no follow-up mission has received funding.",
    stats: [
      { label: "MASS",  value: "17.1 M⊕"         },
      { label: "TEMP",  value: "−218°C deck"      },
      { label: "ORBIT", value: "164 std. years"   },
      { label: "OCEAN", value: "Subsurface ?"     },
    ],
  },
  redDwarf: {
    name: "Mira's Lantern",
    type: "ROGUE M-TYPE RED DWARF",
    glowColor: "#ff5522",
    desc: "A rogue stellar object not gravitationally bound to HD-7819. First catalogued by xenocartographer Mira Osei in 2189, who plotted its transit trajectory through this sector. It will clear the outer system boundary in approximately 4,200 years. Intense flare activity cycling every ~37 hours makes nearby habitation impractical.",
    stats: [
      { label: "MASS",     value: "0.18 M☉"      },
      { label: "SURFACE",  value: "3,200 K"       },
      { label: "FLARE",    value: "~37 hr cycle"  },
      { label: "VELOCITY", value: "114 km/s rel." },
    ],
  },
};

// ── Shared lists (imported by input.js and main.js) ───────────────────────────
export const celestialTargets = [];  // { mesh, lore, pos, zoomDist, rotSpeed }
export const celestialMeshes  = [];  // flat list for raycaster

const planetMats = [];               // shader materials that need time uniform updates
let   _sunUniforms = null;           // kept separate so sun shader can tick independently

// ── Sun ───────────────────────────────────────────────────────────────────────
function buildSun() {
  // Far right, below horizon, deep in the scene — visible but not in the way of project frames.
  const SUN_POS = new THREE.Vector3(180, -50, -320);
  _sunUniforms  = { time: { value: 0 } };

  const sunMat = new THREE.ShaderMaterial({
    uniforms: _sunUniforms,
    vertexShader: `
      varying vec3 vN; varying vec3 vP;
      void main() {
        vN = normalize(normalMatrix * normal); vP = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time; varying vec3 vN; varying vec3 vP;
      // hash/vnoise/fbm: value noise + 6-octave fractal brownian motion (fBm).
      // The large constants in hash() (443, 397, 491, 19.19) are arbitrary primes chosen
      // to scatter bits widely — avoids visible grid artefacts in the noise output.
      float hash(vec3 p){p=fract(p*vec3(443.8975,397.2973,491.1871));p+=dot(p.xyz,p.yzx+19.19);return fract(p.x*p.y*p.z);}
      float vnoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f); // smoothstep on f
        return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
      // fBm: 6 octaves, each halving amplitude (a*=0.5) and doubling frequency (p*=2.1).
      float fbm(vec3 p){float v=0.0,a=0.5;for(int i=0;i<6;i++){v+=a*vnoise(p);p*=2.1;a*=0.5;}return v;}
      void main() {
        // Domain-warped fBm: warp the sample point with fbm itself for more organic turbulence.
        // Scale 0.04 keeps features large enough to see; time offsets animate the surface.
        vec3 p  = vP * 0.04 + vec3(time * 0.018);
        float n = fbm(p + vec3(fbm(p + time*0.012), fbm(p*1.3 - time*0.008), 0.0));
        // HDR colour stops (values > 1.0 exceed the bloom threshold and glow).
        // cCool = dark orange sunspot; cMid = mid photosphere; cHot = bright granule peak.
        vec3 cCool = vec3(1.4, 0.25, 0.02);
        vec3 cMid  = vec3(3.2, 1.4,  0.05);
        vec3 cHot  = vec3(5.0, 3.8,  0.8);
        vec3 col   = mix(cCool, cMid, smoothstep(0.30, 0.58, n));
        col        = mix(col,   cHot, smoothstep(0.55, 0.82, n));
        // Limb darkening: edges of the disc face away from camera (dot→0) and darken.
        float limb = abs(dot(vN, normalize(vec3(0.0, 0.0, 1.0))));
        col *= 0.35 + 0.65 * limb; // edges are 35% as bright as the centre
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const sun = new THREE.Mesh(new THREE.SphereGeometry(28, 64, 64), sunMat);
  sun.position.copy(SUN_POS);
  scene.add(sun);
  // zoomDist: camera stops 65 units from the sun's centre — far enough to see the whole disc.
  // rotSpeed: radians/second for the spin applied in updateCelestials().
  celestialTargets.push({ mesh: sun, lore: CELESTIAL_LORE.sun, pos: SUN_POS.clone(), zoomDist: 65, rotSpeed: 0.012 });
  celestialMeshes.push(sun);

  // Corona glow sprite
  const coronaCv = document.createElement('canvas');
  coronaCv.width = coronaCv.height = 256;
  const ctx = coronaCv.getContext('2d');
  const cg  = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
  cg.addColorStop(0,    'rgba(255, 210, 100, 1.0)');
  cg.addColorStop(0.12, 'rgba(255, 150,  30, 0.85)');
  cg.addColorStop(0.40, 'rgba(255,  70,   5, 0.3)');
  cg.addColorStop(1,    'rgba(200,  20,   0, 0)');
  ctx.fillStyle = cg;
  ctx.fillRect(0, 0, 256, 256);
  const corona = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(coronaCv), transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.95,
  }));
  corona.scale.set(220, 220, 1);
  corona.position.copy(SUN_POS);
  scene.add(corona);
}

// ── Front planets ─────────────────────────────────────────────────────────────
function buildPlanets() {
  // Gas giant (purple/blue bands + rings)
  {
    const pos = new THREE.Vector3(-110, 18, -190);
    const mat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: `
        varying vec2 vUV; varying vec3 vN;
        void main(){ vUV=uv; vN=normalize(normalMatrix*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }
      `,
      fragmentShader: `
        uniform float time; varying vec2 vUV; varying vec3 vN;
        float hash2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        void main(){
          float lat=vUV.y, lon=vUV.x;
          // Three superimposed sine bands at different frequencies create gas-giant banding.
          // b1: primary wide bands (freq 22) with slow longitudinal drift.
          // b2: secondary broader bands (freq 9) moving in the opposite direction.
          // b3: fine texture detail (freq 55/28) — subtle wavy noise on top.
          float b1=sin(lat*22.0+sin(lon*6.28+time*0.018)*0.6+time*0.035);
          float b2=sin(lat*9.0-time*0.022)*0.5;
          float b3=sin(lat*55.0+lon*28.0)*0.08;
          // Combine bands into 0–1 scalar: weighted sum re-centred to positive range.
          float t=clamp((b1*0.55+b2*0.35+b3+1.0)*0.5,0.0,1.0);
          // Four colour stops from dark-purple core to tan outer belts.
          // c1: deepest belt shadow; c2: mid-purple; c3: bright violet; c4: tan-orange highlight.
          vec3 c1=vec3(0.10,0.08,0.28),c2=vec3(0.35,0.25,0.55),c3=vec3(0.55,0.38,0.68),c4=vec3(0.72,0.50,0.38);
          vec3 col=mix(c1,c2,smoothstep(0.18,0.42,t));
          col=mix(col,c3,smoothstep(0.42,0.62,t));
          col=mix(col,c4,smoothstep(0.68,0.82,t));
          // The "Eye" (great anticyclonic storm) at UV (0.52, 0.38).
          // Elliptical distance (x scaled 1.0, y scaled 1.8) makes it wider than tall.
          // smoothstep(0.07, 0.04, d) inverts: inside radius 0.04 = full spot, outside 0.07 = none.
          vec2 spot=vec2(0.52,0.38);
          float d=length(vec2(lon-spot.x,lat-spot.y)*vec2(1.0,1.8));
          col=mix(col,vec3(0.65,0.32,0.22),smoothstep(0.07,0.04,d)*0.7);
          // Directional lighting from upper-right (1.2, 0.3, 0.6). 0.22 ambient floor keeps night side visible.
          float lt=max(0.0,dot(vN,normalize(vec3(1.2,0.3,0.6))));
          col*=0.22+0.78*lt;
          gl_FragColor=vec4(col,1.0);
        }
      `,
    });
    const planet = new THREE.Mesh(new THREE.SphereGeometry(16, 64, 64), mat);
    planet.position.copy(pos);
    planet.rotation.z = 0.14;
    scene.add(planet);
    planetMats.push(mat);
    celestialTargets.push({ mesh: planet, lore: CELESTIAL_LORE.gasGiant, pos: pos.clone(), zoomDist: 38, rotSpeed: 0.08 });
    celestialMeshes.push(planet);

    // Rings — RingGeometry inner radius 20, outer 34 (world units), 128 segments for smooth curve.
    const ringGeo = new THREE.RingGeometry(20, 34, 128);
    const rp = ringGeo.attributes.position, ruv = ringGeo.attributes.uv;
    const _v = new THREE.Vector3();
    for (let i = 0; i < rp.count; i++) {
      // Remap UV.x so 0 = inner edge (r=20) and 1 = outer edge (r=34), matching the gradient texture.
      // Three.js RingGeometry UV.x goes 0–1 across the full ring width (14 units here).
      _v.fromBufferAttribute(rp, i);
      ruv.setXY(i, (_v.length() - 20) / 14, 0);
    }
    // 256×4 px canvas — only horizontal (x) extent matters; height 4 is a minimal valid texture.
    // Gradient: transparent at both edges, opaque in the middle — looks like a particle-density ring.
    const ringCv = document.createElement('canvas');
    ringCv.width = 256; ringCv.height = 4;
    const rctx = ringCv.getContext('2d');
    const rg   = rctx.createLinearGradient(0, 0, 256, 0);
    rg.addColorStop(0,    'rgba(100,70,150,0)');    // inner gap — transparent
    rg.addColorStop(0.1,  'rgba(130,90,180,0.55)'); // inner ring edge
    rg.addColorStop(0.45, 'rgba(160,120,200,0.7)'); // densest band
    rg.addColorStop(0.7,  'rgba(140,105,170,0.45)'); // outer thinning
    rg.addColorStop(1,    'rgba(90,60,130,0)');     // outer gap — transparent
    rctx.fillStyle = rg; rctx.fillRect(0, 0, 256, 4);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(ringCv), side: THREE.DoubleSide,
      transparent: true, depthWrite: false, blending: THREE.NormalBlending,
    }));
    ring.position.copy(pos);
    // rotation.x ≈ PI/2.1 ≈ 85.7° — nearly horizontal but tilted slightly toward camera.
    // rotation.z matches planet.rotation.z so the ring stays coplanar with the equator.
    ring.rotation.x = Math.PI / 2.1;
    ring.rotation.z = 0.14;
    scene.add(ring);
  }

  // Rocky planet
  {
    const pos = new THREE.Vector3(130, -28, -220);
    const mat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: `
        varying vec2 vUV; varying vec3 vN;
        void main(){ vUV=uv; vN=normalize(normalMatrix*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }
      `,
      fragmentShader: `
        uniform float time; varying vec2 vUV; varying vec3 vN;
        // h: 2D hash — same prime constants as the 3D version above.
        float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        // n2: 2D bilinear value noise with smoothstep-interpolated fract (f*f*(3-2f)).
        float n2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
          return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
        void main(){
          // Tile UVs ×9 so terrain features appear at a useful scale (not too large or too fine).
          vec2 uv=vUV*9.0;
          // 4-octave fBm: halving amplitude each octave (0.5, 0.25, 0.125, 0.0625) gives terrain-like roughness.
          float n=n2(uv)*0.5+n2(uv*2.1)*0.25+n2(uv*4.3)*0.125+n2(uv*8.7)*0.0625;
          // c1: dark russet lowlands; c2: red-brown mid terrain; c3: dark charcoal highlands.
          vec3 c1=vec3(0.22,0.10,0.09),c2=vec3(0.38,0.20,0.15),c3=vec3(0.15,0.13,0.13);
          vec3 col=mix(c1,c2,smoothstep(0.32,0.62,n));
          // Mix in c3 only partially (×0.45) so highlands are dark but not black.
          col=mix(col,c3,smoothstep(0.62,0.80,n)*0.45);
          // Three impact craters at fixed UV positions — smoothstep(outer,inner,d) inverted
          // so the centre is fully dark and the rim fades to nothing. 0.5 weight keeps them subtle.
          float cr=0.0;
          cr+=(1.0-smoothstep(0.045,0.065,length(vUV-vec2(0.28,0.60))))*0.5; // crater A (large)
          cr+=(1.0-smoothstep(0.030,0.050,length(vUV-vec2(0.68,0.32))))*0.5; // crater B (medium)
          cr+=(1.0-smoothstep(0.025,0.040,length(vUV-vec2(0.50,0.72))))*0.5; // crater C (small)
          col*=1.0-clamp(cr,0.0,1.0)*0.45; // darken by up to 45% inside craters
          // Light from upper-left (-0.9, 0.3, 0.5). 0.12 ambient floor — very little fills shadows on a dead world.
          float lt=max(0.0,dot(vN,normalize(vec3(-0.9,0.3,0.5))));
          col*=0.12+0.88*lt;
          gl_FragColor=vec4(col,1.0);
        }
      `,
    });
    const planet = new THREE.Mesh(new THREE.SphereGeometry(9, 48, 48), mat);
    planet.position.copy(pos);
    scene.add(planet);
    planetMats.push(mat);
    celestialTargets.push({ mesh: planet, lore: CELESTIAL_LORE.rockyPlanet, pos: pos.clone(), zoomDist: 22, rotSpeed: 0.035 });
    celestialMeshes.push(planet);
  }
}

// ── Back-hemisphere objects ───────────────────────────────────────────────────
function buildBackObjects() {
  // Extra nebulas behind the camera (positive Z)
  const backNebDefs = [
    { r:0,   g:80,  b:200, pos:[ -65, 25, 155], sz:210, rot: 0.5 },
    { r:120, g:0,   b:90,  pos:[  95,-35, 185], sz:250, rot:-0.8 },
    { r:15,  g:120, b:70,  pos:[-140, 45, 230], sz:185, rot: 1.3 },
    { r:80,  g:40,  b:0,   pos:[  30, 60, 120], sz:160, rot:-0.3 },
  ];
  backNebDefs.forEach(d => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeNebulaCanvas(d.r, d.g, d.b), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55, rotation: d.rot,
    }));
    sprite.position.set(...d.pos);
    sprite.scale.set(d.sz, d.sz, 1);
    scene.add(sprite);
  });

  // Ice giant
  {
    const pos = new THREE.Vector3(-95, 14, 175);
    const mat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: `
        varying vec2 vUV; varying vec3 vN;
        void main(){ vUV=uv; vN=normalize(normalMatrix*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }
      `,
      fragmentShader: `
        uniform float time; varying vec2 vUV; varying vec3 vN;
        float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float n2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
          return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
        void main(){
          float lat=vUV.y;
          // b1: primary bands (freq 16), re-centred to 0–1 with *0.5+0.5. Slow eastward drift.
          // b2: wide secondary bands (freq 5) moving westward — counter-rotation effect.
          float b1=sin(lat*16.0+time*0.020)*0.5+0.5;
          float b2=sin(lat*5.0-time*0.015)*0.3;
          // Two octaves of 2D noise add cloud-like perturbation to the band edges.
          float n=n2(vUV*8.0)*0.35+n2(vUV*16.0)*0.15;
          float t=clamp(b1*0.55+b2*0.25+n,0.0,1.0);
          // c1: deep navy; c2: cerulean mid-atmosphere; c3: pale ice-white for high-altitude haze.
          vec3 c1=vec3(0.04,0.10,0.30),c2=vec3(0.12,0.32,0.58),c3=vec3(0.60,0.80,0.95);
          vec3 col=mix(c1,c2,smoothstep(0.28,0.60,t));
          // pole: 0 at equator (lat=0.5), 1 at poles (lat=0 or 1). Suppresses the bright ice
          // highlight toward the poles (factor 1.0-pole*0.4) so poles stay slightly darker.
          float pole=abs(lat*2.0-1.0);
          col=mix(col,c3,smoothstep(0.68,0.86,t)*(1.0-pole*0.4));
          // Light from behind-right (0.5, 0.2, -0.9) — sun is in front-right of the scene.
          // 0.14 ambient floor preserves some colour on the night side.
          float lt=max(0.0,dot(vN,normalize(vec3(0.5,0.2,-0.9))));
          col*=0.14+0.86*lt;
          gl_FragColor=vec4(col,1.0);
        }
      `,
    });
    const planet = new THREE.Mesh(new THREE.SphereGeometry(13, 56, 56), mat);
    planet.position.copy(pos);
    planet.rotation.z = 0.08;
    scene.add(planet);
    planetMats.push(mat);
    celestialTargets.push({ mesh: planet, lore: CELESTIAL_LORE.iceGiant, pos: pos.clone(), zoomDist: 30, rotSpeed: 0.05 });
    celestialMeshes.push(planet);

    // Icy ring — inner radius 17, outer 27 (width 10 world units), 96 segments.
    const ringGeo = new THREE.RingGeometry(17, 27, 96);
    const rp = ringGeo.attributes.position, ruv = ringGeo.attributes.uv;
    const _rv = new THREE.Vector3();
    for (let i = 0; i < rp.count; i++) {
      // Same UV remap as the gas giant ring: 0 = inner edge (r=17), 1 = outer (r=27).
      _rv.fromBufferAttribute(rp, i);
      ruv.setXY(i, (_rv.length() - 17) / 10, 0);
    }
    // Ice ring gradient: pale blue-white, slightly more transparent than the gas giant ring
    // to convey that ice particles scatter light differently from rock/dust.
    const ringCv = document.createElement('canvas');
    ringCv.width = 256; ringCv.height = 4;
    const rctx = ringCv.getContext('2d');
    const rg   = rctx.createLinearGradient(0, 0, 256, 0);
    rg.addColorStop(0,    'rgba(80,140,200,0)');      // inner gap
    rg.addColorStop(0.1,  'rgba(120,180,240,0.40)');  // inner ring
    rg.addColorStop(0.5,  'rgba(180,220,255,0.55)');  // brightest band
    rg.addColorStop(0.85, 'rgba(100,160,210,0.30)');  // outer fade
    rg.addColorStop(1,    'rgba(60,100,160,0)');      // outer gap
    rctx.fillStyle = rg; rctx.fillRect(0, 0, 256, 4);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(ringCv), side: THREE.DoubleSide,
      transparent: true, depthWrite: false,
    }));
    ring.position.copy(pos);
    // rotation.x ≈ PI/2.3 ≈ 78.3° — slightly more face-on than gas giant ring, maximises visibility.
    ring.rotation.x = Math.PI / 2.3;
    ring.rotation.z = 0.08;
    scene.add(ring);
  }

  // Red dwarf star
  {
    const POS = new THREE.Vector3(75, 28, 235);
    const mat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: `
        varying vec3 vN; varying vec3 vP;
        void main(){ vN=normalize(normalMatrix*normal); vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }
      `,
      fragmentShader: `
        uniform float time; varying vec3 vN; varying vec3 vP;
        float hash(vec3 p){p=fract(p*vec3(443.8975,397.2973,491.1871));p+=dot(p.xyz,p.yzx+19.19);return fract(p.x*p.y*p.z);}
        float vn(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
          return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                     mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
        // 5-octave fBm (vs 6 for the sun) — red dwarfs have larger, less complex convection cells.
        float fbm(vec3 p){float v=0.0,a=0.5;for(int i=0;i<5;i++){v+=a*vn(p);p*=2.1;a*=0.5;}return v;}
        void main(){
          // Scale 0.065 (vs sun's 0.04) gives slightly larger surface features — matches a smaller, cooler star.
          // time*0.020 makes it animate slightly faster than the sun (0.018) — convection is more vigorous.
          vec3 p=vP*0.065+vec3(time*0.020);
          // Domain-warped fBm: single warp layer (vs two for the sun) keeps cost lower.
          float n=fbm(p+vec3(fbm(p+time*0.013)));
          // Two-stop palette: dark crimson flare base → bright orange-yellow peak.
          // HDR values (2.0 / 4.0) trigger bloom on the hottest granules.
          vec3 col=mix(vec3(2.0,0.12,0.03),vec3(4.0,0.90,0.08),smoothstep(0.32,0.70,n));
          // Limb darkening: same formula as the sun — edges are 28% as bright as centre.
          float limb=abs(dot(vN,normalize(vec3(0.0,0.0,1.0))));
          col*=0.28+0.72*limb;
          gl_FragColor=vec4(col,1.0);
        }
      `,
    });
    const star = new THREE.Mesh(new THREE.SphereGeometry(9, 48, 48), mat);
    star.position.copy(POS);
    scene.add(star);
    planetMats.push(mat);
    celestialTargets.push({ mesh: star, lore: CELESTIAL_LORE.redDwarf, pos: POS.clone(), zoomDist: 22, rotSpeed: 0.06 });
    celestialMeshes.push(star);

    // Glow sprite — inner radius 6px gives a hard bright core; outer 128px fades to black.
    // Warmer stops than the sun (orange→deep red) reflect the lower surface temperature.
    // Scale 110 world units = roughly 12× the star's geometry radius (9) — chromospheric halo.
    const glowCv = document.createElement('canvas');
    glowCv.width = glowCv.height = 256;
    const ctx = glowCv.getContext('2d');
    const cg  = ctx.createRadialGradient(128, 128, 6, 128, 128, 128);
    cg.addColorStop(0,    'rgba(255,130,40,1.0)');  // bright orange core
    cg.addColorStop(0.14, 'rgba(200,55,10,0.75)');  // deep orange mid
    cg.addColorStop(0.45, 'rgba(140,15,0,0.22)');   // dim red halo
    cg.addColorStop(1,    'rgba(70,0,0,0)');         // transparent edge
    ctx.fillStyle = cg; ctx.fillRect(0, 0, 256, 256);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(glowCv), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.88,
    }));
    glow.scale.set(110, 110, 1);
    glow.position.copy(POS);
    scene.add(glow);
  }

  // Blue-white star cluster — 10 overlapping sprites share one texture, giving a diffuse glow cloud.
  // All sprites use AdditiveBlending so they accumulate brightness without hard edges.
  {
    const center  = new THREE.Vector3(-30, -20, 210);
    // 64×64 canvas is sufficient — the sprites are scaled to 7–18 world units and viewed far away.
    // Colour stops: centre near-white, mid blue haze, outer transparent — classic O/B cluster appearance.
    const clCv    = document.createElement('canvas');
    clCv.width    = clCv.height = 64;
    const cctx    = clCv.getContext('2d');
    const ccg     = cctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    ccg.addColorStop(0,   'rgba(200,225,255,1)');   // bright blue-white core
    ccg.addColorStop(0.3, 'rgba(140,190,255,0.5)'); // mid haze
    ccg.addColorStop(1,   'rgba(80,130,255,0)');    // transparent edge
    cctx.fillStyle = ccg; cctx.fillRect(0, 0, 64, 64);
    const clTex = new THREE.CanvasTexture(clCv);

    // 10 sprites: first [0,0,0] is the brightest central star, the rest are spread up to ±15 units.
    // scales[0]=18 is the dominant central glow; smaller values are fainter cluster members.
    const offsets = [[0,0,0],[8,5,-4],[-6,-8,3],[12,-3,6],[-10,7,-2],[4,12,-7],[-3,-12,5],[15,2,-9],[-14,-4,8],[6,-6,12]];
    const scales  = [18, 10, 14, 8, 12, 7, 9, 11, 13, 8];
    offsets.forEach((off, idx) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: clTex, transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false,
        // Random opacity 0.5–0.9 varies apparent brightness across cluster members without extra geometry.
        opacity: 0.5 + Math.random() * 0.4,
      }));
      const sc = scales[idx];
      s.scale.set(sc, sc, 1);
      s.position.set(center.x + off[0], center.y + off[1], center.z + off[2]);
      scene.add(s);
    });
  }
}

// ── Public API ────────────────────────────────────────────────────────────────
export function buildCelestials() {
  buildSun();
  buildPlanets();
  buildBackObjects();
}

export function updateCelestials(t, dt) {
  if (_sunUniforms) _sunUniforms.time.value = t;
  planetMats.forEach(m => { m.uniforms.time.value = t; });
  celestialTargets.forEach(ct => { ct.mesh.rotation.y += ct.rotSpeed * dt; });
}
