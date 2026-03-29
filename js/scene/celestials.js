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
      float hash(vec3 p){p=fract(p*vec3(443.8975,397.2973,491.1871));p+=dot(p.xyz,p.yzx+19.19);return fract(p.x*p.y*p.z);}
      float vnoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
        return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
      float fbm(vec3 p){float v=0.0,a=0.5;for(int i=0;i<6;i++){v+=a*vnoise(p);p*=2.1;a*=0.5;}return v;}
      void main() {
        vec3 p  = vP * 0.04 + vec3(time * 0.018);
        float n = fbm(p + vec3(fbm(p + time*0.012), fbm(p*1.3 - time*0.008), 0.0));
        vec3 cCool = vec3(1.4, 0.25, 0.02);
        vec3 cMid  = vec3(3.2, 1.4,  0.05);
        vec3 cHot  = vec3(5.0, 3.8,  0.8);
        vec3 col   = mix(cCool, cMid, smoothstep(0.30, 0.58, n));
        col        = mix(col,   cHot, smoothstep(0.55, 0.82, n));
        float limb = abs(dot(vN, normalize(vec3(0.0, 0.0, 1.0))));
        col *= 0.35 + 0.65 * limb;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const sun = new THREE.Mesh(new THREE.SphereGeometry(28, 64, 64), sunMat);
  sun.position.copy(SUN_POS);
  scene.add(sun);
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
          float b1=sin(lat*22.0+sin(lon*6.28+time*0.018)*0.6+time*0.035);
          float b2=sin(lat*9.0-time*0.022)*0.5;
          float b3=sin(lat*55.0+lon*28.0)*0.08;
          float t=clamp((b1*0.55+b2*0.35+b3+1.0)*0.5,0.0,1.0);
          vec3 c1=vec3(0.10,0.08,0.28),c2=vec3(0.35,0.25,0.55),c3=vec3(0.55,0.38,0.68),c4=vec3(0.72,0.50,0.38);
          vec3 col=mix(c1,c2,smoothstep(0.18,0.42,t));
          col=mix(col,c3,smoothstep(0.42,0.62,t));
          col=mix(col,c4,smoothstep(0.68,0.82,t));
          vec2 spot=vec2(0.52,0.38);
          float d=length(vec2(lon-spot.x,lat-spot.y)*vec2(1.0,1.8));
          col=mix(col,vec3(0.65,0.32,0.22),smoothstep(0.07,0.04,d)*0.7);
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

    // Rings
    const ringGeo = new THREE.RingGeometry(20, 34, 128);
    const rp = ringGeo.attributes.position, ruv = ringGeo.attributes.uv;
    const _v = new THREE.Vector3();
    for (let i = 0; i < rp.count; i++) {
      _v.fromBufferAttribute(rp, i);
      ruv.setXY(i, (_v.length() - 20) / 14, 0);
    }
    const ringCv = document.createElement('canvas');
    ringCv.width = 256; ringCv.height = 4;
    const rctx = ringCv.getContext('2d');
    const rg   = rctx.createLinearGradient(0, 0, 256, 0);
    rg.addColorStop(0,    'rgba(100,70,150,0)');
    rg.addColorStop(0.1,  'rgba(130,90,180,0.55)');
    rg.addColorStop(0.45, 'rgba(160,120,200,0.7)');
    rg.addColorStop(0.7,  'rgba(140,105,170,0.45)');
    rg.addColorStop(1,    'rgba(90,60,130,0)');
    rctx.fillStyle = rg; rctx.fillRect(0, 0, 256, 4);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(ringCv), side: THREE.DoubleSide,
      transparent: true, depthWrite: false, blending: THREE.NormalBlending,
    }));
    ring.position.copy(pos);
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
        float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float n2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
          return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
        void main(){
          vec2 uv=vUV*9.0;
          float n=n2(uv)*0.5+n2(uv*2.1)*0.25+n2(uv*4.3)*0.125+n2(uv*8.7)*0.0625;
          vec3 c1=vec3(0.22,0.10,0.09),c2=vec3(0.38,0.20,0.15),c3=vec3(0.15,0.13,0.13);
          vec3 col=mix(c1,c2,smoothstep(0.32,0.62,n));
          col=mix(col,c3,smoothstep(0.62,0.80,n)*0.45);
          float cr=0.0;
          cr+=(1.0-smoothstep(0.045,0.065,length(vUV-vec2(0.28,0.60))))*0.5;
          cr+=(1.0-smoothstep(0.030,0.050,length(vUV-vec2(0.68,0.32))))*0.5;
          cr+=(1.0-smoothstep(0.025,0.040,length(vUV-vec2(0.50,0.72))))*0.5;
          col*=1.0-clamp(cr,0.0,1.0)*0.45;
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
          float b1=sin(lat*16.0+time*0.020)*0.5+0.5;
          float b2=sin(lat*5.0-time*0.015)*0.3;
          float n=n2(vUV*8.0)*0.35+n2(vUV*16.0)*0.15;
          float t=clamp(b1*0.55+b2*0.25+n,0.0,1.0);
          vec3 c1=vec3(0.04,0.10,0.30),c2=vec3(0.12,0.32,0.58),c3=vec3(0.60,0.80,0.95);
          vec3 col=mix(c1,c2,smoothstep(0.28,0.60,t));
          float pole=abs(lat*2.0-1.0);
          col=mix(col,c3,smoothstep(0.68,0.86,t)*(1.0-pole*0.4));
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

    // Icy ring
    const ringGeo = new THREE.RingGeometry(17, 27, 96);
    const rp = ringGeo.attributes.position, ruv = ringGeo.attributes.uv;
    const _rv = new THREE.Vector3();
    for (let i = 0; i < rp.count; i++) {
      _rv.fromBufferAttribute(rp, i);
      ruv.setXY(i, (_rv.length() - 17) / 10, 0);
    }
    const ringCv = document.createElement('canvas');
    ringCv.width = 256; ringCv.height = 4;
    const rctx = ringCv.getContext('2d');
    const rg   = rctx.createLinearGradient(0, 0, 256, 0);
    rg.addColorStop(0,    'rgba(80,140,200,0)');
    rg.addColorStop(0.1,  'rgba(120,180,240,0.40)');
    rg.addColorStop(0.5,  'rgba(180,220,255,0.55)');
    rg.addColorStop(0.85, 'rgba(100,160,210,0.30)');
    rg.addColorStop(1,    'rgba(60,100,160,0)');
    rctx.fillStyle = rg; rctx.fillRect(0, 0, 256, 4);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(ringCv), side: THREE.DoubleSide,
      transparent: true, depthWrite: false,
    }));
    ring.position.copy(pos);
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
        float fbm(vec3 p){float v=0.0,a=0.5;for(int i=0;i<5;i++){v+=a*vn(p);p*=2.1;a*=0.5;}return v;}
        void main(){
          vec3 p=vP*0.065+vec3(time*0.020);
          float n=fbm(p+vec3(fbm(p+time*0.013)));
          vec3 col=mix(vec3(2.0,0.12,0.03),vec3(4.0,0.90,0.08),smoothstep(0.32,0.70,n));
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

    // Glow sprite
    const glowCv = document.createElement('canvas');
    glowCv.width = glowCv.height = 256;
    const ctx = glowCv.getContext('2d');
    const cg  = ctx.createRadialGradient(128, 128, 6, 128, 128, 128);
    cg.addColorStop(0,    'rgba(255,130,40,1.0)');
    cg.addColorStop(0.14, 'rgba(200,55,10,0.75)');
    cg.addColorStop(0.45, 'rgba(140,15,0,0.22)');
    cg.addColorStop(1,    'rgba(70,0,0,0)');
    ctx.fillStyle = cg; ctx.fillRect(0, 0, 256, 256);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(glowCv), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.88,
    }));
    glow.scale.set(110, 110, 1);
    glow.position.copy(POS);
    scene.add(glow);
  }

  // Blue-white star cluster
  {
    const center  = new THREE.Vector3(-30, -20, 210);
    const clCv    = document.createElement('canvas');
    clCv.width    = clCv.height = 64;
    const cctx    = clCv.getContext('2d');
    const ccg     = cctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    ccg.addColorStop(0,   'rgba(200,225,255,1)');
    ccg.addColorStop(0.3, 'rgba(140,190,255,0.5)');
    ccg.addColorStop(1,   'rgba(80,130,255,0)');
    cctx.fillStyle = ccg; cctx.fillRect(0, 0, 64, 64);
    const clTex = new THREE.CanvasTexture(clCv);

    const offsets = [[0,0,0],[8,5,-4],[-6,-8,3],[12,-3,6],[-10,7,-2],[4,12,-7],[-3,-12,5],[15,2,-9],[-14,-4,8],[6,-6,12]];
    const scales  = [18, 10, 14, 8, 12, 7, 9, 11, 13, 8];
    offsets.forEach((off, idx) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: clTex, transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, opacity: 0.5 + Math.random() * 0.4,
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
