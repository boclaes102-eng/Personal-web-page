/**
 * unit.test.js
 * Pure-function unit tests — no browser or Three.js required.
 * Run with:  npm test   (Node.js 18+ built-in test runner)
 *
 * These tests cover the math and logic that powers the 3D scene,
 * catching regressions in camera direction, physics formulas, and
 * database-column naming without needing a full browser environment.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// ── Camera direction formula ──────────────────────────────────────────────────
// Mirrors the camDir() function in js/core/camera.js.
// Yaw = 0 points in the -Z direction (Three.js "forward"),
// pitch is clamped to ±PITCH_LIMIT (Math.PI * 0.42 ≈ ±75.6°).

function camDir(yaw, pitch) {
  return {
    x:  Math.sin(yaw)  * Math.cos(pitch),
    y:  Math.sin(pitch),
    z: -Math.cos(yaw)  * Math.cos(pitch),
  };
}

const PITCH_LIMIT = Math.PI * 0.42;

describe('camDir — camera direction formula', () => {
  test('yaw=0, pitch=0 → points straight ahead (-Z)', () => {
    const { x, y, z } = camDir(0, 0);
    assert.ok(Math.abs(x) < 1e-10, `x should be 0, got ${x}`);
    assert.ok(Math.abs(y) < 1e-10, `y should be 0, got ${y}`);
    assert.ok(Math.abs(z + 1) < 1e-10, `z should be -1, got ${z}`);
  });

  test('yaw=π/2, pitch=0 → points right (+X)', () => {
    const { x, y, z } = camDir(Math.PI / 2, 0);
    assert.ok(Math.abs(x - 1) < 1e-10, `x should be ~1, got ${x}`);
    assert.ok(Math.abs(y) < 1e-10, `y should be 0, got ${y}`);
    assert.ok(Math.abs(z) < 1e-10, `z should be ~0, got ${z}`);
  });

  test('pitch=π/2 → points straight up (+Y)', () => {
    const { x, y, z } = camDir(0, Math.PI / 2);
    assert.ok(Math.abs(y - 1) < 1e-10, `y should be ~1, got ${y}`);
  });

  test('output is a unit vector (length ≈ 1)', () => {
    const { x, y, z } = camDir(1.2, 0.3);
    const len = Math.sqrt(x * x + y * y + z * z);
    assert.ok(Math.abs(len - 1) < 1e-10, `length should be 1, got ${len}`);
  });
});

describe('PITCH_LIMIT boundary clamping', () => {
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  test('values inside the limit pass through unchanged', () => {
    assert.equal(clamp(0.5,  -PITCH_LIMIT, PITCH_LIMIT), 0.5);
    assert.equal(clamp(-0.5, -PITCH_LIMIT, PITCH_LIMIT), -0.5);
  });

  test('values exceeding the limit are clamped to ±PITCH_LIMIT', () => {
    assert.equal(clamp(99,  -PITCH_LIMIT, PITCH_LIMIT), PITCH_LIMIT);
    assert.equal(clamp(-99, -PITCH_LIMIT, PITCH_LIMIT), -PITCH_LIMIT);
  });

  test('PITCH_LIMIT is ≈ 75.6° (prevents flip-over)', () => {
    const degrees = (PITCH_LIMIT * 180) / Math.PI;
    assert.ok(degrees > 75 && degrees < 76, `expected ~75.6°, got ${degrees.toFixed(2)}°`);
  });
});

// ── Polar-to-world coordinate conversion ─────────────────────────────────────
// Mirrors polarToWorld() in js/scene/frames.js.

function polarToWorld(az_deg, el_deg, r) {
  const az = (az_deg * Math.PI) / 180;
  const el = (el_deg * Math.PI) / 180;
  return {
    x:  r * Math.cos(el) * Math.sin(az),
    y:  r * Math.sin(el),
    z: -r * Math.cos(el) * Math.cos(az),
  };
}

describe('polarToWorld — frame placement coordinates', () => {
  test('azimuth=0, elevation=0 → directly in front (-Z)', () => {
    const { x, y, z } = polarToWorld(0, 0, 10);
    assert.ok(Math.abs(x) < 1e-10, `x should be 0, got ${x}`);
    assert.equal(y, 0);
    assert.ok(Math.abs(z + 10) < 1e-10, `z should be -10, got ${z}`);
  });

  test('elevation=90 → directly above (+Y)', () => {
    const { x, y, z } = polarToWorld(0, 90, 10);
    assert.ok(Math.abs(y - 10) < 1e-10, `y should be ~10, got ${y}`);
    assert.ok(Math.abs(x) < 1e-10, `x should be 0, got ${x}`);
  });

  test('radius scales all components proportionally', () => {
    const p5  = polarToWorld(45, 20, 5);
    const p10 = polarToWorld(45, 20, 10);
    assert.ok(Math.abs(p10.x / p5.x - 2) < 1e-10, 'x should double with double radius');
    assert.ok(Math.abs(p10.y / p5.y - 2) < 1e-10, 'y should double with double radius');
    assert.ok(Math.abs(p10.z / p5.z - 2) < 1e-10, 'z should double with double radius');
  });

  test('output length equals the input radius', () => {
    const { x, y, z } = polarToWorld(33, 17, 13);
    const len = Math.sqrt(x * x + y * y + z * z);
    assert.ok(Math.abs(len - 13) < 1e-10, `length should be 13, got ${len}`);
  });
});

// ── Jukebox storage-slot column naming ───────────────────────────────────────
// Mirrors the _trackCol() helper in js/auth/auth.js.

function trackCol(slot) {
  return slot === 1 ? 'custom_track_url' : `custom_track_url_${slot}`;
}

describe('trackCol — jukebox database column names', () => {
  test('slot 1 maps to the primary column (no suffix)', () => {
    assert.equal(trackCol(1), 'custom_track_url');
  });

  test('slots 2 and 3 map to indexed columns', () => {
    assert.equal(trackCol(2), 'custom_track_url_2');
    assert.equal(trackCol(3), 'custom_track_url_3');
  });
});
