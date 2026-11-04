import { describe, expect, it } from 'vitest';
import type { BeatId, Snapshot } from '../src/core/onboarding/steps';
import {
  BEATS, TIP_PATIENCE, WALK_DISTANCE, beatApplies, beatById, promptSegments,
} from '../src/core/onboarding/steps';
import type { OnboardingEvent, OnboardingMachine } from '../src/core/onboarding/machine';
import { createOnboarding, normalise } from '../src/core/onboarding/machine';

/** Nothing done yet. */
const IDLE: Snapshot = {
  travelled: 0,
  mapOpenedEver: false,
  sprintHeld: false,
  dialogueOpenedEver: false,
  leftGroundEver: false,
  flappedEver: false,
  journalOpenedEver: false,
};

const snap = (over: Partial<Snapshot> = {}): Snapshot => ({ ...IDLE, ...over });

/** Walked, talked and looked: the script is waiting on its first airborne beat. */
const AT_JUMP = snap({ travelled: 40, dialogueOpenedEver: true, mapOpenedEver: true });

/** Everything except sprint and the journal. */
const AT_SPRINT = { ...AT_JUMP, leftGroundEver: true, flappedEver: true };

const step = (m: OnboardingMachine, s: Snapshot, dt = 1 / 60): OnboardingEvent[] =>
  m.observe(s, dt);
const kinds = (e: readonly OnboardingEvent[]): string[] => e.map((x) => x.kind);
/** Beats whose `complete` event is in this batch, in order. */
const completed = (e: readonly OnboardingEvent[]): BeatId[] =>
  e.flatMap((x) => (x.kind === 'complete' ? [x.beat.id] : []));

describe('onboarding step table', () => {
  it('is the authored order: walk, talk, look, jump, flap, sprint, journal', () => {
    // Talk is second because beat 1 completes at 12 u and Nana stands 14.42 u away: with "look" in
    // that slot the player reaches her with a look prompt up and is then asked to talk to her again.
    expect(BEATS.map((b) => b.id)).toEqual([
      'walk', 'talk', 'map', 'jump', 'flap', 'sprint', 'journal',
    ]);
  });

  it('pays no bells: the bell is a collectible, not a tutorial ticket', () => {
    for (const b of BEATS) expect(Object.keys(b.payout)).not.toContain('bells');
    // And the walk line must not promise the bell the old spec paid for.
    expect(beatById('walk')?.payout.toast).not.toMatch(/bell/i);
  });

  it('shows every beat its own key caps, and never says a key twice', () => {
    // The map beat once named no key at all: the map was built and nothing told the player how to open it.
    for (const b of BEATS) {
      const segments = promptSegments(b);
      const caps = segments.filter((x) => x.kind === 'keys');
      expect(caps, b.id).toEqual([{ kind: 'keys', keys: b.keys }]);
      const words = segments.flatMap((x) => (x.kind === 'text' ? x.text.split(/\s+/) : []));
      for (const key of b.keys) expect(words, `${b.id} says ${key} twice`).not.toContain(key);
    }
  });

  it('keeps a key that sits mid-sentence in place', () => {
    // The old prefix-stripping rendered this one as "Shift Hold Shift — run".
    const sprint = beatById('sprint')!;
    expect(promptSegments({ ...sprint, prompt: 'Hold Shift — run', keys: ['Shift'] })).toEqual([
      { kind: 'text', text: 'Hold' },
      { kind: 'keys', keys: ['Shift'] },
      { kind: 'text', text: '— run' },
    ]);
  });
});

