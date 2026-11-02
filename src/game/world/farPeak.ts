/**
 * Brindle Peak seen from the valley: the goal of the game, standing in the haze with its beacon.
 *
 * The real summit is ~1000 u from the cabin, far past the camera's far plane (400 u) and the fog, so
 * from everywhere you start the mountain you are climbing did not exist. This draws it into the sky.
 * The geometry is a coarse copy of the real massif (the same heightfield, sampled every 12 u), and the
 * vertex shader projects each point onto the far plane along its direction from the camera — so the
 * silhouette is the true outline of the mountain from wherever you stand, with no per-frame CPU work.
 * Pinned to the far plane and depth-tested, it only claims open sky: every hill in front hides it.
 * It fades out as you come within ~260 u, where the real mountain takes over. On top, a red beacon
 * that blinks slowly (holds still under reduce motion), and the thin line of the mast.
 *
 * It used to be one flat haze colour cut from a square block of terrain, and read as a placeholder:
 * a blue mesa whose sides dropped as sheer walls where the block ended. Now the block is round and its
 * rim sinks to the valley floor, each facet is lit by the valley's own sun in a few palette colours
 * (lit snow, shaded snow, haze; farPeakShaders.ts). It used to stand taller with distance, which put the
 * summit and its beacon above the top of the chase frame; now it is fitted under the top edge instead.
 * Why it was flat: it wrote its pinned depth (~385 u), and the composite fogs everything short of the
 * far plane, so whatever colour it was drawn in came out as the fog. It now writes no depth, like the
 * aurora, so the composite reads its pixels as sky and leaves them be; the haze is its own fourth
 * colour instead. With no depth of its own it is painted far facet first, re-sorted only when the
 * camera has moved a good way, and drawn after the aurora so the lights pass behind the mountain.
 *
 * Beauty layer only, like the aurora: its folds have no business in the normal pass. dusk.ts recolours
 * it through `userData.setDusk` as the valley turns to blue hour.
 */

import * as THREE from 'three';
import type { TerrainSampler } from '../../core/contracts';
import { PEAK } from '../../data/zones';
import { AURORA_LAYER } from '../render/aurora';
import { SUN_DIR } from '../render/scene';
import { MAST_HEIGHT } from './summit';
import { BEACON_FRAG, BEACON_VERT, LINE_FRAG, LINE_VERT, MASSIF_FRAG, MASSIF_VERT } from './farPeakShaders';

const SPAN = 228;
const STEP = 12;
/** Where the rim starts sinking to the valley floor, as a share of SPAN. */
const RIM = 0.7;
/** Snow line for the colour bands. The skirt goes all the way down, or sky shows under the mountain. */
const FLOOR = 34;
const NEAR = [240, 360] as const;
/**
 * How far under the top edge of the frame the beacon is kept (farPeakShaders.ts), and how fast that
 * room follows the camera's tilt: the chase camera leans up on slopes, and the drawing should not
 * breathe with every step.
 */
const MARGIN = (1.6 * Math.PI) / 180;
const RISE_RANGE = [Math.tan((2.5 * Math.PI) / 180), Math.tan((14 * Math.PI) / 180)] as const;
const RISE_EASE = 1.5;
/** Re-sort the facets once the camera has moved this far. */
const RESORT = 30;

/** Palette colours (ART_BIBLE §3) already mixed a share of the way into the haze they stand in. */
const COLOURS = {
  // Sunlit snow a step brighter than the pale horizon it stands in, so the summit is a shape and not a
  // ghost; at dusk the top catches the last light, rose against the blue hour, the way snow peaks do.
  day: { lit: '#F4F8FC', shade: '#98B0CF', haze: '#8FA8CE', mast: '#4E5C80' },
  dusk: { lit: '#D7A9B9', shade: '#7D84A6', haze: '#8690A6', mast: '#333B5A' },
};
type Tone = keyof typeof COLOURS.day;

