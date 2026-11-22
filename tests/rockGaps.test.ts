import { describe, expect, it } from 'vitest';
import { resolveWithSlip } from '../src/core/player/collide';
import type { Collider, Slip } from '../src/core/player/collide';
import { closeNarrowGaps } from '../src/game/world/colliders';

type Circle = Extract<Collider, { kind: 'circle' }>;
const circle = (x: number, z: number, r: number): Circle => ({ kind: 'circle', x, z, r });

// The two boulders below the mast the long-walk review's loose walk stood wedged between (2026-11-22).
const POCKET: Circle[] = [
  circle(313.555, -316.949, 0.74), circle(314.782, -314.205, 1.574), circle(312.479, -317.558, 1.657),
  circle(315.073, -312.903, 0.918), circle(311.146, -318.024, 0.963),
];

/** Holds a walk at the pocket the way that walk came, and says how far past it Pip got. */
function walk(colliders: readonly Collider[]): number {
  const dir = { x: 0.82, z: -0.57 };
  const p = { x: 300.2, z: -306.3 };
  const slip: Slip = { side: 1, frames: 0 };
  for (let i = 0; i < 60 * 8; i++) {
    const from = { ...p };
    p.x += dir.x * 6.5 / 60;
    p.z += dir.z * 6.5 / 60;
    resolveWithSlip(from, p, 0.42, colliders, -Infinity, slip);
  }
  return (p.x - 300.2) * dir.x + (p.z + 306.3) * dir.z;
}

describe('gaps between rocks', () => {
  it('closes a gap too narrow to walk through, and leaves a wide one open', () => {
    const a = circle(0, 0, 1);
    expect(closeNarrowGaps([a, circle(2.87, 0, 1)])).toHaveLength(1);
    expect(closeNarrowGaps([a, circle(4, 0, 1)])).toHaveLength(0);
    expect(closeNarrowGaps([a, circle(1.5, 0, 1)])).toHaveLength(0); // overlapping: one rock already
  });

  it('a walk into the boulders below the mast gets round them instead of standing wedged', () => {
    expect(walk(POCKET)).toBeLessThan(20); // the trap, as the walk found it
    expect(walk([...POCKET, ...closeNarrowGaps(POCKET)])).toBeGreaterThan(30);
  });
});
