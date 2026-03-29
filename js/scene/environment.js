/**
 * environment.js
 * Stars, nebulas, and the animated comet.
 * Call buildEnvironment() once, then updateEnvironment(t, dt) each frame.
 */

import * as THREE from 'three';
import { scene }  from '../core/renderer.js';

// Exported so main.js can pass t/dt each frame
export let starUniforms = null;

// ── Stars ─────────────────────────────────────────────────────────────────────
function buildStars() {
  const N         = 3500; // star count — enough to feel dense without stressing the GPU
  const positions = new Float32Array(N * 3);
  const sizes     = new Float32Array(N);
  const colors    = new Float32Array(N * 3);

  // HDR colour values (> 1.0) so stars exceed the bloom threshold (1.01) and glow.
  // Five colours represent O/A/G/K/M spectral classes: blue-white, white, warm-white, orange, blue.
  const palette = [
    [1.6, 1.6, 1.6], // white
    [0.8, 1.0, 1.6], // blue-white
    [1.6, 1.6, 0.8], // warm white
    [1.6, 0.8, 0.6], // orange
    [0.7, 0.9, 1.6], // blue
  ];

  for (let i = 0; i < N; i++) {
    // Uniform spherical distribution — theta/phi method avoids polar clustering.
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    // Radius 250–650 units: inside the fog range so distant stars fade naturally.
    const r     = 250 + Math.random() * 400;
    positions[i*3]   = r * Math.sin(phi) * Math.cos(theta);
    positions[i*3+1] = r * Math.cos(phi);
    positions[i*3+2] = r * Math.sin(phi) * Math.sin(theta);
    sizes[i] = 0.6 + Math.random() * 3.0; // point size in pixels (before shader twinkle)
    const c = palette[Math.floor(Math.random() * palette.length)];
    colors[i*3] = c[0]; colors[i*3+1] = c[1]; colors[i*3+2] = c[2];
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position',  new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('starSize',  new THREE.BufferAttribute(sizes,     1));
  geo.setAttribute('starColor', new THREE.BufferAttribute(colors,    3));

  starUniforms = { time: { value: 0 } };

  scene.add(new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms: starUniforms,
    vertexShader: `
      attribute float starSize;
      attribute vec3  starColor;
      uniform   float time;
      varying   vec3  vColor;
      varying   float vAlpha;
      void main() {
        // Twinkle: each star gets a unique phase from its world position, so they
        // flicker independently. Frequencies 13.7/9.1/7.3 are chosen to be
        // incommensurate (no common factors) — avoids visible synchronised patterns.
        float tw = 0.55 + 0.45 * sin(time * 1.8 + position.x * 13.7 + position.y * 9.1 + position.z * 7.3);
        vAlpha   = tw;
        vColor   = starColor * tw;
        gl_PointSize = starSize * tw;
        gl_Position  = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3  vColor;
      varying float vAlpha;
      void main() {
        // Convert gl_PointCoord (0–1 square) to a 0–1 radial distance from centre.
        // smoothstep(0.25, 1.0) gives a soft circular disc instead of a hard square pixel.
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = (1.0 - smoothstep(0.25, 1.0, d)) * vAlpha;
        gl_FragColor = vec4(vColor, a);
      }
    `,
    transparent: true,
    depthWrite:  false,
    blending:    THREE.AdditiveBlending,
  })));
}

