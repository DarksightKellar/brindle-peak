/**
 * The aurora: a few broad green curtains low in the northern sky, the thing Edda's radio waits for.
 *
 * Why it is built this way:
 *  - It is sky, not scenery. The vertex shader places every vertex at a fixed direction from the
 *    camera and pins it to the far plane, so it never parallaxes, needs no follow logic, and the depth
 *    test lets it paint only pixels nothing else has claimed (terrain occludes it for free). It writes
 *    no depth, so the composite still reads those pixels as depth = far: unfogged sky.
 *  - It is pixel art. At 384x216 any fine noise becomes shimmer, so the curtain is three or four broad
 *    bands of brightness, quantised to four levels with a 4x4 ordered dither in internal pixels. The
 *    ripple is a slow, low-frequency sway of the lower edge plus wide drifting folds.
 *  - It is beauty-only. It lives on its own layer, which the pipeline hides from the normal pass; on
 *    layer 0 its colours would land in the normal target and the edge pass would outline the folds.
 *
 * North is -z (yaw PI, see core/guide/compass.ts). Azimuths below are yaw offsets from north.
 */
import * as THREE from 'three';
import { AURORA } from './pixelConfig';

/** Render layer kept out of the normal pass (see pixelPipeline.ts). */
export const AURORA_LAYER = 1;

export interface Aurora {
  mesh: THREE.Mesh;
  /** amount 0..1 (0 hides it entirely); time in seconds drives the ripple. */
  set(amount: number, time: number): void;
}

const NORTH = Math.PI;
const COLUMNS = 56;

const VERT = /* glsl */ `
attribute vec3 aSky;    // x: yaw, y: 0 at the lower edge .. 1 at the top, z: -1..1 along the curtain
attribute vec4 aShape;  // x: lower-edge elevation, y: height (rad), z: phase, w: gain
uniform float uTime;
varying vec3 vSky;
varying vec2 vShape;
void main() {
  float yaw = aSky.x;
  // Slow, wide sway: the lower edge rolls and the curtain leans a little. Nothing finer than ~20 deg.
  float lift = 0.05 * sin(yaw * 3.0 - uTime * 0.16 + aShape.z) + 0.02 * sin(yaw * 7.0 + uTime * 0.11);
  yaw += aSky.y * 0.05 * sin(yaw * 3.0 + uTime * 0.07 + aShape.z);
  float el = aShape.x + lift + aSky.y * aShape.y;
  vec3 dir = vec3(sin(yaw) * cos(el), sin(el), cos(yaw) * cos(el));
  vec4 clip = projectionMatrix * viewMatrix * vec4(cameraPosition + dir * 100.0, 1.0);
  clip.z = clip.w * 0.99999; // on the far plane: behind everything, so only open sky takes it
  gl_Position = clip;
  vSky = vec3(yaw, aSky.y, aSky.z);
  vShape = aShape.zw;
}
`;

const FRAG = /* glsl */ `
uniform float uTime, uAmount;
uniform vec3 uLow, uMid, uTop;
varying vec3 vSky;
varying vec2 vShape;
// The 4x4 ordered-dither threshold, built from the 2x2 one: 16 levels in [0, 1), fixed to internal
// pixels (the beauty target is the 384x216 grid), so a band edge is a checker step, never a smear.
float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a) + 1.0 / 32.0; }
void main() {
  float v = vSky.y;
  float a = vSky.x + vShape.x;
  // Rays: two broad, slowly drifting waves along the curtain (periods ~15 and ~8 deg), never finer.
  float rays = clamp(0.5 + 0.35 * sin(a * 23.0 + uTime * 0.2) + 0.25 * sin(a * 41.0 - uTime * 0.13), 0.0, 1.0);
  // The hem: a bright drape along the bottom whose depth follows the rays, so it hangs in folds
  // instead of reading as a tube of even width.
  float hem = smoothstep(0.0, 0.04, v) * (1.0 - smoothstep(0.08 + 0.22 * rays, 0.3 + 0.3 * rays, v));
  // Above it, the rays climb as upright columns (their sides come from the rays term alone, so they stay
  // vertical) and fade toward the top edge.
  float body = smoothstep(0.0, 0.08, v) * pow(1.0 - v, 1.0) * smoothstep(0.55, 0.85, rays) * 0.62;
  float ends = 1.0 - smoothstep(0.55, 1.0, abs(vSky.z));
  float level = max(hem, body) * ends * vShape.y * uAmount;
  // Three flat steps. Only a short ramp at each step is dithered, so the inside of a band is one
  // solid colour and the checker pattern appears only on its edge.
  float x = level * 3.0;
  float q = (floor(x) + step(bayer4(gl_FragCoord.xy), smoothstep(0.3, 0.7, fract(x)))) / 3.0;
  vec3 col = mix(uLow, uMid, smoothstep(0.15, 0.45, v));
  col = mix(col, uTop, smoothstep(0.4, 0.75, v));
  gl_FragColor = vec4(col * q, 1.0);
}
`;

function linear(hex: string): THREE.Vector3 {
  const c = new THREE.Color(hex);
  return new THREE.Vector3(c.r, c.g, c.b).multiplyScalar(AURORA.intensity);
}

function buildGeometry(): THREE.BufferGeometry {
  const sky: number[] = [];
  const shape: number[] = [];
  const index: number[] = [];
  let base = 0;
  for (const c of AURORA.curtains) {
    for (let i = 0; i <= COLUMNS; i++) {
      const u = (i / COLUMNS) * 2 - 1;
      const yaw = NORTH + c.yaw + u * c.half;
      for (const v of [0, 1]) {
        sky.push(yaw, v, u);
        shape.push(c.base, c.height, c.phase, c.gain);
      }
      if (i < COLUMNS) {
        const a = base + i * 2;
        index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    base += (COLUMNS + 1) * 2;
  }
  const geo = new THREE.BufferGeometry();
  // `position` is required by three; the shader ignores it and builds the direction from aSky.
  geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(sky.length), 3));
  geo.setAttribute('aSky', new THREE.Float32BufferAttribute(sky, 3));
  geo.setAttribute('aShape', new THREE.Float32BufferAttribute(shape, 4));
  geo.setIndex(index);
  return geo;
}

export function createAurora(): Aurora {
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uTime: { value: 0 },
      uAmount: { value: 0 },
      uLow: { value: linear(AURORA.low) },
      uMid: { value: linear(AURORA.mid) },
      uTop: { value: linear(AURORA.top) },
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    fog: false,
  });
  material.allowOverride = false;

  const mesh = new THREE.Mesh(buildGeometry(), material);
  mesh.name = 'aurora';
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  mesh.layers.set(AURORA_LAYER);
  mesh.visible = false;

  return {
    mesh,
    set(amount, time): void {
      mesh.visible = amount > 0.002;
      (material.uniforms.uAmount.value as number) = amount;
      (material.uniforms.uTime.value as number) = time;
    },
  };
}
