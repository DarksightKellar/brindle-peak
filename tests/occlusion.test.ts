import { describe, expect, it } from 'vitest';
import { clearFraction, type Occluder } from '../src/game/camera/occlusion';

const trunk = (x: number, z: number, radius = 1.2, height = 9): Occluder => ({ x, z, radius, base: 0, height });

const PIVOT = { x: 0, y: 1.6, z: 0 };

describe('camera occlusion', () => {
  it('leaves a clear segment untouched', () => {
    const camera = { x: 0, y: 5, z: 15 };
    expect(clearFraction(PIVOT, camera, [trunk(6, 0)])).toBe(1);
  });

  it('stops the camera short of a trunk standing between pivot and camera', () => {
    const camera = { x: 0, y: 5, z: 15 };
    const t = clearFraction(PIVOT, camera, [trunk(0, 8)]);

    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThan(1);
    // The stop point must sit on the near face of the widened cylinder, not past it.
    const z = PIVOT.z + (camera.z - PIVOT.z) * t;
    expect(z).toBeCloseTo(8 - (1.2 + 0.55), 1);
  });

  it('ignores a trunk whose top the camera passes over', () => {
    const camera = { x: 0, y: 30, z: 15 };
    // Camera climbs from y=1.6 to y=30, so by z=8 it is far above a 4-unit trunk.
    expect(clearFraction(PIVOT, camera, [trunk(0, 8, 1.2, 4)])).toBe(1);
  });

  it('pulls almost fully in when the pivot itself is inside a trunk', () => {
    expect(clearFraction(PIVOT, { x: 0, y: 5, z: 15 }, [trunk(0.2, 0.2)])).toBeLessThanOrEqual(0.05);
  });

  it('takes the nearest of several trunks', () => {
    const camera = { x: 0, y: 5, z: 15 };
    const near = clearFraction(PIVOT, camera, [trunk(0, 4)]);
    const both = clearFraction(PIVOT, camera, [trunk(0, 4), trunk(0, 10)]);
    expect(both).toBeCloseTo(near, 6);
  });
});
