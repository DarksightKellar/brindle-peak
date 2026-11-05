/** The arrow on the snow and the way words the race and the snowman say (activities/pointer.ts). */

import { describe, expect, it } from 'vitest';
import { floorArrowTo, steadyWay } from '../src/game/activities/pointer';
import { keyToward } from '../src/game/activities/activityWords';

describe('the way words', () => {
  // Critic round 28: a gate on the edge between "ahead" and "on your left" flicked every frame.
  it('hold their word near a band edge, and change once clearly past it', () => {
    let way = steadyWay(0.45, null);
    expect(way).toBe('ahead');
    for (const turn of [0.52, 0.47, 0.55, 0.49]) {
      way = steadyWay(turn, way);
      expect(way).toBe('ahead');
    }
    way = steadyWay(0.8, way);
    expect(way).toBe('left');
    expect(steadyWay(0.45, way)).toBe('left');
    expect(steadyWay(-0.8, way)).toBe('right');
    expect(steadyWay(2.5, way)).toBe('behind');
  });
});

// Critic round 31 held D on "hold D to come round" and walked off sideways: a held key walks a straight
// line, so the words name the line nearest the target.
describe('the keys toward a target', () => {
  const deg = (d: number): number => (d * Math.PI) / 180;
  it('names the nearest of the eight lines, left positive', () => {
    expect(keyToward(deg(10))).toBe('W');
    expect(keyToward(deg(40))).toBe('W and A');
    expect(keyToward(deg(-95))).toBe('D');
    expect(keyToward(deg(-130))).toBe('S and D');
    expect(keyToward(deg(175))).toBe('S');
    expect(keyToward(deg(-180))).toBe('S');
  });

  it('never says W for a target it calls off to a side', () => {
    expect(keyToward(deg(20), true)).toBe('W and A');
  });
});

describe('the arrow on the snow', () => {
  const flat = (): number => 10;

  it('lies on the snow out from Pip, nose toward the target', () => {
    const [rim, arrow] = floorArrowTo({ x: 0, y: 10, z: 0 }, { x: 20, z: 0 }, flat, 0);
    expect(rim.look).toBe('arrow-floor-rim');
    expect(arrow.look).toBe('arrow-floor');
    expect(arrow.x).toBeGreaterThan(1.5);
    expect(arrow.y).toBeCloseTo(10);
    expect(arrow.yaw).toBeCloseTo(Math.PI / 2);
  });

  it('hangs level under Pip in the air, and goes once the target is close', () => {
    const [, arrow] = floorArrowTo({ x: 0, y: 40, z: 0 }, { x: 0, z: 20 }, flat, 0);
    expect(arrow.y).toBeGreaterThan(30);
    expect(arrow.pitch).toBe(0);
    expect(floorArrowTo({ x: 0, y: 10, z: 0 }, { x: 2, z: 0 }, flat, 0)).toEqual([]);
  });
});
