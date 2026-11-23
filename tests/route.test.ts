import { describe, expect, it } from 'vitest';
import { aroundAim, routeAim } from '../src/core/guide/route';

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

  it('says how far off the path Pip stands, for the goal line\'s "once you\'re back on it" (critic round 112)', () => {
    expect(routeAim(routes, { x: 50, z: 2 }, top)?.off).toBeCloseTo(2);
    expect(routeAim(routes, { x: 50, z: -30 }, top)?.off).toBeCloseTo(30);
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
    expect(routeAim(routes, { x: -50, z: 250 }, top)).toBeNull();
    expect(routeAim(routes, { x: 90, z: 5 }, { x: 300, z: 300 })).toBeNull();
  });
});

describe('close in a straight line, far round by the path (critic round 90, Tuck over Windscar face)', () => {
  // A U: out east, up north, back west, to a target at its end, 55 u straight across the U from the start.
  // Among cliffs from its first vertex: in the open, close at hand is always straight (next test).
  const u = [{ path: [[0, 0], [100, 0], [100, 100], [0, 100]] as const, slantUntil: 0 }];
  const end = { x: 0, z: 100 };

  it('follows the path when its walk is far longer than the straight line', () => {
    const r = routeAim(u, { x: 0, z: 45 }, end);
    expect(r).not.toBeNull();
    expect(r?.distance).toBeCloseTo(345);
  });

  it('still points straight when the target is close along the path too', () => {
    expect(routeAim(u, { x: 10, z: 95 }, end)).toBeNull();
  });

  it('points straight at a target beside the path end, among the cliffs (critic round 94 beside Edda)', () => {
    // The trail ends at the mast; Edda stands 18 u past it, and Pip a few steps from her.
    const end = [{ path: [[0, 0], [100, 0], [100, 100]] as const, slantUntil: 0 }];
    expect(routeAim(end, { x: 112, z: 112 }, { x: 113, z: 115 })).toBeNull();
  });

  it('leads back to the path first from off it among the cliffs (critic round 102 above the gorge)', () => {
    // The last leg runs west to the end; Pip stands 16 u north of it, 43 u from the target, with the gorge
    // between. Straight would be within the old 'close along the path' allowance; off the trail it is not.
    const gorge = [{ path: [[300, -100], [200, -16], [140, -16]] as const, slantUntil: 0 }];
    const r = routeAim(gorge, { x: 195, z: 0 }, { x: 153, z: -13 });
    expect(r).not.toBeNull();
    expect(r?.aim.z).toBeCloseTo(-16); // onto the trail, not across the gorge
    // From the trail itself, the same target is pointed at straight.
    expect(routeAim(gorge, { x: 184, z: -16 }, { x: 153, z: -13 })).toBeNull();
  });

  it('points straight at a target close at hand on open ground (critic round 91 beside Bram)', () => {
    // The trail's start by the cabin: Pip a little way out along it, the woodpile just off its start.
    const open = [{ path: [[0, 0], [400, 0], [400, -100]] as const, slantUntil: 1 }];
    expect(routeAim(open, { x: 40, z: 2 }, { x: 10, z: 25 })).toBeNull();
  });
});

describe('a near goal behind a building (critic round 48, "6 u" through the radio hut wall)', () => {
  // A 10 by 6 hut at the origin, square to the axes; the target stands beside its east wall's middle.
  const hut = [{ x: 0, z: 0, hw: 5, hd: 3, yaw: 0 }];
  const target = { x: 7, z: 0 };

  it('points straight when nothing stands between', () => {
    expect(aroundAim(hut, { x: 7, z: 10 }, target)).toBeNull();
  });

  it('points straight at a target too far off to be about walking round a wall', () => {
    expect(aroundAim(hut, { x: -40, z: 0 }, { x: 7, z: 0 })).toBeNull();
  });

  it('aims at a corner round the wall, and the distance is the walk', () => {
    const r = aroundAim(hut, { x: -8, z: 1 }, target);
    expect(r).not.toBeNull();
    // Behind the west wall: first the near corner on the south side (z > 0 is nearer), then round.
    expect(r!.aim.x).toBeCloseTo(-6.5);
    expect(r!.aim.z).toBeCloseTo(4.5);
    expect(r!.distance).toBeGreaterThan(15);
  });

  it('turns with the building', () => {
    const turned = [{ x: 0, z: 0, hw: 5, hd: 3, yaw: Math.PI / 2 }]; // now 6 wide, 10 deep
    const r = aroundAim(turned, { x: 0, z: -9 }, { x: 0, z: 7 });
    expect(r).not.toBeNull();
    expect(Math.abs(r!.aim.x)).toBeCloseTo(4.5);
    expect(Math.abs(r!.aim.z)).toBeCloseTo(6.5);
  });
});

describe('standing at the corner', () => {
  it('points on round it, not back at the corner under Pip (it said "behind you" with Nana in view)', () => {
    const hut = [{ x: 0, z: 0, hw: 5, hd: 3, yaw: 0 }];
    // Just off the north-west corner, with the line to a target on the north side clipping it.
    expect(aroundAim(hut, { x: -5.6, z: 3.1 }, { x: 2, z: 7 })).toBeNull();
  });
});

describe('drifted off the path (critic round 48 walked beside the trail and passed no posts)', () => {
  it('aims further along the further off Pip is, so the walk back meets the path at a slant', () => {
    const straight = [{ path: [[0, 0], [400, 0]] as const }];
    const on = routeAim(straight, { x: 100, z: 0 }, { x: 410, z: 0 });
    expect(on?.aim.x).toBeCloseTo(114);
    const off = routeAim(straight, { x: 100, z: 30 }, { x: 410, z: 0 });
    expect(off?.aim.x).toBeCloseTo(160);
    expect(off?.aim.z).toBeCloseTo(0);
  });
});

describe('no slant among the cliffs (critic round 49 was led into the chimney face)', () => {
  it('aims close along the path past slantUntil', () => {
    const path = [[0, 0], [100, 0], [400, 0]] as const;
    const off = routeAim([{ path, slantUntil: 1 }], { x: 200, z: 30 }, { x: 410, z: 0 });
    expect(off?.aim.x).toBeCloseTo(214);
    const before = routeAim([{ path, slantUntil: 1 }], { x: 20, z: 30 }, { x: 410, z: 0 });
    expect(before?.aim.x).toBeCloseTo(80);
  });
});
