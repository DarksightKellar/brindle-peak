import { describe, expect, it } from 'vitest';
import { createSampler, generateHeightfield } from '../src/core/terrain/heightfield';
import { buildTerrainMesh, TERRAIN_TRIANGLES } from '../src/game/world/terrainMesh';
import { PEAK, SPAWN, WORLD_RES, WORLD_SEED, WORLD_SIZE, ZONES } from '../src/data/zones';
import { makeRng } from '../src/core/contracts';
import type { TerrainSampler } from '../src/core/contracts';

const SEED = WORLD_SEED;
const RES = WORLD_RES;

/** Nettle Chimney, the authored wall. Fixed world position; see heightfield.ts. */
const CHIMNEY = { x: 250, z: -240 };

const hf = generateHeightfield(SEED, WORLD_SIZE, RES, ZONES, PEAK);
const sampler: TerrainSampler = createSampler(hf, ZONES);

describe('heightfield generation', () => {
  it('is byte-identical for identical inputs', () => {
    const a = generateHeightfield(SEED, WORLD_SIZE, RES, ZONES, PEAK);
    const b = generateHeightfield(SEED, WORLD_SIZE, RES, ZONES, PEAK);
    expect(a.heights.length).toBe(RES * RES);

    const bytesA = new Uint8Array(a.heights.buffer);
    const bytesB = new Uint8Array(b.heights.buffer);
    expect(bytesB.length).toBe(bytesA.length);
    let differing = 0;
    for (let i = 0; i < bytesA.length; i++) if (bytesA[i] !== bytesB[i]) differing++;
    expect(differing).toBe(0);

    const other = generateHeightfield(SEED + 1, WORLD_SIZE, RES, ZONES, PEAK);
    const bytesOther = new Uint8Array(other.heights.buffer);
    let otherDiffering = 0;
    for (let i = 0; i < bytesA.length; i++) if (bytesA[i] !== bytesOther[i]) otherDiffering++;
    expect(otherDiffering).toBeGreaterThan(1000);
  });

  it('keeps the summit in 90..100 and within 40 units of PEAK, with no sample below -2', () => {
    let min = Infinity;
    let max = -Infinity;
    let maxX = 0;
    let maxZ = 0;
    const cell = WORLD_SIZE / (RES - 1);

    for (let iz = 0; iz < RES; iz++) {
      for (let ix = 0; ix < RES; ix++) {
        const h = hf.heights[iz * RES + ix];
        if (h < min) min = h;
        if (h > max) {
          max = h;
          maxX = -WORLD_SIZE / 2 + ix * cell;
          maxZ = -WORLD_SIZE / 2 + iz * cell;
        }
      }
    }

    expect(min).toBeGreaterThanOrEqual(-2);
    expect(max).toBeGreaterThanOrEqual(90);
    expect(max).toBeLessThanOrEqual(100);
    expect(Math.hypot(maxX - PEAK.x, maxZ - PEAK.z)).toBeLessThan(40);
  });

  it('identifies every zone at its own centre and hits its elevation band', () => {
    for (const zone of ZONES) {
      const sample = sampler.sampleAt(zone.centre.x, zone.centre.z);
      const [lo, hi] = zone.elevation;
      expect(sample.zone, `${zone.id} centre reports ${sample.zone}`).toBe(zone.id);
      expect(sample.height, `${zone.id} height ${sample.height.toFixed(2)}`).toBeGreaterThanOrEqual(lo - 6);
      expect(sample.height, `${zone.id} height ${sample.height.toFixed(2)}`).toBeLessThanOrEqual(hi + 6);
    }
  });

  it('freezes the reach into a genuinely flat ice sheet', () => {
    const reach = ZONES.find((z) => z.id === 'reach');
    if (!reach) throw new Error('reach zone missing');
    const rng = makeRng(4242);
    let worst = 0;

    for (let i = 0; i < 200; i++) {
      const angle = rng.range(0, Math.PI * 2);
      const radius = Math.sqrt(rng.next()) * reach.radius * 0.6;
      const x = reach.centre.x + Math.cos(angle) * radius;
      const z = reach.centre.z + Math.sin(angle) * radius;
      worst = Math.max(worst, sampler.sampleAt(x, z).slope);
      expect(sampler.sampleAt(x, z).surface).toBe('ice');
    }

    expect(worst).toBeLessThan(0.12);
  });

  it('carves the Nettle Chimney at (250, -240)', () => {
    let steepest = 0;
    let steepestAt = { x: 0, z: 0 };

    for (let dz = -25; dz <= 25; dz += 0.25) {
      for (let dx = -25; dx <= 25; dx += 0.25) {
        if (dx * dx + dz * dz > 625) continue;
        const x = CHIMNEY.x + dx;
        const z = CHIMNEY.z + dz;
        const slope = sampler.sampleAt(x, z).slope;
        if (slope > steepest) {
          steepest = slope;
          steepestAt = { x, z };
        }
      }
    }

    expect(
      steepest,
      `steepest point ${steepestAt.x.toFixed(1)},${steepestAt.z.toFixed(1)}`,
    ).toBeGreaterThan(0.85);
  });

  it('keeps heightAt continuous away from the authored wall', () => {
    let worst = 0;
    let steps = 0;

    for (let t = 0; t < 16; t++) {
      const angle = (t / 16) * Math.PI * 2;
      const dx = Math.cos(angle);
      const dz = Math.sin(angle);
      let x = -430 * dx;
      let z = -430 * dz;
      let prev = sampler.heightAt(x, z);

      for (let i = 0; i < 8600; i++) {
        x += dx * 0.1;
        z += dz * 0.1;
        const h = sampler.heightAt(x, z);
        // The chimney is a 40-unit face over one cell: an 81-degree wall is not a continuity
        // bug, it is the feature. It is asserted by its own slope test above.
        if (Math.hypot(x - CHIMNEY.x, z - CHIMNEY.z) > 20) {
          worst = Math.max(worst, Math.abs(h - prev));
          steps++;
        }
        prev = h;
      }
    }

    expect(steps).toBeGreaterThan(100000);
    expect(worst).toBeLessThan(0.4);
  });

  it('reports slope in 0..1 and exactly 1 - normal.y', () => {
    const rng = makeRng(31337);
    for (let i = 0; i < 4000; i++) {
      const x = rng.range(-512, 512);
      const z = rng.range(-512, 512);
      const sample = sampler.sampleAt(x, z);
      const n = sampler.normalAt(x, z);
      expect(sample.slope).toBeGreaterThanOrEqual(0);
      expect(sample.slope).toBeLessThanOrEqual(1);
      expect(Math.abs(sample.slope - (1 - n.y))).toBeLessThan(1e-3);
      expect(Math.abs(Math.hypot(n.x, n.y, n.z) - 1)).toBeLessThan(1e-6);
    }
  });
});

