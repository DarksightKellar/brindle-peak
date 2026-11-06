/**
 * Steam off the hot pools: soft round puffs that rise, swell and thin out.
 *
 * It used to be three stacks of crossed, see-through rectangles per pool, which read as panes of
 * glass (critic: "stacks of see-through rectangles"). Steam has no edges, so each puff is a camera-
 * facing sprite with a soft lumpy texture, cycling on its own phase: born small at the water, it
 * rises about seven units, doubles in size and fades. Six per pool keep a column going.
 *
 * Beauty layer only (the aurora's layer): a translucent puff written into the normal target would be
 * outlined by the edge pass. With reduce motion on, the puffs hold still at their staggered phases.
 */

import * as THREE from 'three';
import type { TerrainSampler } from '../../core/contracts';
import { PALETTE } from '../../core/palette';
import { AURORA_LAYER } from '../render/aurora';
import { SPRING_POOLS } from './landmarks';

// Six puffs, a seven-unit rise and 60% at the thickest, in white brighter than the sky: four faint puffs
// were the sky's own colour, and critic round 47's steam photo came back with no steam in it.
const PER_POOL = 6;
const PERIOD = 6.5;
const RISE = 7;
const THICK = 0.6;
/**
 * A puff thins out as the camera comes into it: critic round 57 talked to Corm beside a pool with half
 * the screen a white wall. Clear within NEAR_CLEAR of the lens, full by NEAR_FULL.
 */
const NEAR_CLEAR = 3;
const NEAR_FULL = 9;
/**
 * 0..1, how far the viewfinder is up. Through the lens the steam is the subject, not something in the
 * way: the Steam Columns spot stands 5 to 11 u off its pool, inside the thinning, and critic round 58's
 * "The steam, caught on camera" printed only sky.
 */
let lensUp = 0;
export function setSteamLens(blend: number): void {
  lensUp = Math.max(0, Math.min(1, blend));
}

/** A soft cloud: three overlapping round blobs, so a puff is lumpy rather than a perfect disc. */
let cloudTexture: THREE.DataTexture | null = null;
function cloud(): THREE.DataTexture {
  if (cloudTexture) return cloudTexture;
  const n = 32;
  const blobs = [[0.5, 0.56, 0.36], [0.33, 0.45, 0.24], [0.66, 0.42, 0.26]];
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let a = 0;
      for (const [bx, by, br] of blobs) {
        const d = Math.hypot((x + 0.5) / n - bx, (y + 0.5) / n - by) / br;
        a = Math.max(a, Math.max(0, 1 - d * d));
      }
      data.set([255, 255, 255, Math.round(255 * a)], (y * n + x) * 4);
    }
  }
  cloudTexture = new THREE.DataTexture(data, n, n);
  // Smooth, not nearest: a puff right at the lens otherwise magnifies into hard squares.
  cloudTexture.magFilter = cloudTexture.minFilter = THREE.LinearFilter;
  cloudTexture.needsUpdate = true;
  return cloudTexture;
}

interface Puff {
  sprite: THREE.Sprite;
  x: number;
  y: number;
  z: number;
  r: number;
  phase: number;
}

const puffs: Puff[] = [];

function reducedMotion(): boolean {
  if (typeof document === 'undefined') return false;
  if (document.documentElement.dataset.reduceMotion === 'on') return true;
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

export function buildSteam(sampler: TerrainSampler): THREE.Group {
  const group = new THREE.Group();
  group.name = 'spring-steam';
  puffs.length = 0;
  SPRING_POOLS.forEach((pool, p) => {
    for (let i = 0; i < PER_POOL; i++) {
      const material = new THREE.SpriteMaterial({
        map: cloud(),
        color: new THREE.Color(PALETTE.STEAM),
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      material.allowOverride = false;
      const sprite = new THREE.Sprite(material);
      sprite.onBeforeRender = (_r, _s, camera) => {
        const d = camera.position.distanceTo(sprite.position) - sprite.scale.x * 0.5;
        const near = Math.max(0, Math.min(1, (d - NEAR_CLEAR) / (NEAR_FULL - NEAR_CLEAR)));
        const k = near + (1 - near) * lensUp;
        material.opacity = (sprite.userData.opacity as number) * k * k * (3 - 2 * k);
      };
      sprite.layers.set(AURORA_LAYER);
      sprite.renderOrder = 2;
      group.add(sprite);
      puffs.push({ sprite, x: pool.x, y: sampler.heightAt(pool.x, pool.z) + 0.3, z: pool.z, r: pool.r, phase: i / PER_POOL + p * 0.17 });
    }
  });
  updateSteam(0);
  return group;
}

/** Place every puff for this moment. Cheap: a position, a scale and an opacity per sprite. */
export function updateSteam(time: number): void {
  const t0 = reducedMotion() ? 0 : time;
  for (const p of puffs) {
    const t = (((t0 / PERIOD + p.phase) % 1) + 1) % 1;
    const size = p.r * (0.9 + 1.4 * t);
    // A slow lean downwind and a little sway, so the column is not a ruled line.
    const drift = t * 1.4 + 0.25 * Math.sin((t0 + p.phase * 9) * 0.7);
    p.sprite.position.set(p.x + drift, p.y + 0.6 + t * RISE, p.z + 0.3 * Math.sin(p.phase * 11));
    p.sprite.scale.set(size, size * 0.8, 1);
    const fade = Math.min(1, t / 0.18) * (1 - Math.max(0, (t - 0.45) / 0.55));
    p.sprite.userData.opacity = THICK * fade;
  }
}