// ── Nebulas ───────────────────────────────────────────────────────────────────
// Generates a soft cloud texture on a 512×512 canvas using three overlapping
// radial gradients ("blobs"). Exported so celestials.js can reuse it for planet coronas.
export function makeNebulaCanvas(r, g, b) {
  const cv  = document.createElement('canvas');
  cv.width  = cv.height = 512;
  const ctx = cv.getContext('2d');
  // Three off-centre blobs of different sizes give an organic, irregular shape.
  // Opacity 0.35 → 0 creates a soft edge that blends with AdditiveBlending.
  const blobs = [{ x: 256, y: 256, r: 230 }, { x: 180, y: 180, r: 150 }, { x: 320, y: 300, r: 130 }];
  blobs.forEach(blob => {
    const g2 = ctx.createRadialGradient(blob.x, blob.y, 0, blob.x, blob.y, blob.r);
    g2.addColorStop(0,   `rgba(${r},${g},${b},0.35)`);
    g2.addColorStop(0.4, `rgba(${r},${g},${b},0.12)`);
    g2.addColorStop(1,   `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, 512, 512);
  });
  return new THREE.CanvasTexture(cv);
}

function buildNebulas() {
  // Each entry: RGB colour, world-space position, sprite scale (world units), rotation (rad).
  // Positions are behind and around the play area (-Z = away from camera start).
  // Colours chosen to complement each other: purple, blue, orange, teal, deep-violet.
  const defs = [
    { r:80,  g:20,  b:160, pos:[ 60, -10, -140], sz:220, rot: 0.4  }, // purple
    { r:0,   g:60,  b:130, pos:[-110, 30, -180], sz:260, rot:-0.6  }, // blue, largest
    { r:150, g:40,  b:10,  pos:[ 110,-50, -200], sz:190, rot: 0.9  }, // orange
    { r:20,  g:90,  b:110, pos:[ -40,-30, -110], sz:160, rot:-0.25 }, // teal
    { r:70,  g:0,   b:110, pos:[ -20, 50, -160], sz:180, rot: 1.2  }, // deep violet
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

// ── Comet ─────────────────────────────────────────────────────────────────────
// IIFE so the comet's state variables are private. The returned object exposes
// only update(dt) — called each frame from updateEnvironment().
const comet = (() => {
  const TRAIL    = 90;  // number of trail segments — more = longer tail, slightly more GPU cost
  const trailPos = new Float32Array(TRAIL * 3); // positions updated every frame (shift buffer)
  const trailCol = new Float32Array(TRAIL * 3); // colours fade from bright head to transparent tail

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 10, 10), // small sphere for the bright nucleus
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  head.visible = false;
  scene.add(head);

  const glowCv = document.createElement('canvas');
  glowCv.width = glowCv.height = 64;
  const gctx = glowCv.getContext('2d');
  const gg   = gctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gg.addColorStop(0,   'rgba(210,235,255,1)');
  gg.addColorStop(0.4, 'rgba(120,190,255,0.5)');
  gg.addColorStop(1,   'rgba(60,100,255,0)');
  gctx.fillStyle = gg;
  gctx.fillRect(0, 0, 64, 64);

  const glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map:         new THREE.CanvasTexture(glowCv),
    transparent: true,
    blending:    THREE.AdditiveBlending,
    depthWrite:  false,
  }));
  glowSprite.scale.set(5, 5, 1);
  glowSprite.visible = false;
  scene.add(glowSprite);

  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  trailGeo.setAttribute('color',    new THREE.BufferAttribute(trailCol, 3));
  const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true,
    blending:     THREE.AdditiveBlending, depthWrite: false, opacity: 0.85,
  }));
  trail.visible = false;
  scene.add(trail);

  // Comet state machine: rests for ~22 s, then flies across for ~9 s, then rests again.
  // restTimer starts at 10 so the comet appears ~12 s after page load (not immediately).
  const s = {
    active:       false,
    t:            0,            // 0→1 progress of current flight
    restTimer:    10,           // seconds elapsed since last landing
    restDuration: 22,           // seconds to wait before next launch
    start: new THREE.Vector3(),
    end:   new THREE.Vector3(),
    duration: 9,                // seconds for a full crossing
  };

  function spawn() {
    const sign = Math.random() > 0.5 ? 1 : -1;
    s.start.set(sign * -210, 35 + Math.random() * 40, -70  - Math.random() * 50);
    s.end.set(  sign *  210, -25 - Math.random() * 25, -110 - Math.random() * 60);
    s.t = 0; s.active = true;
    for (let i = 0; i < TRAIL * 3; i += 3) {
      trailPos[i] = s.start.x; trailPos[i+1] = s.start.y; trailPos[i+2] = s.start.z;
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

      for (let i = TRAIL - 1; i > 0; i--) {
        trailPos[i*3]   = trailPos[(i-1)*3];
        trailPos[i*3+1] = trailPos[(i-1)*3+1];
        trailPos[i*3+2] = trailPos[(i-1)*3+2];
      }
      trailPos[0] = p.x; trailPos[1] = p.y; trailPos[2] = p.z;

      // Tail colour: head (i=0) is bright blue-white; tail (i=TRAIL-1) fades to dim blue.
      // Power 1.6 gives a non-linear fade so the bright core looks dense.
      // R and G channels have a minimum floor (0.22 / 0.12) so the tail stays visible.
      for (let i = 0; i < TRAIL; i++) {
        const fade = Math.pow(1 - i / TRAIL, 1.6);
        trailCol[i*3]   = 0.75 * fade + 0.22; // R
        trailCol[i*3+1] = 0.88 * fade + 0.12; // G
        trailCol[i*3+2] = 1.0;                 // B — always full blue
      }
      trailGeo.attributes.position.needsUpdate = true;
      trailGeo.attributes.color.needsUpdate    = true;
    },
  };
})();

// ── Public API ────────────────────────────────────────────────────────────────
export function buildEnvironment() {
  buildStars();
  buildNebulas();
}

export function updateEnvironment(t, dt) {
  if (starUniforms) starUniforms.time.value = t;
  comet.update(dt);
}

export { makeNebulaCanvas }; // celestials.js reuses it for corona sprites