function reducedMotion(): boolean {
  if (typeof document === 'undefined') return false;
  if (document.documentElement.dataset.reduceMotion === 'on') return true;
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

const colour = (hex: string): THREE.Color => new THREE.Color(hex);

/**
 * The ground averaged over a cell's width. Sampled at single points, one grid vertex landed on Nettle
 * Chimney's narrow top and stood it up as a needle twice the height of anything near it; seen from a
 * kilometre the chimney is a knob on the ridge, not a spire.
 */
function softHeight(sampler: TerrainSampler, x: number, z: number): number {
  const r = STEP * 0.75;
  let sum = 0;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) sum += sampler.heightAt(x + a * r, z + b * r);
  return sum / 9;
}

/** The massif as an indexed grid over a disc round the peak, its rim sunk to the valley floor. */
function massifGeometry(sampler: TerrainSampler, summit: number): { geo: THREE.BufferGeometry; cells: Float32Array } {
  const n = Math.floor((SPAN * 2) / STEP) + 1;
  const pos: number[] = [];
  const t: number[] = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const dx = -SPAN + i * STEP, dz = -SPAN + j * STEP;
      const r = Math.hypot(dx, dz) / SPAN;
      const sink = 1 - THREE.MathUtils.smoothstep(r, RIM, 1);
      const h = softHeight(sampler, PEAK.x + dx, PEAK.z + dz) * sink;
      pos.push(dx, h, dz);
      t.push(Math.max(0, (h - FLOOR) / (summit - FLOOR)));
    }
  }
  // One entry per cell: its centre, for the near-first sort. Cells wholly outside the disc are dropped.
  const centres: number[] = [];
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const dx = -SPAN + (i + 0.5) * STEP, dz = -SPAN + (j + 0.5) * STEP;
      if (Math.hypot(dx, dz) > SPAN + STEP) continue;
      centres.push(j * n + i, PEAK.x + dx, PEAK.z + dz);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aT', new THREE.Float32BufferAttribute(t, 1));
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array((centres.length / 3) * 6), 1));
  (geo.userData as { n: number }).n = n;
  return { geo, cells: new Float32Array(centres) };
}

/** Write the index buffer farthest cell first, as seen from (x, z): a painter's order. */
function sortFarFirst(geo: THREE.BufferGeometry, cells: Float32Array, x: number, z: number): void {
  const n = (geo.userData as { n: number }).n;
  const count = cells.length / 3;
  const order = Array.from({ length: count }, (_, k) => k);
  const d = (k: number): number => (cells[k * 3 + 1] - x) ** 2 + (cells[k * 3 + 2] - z) ** 2;
  order.sort((a, b) => d(b) - d(a));
  const index = geo.index as THREE.BufferAttribute;
  const out = index.array as Uint32Array;
  for (let k = 0; k < count; k++) {
    const a = cells[order[k] * 3];
    out.set([a, a + n, a + 1, a + 1, a + n, a + n + 1], k * 6);
  }
  index.needsUpdate = true;
}

