import { describe, expect, it } from 'vitest';
import { createSampler, generateHeightfield } from '../src/core/terrain/heightfield';
import { PEAK, SPAWN, WORLD_RES, WORLD_SEED, WORLD_SIZE, ZONES } from '../src/data/zones';
import { HOP_SPOTS } from '../src/game/session/travel';

const sampler = createSampler(generateHeightfield(WORLD_SEED, WORLD_SIZE, WORLD_RES, ZONES, PEAK), ZONES);

/**
 * The test that decides whether the game can be finished.
 *
 * ARCHITECTURE §6 mandates a spawn-to-summit connectivity test and there was none. This is a
 * slope-limited flood fill on a coarse grid: from the spawn you may step to a neighbour if the
 * ground rises no more than MAX_STEP across that distance. Downhill is always allowed.
 *
 * It ignores stamina on purpose, so it is a *necessary* condition only: it proves the mountain is
 * not severed by an unclimbable wall between spawn and summit, not that the summit is reachable at
 * the player's current feather count. 1.15 units of rise per 1.5-unit step permits the steep ridge
 * faces (slope ~0.7); the route it proves never needs a climb.
 */
describe('spawn to summit connectivity', () => {
  const MAX_STEP = 1.15;
  const CELL = 1.5;

  it('has an unbroken on-foot route from the spawn to the peak', () => {
    const n = Math.floor(WORLD_SIZE / CELL);
    const half = WORLD_SIZE / 2;
    const seen = new Uint8Array(n * n);
    const heightAt = (gx: number, gz: number): number =>
      sampler.heightAt(-half + gx * CELL, -half + gz * CELL);

    const startX = Math.round((SPAWN.x + half) / CELL);
    const startZ = Math.round((SPAWN.z + half) / CELL);
    const goalX = Math.round((PEAK.x + half) / CELL);
    const goalZ = Math.round((PEAK.z + half) / CELL);

    const start = startZ * n + startX;
    const stack: number[] = [start];
    seen[start] = 1;
    let reached = false;

    while (stack.length > 0) {
      const idx = stack.pop() as number;
      const gx = idx % n;
      const gz = (idx - gx) / n;
      if (Math.abs(gx - goalX) <= 2 && Math.abs(gz - goalZ) <= 2) {
        reached = true;
        break;
      }
      const h = heightAt(gx, gz);
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dz === 0) continue;
          const nx = gx + dx;
          const nz = gz + dz;
          if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
          const ni = nz * n + nx;
          if (seen[ni]) continue;
          if (heightAt(nx, nz) - h > MAX_STEP) continue;
          seen[ni] = 1;
          stack.push(ni);
        }
      }
    }

    expect(reached, 'the peak must be reachable on foot from the spawn').toBe(true);
  });
});

// A hop records its own arrival as by map (session.ts); a spot that sampled as another zone would be
// recorded again by the frame's zone check, as a walk.
describe('map hops', () => {
  it('land inside the zone they are named for', () => {
    for (const [zone, spot] of Object.entries(HOP_SPOTS)) {
      expect(sampler.sampleAt(spot.at.x, spot.at.z).zone, zone).toBe(zone);
    }
  });
});
