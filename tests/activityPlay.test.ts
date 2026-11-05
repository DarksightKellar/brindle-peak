/**
 * Races and builds as they are now played: authored gate courses and visible, kept pieces.
 *
 * Kept apart from activities.test.ts (already past the file budget). The pure rules (gate passing,
 * settling) are tested directly, then each activity is driven through a fake host the way the
 * session drives it. Throws are in throwPlay.test.ts.
 */

import { describe, expect, it } from 'vitest';
import { createSampler, generateHeightfield } from '../src/core/terrain/heightfield';
import { PEAK, WORLD_RES, WORLD_SEED, WORLD_SIZE, ZONES } from '../src/data/zones';
import { ACTIVITIES } from '../src/data/activities';
import { advanceGates, courseLength } from '../src/game/activities/raceGates';
import { RACE_COURSES, courseFor } from '../src/game/activities/raceCourses';
import { createRaceActivity } from '../src/game/activities/race';
import { BUILD, createBuildActivity, settleAt } from '../src/game/activities/build';
import { BUILD_SITES, finishedBuildMarkers, heapLeft, siteFor, stepsFor } from '../src/game/activities/buildSites';
import { activityOffered } from '../src/game/activities/offered';
import { onAurora } from '../src/game/activities/photoSubjects';
import { createKiteActivity, KITE, KiteActivity, liftAt } from '../src/game/activities/kite';
import { createActivity } from '../src/game/activities/index';
import { SnowmanActivity } from '../src/game/activities/snowman';
import { AURORA } from '../src/game/render/pixelConfig';
import { QUESTS } from '../src/data/quests';
import type { PlacedMarker } from '../src/game/activities/markerLooks';
import { FLAT, def, host, step } from './activityHost';

// ---------------------------------------------------------------------------
// Races
// ---------------------------------------------------------------------------

describe('race gates', () => {
  const gates = [{ x: 0, z: 10 }, { x: 0, z: 20 }, { x: 10, z: 30 }];

  it('counts a gate inside the radius and not outside it', () => {
    expect(advanceGates(0, { x: 3, z: 10 }, gates, 4.5)).toBe(1);
    expect(advanceGates(0, { x: 5, z: 10 }, gates, 4.5)).toBe(0);
  });

  it('counts gates on foot in order, so the counter never jumps; in the air a missed hoop is skipped', () => {
    expect(advanceGates(0, { x: 0, z: 20 }, gates, 4.5)).toBe(0); // the gate after next does nothing
    expect(advanceGates(1, { x: 0, z: 20 }, gates, 4.5)).toBe(2);
    expect(advanceGates(2, { x: 0, z: 10 }, gates, 4.5)).toBe(2); // going back gains and loses nothing
    expect(advanceGates(0, { x: 0, z: 20 }, gates, 4.5, undefined, 3, true)).toBe(2);
  });

  it('every race activity has an authored course, and only the ascent climbs with lanterns', () => {
    for (const a of ACTIVITIES.filter((x) => x.kind === 'race')) {
      expect(RACE_COURSES[a.id], a.id).toBeDefined();
      expect(courseFor(a).gates.length, a.id).toBeGreaterThanOrEqual(5);
      expect(courseLength(a.pos, courseFor(a).gates), a.id).toBeGreaterThan(90);
    }
    expect(RACE_COURSES['ridge-lantern-ascent'].look).toBe('lantern');
  });

  it('courses match their names on the real terrain: up to the top, up the ascent, down the descent', () => {
    const terrain = createSampler(generateHeightfield(WORLD_SEED, WORLD_SIZE, WORLD_RES, ZONES, PEAK), ZONES);
    const rise = (id: string): number => {
      const a = ACTIVITIES.find((x) => x.id === id)!;
      const end = RACE_COURSES[id].gates[RACE_COURSES[id].gates.length - 1];
      return terrain.heightAt(end.x, end.z) - terrain.heightAt(a.pos.x, a.pos.z);
    };
    expect(rise('ridge-chimney-race')).toBeGreaterThan(10);
    expect(rise('ridge-lantern-ascent')).toBeGreaterThan(30);
    expect(rise('peak-thermal-flight')).toBeLessThan(-15);
    // Every gate stands on ground Pip can walk onto.
    for (const course of Object.values(RACE_COURSES)) {
      for (const g of course.gates) expect(terrain.sampleAt(g.x, g.z).slope).toBeLessThan(0.35);
    }
  });
});

