/**
 * Which errand the line under the goal names: the tracked one.
 *
 * Critic round 3 found side goals nearly invisible, so one errand is tracked and its line stays until it
 * is done. Critic round 4 then watched the line swap under them: accepting a second errand took it over,
 * an errand started by idle chatter took it over again, and a step of a third errand a few metres away
 * was named "while you stand there" until the race they had chosen was never shown again. So:
 *
 *  - The player can pick (`track`, from the journal's Quests page). A picked errand is kept, across
 *    reloads, until it is done; nothing else takes the line from it.
 *  - With nothing picked, the errand most recently handed over, or moved on by something Pip chose to
 *    do (a talk, an activity), is tracked. A step that passes on its own as Pip walks by (a place
 *    reached, a zone visited) does not take the line: critic round 22 walked past the hot pools, Wren's
 *    errand passed "listen to the pools" and took the line from the Bundle they were carrying, and
 *    they overshot Ivy. When the line does move by itself, `switched` says so for the HUD to show.
 *  - The story can be picked too: then the line under the goal stands down and the compass follows the
 *    story alone, until an errand is picked or a new one taken on. Critic round 22 picked "Up to the
 *    Mast" on the Quests page and got Four Loaves, because the story was not a row the cursor stopped on.
 *  - When the tracked errand finishes, the nearest live one is taken up.
 *  - A word on the way: when the followed errand is far off and another errand's next step is a talk
 *    with someone a few steps away, the line names that talk for now, then goes back. The followed
 *    errand does not change. Critic round 45 was sent 636 u back to Nana while Gus, 28 u behind, only
 *    wanted to hear that his bell carried.
 *  - No other errand is ever named over the tracked one. The others wait in the journal.
 *
 * The earlier complaint still holds (six "go to X" lines read as homework), so it is one line for one
 * errand. With no errand live at all, unexplored ground is named only when it is near (core/guide/
 * nextStep.ts `worthShowing`).
 *
 * "Moved on" is tracked per step, across every live errand. Steps already live when the run loads are
 * not news, so a resumed save starts on the picked errand, else the nearest.
 */

import type { GameState, Vec2 } from '../../core/contracts';
import type { GuideContent, GuideStep } from '../../core/guide/nextStep';
import { nextStepFor, nextStepOf, place, worthShowing } from '../../core/guide/nextStep';
import { ACTIVITIES } from '../../data/activities';

/** The save flag that remembers the player's pick: `track:<questId>`. At most one is set. */
const PIN = 'track:';
/** The pick that means "the story, no errand". */
const STORY = '@story';
/**
 * A thing to try followed from the journal, `try:<activityId>`, as an errand is: critic round 77 read
 * "High Tarn, 36 u west" on the Quests page and had nothing to follow it by.
 */
export const TRY = 'try:';

/** The activity a `try:` pick names, while Pip has not done it yet. */
function tryOf(id: string, s: GameState): (typeof ACTIVITIES)[number] | null {
  if (!id.startsWith(TRY)) return null;
  const def = ACTIVITIES.find((a) => a.id === id.slice(TRY.length));
  return def && (s.counters[`activity:${def.id}`] ?? 0) === 0 ? def : null;
}
/** The followed errand is this far off or more before a word on the way may stand in for it. */
const FAR_OFF = 300;
/** A talk this close takes the line as a word on the way; it keeps it until Pip is WORD_KEEP away. */
const WORD_NEAR = 40;
const WORD_KEEP = 60;

export interface ErrandLine {
  /** The step to print, or null for no line. Moves the tracking on; call once a frame. */
  pick(s: GameState, from: Vec2): GuideStep | null;
  /** The title of the errand whose talk the line names on the way, standing in for the followed one; else null. */
  onTheWay(): string | null;
  /** What the last `pick` returned: for a reader (the map) that must not move the tracking. */
  current(): GuideStep | null;
  /** The errand being followed, picked or not, or the story's quest when the story is picked; null when none is. */
  trackedId(): string | null;
  /**
   * The title of the errand the line moved to by itself in the last `pick` (one finished, another moved
   * on), else null. Not set when the player picked.
   */
  switched(): string | null;
  /**
   * Every other live errand's next step that has a place, nearest first. Critic round 7 carried five
   * errands and could only see the one being followed: these are the marks and the "nearby" lines for
   * the rest. Reading them moves nothing.
   */
  others(s: GameState, from: Vec2): GuideStep[];
  /** One errand's next step from `from`, tracked or not; null when it has none. For the journal. */
  stepFor(id: string, s: GameState, from: Vec2): GuideStep | null;
  /** The player picks `id` to follow. Picking the one already picked lets it go. */
  track(s: GameState, id: string): void;
}

/**
 * One line per guide table, shared by the HUD, the map and the journal, so the compass mark, the world
 * gem, the map's errand pin and the journal's mark always name the same step.
 */
const lines = new WeakMap<GuideContent, ErrandLine>();
export function errandLineFor(guide: GuideContent): ErrandLine {
  let line = lines.get(guide);
  if (!line) {
    line = createErrandLine(guide);
    lines.set(guide, line);
  }
  return line;
}

/** The errand the save says the player picked, if any. */
function pinnedIn(s: GameState): string | null {
  for (const key in s.flags) if (key.startsWith(PIN) && s.flags[key] === true) return key.slice(PIN.length);
  return null;
}

function unpin(s: GameState): void {
  for (const key in s.flags) if (key.startsWith(PIN)) delete s.flags[key];
}