describe('onboarding machine', () => {
  it('announces the first beat before anything is asked of the player', () => {
    const m = createOnboarding();
    expect(m.current()?.id).toBe('walk');
    expect(kinds(step(m, IDLE))).toEqual(['enter']);
    expect(m.isDone()).toBe(false);
  });

  it('completes walk at WALK_DISTANCE travelled and not before', () => {
    const m = createOnboarding();
    step(m, IDLE);
    expect(step(m, snap({ travelled: WALK_DISTANCE - 0.1 }))).toEqual([]);
    expect(m.current()?.id).toBe('walk');
    expect(completed(step(m, snap({ travelled: WALK_DISTANCE })))).toEqual(['walk']);
    expect(m.current()?.id).toBe('talk');
  });

  it('cannot complete a beat out of order', () => {
    const m = createOnboarding();
    step(m, IDLE);
    // Everything but walking and talking, the journal included: nothing happens, the script simply waits.
    const events = step(m, {
      travelled: 0, mapOpenedEver: true, sprintHeld: true, dialogueOpenedEver: false,
      leftGroundEver: true, flappedEver: true, journalOpenedEver: true,
    }, 0.3);
    expect(events).toEqual([]);
    expect(m.current()?.id).toBe('walk');
  });

  it('counts a talk as the walk done, however short the walk', () => {
    const m = createOnboarding();
    step(m, IDLE);
    const events = step(m, snap({ travelled: 3, dialogueOpenedEver: true }));
    expect(completed(events)).toEqual(['walk', 'talk']);
  });

  it('pays a beat that was already done before it became current', () => {
    const m = createOnboarding();
    step(m, IDLE);
    // Nana talked to on the way in: walking and talking complete together, with no second request to
    // go and find her. The map was not opened, so the script stops there.
    const events = step(m, snap({ travelled: 14.4, dialogueOpenedEver: true }));
    expect(completed(events)).toEqual(['walk', 'talk']);
    expect(m.current()?.id).toBe('map');
  });

  it('completes the map beat only once the map page has been opened', () => {
    const m = createOnboarding();
    step(m, IDLE);
    step(m, snap({ travelled: 13, dialogueOpenedEver: true })); // walk + talk done
    expect(m.current()?.id).toBe('map');
    expect(step(m, snap({ travelled: 40 }))).toEqual([]);
    expect(completed(step(m, snap({ travelled: 40, mapOpenedEver: true })))).toEqual(['map']);
  });

  it('completes jump once the ground has been left, and flap once a flap is spent', () => {
    const m = createOnboarding();
    step(m, IDLE);
    step(m, AT_JUMP); // walk, talk, look paid; jump current
    expect(m.current()?.id).toBe('jump');
    expect(step(m, AT_JUMP)).toEqual([]);
    expect(completed(step(m, { ...AT_JUMP, leftGroundEver: true }))).toEqual(['jump']);
    expect(m.current()?.id).toBe('flap');
    // A latch keeps working: a player who flapped before the beat appeared is not asked again.
    expect(completed(step(m, { ...AT_JUMP, leftGroundEver: true, flappedEver: true })))
      .toEqual(['flap']);
    expect(m.current()?.id).toBe('sprint');
  });

  it('measures sprint as a continuous 0.6 s hold', () => {
    const m = createOnboarding();
    step(m, IDLE);
    step(m, AT_SPRINT);
    expect(m.current()?.id).toBe('sprint');

    const held = { ...AT_SPRINT, sprintHeld: true };
    // 0.2 s frames, under the machine's own MAX_DT clamp, so this measures the hold and not the clamp.
    step(m, held, 0.2);
    expect(m.current()?.id).toBe('sprint');
    // Releasing resets the hold: 0.2 s, a gap, 0.2 s is not 0.4 s of running.
    step(m, AT_SPRINT, 0.05);
    expect(completed(step(m, held, 0.2))).toEqual([]);
    step(m, held, 0.2);
    expect(m.current()?.id).toBe('sprint');
    expect(completed(step(m, held, 0.2))).toEqual(['sprint']);
    expect(m.current()?.id).toBe('journal');
  });

  it('clamps a huge dt so one frame cannot buy a sprint', () => {
    const m = createOnboarding();
    step(m, IDLE);
    step(m, AT_SPRINT);
    expect(step(m, { ...AT_SPRINT, sprintHeld: true }, 999)).toEqual([]);
    expect(m.current()?.id).toBe('sprint');
    expect(() => step(m, AT_SPRINT, NaN)).not.toThrow();
  });

  it('opens the journal, retires, and stays retired', () => {
    const m = createOnboarding();
    step(m, IDLE);
    step(m, AT_SPRINT);
    const held = { ...AT_SPRINT, sprintHeld: true };
    step(m, held, 0.2);
    step(m, held, 0.2);
    step(m, held, 0.2); // sprint paid, journal current
    expect(m.current()?.id).toBe('journal');
    expect(kinds(step(m, { ...AT_SPRINT, journalOpenedEver: true })))
      .toEqual(['complete', 'retire']);
    expect(m.isDone()).toBe(true);
    expect(m.current()).toBeNull();
    expect(step(m, AT_SPRINT)).toEqual([]);
  });

  // The map tip was still up at the ending card: a tip the player keeps ignoring has to go.
  it('drops a tip left unanswered for its patience, unpaid, but never the story\'s first steps', () => {
    for (const first of ['walk', 'talk']) {
      const m = createOnboarding(undefined, first);
      for (let i = 0; i < 1000; i++) step(m, IDLE, 0.25);
      expect(m.current()?.id).toBe(first);
    }
    const m = createOnboarding(undefined, 'jump');
    const events: OnboardingEvent[] = [];
    for (let i = 0; i <= TIP_PATIENCE * 4; i++) events.push(...step(m, AT_JUMP, 0.25));
    expect(kinds(events)).toEqual(['enter', 'lapse', 'enter']);
    expect(completed(events)).toEqual([]);
    expect(m.current()?.id).toBe('flap');
  });

  it('skips in one call and pays nothing', () => {
    const m = createOnboarding();
    step(m, IDLE);
    expect(m.skip()).toEqual([{ kind: 'retire' }]);
    expect(m.isDone()).toBe(true);
    expect(m.current()).toBeNull();
    expect(m.skip()).toEqual([]);
    expect(m.observe(AT_SPRINT, 1)).toEqual([]);
  });

  it('resumes at a saved beat and restarts on an id it does not know', () => {
    expect(createOnboarding(undefined, 'jump').current()?.id).toBe('jump');
    expect(createOnboarding(undefined, 'journal').current()?.id).toBe('journal');
    // A renamed or corrupt beat id must not strand a run: back to the top.
    expect(createOnboarding(undefined, 'polka').current()?.id).toBe('walk');
    expect(createOnboarding(undefined, '').current()?.id).toBe('walk');
    expect(createOnboarding(undefined, null).current()?.id).toBe('walk');
  });

  it('is forgiving of junk snapshots and junk dt', () => {
    const m = createOnboarding();
    const junk = {
      travelled: NaN, lookTotal: Infinity, sprintHeld: 'yes', dialogueOpenedEver: 1,
      leftGroundEver: undefined, flappedEver: null, journalOpenedEver: {},
    } as unknown as Snapshot;
    expect(() => step(m, junk, NaN)).not.toThrow();
    expect(() => m.observe(null as unknown as Snapshot, -4)).not.toThrow();
    expect(m.current()?.id).toBe('walk');
    expect(normalise(null).travelled).toBe(0);
  });
});

describe('when a tip applies', () => {
  const ctx = { airborne: false, moving: false, openerInReach: false };

  it('asks for a flap only in the air, and a run only while walking', () => {
    const flap = beatById('flap')!, sprint = beatById('sprint')!;
    expect(beatApplies(flap, ctx)).toBe(false);
    expect(beatApplies(flap, { ...ctx, airborne: true })).toBe(true);
    expect(beatApplies(sprint, ctx)).toBe(false);
    expect(beatApplies(sprint, { ...ctx, moving: true })).toBe(true);
  });

  it('asks to talk to Nana only where E reaches her', () => {
    const talk = beatById('talk')!;
    expect(beatApplies(talk, ctx)).toBe(false);
    expect(beatApplies(talk, { ...ctx, openerInReach: true })).toBe(true);
  });
});
