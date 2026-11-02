/**
 * The onboarding machine: a pure reducer over the step table.
 *
 *   observe(snapshot, dt) -> events      current()      skip()      isDone()
 *
 * It never reads the world. It is fed a `Snapshot` and answers with events, which is what lets the
 * order, the completion conditions and the retire path be unit-tested without a browser — the first
 * thing every new player touches must not be able to break in a way only a human notices.
 *
 * Completion is LEVEL-triggered, not edge-triggered. The snapshot carries latched totals ("a dialogue
 * has been opened at least once"), so a player who has already done a thing is never asked to do it
 * again: walk to Nana, talk to her on the way, and the talk beat is already satisfied when it appears.
 * The one exception is `sprint`, a duration of holding, measured here from `dt`.
 *
 * Only one beat is current, and only it can complete. Anything else the player does meanwhile is
 * simply recorded and cashed in when the script reaches that beat. A tip with `patience` that stays
 * unanswered that long lapses: it is dropped unpaid and the script moves on, so a player who never
 * needs the map tip is not shown it until the credits. Nothing here throws on bad input:
 * every numeric field is coerced, every flag is read strictly, and `null` reads as an empty snapshot.
 */

import type { Snapshot, TutorialBeat } from './steps';
import { BEATS, SPRINT_SECONDS, WALK_DISTANCE } from './steps';

export type OnboardingEvent =
  /** A new beat is current: show its prompt. */
  | { readonly kind: 'enter'; readonly index: number; readonly beat: TutorialBeat }
  /** The current beat was performed: pay it. */
  | { readonly kind: 'complete'; readonly index: number; readonly beat: TutorialBeat }
  /** The current beat outlasted its patience unanswered: drop it, pay nothing, move on. */
  | { readonly kind: 'lapse'; readonly index: number; readonly beat: TutorialBeat }
  /** The script is over — finished or skipped. Never followed by anything else. */
  | { readonly kind: 'retire' };

export interface OnboardingMachine {
  observe(snapshot: Snapshot, dt: number): OnboardingEvent[];
  current(): TutorialBeat | null;
  /** Dismiss the whole script. Pays nothing: skipping is not a lesson. */
  skip(): OnboardingEvent[];
  isDone(): boolean;
}

const MAX_DT = 0.25;

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const bool = (v: unknown): boolean => v === true;

/** Coerce anything — a half-built snapshot, NaN, a missing field — into a readable one. */
export function normalise(raw: Snapshot | null | undefined): Snapshot {
  const s = (raw ?? {}) as unknown as Record<string, unknown>;
  return {
    travelled: Math.max(0, num(s.travelled)),
    mapOpenedEver: s.mapOpenedEver === true,
    sprintHeld: bool(s.sprintHeld),
    dialogueOpenedEver: bool(s.dialogueOpenedEver),
    leftGroundEver: bool(s.leftGroundEver),
    flappedEver: bool(s.flappedEver),
    journalOpenedEver: bool(s.journalOpenedEver),
  };
}

const clampDt = (dt: unknown): number => Math.min(Math.max(num(dt), 0), MAX_DT);

/**
 * The completion condition for one beat. Everything but `sprint` reads a latched total, so a beat that
 * was already earned before it became current completes on its first frame.
 */
function isSatisfied(beat: TutorialBeat, snap: Snapshot): boolean {
  switch (beat.id) {
    case 'walk':
      return snap.travelled >= WALK_DISTANCE - 1e-6;
    case 'talk':
      return snap.dialogueOpenedEver;
    case 'map':
      return snap.mapOpenedEver;
    case 'jump':
      return snap.leftGroundEver;
    case 'flap':
      return snap.flappedEver;
    case 'journal':
      return snap.journalOpenedEver;
    case 'sprint':
      // Owned by `observe`, which holds the timer.
      return false;
    default:
      // An unknown beat id is a step this build cannot judge; it stays up rather than completing
      // itself.
      return false;
  }
}

/**
 * `start` resumes the script at a beat id saved by a previous session. Anything unknown — a renamed
 * beat, a value from a future build, a typo — restarts at the first beat instead of throwing, because
 * a corrupt tutorial pointer must never be able to block a run.
 */
export function createOnboarding(
  beats: readonly TutorialBeat[] = BEATS,
  start: string | null = null,
): OnboardingMachine {
  const resumed = start === null ? -1 : beats.findIndex((b) => b.id === start);
  let index = resumed > 0 ? resumed : 0;
  let started = false;
  let done = beats.length === 0;
  let sprintHeld = 0;
  /** Seconds the current beat has been observed with a visible prompt (the caller passes 0 dt while hidden). */
  let shownFor = 0;

  const enter = (): OnboardingEvent => {
    sprintHeld = 0;
    shownFor = 0;
    // A bounds check, not an assertion: a short table would otherwise emit `beat: undefined` and the
    // prompt bar would throw on `beat.id` — a crash in the first thing every player sees.
    const entered = beats[index];
    if (entered === undefined) return { kind: 'retire' };
    return { kind: 'enter', index, beat: entered };
  };

  const advance = (snap: Snapshot, frameDt: number): OnboardingEvent[] => {
    const out: OnboardingEvent[] = [];
    if (!started) {
      started = true;
      out.push(enter());
    }
    // Bounded: each pass either stops or retires one beat, and there are only `beats.length` of them.
    for (let guard = 0; guard <= beats.length; guard++) {
      const beat = beats[index];
      if (beat === undefined) return out;
      let satisfied: boolean;
      if (beat.id === 'sprint') {
        sprintHeld = snap.sprintHeld ? sprintHeld + frameDt : 0;
        // Held time is a sum of floats: 0.3 + 0.3 lands at 0.5999999999999999, and a player who held
        // for that long has still held the 0.6 s the prompt asked for.
        satisfied = sprintHeld >= SPRINT_SECONDS - 1e-6;
      } else {
        satisfied = isSatisfied(beat, snap);
      }
      if (!satisfied) {
        shownFor += frameDt;
        if (beat.patience === undefined || shownFor < beat.patience) return out;
        out.push({ kind: 'lapse', index, beat });
      } else {
        out.push({ kind: 'complete', index, beat });
      }
      index += 1;
      if (index >= beats.length) {
        done = true;
        out.push({ kind: 'retire' });
        return out;
      }
      // Walk, talk and the map can all be done before the script is ever read: the next beat announces
      // and completes together rather than flashing a prompt the player already answered.
      out.push(enter());
      // Only the beat that was current when the frame began may add to a hold timer.
      frameDt = 0;
    }
    return out;
  };

  return {
    observe: (raw: Snapshot, rawDt: number): OnboardingEvent[] =>
      done ? [] : advance(normalise(raw), clampDt(rawDt)),

    current(): TutorialBeat | null {
      return done ? null : (beats[index] ?? null);
    },

    skip(): OnboardingEvent[] {
      if (done) return [];
      done = true;
      started = true;
      return [{ kind: 'retire' }];
    },

    isDone: () => done,
  };
}
