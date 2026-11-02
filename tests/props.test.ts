import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createSampler, generateHeightfield } from '../src/core/terrain/heightfield';
import { PEAK, WORLD_SEED, WORLD_SIZE, ZONES } from '../src/data/zones';
import { createPropMesh, PROP_BUDGET, PROP_VARIANTS } from '../src/game/world/props';
import type { PropKind } from '../src/game/world/props';
import { buildScatterGroup, MIN_SPACING, scatterProps } from '../src/game/world/scatter';
import { buildLandmarks, LANDMARKS } from '../src/game/world/landmarks';
import { buildWater, updateWater } from '../src/game/world/water';

const SEED = WORLD_SEED, KINDS = Object.keys(PROP_BUDGET) as PropKind[];
const hf = generateHeightfield(SEED, WORLD_SIZE, 192, ZONES, PEAK);
const sampler = createSampler(hf, ZONES);
const placements = scatterProps(sampler, SEED);

describe('scatter', () => {
  it('is identical for the same seed', () => {
    expect(scatterProps(sampler, SEED)).toEqual(placements);
    expect(scatterProps(sampler, SEED + 1)).not.toEqual(placements);
  });
  it('respects the 2.2-unit minimum spacing', () => {
    let worst = Infinity;
    for (let i = 0; i < placements.length; i++) {
      for (let j = i + 1; j < placements.length; j++) {
        const a = placements[i];
        const b = placements[j];
        if (Math.abs(a.x - b.x) > MIN_SPACING || Math.abs(a.z - b.z) > MIN_SPACING) continue;
        worst = Math.min(worst, Math.hypot(a.x - b.x, a.z - b.z));
      }
    }
    expect(worst).toBeGreaterThanOrEqual(MIN_SPACING);
  });
  it('puts only drift, rock and brush on ice; nothing at all on a spring', () => {
    // A frozen lake holds drift, boulders and dead reeds; anything that grows or is built must stay
    // off the ice, and nothing may stand in a hot spring the player soaks in.
    const ICE_OK = new Set(['drift', 'rock', 'brush']);
    for (const p of placements) {
      const s = sampler.sampleAt(p.x, p.z);
      expect(s.surface, `prop on a spring at ${p.x.toFixed(0)},${p.z.toFixed(0)}`).not.toBe('spring');
      if (s.surface === 'ice') expect(ICE_OK.has(p.kind), `${p.kind} does not belong on ice`).toBe(true);
    }
  });
  it('stays inside the margin and on the terrain', () => {
    for (const p of placements) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(500);
      expect(Math.abs(p.z)).toBeLessThanOrEqual(500);
      expect(Math.abs(p.y - sampler.heightAt(p.x, p.z))).toBeLessThan(0.5);
    }
  });
  it('never stands on a slope steeper than 0.78', () => {
    for (const p of placements) expect(sampler.sampleAt(p.x, p.z).slope).toBeLessThanOrEqual(0.78);
  });
  it('leaves 6 units of clearance around every landmark and the summit', () => {
    const points = [...LANDMARKS.map((l) => ({ id: l.id, x: l.x, z: l.z })), { id: 'peak', x: PEAK.x, z: PEAK.z }];
    for (const p of placements) {
      for (const c of points) expect(Math.hypot(p.x - c.x, p.z - c.z), `${p.kind} inside ${c.id}`).toBeGreaterThanOrEqual(6);
    }
  });
  it('draws every placement, instanced into a bounded number of meshes', () => {
    const group = buildScatterGroup(sampler, SEED);
    expect(group.children.length).toBeLessThanOrEqual(22);
    let instances = 0;
    for (const child of group.children) instances += (child as THREE.InstancedMesh).count;
    expect(instances).toBe(placements.length);
  });
});

describe('landmarks', () => {
  it('stands every structure on the terrain', () => {
    const group = buildLandmarks(sampler);
    expect(group.children.length).toBe(LANDMARKS.length);
    let meshes = 0;
    group.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh) return;
      meshes++;
      expect(o.position.y).toBeCloseTo(sampler.heightAt(o.position.x, o.position.z), 3);
    });
    expect(meshes).toBeGreaterThanOrEqual(LANDMARKS.length);
  });
});

describe('props', () => {
  it('stays inside the documented triangle budget for every variant', () => {
    for (const kind of KINDS) {
      for (let v = 0; v < PROP_VARIANTS[kind]; v++) {
        const geometry = createPropMesh(kind, v).geometry;
        expect(geometry.getAttribute('position').count / 3, `${kind} v${v}`).toBeLessThanOrEqual(PROP_BUDGET[kind]);
        expect(geometry.getAttribute('color').count).toBe(geometry.getAttribute('position').count);
      }
    }
  });
  it('keeps unlit and transparent materials out of the normal pass (ART_BIBLE A3)', () => {
    for (const m of createPropMesh('lantern', 0).material as THREE.Material[]) {
      if (m.type === 'MeshBasicMaterial') expect(m.allowOverride).toBe(false);
    }
    for (const child of buildWater(sampler).children) {
      const m = (child as THREE.Mesh).material as THREE.Material;
      if (m.type === 'MeshBasicMaterial') expect(m.allowOverride).toBe(false);
    }
    expect(() => updateWater(0.016)).not.toThrow();
  });
});
