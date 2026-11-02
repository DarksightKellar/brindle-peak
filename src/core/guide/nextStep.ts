/**
 * The next step — one action, derived, never authored twice.
 *
 * The journal used to answer "how much is left" (3 / 22) and never "what do I do now", which is the
 * whole complaint the field guide answers (docs/GUIDE.md). This module is that answer, and it is
 * pure: it reads `GameState` and the content tables it is handed, and returns a value. No `three`,
 * no DOM, no clock, no browser — so "the line never shows a step that is already done" can be tested
 * without opening the game.
 *
 * Two rules shape the result:
 *
 *  1. A step comes from the quest's own ordered `steps`, filtered by the same `evaluate` the quest
 *     engine uses. There is no parallel hint table, because a hint that can disagree with a quest is
 *     a bug factory.
 *  2. The main story and the errands are asked for separately. The main story's step is the goal
 *     (the first active `main` quest, in story order); between errands the nearest step wins, because
 *     distance is a fact the player can act on and "pick a quest" is homework.
 */

import type { Condition, GameState, QuestDef, QuestStep, Vec2, ZoneId } from '../contracts';
import { evaluate, measure } from '../progress/conditions';
import { doneOnce } from '../progress/quests';
import type { CompassWord } from './compass';
import { compassWord, formatDistance } from './compass';

/** The content the guide is allowed to read. Structural, so tests need no full content records. */
export interface GuideNpc {
  id: string;
  zone: ZoneId;
  pos: Vec2;
}

export interface GuideActivity {
  id: string;
  zone: ZoneId;
  pos: Vec2;
  /** fish, photo, sled…: picks the map's glyph. */
  kind?: string;
}

export interface GuideZone {
  id: ZoneId;
  centre: Vec2;
  radius: number;
}

/** A named spot a `reached` step sends Pip to (data/places.ts). */
export interface GuidePlace {
  id: string;
  zone: ZoneId;
  pos: Vec2;
}

export interface GuideContent {
  quests: readonly QuestDef[];
  npcs: readonly GuideNpc[];
  activities: readonly GuideActivity[];
  zones: readonly GuideZone[];
  places: readonly GuidePlace[];
  zoneNames: Readonly<Record<ZoneId, string>>;
}

/** `quest` = a live quest step; `explore` = no quest is running, so point at unseen ground. */
export type GuideKind = 'quest' | 'explore';

export interface GuideStep {
  kind: GuideKind;
  /** Null for `explore`. */
  questId: string | null;
  questTitle: string | null;
  /** Index into the quest's `steps`. Null for `explore`. */
  stepIndex: number | null;
  /** The authored step text, or the zone name for `explore`. */
  stepText: string;
  /** The zone the target sits in; null when the step names nothing placed. */
  zone: ZoneId | null;
  /** World position of the target, if the step has one. */
  target: Vec2 | null;
  /** Null when there is no target, or the player is standing on it. */
  bearing: CompassWord | null;
  /** Whole world units to the target. */
  distance: number | null;
}

/** Closer than this and a bearing is noise: the thing is under the player's feet. */
export const AT_TARGET = 1.5;

/** The first step of `def` whose condition does not hold yet, or null when the quest is done. */
export function nextStepOf(def: QuestDef, s: GameState): { index: number; step: QuestStep } | null {
  const p = s.quests[def.id];
  if (!p || p.status !== 'active') return null;
  const current = Math.max(0, Math.floor(p.step));
  let i = current;
  // Walk past anything already satisfied — including steps the engine has not advanced over yet.
  // A displayed step whose condition holds is the lie this module exists to prevent. A counted step
  // (talk, visit) holds only once its count rose past the engine's baseline, and only the current step
  // has one: "talk to Bram again" is not done because you talked to him once. An activity or place step
  // counts if it was ever done (doneOnce, progress/quests.ts), the same rule the engine uses.
  while (i < def.steps.length) {
    const c = def.steps[i].when;
    const count = measure(c, s);
    const held = count === null ? evaluate(c, s)
      : doneOnce(def.steps[i]) ? count > 0
        : i === current && p.base !== undefined && count > p.base;
    if (!held) break;
    i += 1;
  }
  const step = def.steps[i];
  return step ? { index: i, step } : null;
}

/** Where a step's condition points in the world, or null when it names nothing placed. */
export function targetOf(c: Condition, content: GuideContent): { pos: Vec2; zone: ZoneId } | null {
  if (c.kind === 'talked') {
    const npc = content.npcs.find((n) => n.id === c.id);
    return npc ? { pos: npc.pos, zone: npc.zone } : null;
  }
  if (c.kind === 'activity') {
    const activity = content.activities.find((a) => a.id === c.id);
    return activity ? { pos: activity.pos, zone: activity.zone } : null;
  }
  if (c.kind === 'visited') {
    const zone = content.zones.find((z) => z.id === c.id);
    return zone ? { pos: zone.centre, zone: zone.id } : null;
  }
  if (c.kind === 'reached') {
    const spot = content.places.find((p) => p.id === c.id);
    return spot ? { pos: spot.pos, zone: spot.zone } : null;
  }
  // `hasItem`, `count`, `flag` and `achievement` name no position. Never invent a bearing for them.
  return null;
}

