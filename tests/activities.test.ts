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
import { FISH } from '../src/data/fish';
import {
  FISHING,
  createFishingActivity,
  pickFish,
  resolveCatch,
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

  it('picks the same fish for the same rng seed', () => {
    const a = pickFish(makeRng(1234), FISH);
    const b = pickFish(makeRng(1234), FISH);
    expect(a.id).toBe(b.id);
    expect(FISH.map((f) => f.id)).toContain(a.id);
  });

  // Critic round 32 read "NOW" in the corner panel too late: the bite goes up large in the view as well.
  it('says the bite in the middle of the view, only while it is on', () => {
    const fish = createFishingActivity(defOf('fish'));
    const host = makeHost();
    begin(fish, host);
    expect(fish.progress()?.cue).toBeUndefined();
    let guard = 0;
    while (fish.elapsed < fish.strikeAt + 0.05 && guard++ < 300) step(fish, host);
    expect(fish.progress()?.cue).toBe('Now! Press E');
    step(fish, host, { interactPressed: true });
    expect(fish.progress()?.cue).toBeUndefined();
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

  const landAt = (id: string, state?: GameState): { host: FakeHost; fish: ReturnType<typeof createFishingActivity> } => {
    const fish = createFishingActivity(defOf('fish', { id }));
    const host = makeHost({ state });
    begin(fish, host);
    let guard = 0;
    while (fish.elapsed < fish.strikeAt + 0.05 && guard++ < 600) step(fish, host);
    step(fish, host, { interactPressed: true });
    return { host, fish };
  };

  it("a first catch at each pool is that pool's own fish", () => {
    const firsts = ['pinewind-creek-fish', 'kettles-spring-fish', 'reach-ice-fish', 'ridge-tarn-fish']
      .map((id) => landAt(id).fish.lastCatch?.id);
    expect(new Set(firsts).size).toBe(4);
  });

  it("while the mitten errand waits on the Creek Pool, the catch there is the mitten, not a fish", () => {
    const state = createGameState({ x: 0, y: 0, z: 0 }, 8);
    state.quests['hollis-mitten'] = { status: 'active', step: 1 };
    const { host, fish } = landAt('pinewind-creek-fish', state);
    expect(fish.lastCatch?.id).toBe('mitten');
    expect(host.events.some((e) => e.name === 'fish:caught')).toBe(false);
    expect(host.awards).toHaveLength(1);
    // Anywhere else, or once the step has moved on, it is fish again.
    expect(landAt('kettles-spring-fish', state).fish.lastCatch?.id).not.toBe('mitten');
    state.quests['hollis-mitten'] = { status: 'active', step: 2 };
    expect(landAt('pinewind-creek-fish', state).fish.lastCatch?.id).not.toBe('mitten');
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
    // One second of D turns right (toward lower yaw): 70 degrees a second, slower as it passes over the
    // subject (critic round 33 overshot with short taps). W tilts up, clamped.
    for (let i = 0; i < 60; i++) step(photo, host, { moveX: 1 });
    const turned = open - (photo.view()?.yaw ?? 0);
    expect(turned).toBeGreaterThan((45 * Math.PI) / 180);
    expect(turned).toBeLessThan((70 * Math.PI) / 180);
    for (let i = 0; i < 600; i++) step(photo, host, { moveZ: 1 });
    expect(photo.view()?.pitch).toBeCloseTo((55 * Math.PI) / 180, 6);
    // The follow camera turning underneath does not move the aim.
    const yaw = photo.view()?.yaw ?? 0;
    step(photo, host, { camYaw: 2 });
    expect(photo.view()?.yaw).toBeCloseTo(yaw, 6);
  });

  // Critic round 33 was a little off on both axes at once and read "Turn until it is centred", no key.
  it('always names a key while the subject is off centre', () => {
    const def = defOf('photo');
    const photo = createPhotoActivity(def);
    const host = makeHost({ playerPos: { x: def.pos.x, y: 0, z: def.pos.z }, camYaw: 0.5 });
    begin(photo, host);
    for (let i = 0; i < 600; i++) {
      const label = photo.progress()?.label ?? '';
      expect(label).not.toBe('Turn until it is centred');
      step(photo, host, { moveX: i % 120 < 60 ? 1 : -1, moveZ: i % 90 < 45 ? 0.4 : -0.4 });
    }
  });

});

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

  it('a rider who steers the way the ring cue says, a third of a second late, gets most rings', () => {
    const sled = createSledActivity(defOf('sled'), { length: 120 });
    const host = makeHost();
    begin(sled, host);
    const seen: string[] = [];
    let guard = 0;
    while (!sled.isComplete() && guard++ < 6000) {
      seen.push(sled.progress()?.label ?? '');
      const cue = seen[Math.max(0, seen.length - 1 - 20)];
      step(sled, host, { moveX: cue.startsWith('Ring to your right') ? 1 : cue.startsWith('Ring to your left') ? -1 : 0 });
    }
    expect(seen.some((l) => /^Ring to your (left|right) · /.test(l))).toBe(true);
    expect(sled.ringsGot).toBeGreaterThanOrEqual(Math.ceil(sled.ringsTotal * 0.6));
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

  it('a player who leans against the tip the panel names, a third of a second late, crosses the pond', () => {
    // Critic round 17 fell in at 11 s: the panel said "press", and a tap barely moves the meter.
    const skate = createSkateActivity(defOf('skate'));
    const host = makeHost();
    begin(skate, host);
    const seen: string[] = [];
    let guard = 0;
    while (!skate.isComplete() && guard++ < 2000) {
      seen.push(skate.progress()?.label ?? '');
      const cue = seen[Math.max(0, seen.length - 1 - 20)];
      step(skate, host, { moveX: cue.startsWith('Tipping right') ? -1 : cue.startsWith('Tipping left') ? 1 : 0 });
    }
    expect(seen[0]).toMatch(/^Tipping (right|left) · /);
    expect(skate.crossedPond).toBe(true);
  });

  it('a whole second late on every cue, rides out its wobbles and finishes the lap (critic rounds 17 and 21)', () => {
    // A player a whole second late on every cue: once a fall, now caught.
    const skate = createSkateActivity(defOf('skate'));
    const host = makeHost();
    begin(skate, host);
    const seen: string[] = [];
    let guard = 0;
    while (!skate.isComplete() && guard++ < 2000) {
      seen.push(skate.progress()?.label ?? '');
      const cue = seen[Math.max(0, seen.length - 1 - 60)];
      const at = cue.replace(/^Whoa[^·]*· /, '');
      step(skate, host, { moveX: at.startsWith('Tipping right') ? -1 : at.startsWith('Tipping left') ? 1 : 0 });
    }
    expect(seen.some((l) => l.startsWith("Whoa, caught it"))).toBe(true);
    expect(skate.crossedPond).toBe(true);
  });

  it('says which way it tips every time, and says it large before a fall (critic round 34)', () => {
    const skate = createSkateActivity(defOf('skate'));
    const host = makeHost();
    begin(skate, host);
    const tips: string[] = [];
    const cues: string[] = [];
    let guard = 0;
    while (!skate.isComplete() && guard++ < 1300) {
      const r = skate.progress();
      if (r?.label.includes('Tipping')) tips.push(r.label);
      if (r?.cue) cues.push(r.cue);
      step(skate, host);
    }
    expect(tips.length).toBeGreaterThan(0);
    expect(tips.every((l) => /(^|· )Tipping (right|left)( · |$)/.test(l))).toBe(true);
    expect(cues.length).toBeGreaterThan(0);
    expect(cues.every((c) => c === 'Tipping right!' || c === 'Tipping left!')).toBe(true);
  });

  it('an untouched run ends on its own and still banks the time', () => {
    const skate = createSkateActivity(defOf('skate'));
    const host = makeHost();
    begin(skate, host);
    let guard = 0;
    while (!skate.isComplete() && guard++ < 1300) step(skate, host);
    expect(skate.isComplete()).toBe(true);
    expect(skate.crossedPond).toBe(false); // the caught wobbles don't carry a run nobody steers
    expect(skate.result()?.score).toBeGreaterThan(0);
    expect(host.awards).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 6. Snowball throwing
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// 7. Snowman
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// 8. Race
// ---------------------------------------------------------------------------


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

});
