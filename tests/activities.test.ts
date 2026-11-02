import { describe, expect, it } from 'vitest';
import { angleDelta, createGameState, emptyInput, makeRng } from '../src/core/contracts';
import type {
  ActivityDef,
  ActivityInstance,
  ActivityKind,
  ActivityResult,
  FishDef,
  GameEventName,
  GameEventPayloads,
  GameState,
  InputFrame,
  TerrainSampler,
  Vec3,
} from '../src/core/contracts';
import { createActivity } from '../src/game/activities/index';
import { EXPOSURE } from '../src/game/activities/exposure';
import { FISH } from '../src/data/fish';
import {
  FISHING,
  createFishingActivity,
  pickFish,
  resolveCatch,
  tensionAt,
} from '../src/game/activities/fishing';
import {
  bearingTo,
  composition,
  createPhotoActivity,
  facingDot,
  inFrame,
} from '../src/game/activities/photo';
import { createSledActivity, DEFAULT_COURSE, sledStep } from '../src/game/activities/sled';
import { createSkateActivity, newBalance, SKATE, skateStep } from '../src/game/activities/skate';
import { createTargetActivity, targetAngle, THROW } from '../src/game/activities/targets';
import { createBuildActivity, partStations } from '../src/game/activities/build';
import { createRaceActivity, forwardDrive } from '../src/game/activities/race';

// ---------------------------------------------------------------------------
// Fake world. Everything below the `ActivityHost` line is deliberately dumb: flat terrain,
// a mutable input frame, an event log and an award log. No three, no DOM, no timers.
// ---------------------------------------------------------------------------

interface RecordedEvent {
  name: GameEventName;
  data: GameEventPayloads[GameEventName];
}

type FakeHost = {
  state: Readonly<GameState>;
  terrain: TerrainSampler;
  playerPos: Vec3;
  input: InputFrame;
  cameraYaw: number;
  events: RecordedEvent[];
  awards: ActivityResult[];
  emit<K extends GameEventName>(name: K, data: GameEventPayloads[K]): void;
  award(result: ActivityResult): void;
};

const FLAT: TerrainSampler = {
  size: 1024,
  heightAt: () => 0,
  normalAt: () => ({ x: 0, y: 1, z: 0 }),
  sampleAt: () => ({ height: 0, slope: 0, surface: 'snow', zone: 'hearth' }),
};

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) deepFreeze(record[key]);
    Object.freeze(value);
  }
  return value;
}

function makeHost(
  options: {
    state?: GameState;
    terrain?: TerrainSampler;
    playerPos?: Vec3;
    camYaw?: number;
  } = {},
): FakeHost {
  const events: RecordedEvent[] = [];
  const awards: ActivityResult[] = [];
  return {
    state: options.state ?? deepFreeze(createGameState({ x: 0, y: 0, z: 0 }, 8)),
    terrain: options.terrain ?? FLAT,
    playerPos: options.playerPos ?? { x: 0, y: 0, z: 0 },
    input: emptyInput(options.camYaw ?? 0),
    cameraYaw: options.camYaw ?? 0,
    events,
    awards,
    emit(name, data) {
      events.push({ name, data });
    },
    award(result) {
      awards.push(result);
    },
  };
}

const KINDS: readonly ActivityKind[] = ['fish', 'photo', 'sled', 'skate', 'throw', 'build', 'race'];

function defOf(kind: ActivityKind, overrides: Partial<ActivityDef> = {}): ActivityDef {
  return {
    id: `test-${kind}`,
    name: kind,
    kind,
    zone: 'hearth',
    pos: { x: 12, z: -8 },
    radius: 3,
    prompt: 'Play',
    ...overrides,
  };
}

const FRAME = 1 / 60;

/** Drive one frame. Passing `camYaw` moves the camera as well as the input frame. */
function step(
  activity: ActivityInstance,
  host: FakeHost,
  over: Partial<InputFrame> = {},
  dt = FRAME,
): void {
  host.input = { ...emptyInput(host.cameraYaw), ...over };
  if (over.camYaw !== undefined) host.cameraYaw = over.camYaw;
  activity.update(dt, host);
}

/** Start, then burn the activation press so tests press deliberately. */
function begin(activity: ActivityInstance, host: FakeHost): void {
  activity.start(host);
  step(activity, host);
}

// ---------------------------------------------------------------------------
// 1. Factory
// ---------------------------------------------------------------------------

