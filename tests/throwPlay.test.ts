/**
 * Throws as they are now played: an aim turned with A / D, a projectile that hits or misses the
 * real target, and a round that always ends and always counts.
 */

import { describe, expect, it } from 'vitest';
import type { ActivityDef, ActivityResult } from '../src/core/contracts';
import { createTargetActivity, THROW, type TargetActivity } from '../src/game/activities/targets';
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

/**
 * Hold F and let go the moment the arc turns bold, as a player watching it would, steering as it swings;
 * or `late` frames after it, as a player reacting to the cue does.
 */
function throwOnArc(game: TargetActivity, h: ReturnType<typeof host>, steer: () => number = () => 0, late = 0): boolean {
  step(game, h, { interactPressed: true, interactHeld: true });
  for (let f = 0; f < 240 && !game.letGoHits; f++) step(game, h, { interactHeld: true, moveX: steer() });
  const bold = game.letGoHits;
  for (let f = 0; f < late; f++) step(game, h, { interactHeld: true, moveX: steer() });
  step(game, h);
  return bold;
}

/** Hold F for `frames` and let go, whatever the arc says. */
function throwHeld(game: TargetActivity, h: ReturnType<typeof host>, frames: number): void {
  step(game, h, { interactPressed: true, interactHeld: true });
  for (let f = 1; f < frames; f++) step(game, h, { interactHeld: true });
  step(game, h);
}

