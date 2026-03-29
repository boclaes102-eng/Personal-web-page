/**
 * renderer.js
 * Three.js scene, camera, WebGL renderer, and post-processing pipeline.
 * Everything else imports { scene, camera, renderer, composer, bloomPass } from here.
 */

import * as THREE         from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }     from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass }from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass }     from 'three/addons/postprocessing/OutputPass.js';

export const canvas = document.getElementById('canvas');
export const scene  = new THREE.Scene();
// 70° FOV — wide enough for immersion, narrow enough to keep planets in frame.
// Near plane 0.1 avoids z-fighting on close geometry; far 1200 covers the whole star field.
export const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 1200);

export const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias:       false,          // bypassed by EffectComposer anyway
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); // cap at 1.5 — retina gains diminish past that
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping      = THREE.NoToneMapping; // OutputPass handles tone-mapping
renderer.outputColorSpace = THREE.SRGBColorSpace;

// Near-black deep-space colour; density 0.004 fades objects to black past ~250 units.
scene.fog = new THREE.FogExp2(0x000008, 0.004);

// ── HDR render target (HalfFloat keeps values > 1 alive through bloom) ──
export const hdrTarget = new THREE.WebGLRenderTarget(innerWidth, innerHeight, {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  type:      THREE.HalfFloatType,
  format:    THREE.RGBAFormat,
});

export const composer = new EffectComposer(renderer, hdrTarget);
composer.addPass(new RenderPass(scene, camera));

// Bloom at half resolution — low-frequency effect, visually identical, 4× cheaper internally
export const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(innerWidth / 2, innerHeight / 2), // half-res — 4× cheaper, visually identical
  0.75,  // strength  — how bright the glow is
  0.28,  // radius    — how far the glow spreads
  1.01   // threshold — above 1.0 so SDR panels and UI text never bloom, only HDR emissives do
);
composer.addPass(bloomPass);

const outputPass = new OutputPass(); // applies Reinhard tone-mapping + sRGB encode
composer.addPass(outputPass);
renderer.toneMapping         = THREE.ReinhardToneMapping;
renderer.toneMappingExposure = 1.1; // slight boost so stars read bright without blowing highlights

// ── Shared scene lights (called by computer.js and television.js) ─────────────
// Added once — both builders check by name before adding.
export function ensureLights() {
  if (scene.getObjectByName('__compAmbient')) return; // idempotent — safe to call from multiple builders
  const amb  = new THREE.AmbientLight(0xffffff, 0.22);     amb.name  = '__compAmbient'; // soft base fill
  const dir  = new THREE.DirectionalLight(0xffffff, 0.6);  dir.name  = '__compDir';     dir.position.set(5, 8, 6);   // key light from upper-right
  const fill = new THREE.DirectionalLight(0x8888ff, 0.15); fill.name = '__compFill';    fill.position.set(-4, -2, -3); // cool blue rim from lower-left
  scene.add(amb, dir, fill);
}