export function buildFarPeak(sampler: TerrainSampler): THREE.Group {
  const group = new THREE.Group();
  group.name = 'far-peak';
  const summit = softHeight(sampler, PEAK.x, PEAK.z);
  const shared = {
    uPeak: { value: new THREE.Vector3(PEAK.x, summit, PEAK.z) },
    uNear0: { value: NEAR[0] },
    uNear1: { value: NEAR[1] },
    uTop: { value: summit + MAST_HEIGHT + 0.5 },
    uMaxRise: { value: Math.tan((4 * Math.PI) / 180) },
  };
  const tone = (k: Tone): { value: THREE.Color } => ({ value: colour(COLOURS.day[k]) });

  const { geo, cells } = massifGeometry(sampler, summit);
  const massifMat = new THREE.ShaderMaterial({
    vertexShader: MASSIF_VERT,
    fragmentShader: MASSIF_FRAG,
    uniforms: {
      ...shared, uLit: tone('lit'), uShade: tone('shade'), uHaze: tone('haze'),
      uSun: { value: SUN_DIR.clone().normalize() },
    },
    transparent: true,
    side: THREE.DoubleSide,
  });
  massifMat.allowOverride = false;
  // Tested against the pinned depth, so every solid thing in front still hides it; never written.
  massifMat.depthWrite = false;
  const massif = new THREE.Mesh(geo, massifMat);
  // Placed at the peak, so among the overlays drawn in the same order (steam, halos) it sorts as the
  // farthest and goes first; they stay in front of it.
  massif.position.set(PEAK.x, 0, PEAK.z);
  massif.frustumCulled = false;
  const sorted = new THREE.Vector2(Infinity, Infinity);
  let lastFrame = performance.now();
  massif.onBeforeRender = (_r, _s, camera): void => {
    // The room above the horizon: the camera's pitch plus half its lens, less a margin, eased.
    if (camera instanceof THREE.PerspectiveCamera) {
      const e = camera.matrixWorld.elements;
      const top = Math.asin(THREE.MathUtils.clamp(-e[9], -1, 1)) + THREE.MathUtils.degToRad(camera.fov / 2);
      const want = THREE.MathUtils.clamp(Math.tan(top - MARGIN), RISE_RANGE[0], RISE_RANGE[1]);
      const now = performance.now();
      const dt = Math.min(0.5, (now - lastFrame) / 1000);
      lastFrame = now;
      const u = shared.uMaxRise;
      u.value += (want - u.value) * Math.min(1, dt * RISE_EASE);
    }
    const p = camera.position;
    if (Math.hypot(p.x - sorted.x, p.z - sorted.y) < RESORT) return;
    sorted.set(p.x, p.z);
    sortFarFirst(geo, cells, p.x, p.z);
  };

  // The mast as a line, and the beacon on top of it.
  const top = summit + MAST_HEIGHT + 0.5;
  const lineGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(PEAK.x, summit, PEAK.z), new THREE.Vector3(PEAK.x, top, PEAK.z),
  ]);
  const lineMat = new THREE.ShaderMaterial({
    vertexShader: LINE_VERT,
    fragmentShader: LINE_FRAG,
    uniforms: { ...shared, uColor: tone('mast') },
    transparent: true,
  });
  lineMat.allowOverride = false;
  const line = new THREE.Line(lineGeo, lineMat);
  line.frustumCulled = false;

  const beaconMat = new THREE.ShaderMaterial({
    vertexShader: BEACON_VERT,
    fragmentShader: BEACON_FRAG,
    uniforms: { ...shared, uSize: { value: 9 }, uBlink: { value: 1 } },
    transparent: true,
    depthWrite: false,
  });
  beaconMat.allowOverride = false;
  const beacon = new THREE.Points(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(PEAK.x, top, PEAK.z)]), beaconMat);
  beacon.frustumCulled = false;
  beacon.onBeforeRender = (): void => {
    // A slow two-second pulse, never fully off; steady when motion is reduced.
    const s = performance.now() / 1000;
    beaconMat.uniforms.uBlink.value = reducedMotion() ? 1 : 0.55 + 0.45 * Math.max(0, Math.sin(s * Math.PI));
  };

  // After the aurora (order 1), which also writes no depth: the mountain stands in front of the lights.
  for (const [o, order] of [[massif, 2], [line, 2], [beacon, 3]] as const) {
    o.layers.set(AURORA_LAYER);
    o.renderOrder = order;
    group.add(o);
  }

  const recolour = (u: { value: THREE.Color }, k: Tone, t: number): void => {
    u.value.copy(colour(COLOURS.day[k])).lerp(colour(COLOURS.dusk[k]), t);
  };
  group.userData.setDusk = (t: number): void => {
    const m = massifMat.uniforms;
    recolour(m.uLit, 'lit', t);
    recolour(m.uShade, 'shade', t);
    recolour(m.uHaze, 'haze', t);
    recolour(lineMat.uniforms.uColor, 'mast', t);
  };
  return group;
}
