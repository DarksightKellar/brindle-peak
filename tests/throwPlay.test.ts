/**
 * Throws as they are now played: an aim turned with A / D, a projectile that hits or misses the
 * real target, and a round that always ends and always counts.
 */

import { describe, expect, it } from 'vitest';
import type { ActivityDef, ActivityResult } from '../src/core/contracts';
import { createTargetActivity, THROW } from '../src/game/activities/targets';
import { FLIGHT, launch, stepShot, turnAim, type Strikeable } from '../src/game/activities/throwFlight';
import { FRAME, def, host, step } from './activityHost';

// ---------------------------------------------------------------------------
// Throws
// ---------------------------------------------------------------------------

describe('throw flight', () => {
  const target: Strikeable = { pos: { x: 0, y: 1, z: 12 }, radius: 0.75, half: 1.1 };
  const fly = (yaw: number): number => {
    const shot = launch({ x: 0, y: 0, z: 0 }, yaw, [target], () => 0);
    for (let i = 0; i < 300 && !shot.done; i++) {
      const hit = stepShot(shot, FRAME, [target], () => 0);
      if (hit >= 0) return hit;
    }
    return -1;
  };

  it('a throw lined up on a target strikes it; one a target-width off lands in the snow', () => {
    expect(fly(0)).toBe(0);
    expect(fly(0.2)).toBe(-1);
  });

  it('D turns the aim right, A left, and a resting stick leaves it alone', () => {
    expect(turnAim(0, 1, 1)).toBeCloseTo(-FLIGHT.turn, 6);
    expect(turnAim(0, -1, 1)).toBeCloseTo(FLIGHT.turn, 6);
    expect(turnAim(0.5, 0.05, 1)).toBe(0.5);
  });
});

describe('throw', () => {
  /** Hold the aim on the nearest standing target and throw whenever allowed. */
  function play(d: ActivityDef, aimAt: boolean): { hits: number; awards: ActivityResult[]; frames: number } {
    const game = createTargetActivity(d);
    const h = host({ x: d.pos.x, y: 0, z: d.pos.z });
    game.start(h);
    step(game, h);
    let frames = 0;
    while (!game.isComplete() && frames++ < 3000) {
      const t = game.hitVolumes.find((v) => v !== null);
      let moveX = 0;
      if (aimAt && t) {
        const want = Math.atan2(t.pos.x - h.playerPos.x, t.pos.z - h.playerPos.z);
        const err = Math.atan2(Math.sin(want - game.aimYaw), Math.cos(want - game.aimYaw));
        moveX = Math.abs(err) < 0.01 ? 0 : -Math.sign(err) * Math.min(1, Math.abs(err) * 20);
      } else if (!aimAt) {
        moveX = frames < 120 ? 1 : 0; // turn well away first
      }
      step(game, h, { moveX, interactPressed: frames % 30 === 0 && frames > 125 });
    }
    return { hits: game.hitCount, awards: h.awards, frames };
  }

  it('the pinecone toss ends on three hits and pays once', () => {
    const r = play(def('throw', 'pinewind-pinecone-throw', { x: -206, z: 160 }), true);
    expect(r.hits).toBe(3);
    expect(r.awards).toHaveLength(1);
    expect(r.awards[0]).toMatchObject({ score: 3, bonus: 'clean-sweep' });
  });

  it('a round of misses still ends and still counts, with no hits claimed', () => {
    const r = play(def('throw', 'pinewind-pinecone-throw', { x: -206, z: 160 }), false);
    expect(r.hits).toBe(0);
    expect(r.awards).toEqual([{ score: 0 }]);
  });

  it('ringing the bell cleanly means a snowball that strikes the bell', () => {
    const r = play(def('throw', 'hamlet-bell-throw', { x: 274, z: 128 }), true);
    // A second snowball already in the air when the first rings it may ring it again; both count.
    expect(r.hits).toBeGreaterThanOrEqual(1);
    expect(r.awards).toHaveLength(1);
    expect(r.awards[0]).toMatchObject({ score: r.hits, bonus: 'clean' });
  });

  it('reports hits and throws left, and waits for the hit to be seen before closing', () => {
    const game = createTargetActivity(def('throw', 'hamlet-bell-throw', { x: 274, z: 128 }));
    const h = host({ x: 274, y: 0, z: 128 });
    game.start(h);
    expect(game.progress()?.label).toBe('Hits 0 / 1 · 8 left');
    step(game, h);
    // The aim opens off the bell: line it up with A / D first.
    const bell = game.hitVolumes[0]!;
    const want = Math.atan2(bell.pos.x - 274, bell.pos.z - 128);
    const err = (): number => Math.atan2(Math.sin(want - game.aimYaw), Math.cos(want - game.aimYaw));
    expect(Math.abs(err())).toBeGreaterThan(0.2);
    for (let i = 0; i < 400 && Math.abs(err()) > 0.01; i++) step(game, h, { moveX: -Math.sign(err()) * Math.min(1, Math.abs(err()) * 20) });
    step(game, h, { interactPressed: true });
    expect(game.inFlight).toBe(1);
    let f = 0;
    while (game.inFlight > 0 && f++ < 200) step(game, h);
    expect(game.hitCount).toBe(1);
    expect(game.isComplete()).toBe(false);
    for (let i = 0; i < Math.ceil(THROW.linger / FRAME) + 1; i++) step(game, h);
    expect(game.isComplete()).toBe(true);
  });
});
