/**
 * A soft additive glow for a light, so a lamp or a beacon carries through haze and reads at a
 * distance where the lamp itself is a single pixel. Unlit, additive, out of the normal pass.
 */

import * as THREE from 'three';

/** A soft round glow, white at the centre to nothing at the edge, made once. */
let haloTexture: THREE.DataTexture | null = null;
export function softDot(): THREE.DataTexture {
  if (haloTexture) return haloTexture;
  const n = 32;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const d = Math.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2) / (n / 2);
      const a = Math.max(0, 1 - d);
      const i = (y * n + x) * 4;
      data.set([255, 255, 255, Math.round(255 * a * a)], i);
    }
  }
  haloTexture = new THREE.DataTexture(data, n, n);
  haloTexture.needsUpdate = true;
  return haloTexture;
}

/** A soft additive glow around a light, so it carries through haze; named `halo`. */
export function haloSprite(hex: string, size: number, opacity: number): THREE.Sprite {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: softDot(), color: new THREE.Color(hex), transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  sprite.material.allowOverride = false;
  sprite.scale.setScalar(size);
  sprite.name = 'halo';
  sprite.renderOrder = 2;
  return sprite;
}