describe('race', () => {
  it('finishes on the last gate with the time as the score, showing only the next gate', () => {
    const d = def('race', 'pinewind-deer-run', { x: -244, z: 196 });
    const race = createRaceActivity(d);
    const h = host({ x: d.pos.x, y: 0, z: d.pos.z });
    race.start(h);
    step(race, h);
    // The count, then where the gate is from the view (critic round 17 lost the lantern line).
    expect(race.progress()?.label).toMatch(new RegExp(`^Gate 1 of ${race.gates.length} · \\d+ u (ahead|behind you|on your (left|right))$`));
    const arches = (race.markers() as PlacedMarker[]).filter((m) => m.look === 'arch');
    expect(arches).toHaveLength(1);
    expect(arches[0].strength).toBe(1);

    for (const g of race.gates) {
      h.playerPos = { x: g.x + 2, y: 0, z: g.z };
      for (let i = 0; i < 30; i++) step(race, h);
    }
    expect(race.finished).toBe(true);
    expect(h.awards).toHaveLength(1);
    expect(h.awards[0].score).toBeCloseTo(race.seconds, 6);
  });

  it('standing at the post gains nothing however long you hold forward', () => {
    const d = def('race', 'ridge-chimney-race', { x: 232, z: -206 });
    const race = createRaceActivity(d);
    const h = host({ x: d.pos.x, y: 0, z: d.pos.z });
    race.start(h);
    for (let i = 0; i < 300; i++) step(race, h, { moveZ: 1, sprintHeld: true });
    expect(race.gatesPassed).toBe(0);
    expect(race.isComplete()).toBe(false);
  });

  it('keeps every lantern post up and lights the ones passed', () => {
    const d = def('race', 'ridge-lantern-ascent', { x: 168, z: -140 });
    const race = createRaceActivity(d);
    const h = host({ x: d.pos.x, y: 0, z: d.pos.z });
    race.start(h);
    const first = race.gates[0];
    h.playerPos = { x: first.x, y: 0, z: first.z };
    step(race, h);
    const lamps = (race.markers() as PlacedMarker[]).filter((m) => m.look === 'lamp');
    expect(lamps).toHaveLength(race.gates.length);
    expect(lamps[0].strength).toBe(1);
    expect(lamps[lamps.length - 1].strength).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Builds
// ---------------------------------------------------------------------------

describe('build', () => {
  it('settles a piece from above onto its resting place', () => {
    expect(settleAt(0).drop).toBeCloseTo(BUILD.drop, 6);
    expect(settleAt(BUILD.settle).drop).toBeCloseTo(0, 6);
    expect(settleAt(BUILD.settle).skew).toBe(0);
  });

  it('a log goes on only when pressed square; a crooked press slips off and costs nothing', () => {
    const d = def('build', 'hearth-kindling', { x: -335.5, z: 296.4 });
    const build = createBuildActivity(d);
    const h = host({ x: d.pos.x + 2, y: 0, z: d.pos.z });
    build.start(h);
    step(build, h); // opens crooked
    expect(build.squareNow).toBe(false);
    step(build, h, { interactPressed: true });
    expect(build.placed).toBe(0);
    for (let f = 0; f < 60 && !build.squareNow; f++) step(build, h); // still slipping, then swinging back
    let guard = 0;
    while (!build.squareNow && guard++ < 600) step(build, h);
    step(build, h, { interactPressed: true });
    expect(build.placed).toBe(1);
  });

  it('mashing E never lays a log, at any rate', () => {
    const d = def('build', 'hearth-kindling', { x: -335.5, z: 296.4 });
    for (const every of [1, 3, 6, 12]) {
      const build = createBuildActivity(d);
      const h = host({ x: d.pos.x + 2, y: 0, z: d.pos.z });
      build.start(h);
      for (let f = 0; f < 60 * 12; f++) step(build, h, { interactPressed: f % every === 0 });
      expect(build.placed).toBe(0);
    }
  });

  it('a steady rhythm of presses, not watching the log, does not stack the pile', () => {
    // Critic round 16 laid seven of seven pressing once every 0.7 s: every log came square at the same
    // moment after the last. Now each comes up at a different point in its swing.
    const d = def('build', 'hearth-kindling', { x: -335.5, z: 296.4 });
    for (const every of [36, 42, 48]) {
      const build = createBuildActivity(d);
      const h = host({ x: d.pos.x + 2, y: 0, z: d.pos.z });
      build.start(h);
      let presses = 0;
      for (let f = 1; f < 60 * 60 && build.placed < build.stepCount; f++) {
        const press = f % every === 0;
        if (press) presses++;
        step(build, h, { interactPressed: press });
      }
      expect(presses - build.placed, `every ${every} frames`).toBeGreaterThanOrEqual(3);
    }
  });

  it('the dam sets a stone only while it sways over its gap (critic round 19: five presses, no way to miss)', () => {
    const d = def('build', 'kettles-dam-build', { x: -52, z: 42 });
    const mash = createBuildActivity(d);
    const h = host({ x: d.pos.x + 2, y: 0, z: d.pos.z });
    mash.start(h);
    let presses = 0;
    for (let f = 1; f < 60 * 30 && mash.placed < mash.stepCount; f++) {
      const press = f % 40 === 0;
      if (press) presses++;
      step(mash, h, { interactPressed: press });
    }
    expect(presses - mash.placed).toBeGreaterThanOrEqual(3);

    const watched = createBuildActivity(d);
    watched.start(h);
    step(watched, h);
    for (let f = 0; f < 60 * 60 && !watched.isComplete(); f++) {
      const now = watched.squareNow;
      if (now) expect(watched.progress()?.label).toMatch(/^Over the gap — press E · /);
      step(watched, h, { interactPressed: now });
    }
    expect(watched.isComplete()).toBe(true);
  });

  it('each square press moves a log from the crooked heap onto the crib; the last one lands before it counts', () => {
    const d = def('build', 'hearth-kindling', { x: -335.5, z: 296.4 });
    const build = createBuildActivity(d);
    const h = host({ x: d.pos.x + 2, y: 0, z: d.pos.z });
    build.start(h);
    step(build, h, { interactPressed: true }); // the press that opened it is swallowed
    expect(build.placed).toBe(0);

    const pieces = (): PlacedMarker[] => (build.markers() as PlacedMarker[]).filter((m) => m.look === 'log');
    const site = siteFor(d);
    const steps = stepsFor(site);
    const total = steps.flat().length;
    expect(heapLeft(site, 0)).toHaveLength(total); // before anything: all eight logs, in a heap
    expect(pieces()).toHaveLength(total);
    for (let i = 1; i <= build.stepCount; i++) {
      let guard = 0;
      while (!build.squareNow && guard++ < 600) step(build, h);
      step(build, h, { interactPressed: true });
      expect(build.placed).toBe(i);
      expect(pieces()).toHaveLength(total); // never more logs than there were, never fewer
      expect(heapLeft(site, i).length).toBeLessThan(heapLeft(site, i - 1).length);
      for (let f = 0; f < 4; f++) step(build, h);
    }
    expect(heapLeft(site, build.stepCount)).toHaveLength(0);
    expect(build.isComplete()).toBe(false); // the last log is still falling
    for (let f = 0; f < 30; f++) step(build, h);
    expect(build.isComplete()).toBe(true);
    expect(h.awards).toEqual([{ score: build.stepCount, bonus: 'hearth-kindling' }]);
    // Every piece is a kept piece, so it outlives the activity.
    expect(pieces().every((p) => p.keep === 'hearth-kindling')).toBe(true);
  });

  it('the snowman is rolled: a ball grows only as Pip walks, goes on only once full, then E puts the face on', () => {
    const d = ACTIVITIES.find((a) => a.id === 'hamlet-snowman')!;
    const snow = createActivity(d) as SnowmanActivity;
    expect(snow).toBeInstanceOf(SnowmanActivity);
    const at = siteFor(d).at;
    const h = host({ x: at.x + 3, y: 0, z: at.z });
    snow.start(h);
    expect(snow.freeRoam).toBe(true);
    for (let i = 0; i < 120; i++) step(snow, h, { interactPressed: true }); // standing and pressing does nothing
    expect(snow.placed).toBe(0);
    const walk = (x: number, z: number): void => {
      for (let i = 0; i < 2000; i++) {
        const dx = x - h.playerPos.x, dz = z - h.playerPos.z, len = Math.hypot(dx, dz);
        if (len < 0.05) return;
        const k = Math.min(0.07, len) / len; // about walking pace
        h.playerPos = { x: h.playerPos.x + dx * k, y: 0, z: h.playerPos.z + dz * k };
        step(snow, h);
      }
    };
    for (let ball = 1; ball <= 3; ball++) {
      walk(at.x + 3, at.z + 12); // roll out into the open and grow it
      walk(at.x + 3, at.z);
      walk(at.x, at.z); // push it home
      expect(snow.placed).toBe(ball);
    }
    expect(snow.freeRoam).toBe(false);
    for (let i = 0; i < 10; i++) step(snow, h);
    step(snow, h, { interactPressed: true });
    for (let i = 0; i < 40; i++) step(snow, h);
    expect(snow.isComplete()).toBe(true);
    expect(h.awards).toEqual([{ score: 4, bonus: 'hamlet-snowman' }]);
  });

  it('stands every finished build back up from the save counters, and the untouched woodpile as a heap', () => {
    const counters = { 'activity:hamlet-snowman': 1 };
    const out = finishedBuildMarkers(ACTIVITIES, counters, FLAT);
    const snowman = out.filter((m) => m.keep === 'hamlet-snowman');
    expect(snowman.length).toBeGreaterThan(3);
    expect(out.filter((m) => m.keep === 'hearth-kindling')).toHaveLength(8);
    expect(out.some((m) => m.keep === 'kettles-dam-build')).toBe(false);
    expect(Object.keys(BUILD_SITES).sort()).toEqual(ACTIVITIES.filter((a) => a.kind === 'build').map((a) => a.id).sort());
  });

  it('the aurora photo waits until Edda has asked, when the aurora is in the sky (critic round 18)', () => {
    const d = ACTIVITIES.find((a) => a.id === 'peak-aurora-photo')!;
    const state = host().state;
    expect(activityOffered(d, state)).toBe(false);
    state.quests['the-mast'] = { status: 'active', step: 0 };
    expect(activityOffered(d, state)).toBe(true);
  });

  it('a finished build does not start again, unless a quest step is waiting on it', () => {
    const d = ACTIVITIES.find((a) => a.id === 'hearth-kindling')!;
    const state = host().state;
    expect(activityOffered(d, state)).toBe(true);
    state.counters['activity:hearth-kindling'] = 1;
    expect(activityOffered(d, state)).toBe(false);
    const q = QUESTS.find((x) => x.steps.some((s) => s.when.kind === 'activity' && s.when.id === d.id))!;
    state.quests[q.id] = { status: 'active', step: q.steps.findIndex((s) => s.when.id === d.id) };
    expect(activityOffered(d, state)).toBe(true);
  });

  it('the woodpile post is the woodpile, so the prompt sits over the logs', () => {
    const d = ACTIVITIES.find((a) => a.id === 'hearth-kindling')!;
    const at = siteFor(d).at;
    expect(Math.hypot(at.x - d.pos.x, at.z - d.pos.z)).toBeLessThan(0.5);
  });
});

// ---------------------------------------------------------------------------
// Photo subjects
// ---------------------------------------------------------------------------

describe('aurora framing', () => {
  it('counts the frame as centred wherever a curtain is drawn, and not in the dark between', () => {
    for (const c of AURORA.curtains) expect(onAurora(Math.PI + c.yaw, c.base + c.height * 0.3)).toBe(true);
    expect(onAurora(0, 0.3)).toBe(false); // due south
    expect(onAurora(Math.PI, 1.2)).toBe(false); // straight up past the top
  });
});

// ---------------------------------------------------------------------------
// Kite
// ---------------------------------------------------------------------------

describe('kite', () => {
  const fly = (steer: (k: ReturnType<typeof createKiteActivity>) => number): ReturnType<typeof createKiteActivity> => {
    const kite = createKiteActivity(def('throw', 'ridge-kite', { x: 205, z: -195 }));
    const h = host({ x: 205, y: 0, z: -194 });
    kite.start(h);
    for (let i = 0; i < 60 * 40 && !kite.isComplete(); i++) step(kite, h, { moveX: steer(kite) });
    return kite;
  };

  it('climbs above the crest for a player who keeps it in the rising snow, and finishes', () => {
    const kite = fly((k) => Math.max(-1, Math.min(1, (liftAt(k.seconds) - k.kiteSide) * 8)));
    expect(kite.isComplete()).toBe(true);
    expect(kite.result()?.bonus).toBe('above-crest');
    expect(kite.seconds).toBeLessThan(25);
  });

  it('does not climb on its own, and never crashes', () => {
    const kite = fly(() => 0);
    expect(kite.isComplete()).toBe(false);
    expect(kite.kiteHeight).toBeGreaterThanOrEqual(KITE.floor);
  });

  it('a player who reads the lift half a second late still gets there inside a minute', () => {
    const kite = createKiteActivity(def('throw', 'ridge-kite', { x: 205, z: -195 }));
    const h = host({ x: 205, y: 0, z: -194 });
    kite.start(h);
    for (let i = 0; i < 60 * 60 && !kite.isComplete(); i++) {
      const seen = liftAt(Math.max(0, kite.seconds - 0.5));
      step(kite, h, { moveX: Math.max(-1, Math.min(1, (seen - kite.kiteSide) * 3)) });
    }
    expect(kite.isComplete()).toBe(true);
    expect(kite.seconds).toBeGreaterThan(10);
  });

  it('one tap into the lift is not enough: it has to be flown', () => {
    const kite = fly((k) => (k.seconds < 0.5 ? -1 : 0));
    expect(kite.isComplete()).toBe(false);
  });

  it('plays as a kite, not as the post throw it used to be', () => {
    const a = createActivity(ACTIVITIES.find((x) => x.id === 'ridge-kite')!);
    expect(a).toBeInstanceOf(KiteActivity);
  });
});
