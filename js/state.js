/**
 * state.js
 * Tiny shared mutable bag for values that need to be read AND written
 * by multiple modules (camera.js + input.js) without creating circular imports.
 */

export const shared = {
  hoveredFrame: null,   // the THREE.Group currently under the cursor, or null
};