describe('throw', () => {
  /** Hold the aim on the nearest standing target and throw whenever allowed. */
  function play(d: ActivityDef, aimAt: boolean, late = 0): { hits: number; awards: ActivityResult[]; frames: number } {
    const game = createTargetActivity(d);
    const h = host({ x: d.pos.x, y: 0, z: d.pos.z });
    game.start(h);
    step(game, h);
    let frames = 0;
    const steer = (): number => {
      const t = game.hitVolumes.find((v) => v !== null);
      if (!aimAt) return frames < 120 ? 1 : 0; // turn well away first
      if (!t) return 0;
      // At the bell, into the wind (round 26): where the cue says, not straight at it.
      const want = game.ringAim ?? Math.atan2(t.pos.x - h.playerPos.x, t.pos.z - h.playerPos.z);
      const err = Math.atan2(Math.sin(want - game.aimYaw), Math.cos(want - game.aimYaw));
      return Math.abs(err) < 0.01 ? 0 : -Math.sign(err) * Math.min(1, Math.abs(err) * 20);
    };
    while (!game.isComplete() && frames++ < 3000) {
      if (frames % 30 === 0 && frames > 125 && game.inFlight === 0) {
        if (aimAt) throwOnArc(game, h, steer, late);
        else throwHeld(game, h, 27);
      } else step(game, h, { moveX: steer() });
    }
    return { hits: game.hitCount, awards: h.awards, frames };
  }

  it('F pressed and held while a throw is in the air starts the next draw when it lands (critic round 96)', () => {
    const d = def('throw', 'pinewind-pinecone-throw', { x: -206, z: 160 });
    const game = createTargetActivity(d);
    const h = host({ x: d.pos.x, y: 0, z: d.pos.z });
    game.start(h);
    step(game, h);
    throwHeld(game, h, 27);
    expect(game.inFlight).toBe(1);
    step(game, h, { interactPressed: true, interactHeld: true });
    expect(game.drawing).toBe(false);
    let f = 0;
    while (!game.drawing && f++ < 300) step(game, h, { interactHeld: true });
    expect(game.drawing).toBe(true);
    expect(game.inFlight).toBe(0);
  });

  it('a press let go while a throw is in the air is not kept', () => {
    const d = def('throw', 'pinewind-pinecone-throw', { x: -206, z: 160 });
    const game = createTargetActivity(d);
    const h = host({ x: d.pos.x, y: 0, z: d.pos.z });
    game.start(h);
    step(game, h);
    throwHeld(game, h, 27);
    step(game, h, { interactPressed: true, interactHeld: true });
    for (let f = 0; f < 300; f++) step(game, h);
    expect(game.drawing).toBe(false);
  });

  it('the pinecone toss ends on three hits and pays once', () => {
    const r = play(def('throw', 'pinewind-pinecone-throw', { x: -206, z: 160 }), true);
    expect(r.hits).toBe(3);
    expect(r.awards).toHaveLength(1);
    expect(r.awards[0]).toMatchObject({ score: 3, bonus: 'clean-sweep' });
  });

  it('drawing on each snowman, the words stay on letting go and "Let go!" lights for every one (critic round 38)', () => {
    const d = def('throw', 'pinewind-pinecone-throw', { x: -206, z: 160 });
    const lit: boolean[] = [];
    for (let target = 0; target < 3; target++) {
      const game = createTargetActivity(d);
      const h = host({ x: d.pos.x, y: 0, z: d.pos.z });
      game.start(h);
      step(game, h);
      const err = (): number => {
        const t = game.hitVolumes[target]!;
        const want = Math.atan2(t.pos.x - h.playerPos.x, t.pos.z - h.playerPos.z);
        return Math.atan2(Math.sin(want - game.aimYaw), Math.cos(want - game.aimYaw));
      };
      // Turn onto it until the words say lined up, as a player does.
      for (let i = 0; i < 600 && !/Lined up/.test(game.progress()?.label ?? ''); i++) {
        step(game, h, { moveX: -Math.sign(err()) * Math.min(1, Math.abs(err()) * 20) });
      }
      step(game, h, { interactPressed: true, interactHeld: true });
      let saw = false;
      for (let f = 0; f < Math.ceil(THROW.drawPeriod / FRAME); f++) {
        const label = game.progress()?.label ?? '';
        expect(label, `snowman ${target}, frame ${f}`).not.toMatch(/Aim (left|right)/);
        if (/Let go!/.test(label)) saw = true;
        step(game, h, { interactHeld: true });
      }
      lit.push(saw);
    }
    expect(lit).toEqual([true, true, true]);
  });

  it('a player letting go a reaction after "Let go!" still hits (critic round 35)', () => {
    // 14 frames is about a quarter of a second, a player's reaction to a word lighting up.
    const r = play(def('throw', 'pinewind-pinecone-throw', { x: -206, z: 160 }), true, 14);
    expect(r.hits).toBe(3);
  });

  it('a throw let go while the arc is bold hits, with no steering during the draw (rounds 8, 20)', () => {
    const d = def('throw', 'pinewind-pinecone-throw', { x: -206, z: 160 });
    const game = createTargetActivity(d);
    const h = host({ x: d.pos.x, y: 0, z: d.pos.z });
    game.start(h);
    step(game, h);
    // Lined up is the full ring; a fainter one marks the snowman the aim words turn toward (round 95).
    const ringed = (): boolean => game.markers().some((m) => (m as { look?: string; strength?: number }).look === 'halo' && (m as { strength?: number }).strength === 1);
    let thrown = 0;
    let dir = 1;
    for (let f = 0; f < 6000 && !game.isComplete() && thrown < 3; f++) {
      if (f % 160 === 0) dir = -dir;
      if (!ringed()) {
        step(game, h, { moveX: dir });
        continue;
      }
      const before = game.hitCount;
      // No steering while drawing: the aim keeps on the snowman it was lined up on as it swings, so
      // the arc always comes round to bold (critic round 20 was called wide on the swing).
      expect(throwOnArc(game, h)).toBe(true);
      thrown++;
      for (let k = 0; k < 90 && game.inFlight > 0; k++) step(game, h);
      expect(game.hitCount).toBe(before + 1);
    }
    expect(thrown).toBeGreaterThan(0);
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

  it('says which side a miss went wide on', () => {
    for (const way of ['left', 'right'] as const) {
      const game = createTargetActivity(def('throw', 'hamlet-bell-throw', { x: 274, z: 128 }));
      const h = host({ x: 274, y: 0, z: 128 });
      game.start(h);
      step(game, h);
      const bell = game.hitVolumes[0]!;
      // A raises the aim yaw (turns left), so "left of the bell" is the bell's bearing plus a little.
      const want = (game.ringAim ?? Math.atan2(bell.pos.x - 274, bell.pos.z - 128)) + (way === 'left' ? 0.25 : -0.25);
      const err = (): number => Math.atan2(Math.sin(want - game.aimYaw), Math.cos(want - game.aimYaw));
      for (let i = 0; i < 400 && Math.abs(err()) > 0.01; i++) step(game, h, { moveX: -Math.sign(err()) * Math.min(1, Math.abs(err()) * 20) });
      // A quarter of the swell is the strength that arrives: only the aim is off.
      throwHeld(game, h, Math.round(THROW.drawPeriod / 4 / FRAME));
      let f = 0;
      while (game.inFlight > 0 && f++ < 300) step(game, h);
      expect(game.hitCount).toBe(0);
      expect(game.progress()?.label).toMatch(new RegExp(`^Missed, wide ${way}\. Aim a touch more ${way === 'left' ? 'right' : 'left'} · `));
    }
  });

  it('on the line, a throw let go too soon falls short and one at the top of the swell sails over (round 19)', () => {
    // Let go two frames in, the swell was still growing: too soon. Let go at the top, it was too much.
    for (const [frames, said] of [[2, 'Fell short: the arc was still growing. Let go later'], [Math.round(THROW.drawPeriod / 2 / FRAME) - 2, 'Sailed over: the arc grew past it. Let go sooner']] as const) {
      const game = createTargetActivity(def('throw', 'hamlet-bell-throw', { x: 274, z: 128 }));
      const h = host({ x: 274, y: 0, z: 128 });
      game.start(h);
      step(game, h);
      const bell = game.hitVolumes[0]!;
      const want = game.ringAim ?? Math.atan2(bell.pos.x - 274, bell.pos.z - 128);
      const err = (): number => Math.atan2(Math.sin(want - game.aimYaw), Math.cos(want - game.aimYaw));
      for (let i = 0; i < 400 && Math.abs(err()) > 0.01; i++) step(game, h, { moveX: -Math.sign(err()) * Math.min(1, Math.abs(err()) * 20) });
      throwHeld(game, h, frames);
      let f = 0;
      while (game.inFlight > 0 && f++ < 300) step(game, h);
      expect(game.hitCount).toBe(0);
      expect(game.progress()?.label).toMatch(new RegExp(`^${said} · `));
    }
  });

  it('the bell has a crosswind: straight at it, a strong gust carries the snowball past (round 26)', () => {
    // Critic round 25 played the bell as the toss again. Now the wind across the square is the skill.
    const game = createTargetActivity(def('throw', 'hamlet-bell-throw', { x: 274, z: 128 }));
    const h = host({ x: 274, y: 0, z: 128 });
    game.start(h);
    step(game, h);
    const bell = game.hitVolumes[0]!;
    const straight = Math.atan2(bell.pos.x - 274, bell.pos.z - 128);
    expect(Math.abs(Math.atan2(Math.sin(game.ringAim! - straight), Math.cos(game.ringAim! - straight)))).toBeGreaterThan(0.05);
    const err = (): number => Math.atan2(Math.sin(straight - game.aimYaw), Math.cos(straight - game.aimYaw));
    for (let i = 0; i < 400 && Math.abs(err()) > 0.01; i++) step(game, h, { moveX: -Math.sign(err()) * Math.min(1, Math.abs(err()) * 20) });
    throwHeld(game, h, Math.round(THROW.drawPeriod / 4 / FRAME));
    let f = 0;
    while (game.inFlight > 0 && f++ < 300) step(game, h);
    expect(game.hitCount).toBe(0);
    expect(game.progress()?.label).toMatch(/^Missed, wide left\. Aim a touch more right · Wind from the /);
  });

  it('reports hits and throws left, and waits for the hit to be seen before closing', () => {
    const game = createTargetActivity(def('throw', 'hamlet-bell-throw', { x: 274, z: 128 }));
    const h = host({ x: 274, y: 0, z: 128 });
    game.start(h);
    step(game, h);
    // The aim opens off the bell: line it up with A / D first, the way the cue says.
    // The first gust blows hard to the left (BELL_WIND): the cue turns toward the aim that rings it then.
    const want = game.ringAim!;
    const err = (): number => Math.atan2(Math.sin(want - game.aimYaw), Math.cos(want - game.aimYaw));
    const gust = 'Wind from the right, strong · ';
    expect(Math.abs(err())).toBeGreaterThan(0.1);
    expect(game.progress()?.label).toBe(`${gust}${err() > 0 ? 'Aim left' : 'Aim right'} · Hits 0 / 1 · 8 left`);
    for (let i = 0; i < 400 && Math.abs(err()) > 0.01; i++) step(game, h, { moveX: -Math.sign(err()) * Math.min(1, Math.abs(err()) * 20) });
    expect(game.progress()).toMatchObject({ label: `${gust}Lined up: hold F · Hits 0 / 1 · 8 left`, urgent: true });
    step(game, h, { interactPressed: true, interactHeld: true });
    expect(game.progress()?.label).toBe(`${gust}Let go as the arc reaches it · Hits 0 / 1 · 8 left`);
    for (let i = 0; i < 240 && !game.letGoHits; i++) step(game, h, { interactHeld: true });
    expect(game.progress()).toMatchObject({ label: `${gust}Let go! · Hits 0 / 1 · 8 left`, urgent: true });
    step(game, h);
    expect(game.inFlight).toBe(1);
    let f = 0;
    while (game.inFlight > 0 && f++ < 200) step(game, h);
    expect(game.hitCount).toBe(1);
    expect(game.isComplete()).toBe(false);
    for (let i = 0; i < Math.ceil(THROW.linger / FRAME) + 1; i++) step(game, h);
    expect(game.isComplete()).toBe(true);
  });
});