describe('activity factory', () => {
  it('creates a fresh instance for every activity kind', () => {
    for (const kind of KINDS) {
      const def = defOf(kind);
      const activity = createActivity(def);
      expect(activity.def, kind).toBe(def);
      expect(activity.isComplete(), kind).toBe(false);
      expect(activity.result(), kind).toBeNull();
    }
  });

  it('the fake host is a usable ActivityHost', () => {
    const host = makeHost();
    host.emit('toast', { text: 'hi', icon: 'bell', tier: 'pickup' });
    host.award({ score: 3 });
    expect(host.events).toHaveLength(1);
    expect(host.awards).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 2. Fishing
// ---------------------------------------------------------------------------

describe('fishing', () => {
  it('accepts a press inside the strike window and rejects early or late', () => {
    expect(resolveCatch(2, 2, FISHING.window)).toBe(true);
    expect(resolveCatch(2, 2 + FISHING.window / 2, FISHING.window)).toBe(true);
    expect(resolveCatch(2, 2 + FISHING.window, FISHING.window)).toBe(true);
    expect(resolveCatch(2, 2 + FISHING.window + 0.01, FISHING.window)).toBe(false);
    expect(resolveCatch(2, 1.9, FISHING.window)).toBe(false);
  });

  it('has a readable tempo that peaks in the middle of the swing', () => {
    expect(tensionAt(0)).toBe(0);
    expect(tensionAt(FISHING.basePeriod / 2)).toBeCloseTo(1, 6);
    expect(tensionAt(FISHING.basePeriod * 0.25)).toBeCloseTo(0.5, 6);
    expect(tensionAt(FISHING.basePeriod)).toBeCloseTo(0, 6);
  });

  it('picks the same fish for the same rng seed', () => {
    const a = pickFish(makeRng(1234), FISH);
    const b = pickFish(makeRng(1234), FISH);
    expect(a.id).toBe(b.id);
    expect(FISH.map((f) => f.id)).toContain(a.id);
  });

  it('completes once with a fish, an event and an award', () => {
    const fish = createFishingActivity(defOf('fish'));
    const host = makeHost();
    begin(fish, host);

    expect(fish.castsMade).toBe(1);
    expect(fish.strikeAt).toBeGreaterThan(fish.elapsed);

    let guard = 0;
    const target = fish.strikeAt + FISHING.window / 2;
    while (fish.elapsed < target && guard++ < 600) step(fish, host);

    step(fish, host, { interactPressed: true });

    expect(fish.isComplete()).toBe(true);
    expect(host.events.map((e) => e.name)).toEqual(['fish:caught']);
    expect(host.awards).toHaveLength(1);
    expect(fish.lastCatch).not.toBeNull();
    expect(host.awards[0].score).toBe(fish.lastCatch?.value);
    expect(host.awards[0].bonus).toBe(fish.lastCatch?.id);
    expect(fish.result()).toEqual(host.awards[0]);

    // A second press on the finished activity changes nothing.
    step(fish, host, { interactPressed: true });
    expect(host.events).toHaveLength(1);
    expect(host.awards).toHaveLength(1);
  });

  it('uses the injected fish table rather than the fallback', () => {
    const table: readonly FishDef[] = [
      { id: 'test-fish', name: 'Test Fish', rarity: 'common', value: 9, body: '#ffffff', accent: '#000000' },
    ];
    const fish = createFishingActivity(defOf('fish'), table);
    const host = makeHost();
    begin(fish, host);
    let guard = 0;
    while (fish.elapsed < fish.strikeAt + 0.05 && guard++ < 300) step(fish, host);
    step(fish, host, { interactPressed: true });

    expect(host.events[0].data).toMatchObject({ id: 'test-fish', isNew: true });
    expect(host.awards[0].score).toBe(9);
  });

  it('recovers from an early press with a new cast instead of ending', () => {
    const fish = createFishingActivity(defOf('fish'));
    const host = makeHost();
    begin(fish, host);

    step(fish, host, { interactPressed: true }); // far too early
    expect(fish.isComplete()).toBe(false);
    expect(fish.missesMade).toBe(1);
    expect(host.awards).toHaveLength(0);

    let guard = 0;
    while (fish.castsMade < 2 && guard++ < 200) step(fish, host);
    expect(fish.castsMade).toBe(2);
    expect(fish.isComplete()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Photo
// ---------------------------------------------------------------------------

describe('photo', () => {
  it('scores a centred frame above an off-centre one', () => {
    expect(facingDot(0, 0)).toBeCloseTo(1, 6);
    expect(inFrame(1)).toBe(true);
    expect(inFrame(facingDot(0, 1.2))).toBe(false);
    expect(composition(1, 12)).toBeGreaterThan(composition(0.9, 12));
  });

  it('snaps when aimed at the subject and stays open when aimed away', () => {
    const def = defOf('photo');
    const photo = createPhotoActivity(def);
    const host = makeHost({ playerPos: { x: def.pos.x, y: 0, z: def.pos.z } });
    begin(photo, host);

    const yaw = bearingTo(host.playerPos, photo.subject);
    const pitch = elevationTo(host.playerPos, photo.subject);
    expect(inFrame(photo.aimFrom(host.playerPos, yaw, pitch))).toBe(true);
    // Yaw alone is not enough: the check is 3D, so looking at the right bearing but up at the sky misses.
    expect(inFrame(photo.aimFrom(host.playerPos, yaw, pitch + 0.6))).toBe(false);

    aimTo(photo, host, yaw + 1.2, pitch);
    step(photo, host, { interactPressed: true });
    expect(photo.isComplete()).toBe(false);
    expect(photo.lastHint).toBe('aim');
    expect(host.events).toHaveLength(0);
    expect(host.awards).toHaveLength(0);

    aimTo(photo, host, yaw, pitch);
    step(photo, host, { interactPressed: true });
    expect(photo.isComplete()).toBe(true);
    expect(host.events.map((e) => e.name)).toEqual(['photo:taken']);
    expect(host.events[0].data).toMatchObject({ id: 'test-photo', isNew: true });
    expect(host.awards).toHaveLength(1);
    expect(photo.result()?.score).toBeGreaterThanOrEqual(50);
    expect(photo.result()?.bonus).toBe('test-photo');
    expect(photo.view()).toBeNull();
  });

  it('opens the viewfinder with the subject in frame but not centred, and turns and tilts with the move keys', () => {
    const def = defOf('photo');
    const photo = createPhotoActivity(def);
    const host = makeHost({ playerPos: { x: def.pos.x, y: 0, z: def.pos.z }, camYaw: 0.5 });
    begin(photo, host);
    const open = photo.view()?.yaw ?? 0;
    const off = Math.abs(angleDelta(open, bearingTo(host.playerPos, photo.subject)));
    expect(off).toBeGreaterThan(0.17); // outside the centring cone
    expect(off).toBeLessThan(0.45); // inside the frame
    expect(photo.view()?.pitch).toBeGreaterThan(0);
    // One second of D turns right (toward lower yaw) by about 70 degrees; W tilts up, clamped.
    for (let i = 0; i < 60; i++) step(photo, host, { moveX: 1 });
    expect(photo.view()?.yaw).toBeCloseTo(open - (70 * Math.PI) / 180, 2);
    for (let i = 0; i < 600; i++) step(photo, host, { moveZ: 1 });
    expect(photo.view()?.pitch).toBeCloseTo((55 * Math.PI) / 180, 6);
    // The follow camera turning underneath does not move the aim.
    step(photo, host, { camYaw: 2 });
    expect(photo.view()?.yaw).toBeCloseTo(open - (70 * Math.PI) / 180, 2);
  });

  it('frames the aurora as a sky direction, due north and up, with no ring and no distance check', () => {
    const def = defOf('photo', { id: 'peak-aurora-photo', pos: { x: 322, z: -392 } });
    const photo = createPhotoActivity(def);
    const host = makeHost({ playerPos: { x: 322, y: 85, z: -392 }, camYaw: 0 });
    begin(photo, host);
    expect(photo.markers()).toEqual([]);
    step(photo, host, { interactPressed: true });
    expect(photo.isComplete()).toBe(false); // facing south, at the snow
    aimTo(photo, host, Math.PI, (25 * Math.PI) / 180);
    expect(photo.lastHint).toBe('aim');
    step(photo, host, { interactPressed: true });
    // A long exposure: the shutter stays open while the frame drifts, and is held steady by hand.
    expect(photo.isComplete()).toBe(false);
    const held = photo.view()!;
    for (let i = 0; i < 60 * 6 && !photo.isComplete(); i++) {
      const v = photo.view()!;
      const k = PHOTO.turnRate * EXPOSURE.fine * FRAME;
      const moveX = Math.max(-1, Math.min(1, -angleDelta(v.yaw, held.yaw) / k));
      const moveZ = Math.max(-1, Math.min(1, (held.pitch - v.pitch) / (PHOTO.tiltRate * EXPOSURE.fine * FRAME)));
      step(photo, host, { moveX, moveZ });
    }
    expect(photo.isComplete()).toBe(true);
    expect(host.events[0].data).toMatchObject({ id: 'peak-aurora-photo' });
  });
});

/** Elevation from Pip's eye to a point, matching the viewfinder's pitch. */
function elevationTo(from: Vec3, to: Vec3): number {
  return Math.atan2(to.y - (from.y + PHOTO.eyeHeight), Math.hypot(to.x - from.x, to.z - from.z));
}

/** Hold the viewfinder keys until the aim reaches (yaw, pitch), as a player would. */
function aimTo(photo: ReturnType<typeof createPhotoActivity>, host: FakeHost, yaw: number, pitch: number): void {
  for (let i = 0; i < 2000; i++) {
    const v = photo.view();
    if (!v) return;
    const dYaw = angleDelta(v.yaw, yaw);
    const dPitch = pitch - v.pitch;
    if (Math.abs(dYaw) < 1e-4 && Math.abs(dPitch) < 1e-4) return;
    const moveX = Math.max(-1, Math.min(1, -dYaw / (PHOTO.turnRate * FRAME)));
    const moveZ = Math.max(-1, Math.min(1, dPitch / (PHOTO.tiltRate * FRAME)));
    step(photo, host, { moveX, moveZ });
  }
}

// ---------------------------------------------------------------------------
// 4. Sled
// ---------------------------------------------------------------------------

describe('sled', () => {
  it('gains speed on a slope, never stalls on the flat, and steers across the run', () => {
    const run = () => ({ speed: 0, distance: 0, lateral: 0, drift: 0, elapsed: 0 });
    const flatRun = run();
    sledStep(flatRun, 0.1, 0, 0);
    expect(flatRun.speed).toBeGreaterThan(0);
    expect(flatRun.distance).toBeGreaterThan(0);

    const steepRun = run();
    for (let i = 0; i < 10; i++) sledStep(steepRun, 0.1, 0.2, 0);
    expect(steepRun.speed).toBeGreaterThan(flatRun.speed);

    const right = run();
    for (let i = 0; i < 10; i++) sledStep(right, 0.1, 0.1, 1);
    expect(right.lateral).toBeGreaterThan(1);
    const held = run();
    for (let i = 0; i < 200; i++) sledStep(held, 0.1, 0.1, -1, 4.5);
    expect(held.lateral).toBe(-4.5); // the edge of the run, not off into the trees
  });

  it('carries Pip down the slide and turns the camera with it (ride)', () => {
    const slope: TerrainSampler = { ...FLAT, heightAt: (_x, z) => -z * 0.1, normalAt: () => ({ x: 0, y: 0.995, z: 0.0995 }) };
    const sled = createSledActivity(defOf('sled'), { length: 60 });
    const host = makeHost({ terrain: slope });
    begin(sled, host);
    const first = sled.ride();
    for (let i = 0; i < 120; i++) step(sled, host, { moveX: 1 });
    const later = sled.ride();
    expect(first && later).toBeTruthy();
    expect(later!.z).toBeGreaterThan(first!.z + 5); // downhill is +z here
    expect(later!.y).toBeLessThan(first!.y);
    expect(sled.lateral).toBeGreaterThan(1);
    const look = (sled.markers() as readonly { look?: string }[]).map((m) => m.look);
    expect(look).toContain('sled');
    expect(look).toContain('arch');
  });

  it('scores the time at the finish line, and longer courses score more', () => {
    const short = createSledActivity(defOf('sled'), { length: 40 });
    const shortHost = makeHost();
    begin(short, shortHost);
    const early = short.elapsed;
    for (let i = 0; i < 30; i++) step(short, shortHost);
    expect(short.elapsed).toBeGreaterThan(early);
    let guard = 0;
    while (!short.isComplete() && guard++ < 4000) step(short, shortHost);
    expect(short.isComplete()).toBe(true);
    expect(short.result()?.score).toBe(short.finishTime);
    expect(short.finishTime).toBeLessThanOrEqual(short.elapsed);
    expect(short.elapsed).toBeGreaterThan(0);

    const long = createSledActivity(defOf('sled'), { length: 80 });
    const longHost = makeHost();
    begin(long, longHost);
    guard = 0;
    while (!long.isComplete() && guard++ < 6000) step(long, longHost);
    expect(long.isComplete()).toBe(true);
    expect(long.result()?.score).toBe(long.finishTime);
    expect(long.finishTime).toBeGreaterThan(short.finishTime);
    expect(DEFAULT_COURSE).toBeGreaterThan(80);
  });

  it('records a personal best without a rank', () => {
    const state = createGameState({ x: 0, y: 0, z: 0 }, 8);
    state.sledBests['test-sled'] = 999;
    deepFreeze(state);
    const sled = createSledActivity(defOf('sled'), { length: 40 });
    const host = makeHost({ state });
    begin(sled, host);
    let guard = 0;
    while (!sled.isComplete() && guard++ < 4000) step(sled, host);
    expect(sled.result()?.bonus).toBe('personal-best');
    expect(sled.result()?.bonus).not.toMatch(/gold|silver|bronze|medal/i);
  });
});

// ---------------------------------------------------------------------------
// 5. Skate
// ---------------------------------------------------------------------------

describe('skate', () => {
  it('the balance model diverges with no input (pure step)', () => {
    const state = newBalance(0.2);
    for (let i = 0; i < 180; i++) skateStep(state, FRAME, 0, i * FRAME, 0.3);
    expect(Math.abs(state.balance)).toBeGreaterThan(0.3);
    expect(state.offCentreFor).toBeGreaterThan(0);
  });

  it('holds near the centre with alternating corrections', () => {
    const skate = createSkateActivity(defOf('skate'));
    const host = makeHost();
    begin(skate, host);

    let peak = 0;
    let corrections = 0;
    for (let i = 0; i < 240; i++) {
      const push = skate.balance > 0.05 ? -1 : skate.balance < -0.05 ? 1 : 0;
      if (push !== 0) corrections++;
      step(skate, host, { moveX: push });
      peak = Math.max(peak, Math.abs(skate.balance));
    }
    expect(corrections).toBeGreaterThan(20);
    expect(peak).toBeLessThan(0.7);
    expect(Math.abs(skate.balance)).toBeLessThan(0.4);
    expect(skate.isComplete()).toBe(false);
  });

  it('one held direction loses the edge, keeps the seconds, and never scolds', () => {
    const skate = createSkateActivity(defOf('skate'));
    const host = makeHost();
    begin(skate, host);

    let guard = 0;
    while (!skate.isComplete() && guard++ < 900) step(skate, host, { moveX: 1 });

    expect(skate.isComplete()).toBe(true);
    expect(host.awards).toHaveLength(1);
    expect(skate.result()?.score).toBeCloseTo(skate.secondsHeld, 9);
    expect(host.awards[0].score).toBeGreaterThan(0);
    expect(skate.crossedPond).toBe(false);
    expect(SKATE.goal).toBeGreaterThan(1);
  });

  it('an untouched run ends on its own and still banks the time', () => {
    const skate = createSkateActivity(defOf('skate'));
    const host = makeHost();
    begin(skate, host);
    let guard = 0;
    while (!skate.isComplete() && guard++ < 900) step(skate, host);
    expect(skate.isComplete()).toBe(true);
    expect(skate.result()?.score).toBeGreaterThan(0);
    expect(host.awards).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 6. Snowball throwing
// ---------------------------------------------------------------------------

describe('throw', () => {
  it('hits a target that the aim cone is over', () => {
    const game = createTargetActivity(defOf('throw'));
    const host = makeHost();
    begin(game, host);

    const target = game.liveTargets[0];
    step(game, host, { camYaw: targetAngle(target, game.seconds), interactPressed: true });

    expect(game.hitCount).toBe(1);
    expect(target.down).toBe(true);
    expect(game.throwsRemaining).toBe(THROW.budget - 1);
    expect(game.isComplete()).toBe(false);
  });

  it('counts hits and ends when the snowballs run out', () => {
    const game = createTargetActivity(defOf('throw'));
    const host = makeHost();
    begin(game, host);

    for (let frame = 0; !game.isComplete() && frame < 900; frame++) {
      const standing = game.liveTargets.filter((t) => !t.down);
      const aim = standing.length > 0 ? targetAngle(standing[0], game.seconds) : 0;
      if (frame % 24 === 0) {
        step(game, host, { camYaw: aim, interactPressed: true });
      } else {
        step(game, host);
      }
    }

    expect(game.isComplete()).toBe(true);
    expect(game.hitCount).toBe(3);
    expect(host.awards).toHaveLength(1);
    expect(game.result()?.score).toBe(3);
    expect(game.result()?.bonus).toBe('clean-sweep');
  });

  it('ends on the budget with zero hits when every throw misses', () => {
    const game = createTargetActivity(defOf('throw'));
    const host = makeHost();
    begin(game, host);

    let throwsSeen = 0;
    for (let frame = 0; !game.isComplete() && frame < 900; frame++) {
      const throwFrame = frame % 24 === 0;
      if (throwFrame) throwsSeen++;
      step(game, host, throwFrame ? { camYaw: Math.PI, interactPressed: true } : {});
    }

    expect(throwsSeen).toBe(THROW.budget);
    expect(game.throwsRemaining).toBe(0);
    expect(game.hitCount).toBe(0);
    expect(game.isComplete()).toBe(true);
    expect(host.awards).toHaveLength(1);
    expect(game.result()?.score).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 7. Snowman
// ---------------------------------------------------------------------------

describe('build', () => {
  it('needs all three parts, in order, and completes exactly once', () => {
    const build = createBuildActivity(defOf('build'));
    const host = makeHost();
    begin(build, host);
    const stations = partStations(defOf('build'));

    // "Away" has to be genuinely away. The ring radius is now <= the press reach, so that every
    // part is reachable from where the player already stands (movement is frozen during an
    // activity), which means one station is within reach of another. Standing 12 u off is away.
    host.playerPos = { x: stations[0].x + 12, y: 0, z: stations[0].z };
    step(build, host, { interactPressed: true });
    expect(build.placed).toBe(0);
    expect(build.currentPart).toBe('base');

    for (let i = 0; i < 3; i++) {
      host.playerPos = { x: stations[i].x, y: 0, z: stations[i].z };
      expect(build.inPlace(host.playerPos)).toBe(true);
      step(build, host, { interactPressed: true });
      expect(build.placed).toBe(i + 1);
    }

    expect(build.isComplete()).toBe(true);
    expect(host.awards).toHaveLength(1);
    expect(build.result()?.score).toBe(3);
    expect(build.result()?.bonus).toBe('test-build');

    step(build, host, { interactPressed: true });
    step(build, host, { interactPressed: true });
    expect(host.awards).toHaveLength(1);
    expect(build.result()?.bonus).toBe('test-build');

    // Standing away from the ring does nothing at all.
    const far = createBuildActivity(defOf('build'));
    const farHost = makeHost({ playerPos: { x: 40, y: 0, z: 40 } });
    begin(far, farHost);
    step(far, farHost, { interactPressed: true });
    expect(far.placed).toBe(0);
    expect(far.pressCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 8. Race
// ---------------------------------------------------------------------------

describe('race', () => {
  it('only counts movement down the course', () => {
    expect(forwardDrive(0, 1, 0, 0)).toBeCloseTo(1, 6);
    expect(forwardDrive(1, 0, 0, 0)).toBeCloseTo(0, 6);
    expect(forwardDrive(0, -1, 0, 0)).toBe(0);
    expect(forwardDrive(0, 0, 0, 0)).toBe(0);
  });

  it('finishes at the post with the elapsed time as the result', () => {
    const race = createRaceActivity(defOf('race'));
    const host = makeHost();
    race.start(host);
    step(race, host); // heading is known after start

    let guard = 0;
    while (!race.isComplete() && guard++ < 2000) {
      step(race, host, { moveZ: 1, sprintHeld: true, camYaw: race.headingDir });
    }

    expect(race.isComplete()).toBe(true);
    expect(race.distance).toBe(race.courseLength);
    expect(race.result()?.score).toBe(race.seconds);
    expect(race.seconds).toBeLessThan(20);
    expect(race.result()?.bonus).toBeUndefined();
    expect(host.awards).toHaveLength(1);
    expect(race.finished).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 9. Abort
// ---------------------------------------------------------------------------

describe('abort', () => {
  it('every kind aborts on cancel and never emits or awards again', () => {
    for (const kind of KINDS) {
      const activity = createActivity(defOf(kind));
      const host = makeHost();
      begin(activity, host);

      step(activity, host, { cancelPressed: true });

      expect(activity.isComplete(), kind).toBe(true);
      expect(activity.result(), kind).toBeNull();
      expect(host.awards, kind).toHaveLength(0);
      expect(host.events, kind).toHaveLength(0);

      for (let i = 0; i < 40; i++) step(activity, host, { interactPressed: true });
      expect(host.awards, kind).toHaveLength(0);
      expect(host.events, kind).toHaveLength(0);
      expect(activity.result(), kind).toBeNull();
    }
  });

  it('cancel wins over a press on the same frame', () => {
    const fish = createFishingActivity(defOf('fish'));
    const host = makeHost();
    begin(fish, host);
    let guard = 0;
    while (fish.elapsed < fish.strikeAt + 0.05 && guard++ < 300) step(fish, host);
    step(fish, host, { interactPressed: true, cancelPressed: true });
    expect(host.events).toHaveLength(0);
    expect(host.awards).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 10. Determinism
// ---------------------------------------------------------------------------

interface RunLog {
  events: string[];
  awards: string[];
  complete: boolean;
  result: ActivityResult | null;
}

/** A fixed, nonsense-but-reproducible input script: no Math.random anywhere. */
function scriptedRun(kind: ActivityKind, frames = 600): RunLog {
  const activity = createActivity(defOf(kind));
  const host = makeHost();
  activity.start(host);

  for (let i = 0; i < frames; i++) {
    step(activity, host, {
      moveX: Math.sin(i * 0.37),
      moveZ: Math.cos(i * 0.21),
      camYaw: Math.sin(i * 0.05) * 1.6,
      sprintHeld: i % 7 < 3,
      interactPressed: i % 23 === 0,
    });
  }

  return {
    events: host.events.map((e) => e.name),
    awards: host.awards.map((a) => `${a.score}|${a.bonus ?? ''}`),
    complete: activity.isComplete(),
    result: activity.result(),
  };
}

describe('determinism', () => {
  it('replays the same input script to identical events and results', () => {
    for (const kind of KINDS) {
      const once = scriptedRun(kind);
      const twice = scriptedRun(kind);
      expect(twice, kind).toEqual(once);
    }
  });

  it('never uses Math.random inside an activity', () => {
    const original = Math.random;
    Math.random = () => {
      throw new Error('activity reached Math.random');
    };
    try {
      for (const kind of KINDS) expect(() => scriptedRun(kind, 240), kind).not.toThrow();
    } finally {
      Math.random = original;
    }
  });
});

// ---------------------------------------------------------------------------
// 11. Read-only state
// ---------------------------------------------------------------------------

describe('host state', () => {
  it('is never mutated, and a frozen state never throws', () => {
    for (const kind of KINDS) {
      const state = createGameState({ x: 3, y: 4, z: 5 }, 8);
      state.fish['silver-smelt'] = 2;
      state.photos['test-photo'] = 1;
      state.sledBests['test-sled'] = 12;
      deepFreeze(state);

      const before = JSON.stringify(state);
      const host = makeHost({ state });
      const activity = createActivity(defOf(kind));
      activity.start(host);

      expect(() => {
        for (let i = 0; i < 400; i++) {
          step(activity, host, {
            moveX: Math.sin(i * 0.5),
            moveZ: Math.cos(i * 0.3),
            camYaw: Math.sin(i * 0.04),
            interactPressed: i % 19 === 0,
          });
          if (activity.isComplete()) break;
        }
      }, kind).not.toThrow();

      expect(Object.isFrozen(state), kind).toBe(true);
      expect(JSON.stringify(state), kind).toBe(before);
    }
  });

  it('reads caught fish and photos to report isNew correctly', () => {
    const def = defOf('photo');
    const state = createGameState({ x: 0, y: 0, z: 0 }, 8);
    state.photos['test-photo'] = 1;
    deepFreeze(state);

    const photo = createPhotoActivity(def);
    const host = makeHost({ state, playerPos: { x: def.pos.x, y: 0, z: def.pos.z } });
    begin(photo, host);
    aimTo(photo, host, bearingTo(host.playerPos, photo.subject), elevationTo(host.playerPos, photo.subject));
    step(photo, host, { interactPressed: true });

    expect(host.events).toHaveLength(1);
    expect(host.events[0].data).toMatchObject({ id: 'test-photo', isNew: false });
  });
});