describe('terrain mesh', () => {
  it('is one smooth-shaded mesh inside the triangle budget with sampler normals', () => {
    const mesh = buildTerrainMesh(sampler);
    const geometry = mesh.geometry;
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const color = geometry.getAttribute('color');

    expect(geometry.getIndex()).toBeNull();
    expect(position.count / 3).toBe(TERRAIN_TRIANGLES);
    expect(TERRAIN_TRIANGLES).toBeLessThan(40000);
    expect(normal.count).toBe(position.count);
    expect(color.count).toBe(position.count);

    let minY = Infinity;
    let maxY = -Infinity;
    let minColor = Infinity;
    let maxColor = -Infinity;
    let matching = 0;

    for (let i = 0; i < position.count; i++) {
      minY = Math.min(minY, position.getY(i));
      maxY = Math.max(maxY, position.getY(i));
      minColor = Math.min(minColor, color.getX(i), color.getY(i), color.getZ(i));
      maxColor = Math.max(maxColor, color.getX(i), color.getY(i), color.getZ(i));
    }

    // Every vertex carries the sampler's own normal at that point, so the lighting matches the
    // ground the player collides with and faces blend smoothly instead of reading as triangles.
    let checked = 0;
    for (let i = 0; i < position.count; i += 97) {
      const n = sampler.normalAt(position.getX(i), position.getZ(i));
      if (Math.abs(normal.getX(i) - n.x) + Math.abs(normal.getY(i) - n.y) + Math.abs(normal.getZ(i) - n.z) < 1e-4) matching++;
      checked++;
    }

    expect(minY).toBeGreaterThan(-2);
    expect(maxY).toBeLessThan(100);
    expect(minColor).toBeGreaterThanOrEqual(0);
    expect(maxColor).toBeLessThanOrEqual(1);
    expect(matching).toBe(checked);
  });
});

describe('world data', () => {
  it('places the spawn inside the hearth low ground', () => {
    const sample = sampler.sampleAt(SPAWN.x, SPAWN.z);
    expect(sample.zone).toBe('hearth');
    expect(sample.height).toBeGreaterThan(2);
    expect(sample.height).toBeLessThan(20);
  });
});