export function createErrandLine(guide: GuideContent): ErrandLine {
  const seen = new Set<string>();
  /** A one-quest view of the table per errand, built once, so a frame allocates nothing. */
  const single = new Map<string, GuideContent>();
  let seeded = false;
  let tracked: string | null = null;
  let pinned = false;
  /** The player picked the story: no errand line until they pick one or take a new one on. */
  let story = false;
  let lastState: GameState | null = null;
  let switchedTo: string | null = null;
  let last: GuideStep | null = null;
  /** The errand whose talk stands in on the way (WORD_NEAR), or null. */
  let word: string | null = null;

  const storyQuest = (s: GameState): string | null =>
    guide.quests.find((q) => q.main === true && nextStepOf(q, s) !== null)?.id ?? null;

  const live = (id: string, s: GameState): boolean => {
    if (id.startsWith(TRY)) return tryOf(id, s) !== null;
    const def = guide.quests.find((q) => q.id === id);
    return def !== undefined && def.main !== true && nextStepOf(def, s) !== null;
  };

  const stepOf = (id: string, s: GameState, from: Vec2): GuideStep | null => {
    const act = tryOf(id, s);
    if (act) {
      const what = act.what ? `: ${act.what.charAt(0).toUpperCase()}${act.what.slice(1)}` : '';
      return { kind: 'quest', questId: id, questTitle: act.name, stepIndex: 0, stepText: `${act.name}${what}.`, ...place(from, act).placed };
    }
    if (id.startsWith(TRY)) return null;
    const def = guide.quests.find((q) => q.id === id);
    if (!def || !nextStepOf(def, s)) return null;
    let only = single.get(id);
    if (!only) {
      only = { ...guide, quests: [def] };
      single.set(id, only);
    }
    return nextStepFor(s, from, only, 'side');
  };

  /** The nearest other errand whose next step is a talk within reach; the one already named holds to WORD_KEEP. */
  const wordOnTheWay = (s: GameState, from: Vec2): string | null => {
    let best: string | null = null;
    let bestAway = Infinity;
    for (const def of guide.quests) {
      if (def.main === true || def.id === tracked) continue;
      const now = nextStepOf(def, s);
      if (!now || now.step.when.kind !== 'talked') continue;
      const away = stepOf(def.id, s, from)?.distance ?? null;
      if (away === null || away > (def.id === word ? WORD_KEEP : WORD_NEAR)) continue;
      if (away < bestAway) {
        best = def.id;
        bestAway = away;
      }
    }
    return best;
  };

  return {
    pick(s, from): GuideStep | null {
      lastState = s;
      const was = tracked;
      switchedTo = null;
      if (!seeded) {
        const saved = pinnedIn(s);
        if (saved === STORY) story = true;
        else if (saved !== null && live(saved, s)) {
          tracked = saved;
          pinned = true;
        }
      }
      // A followed thing to try is let go once it has been done.
      if (tracked !== null && tracked.startsWith(TRY) && !live(tracked, s)) {
        tracked = null;
        if (pinned) unpin(s);
        pinned = false;
      }
      for (const def of guide.quests) {
        if (def.main === true) continue;
        const now = nextStepOf(def, s);
        if (!now) {
          if (tracked === def.id) {
            tracked = null;
            if (pinned) unpin(s);
            pinned = false;
          }
          continue;
        }
        const key = `${def.id}:${now.index}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (!seeded) continue;
        // Handed over (nothing of it seen before), or moved on by something Pip chose to do: this is the
        // one being worked on, unless the player picked another. Taking one on ends a story pick.
        const handed = ![...seen].some((k) => k !== key && k.startsWith(`${def.id}:`));
        const by = def.steps[now.index - 1]?.when.kind;
        const chosen = handed || by === 'talked' || by === 'activity';
        if (handed && story) {
          story = false;
          unpin(s);
        }
        if (chosen && !pinned && !story) tracked = def.id;
      }
      seeded = true;

      if (story) {
        last = null;
        return last;
      }
      const nearest = nextStepFor(s, from, guide, 'side');
      if (tracked === null && nearest?.kind === 'quest') tracked = nearest.questId;
      if (was !== null && tracked !== null && tracked !== was) {
        switchedTo = guide.quests.find((q) => q.id === tracked)?.title ?? null;
      }
      const mine = tracked === null ? null : stepOf(tracked, s, from);
      word = mine && !pinned && (mine.distance ?? 0) >= FAR_OFF ? wordOnTheWay(s, from) : null;
      const aside = word === null ? null : stepOf(word, s, from);
      if (aside) last = aside;
      else if (mine) last = mine;
      else last = worthShowing(nearest, Number.POSITIVE_INFINITY) ? nearest : null;
      return last;
    },
    onTheWay: () => (word === null ? null : guide.quests.find((q) => q.id === word)?.title ?? null),
    current: () => last,
    trackedId: () => (story && lastState ? storyQuest(lastState) : tracked),
    switched: () => switchedTo,
    others(s, from): GuideStep[] {
      const out: GuideStep[] = [];
      for (const def of guide.quests) {
        if (def.main === true || def.id === tracked || def.id === word) continue;
        const step = stepOf(def.id, s, from);
        if (step?.target && step.distance !== null) out.push(step);
      }
      return out.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
    },
    stepFor: (id, s, from) => stepOf(id, s, from),
    track(s, id): void {
      lastState = s;
      const main = guide.quests.find((q) => q.id === id)?.main === true;
      if (main && nextStepOf(guide.quests.find((q) => q.id === id)!, s) !== null) {
        unpin(s);
        pinned = false;
        if (story) {
          story = false;
          return;
        }
        story = true;
        tracked = null;
        s.flags[`${PIN}${STORY}`] = true;
        return;
      }
      if (!live(id, s)) return;
      unpin(s);
      story = false;
      if (pinned && tracked === id) {
        pinned = false;
        return;
      }
      s.flags[`${PIN}${id}`] = true;
      tracked = id;
      pinned = true;
    },
  };
}
