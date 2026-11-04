import { describe, expect, it } from 'vitest';
import { resolveCollisions, resolveWithSlip, type Collider } from '../src/core/player/collide';

const PLAYER = 0.42;

describe('collision resolution', () => {
  it('leaves a player standing in the open untouched', () => {
    const p = { x: 0, z: 0 };
    const moved = resolveCollisions(p, PLAYER, [{ kind: 'circle', x: 10, z: 10, r: 1 }]);
    expect(moved).toBe(false);
    expect([p.x, p.z]).toEqual([0, 0]);
  });

  it('pushes a player who is inside a trunk out to exactly touching distance', () => {
    const p = { x: 0.3, z: 0 };
    resolveCollisions(p, PLAYER, [{ kind: 'circle', x: 0, z: 0, r: 0.6 }]);
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(0.6 + PLAYER, 6);
  });

  it('handles a player exactly on a collider centre without producing NaN', () => {
    const p = { x: 0, z: 0 };
    resolveCollisions(p, PLAYER, [{ kind: 'circle', x: 0, z: 0, r: 1 }]);
    expect(Number.isFinite(p.x) && Number.isFinite(p.z)).toBe(true);
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(1 + PLAYER, 6);
  });

  it('resolves the second of two overlapping trees too', () => {
    const p = { x: 0.2, z: 0.1 };
    const colliders: Collider[] = [
      { kind: 'circle', x: 0, z: 0, r: 0.6 },
      { kind: 'circle', x: 0.9, z: 0, r: 0.6 },
    ];
    resolveCollisions(p, PLAYER, colliders);
    for (const c of colliders) {
      if (c.kind !== 'circle') continue;
      expect(Math.hypot(p.x - c.x, p.z - c.z)).toBeGreaterThanOrEqual(c.r + PLAYER - 1e-6);
    }
  });

  it('stops a player crossing a fence segment', () => {
    // A fence lying along X at z = 0, approached from z = -0.8.
    const fence: Collider = { kind: 'segment', ax: -5, az: 0, bx: 5, bz: 0, r: 0.25 };
    const p = { x: 0, z: -0.3 };
    resolveCollisions(p, PLAYER, [fence]);
    expect(Math.abs(p.z)).toBeCloseTo(0.25 + PLAYER, 6);
    expect(Math.abs(p.x)).toBeLessThan(1e-9); // pushed sideways, not along the fence
  });

  it('does not push a player standing well clear of a fence', () => {
    const fence: Collider = { kind: 'segment', ax: -5, az: 0, bx: 5, bz: 0, r: 0.25 };
    const p = { x: 0, z: -3 };
    expect(resolveCollisions(p, PLAYER, [fence])).toBe(false);
  });

  it('pushes a player out of a building box through the nearest wall', () => {
    // A 6 x 4 hut, unrotated, centred at the origin. Player just inside the east wall.
    const hut: Collider = { kind: 'box', x: 0, z: 0, hw: 3, hd: 2, yaw: 0 };
    const p = { x: 2.6, z: 0.2 };
    resolveCollisions(p, PLAYER, [hut]);
    expect(p.x).toBeCloseTo(3 + PLAYER, 6); // out the near (east) face, not the far one
  });

  it('pushes out through the west face when that is the nearer one', () => {
    // A solver that always pushed in +X would pass the east-face test and trap anyone on the other side.
    const hut: Collider = { kind: 'box', x: 0, z: 0, hw: 3, hd: 2, yaw: 0 };
    const p = { x: -2.7, z: -0.3 };
    resolveCollisions(p, PLAYER, [hut]);
    expect(p.x).toBeCloseTo(-3 - PLAYER, 6);
  });

  it('respects box rotation', () => {
    // Same box rotated 90 degrees: now it is 4 wide and 6 deep, so the east face sits at x = 2.
    const hut: Collider = { kind: 'box', x: 0, z: 0, hw: 3, hd: 2, yaw: Math.PI / 2 };
    const p = { x: 1.9, z: 0 };
    resolveCollisions(p, PLAYER, [hut]);
    expect(p.x).toBeCloseTo(2 + PLAYER, 6);
  });

  it('is idempotent: resolving twice changes nothing the second time', () => {
    const colliders: Collider[] = [
      { kind: 'circle', x: 0, z: 0, r: 0.6 },
      { kind: 'box', x: 3, z: 0, hw: 1, hd: 1, yaw: 0.3 },
    ];
    const p = { x: -0.2, z: 0.1 };
    resolveCollisions(p, PLAYER, colliders);
    const settled = { x: p.x, z: p.z };
    const movedAgain = resolveCollisions(p, PLAYER, colliders);
    expect(movedAgain).toBe(false);
    expect(p.x).toBeCloseTo(settled.x, 9);
    expect(p.z).toBeCloseTo(settled.z, 9);
  });

  it('settles a corner between two walls without oscillating to infinity', () => {
    // Inside a corner formed by two boxes; both push, and three passes must land outside both.
    const a: Collider = { kind: 'box', x: -1.2, z: 0, hw: 1, hd: 4, yaw: 0 };
    const b: Collider = { kind: 'box', x: 0, z: -1.2, hw: 4, hd: 1, yaw: 0 };
    const p = { x: -0.1, z: -0.1 };
    resolveCollisions(p, PLAYER, [a, b], 6);
    const inside = (c: Collider): boolean => {
      if (c.kind !== 'box') return false;
      return Math.abs(p.x - c.x) < c.hw + PLAYER - 1e-6 &&
             Math.abs(p.z - c.z) < c.hd + PLAYER - 1e-6;
    };
    expect(inside(a) && inside(b)).toBe(false);
    expect(Number.isFinite(p.x) && Number.isFinite(p.z)).toBe(true);
  });
});

