/**
 * The wiring test pattern: magenta/green squares, unmistakable against snow, used only to prove that a
 * texture reached the shader before anyone tunes a subtle one. A subtle change that measures zero is
 * indistinguishable from a texture that was never attached, and this is what tells them apart.
 */

import * as THREE from 'three';

export function buildCheckTexture(): THREE.DataTexture {
  const n = 64;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = (y * n + x) * 4;
      const on = ((x >> 3) + (y >> 3)) % 2 === 0;
      data[i] = on ? 255 : 0;
      data[i + 1] = on ? 0 : 255;
      data[i + 2] = on ? 255 : 0;
      data[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  t.name = 'ground-checker';
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Built once per page: three 256x256 RGBA textures, ~0.75 MB total. */
