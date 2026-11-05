import { describe, expect, it } from 'vitest';
import { routeAim } from '../src/core/guide/route';

// An L: east 100, then north 100, to a target just past the end.
const routes = [{ path: [[0, 0], [100, 0], [100, 100]] as const }];
const top = { x: 100, z: 110 };
const foot = { x: -5, z: 0 };

describe('a goal along a route (critic round 17, the pin through the north face)', () => {
  it('aims a little way along the path, waits at a bend, then goes round it, and counts the walk left', () => {
    const before = routeAim(routes, { x: 90, z: 5 }, top);
    expect(before?.aim).toEqual({ x: 100, z: 0 }); // the corner, not across it
    expect(before?.distance).toBeCloseTo(5 + 110 + 10);
    const at = routeAim(routes, { x: 98, z: 2 }, top);
    expect(at?.aim.x).toBeCloseTo(100);
    expect(at?.aim.z).toBeCloseTo(12); // 2 to the corner, 12 up the second leg
  });

  it('points straight within reach of the target (critic round 18: "73 u, behind you" beside Bram)', () => {
    expect(routeAim(routes, { x: 100, z: 90 }, top)).toBeNull();
    expect(routeAim(routes, { x: 20, z: 3 }, foot)).toBeNull();
  });

  it('points straight while the path still runs along the straight line', () => {
    const bent = [{ path: routes[0].path, leaves: 1 }];
    expect(routeAim(bent, { x: 30, z: 0 }, top)).toBeNull(); // 70 short of the bend
    expect(routeAim(bent, { x: 90, z: 0 }, top)?.aim).toEqual({ x: 100, z: 0 });
  });

  it('leads back down the same path to a target at its start', () => {
    const r = routeAim(routes, { x: 100, z: 50 }, foot);
    expect(r?.aim.x).toBeCloseTo(100);
    expect(r?.aim.z).toBeCloseTo(36);
  });

  it('leaves the goal straight when Pip is far off the path, or the target is elsewhere', () => {
    expect(routeAim(routes, { x: 50, z: 200 }, top)).toBeNull();
    expect(routeAim(routes, { x: 90, z: 5 }, { x: 300, z: 300 })).toBeNull();
  });
});
