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
export const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 1200);

export const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias:       false,          // bypassed by EffectComposer anyway
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping      = THREE.NoToneMapping; // OutputPass handles tone-mapping
renderer.outputColorSpace = THREE.SRGBColorSpace;

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
  new THREE.Vector2(innerWidth / 2, innerHeight / 2),
  0.75,  // strength
  0.28,  // radius
  1.01   // threshold — above 1.0, SDR panels/text never bloom
);
composer.addPass(bloomPass);

const outputPass = new OutputPass(); // applies Reinhard tone-mapping + sRGB encode
composer.addPass(outputPass);
renderer.toneMapping         = THREE.ReinhardToneMapping;
renderer.toneMappingExposure = 1.1;