describe('flying over low obstacles', () => {
  /*
   * Reported from play: "I can't fly over fences, it just clips me back in front of the fence". The
   * resolver was a pure ground-plane projection with no height in it, so a fence stopped the bird 5
   * units up exactly as it stopped it on the ground — and applySolidWorld then snapped Y to the terrain
   * on any hit, which is what made it feel like being yanked back and dropped.
   */
  const fence = { kind: 'segment' as const, ax: 0, az: 0, bx: 4, bz: 0, r: 0.22, top: 1.15 };

  it('does not push a bird that is above the fence rail', () => {
    const p = { x: 2, z: 0.1 };
    const moved = resolveCollisions(p, PLAYER, [fence], 1.6);
    expect(moved).toBe(false);
    expect([p.x, p.z]).toEqual([2, 0.1]);
  });

  it('still stops a bird at fence height', () => {
    const p = { x: 2, z: 0.1 };
    const moved = resolveCollisions(p, PLAYER, [fence], 0.4);
    expect(moved).toBe(true);
    expect(Math.abs(p.z)).toBeGreaterThan(0.22);
  });

  it('treats a collider with no top as unbounded, so trunks and buildings still stop a bird', () => {
    const p = { x: 0.1, z: 0 };
    const moved = resolveCollisions(p, PLAYER, [{ kind: 'circle', x: 0, z: 0, r: 0.6 }], 30);
    expect(moved).toBe(true);
  });
});

describe('slipping round small props (critic round 11)', () => {
  /** Walk straight along +z for `frames` steps of `step` units; return where the body ends. */
  const walk = (colliders: Collider[], frames = 120, step = 0.08): { x: number; z: number } => {
    const p = { x: 0, z: -3 };
    const slip = { side: 1, frames: 0 };
    for (let i = 0; i < frames; i++) {
      const from = { x: p.x, z: p.z };
      p.z += step;
      resolveWithSlip(from, p, PLAYER, colliders, -Infinity, slip);
    }
    return p;
  };

  it('gets past a sign post walked into dead centre', () => {
    expect(walk([{ kind: 'circle', x: 0, z: 0, r: 0.39 }]).z).toBeGreaterThan(1);
  });

  it('gets out of the notch between two rocks side by side', () => {
    const rocks: Collider[] = [
      { kind: 'circle', x: -0.48, z: 0, r: 0.39 },
      { kind: 'circle', x: 0.48, z: 0, r: 0.39 },
    ];
    expect(walk(rocks).z).toBeGreaterThan(1);
  });

  it('still stops at a wall walked into head-on', () => {
    const p = walk([{ kind: 'box', x: 0, z: 0, hw: 4, hd: 0.5, yaw: 0 }]);
    expect(Math.abs(p.x)).toBeLessThan(0.01);
    expect(p.z).toBeLessThan(-0.5);
  });
});