interface Placed {
  zone: ZoneId | null;
  target: Vec2 | null;
  bearing: CompassWord | null;
  distance: number | null;
}

/** Resolve a target into what the line prints, measured from `from`. */
function place(from: Vec2, at: { pos: Vec2; zone: ZoneId } | null): { placed: Placed; away: number } {
  if (!at) {
    return { placed: { zone: null, target: null, bearing: null, distance: null }, away: Number.POSITIVE_INFINITY };
  }
  const dx = at.pos.x - from.x;
  const dz = at.pos.z - from.z;
  const away = Math.hypot(dx, dz);
  return {
    placed: {
      zone: at.zone,
      target: { x: at.pos.x, z: at.pos.z },
      bearing: away < AT_TARGET ? null : compassWord(dx, dz),
      distance: Math.round(away),
    },
    away,
  };
}

/**
 * The single next action for this state.
 *
 * `which` picks the pool: 'main' is the story step only (no exploring fallback, the HUD writes its own
 * goal when the story is between chapters); 'side' is the errands plus the exploring fallback; 'any'
 * is both, nearest first.
 *
 * Returns null when there is nothing honest to point at: no active quest and every zone already
 * walked. The HUD then shows no line at all rather than repeating the goal.
 */
export function nextStepFor(
  s: GameState,
  from: Vec2,
  content: GuideContent,
  which: 'main' | 'side' | 'any' = 'any',
): GuideStep | null {
  let best: GuideStep | null = null;
  let bestAway = Number.POSITIVE_INFINITY;

  for (const def of content.quests) {
    if (which === 'main' && def.main !== true) continue;
    if (which === 'side' && def.main === true) continue;
    const now = nextStepOf(def, s);
    if (!now) continue;
    // "Walk into a zone" passes on a fresh entry, so while the player stands in that zone its centre is
    // empty snow they cannot finish anything at. No target is the honest answer, not a bearing to it.
    const when = now.step.when;
    const inside = when.kind === 'visited' && s.zone === when.id;
    const { placed, away } = place(from, inside ? null : targetOf(when, content));
    // A targetless step measures as Infinity, so the first candidate must always be taken; a later
    // quest with a real position then beats it. The story is never "nearest": its first live step wins.
    if (best !== null && (which === 'main' || away >= bestAway)) continue;
    bestAway = away;
    best = {
      kind: 'quest',
      questId: def.id,
      questTitle: def.title,
      stepIndex: now.index,
      stepText: now.step.text,
      ...placed,
    };
  }
  if (best || which === 'main') return best;

  for (const zone of content.zones) {
    if (s.visited[zone.id] === true) continue;
    const { placed, away } = place(from, { pos: zone.centre, zone: zone.id });
    if (best !== null && away >= bestAway) continue;
    bestAway = away;
    best = {
      kind: 'explore',
      questId: null,
      questTitle: null,
      stepIndex: null,
      stepText: content.zoneNames[zone.id] ?? zone.id,
      ...placed,
    };
  }
  return best;
}

/**
 * Errands are offered, not assigned. The line under the goal names an errand only when its step is
 * close enough to act on, or for a short while after it first appears (the player has just been handed
 * it). Everything else waits in the journal: six "go to X" lines across the valley read as homework.
 */
export const NEAR_STEP = 90;
/** Seconds a newly appeared errand step is shown wherever it is. */
export const FRESH_STEP_S = 20;

/** Should the HUD print this errand step? `ageS` is how long this exact step has been around. */
export function worthShowing(step: GuideStep | null, ageS: number): boolean {
  // A step with nowhere to walk to is a sentence for the journal, not a direction.
  if (!step || step.distance === null) return false;
  if (step.distance <= NEAR_STEP) return true;
  return step.kind === 'quest' && ageS < FRESH_STEP_S;
}

/** Strip the authored full stop: "Ask Bram about the batteries." reads badly before an em dash. */
const clause = (text: string): string => text.replace(/\.\s*$/, '');

/**
 * The line as it appears under the goal, prefix included, so the string itself is testable.
 *
 * Distance only. The bearing word ("northwest, 9 u") meant little once the camera had turned, and the
 * HUD now hangs the errand's own mark on the compass strip, which says where relative to the view.
 * `bearing` still decides whether there is anywhere to point at all (null when standing on it).
 */
export function formatNextStep(step: GuideStep | null): string {
  if (!step) return '';
  const where = step.bearing !== null && step.distance !== null ? ` — ${formatDistance(step.distance)}` : '';
  if (step.kind === 'explore') return `Unexplored: ${step.stepText}${where}`;
  // A step with a target loses its full stop before the em dash; a step without one keeps its
  // authored sentence intact.
  return `Next: ${where === '' ? step.stepText : clause(step.stepText)}${where}`;
}
