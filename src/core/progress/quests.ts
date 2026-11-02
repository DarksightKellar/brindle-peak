/**
 * Quest state machine.
 *
 * `QuestStatus` is derived, not stored twice: a quest with unmet `requires` is 'locked', with met
 * requires and no progress entry is 'available', a started quest is 'active', and 'complete' is
 * terminal. Only the started/complete facts live in the progress map, and `GameState.quests` is their
 * persisted copy: `advance` mirrors progress into it and adopts entries it does not know, which is how
 * a freshly constructed engine resumes a loaded save.
 *
 * A talk or visit step is baselined the moment it becomes current and passes only when its count rises
 * above that. Without this, a quest accepted after the player had already walked through its zone or
 * chatted to its NPC completed on sight. An activity or place step is the other way round: done once,
 * ever, is done (`doneOnce`). Orla asked for a snowman after the visit to Skiff, and one built earlier
 * had to be built again. A step marked `fresh` is the exception, for an errand that means "now".
 *
 * When a talk passes a step and the steps after it are already done, a following step with the same
 * person passes in that same talk: a woodpile stacked before Bram asked is paid for at once, rather
 * than Bram asking for it and then needing a second word to notice it is there.
 *
 * Rewards are applied here, once, at the moment a quest flips to 'complete'; step gifts at the moment
 * a step passes. A quest with `then` starts its successor in the same call, which is how the main story
 * moves on without the player having to find someone to offer the next chapter.
 */

import type { GameState, QuestDef, QuestProgress, QuestStatus, QuestStep } from '../contracts';
import { allSatisfied, evaluate, measure } from './conditions';

export interface StepPassed {
  quest: string;
  index: number;
  step: QuestStep;
}

export interface AdvanceResult {
  completed: string[];
  passed: StepPassed[];
  /** Quests started by a predecessor's `then`. */
  started: string[];
}

export interface QuestEngine {
  status(id: string): QuestStatus;
  accept(id: string, s: GameState): boolean;
  /** Idempotent: a second call with no new facts passes nothing. */
  advance(s: GameState): AdvanceResult;
  activeIds(): string[];
}

const KNOWN_STATUSES: readonly QuestStatus[] = ['locked', 'available', 'active', 'complete'];

const isStatus = (v: unknown): v is QuestStatus =>
  typeof v === 'string' && (KNOWN_STATUSES as readonly string[]).includes(v);

/** An activity or place step is done by having done it once, at any time (see `QuestStep.fresh`). */
export function doneOnce(step: QuestStep): boolean {
  return (step.when.kind === 'activity' || step.when.kind === 'reached') && step.fresh !== true;
}

export function createQuestEngine(defs: readonly QuestDef[]): QuestEngine {
  const byId = new Map<string, QuestDef>();
  for (const d of defs) byId.set(d.id, d);
  // The story is advanced first, so it wins a conversation an errand also waits on.
  const ordered = [...defs.filter((d) => d.main), ...defs.filter((d) => !d.main)];

  const progress = new Map<string, QuestProgress>();
  let lastState: GameState | null = null;

  const requiresMet = (def: QuestDef, s: GameState | null): boolean => {
    const req = def.requires;
    if (!req || req.length === 0) return true;
    if (!s) return false;
    return allSatisfied(req, s);
  };

  const status = (id: string): QuestStatus => {
    const def = byId.get(id);
    if (!def) return 'locked';
    const p = progress.get(id);
    if (p) return p.status;
    return requiresMet(def, lastState) ? 'available' : 'locked';
  };

  /** Baseline the step `p` now points at, so only what happens from here on can pass it. */
  const baseline = (def: QuestDef, p: QuestProgress, s: GameState): void => {
    const step = def.steps[p.step];
    p.base = step && !doneOnce(step) ? measure(step.when, s) ?? undefined : undefined;
  };

  const start = (def: QuestDef, s: GameState): void => {
    const p: QuestProgress = { status: 'active', step: 0 };
    baseline(def, p, s);
    progress.set(def.id, p);
  };

  /** The quest's own thing to carry, handed over as it is taken on (Tuck's rope, Nana's camera). */
  const handOver = (def: QuestDef, s: GameState): void => {
    if (def.gives) s.items[def.gives.item] = (s.items[def.gives.item] ?? 0) + (def.gives.n ?? 1);
  };

  const accept = (id: string, s: GameState): boolean => {
    lastState = s;
    const def = byId.get(id);
    if (!def || status(id) !== 'available') return false;
    start(def, s);
    handOver(def, s);
    sync(s);
    return true;
  };

  const adopt = (s: GameState): void => {
    for (const id of Object.keys(s.quests)) {
      if (progress.has(id) || !byId.has(id)) continue;
      const saved = s.quests[id];
      if (!saved || !isStatus(saved.status)) continue;
      // 'locked' and 'available' are derived from `requires`, never facts; only adopt real progress.
      if (saved.status !== 'active' && saved.status !== 'complete') continue;
      const step = Number.isFinite(saved.step) ? Math.max(0, Math.floor(saved.step)) : 0;
      const base = Number.isFinite(saved.base) ? saved.base : undefined;
      progress.set(id, { status: saved.status, step, base });
    }
  };

  const sync = (s: GameState): void => {
    for (const [id, p] of progress) {
      if (p.status !== 'active' && p.status !== 'complete') continue;
      s.quests[id] = p.base === undefined ? { status: p.status, step: p.step } : { status: p.status, step: p.step, base: p.base };
    }
  };

  const grantReward = (def: QuestDef, s: GameState): void => {
    const r = def.reward;
    s.feathers += r.feathers ?? 0;
    s.bells += r.bells ?? 0;
    if (r.item !== undefined) {
      s.items[r.item] = (s.items[r.item] ?? 0) + (r.itemCount ?? 1);
    }
    if (r.ability !== undefined) {
      s.abilities[r.ability] = true;
    }
    if (r.achievement !== undefined && s.achievements[r.achievement] === undefined) {
      s.achievements[r.achievement] = Object.keys(s.achievements).length;
    }
  };

  /** Has the current step happened since it began (or ever, for an activity or a place)? */
  const stepDone = (step: QuestStep, p: QuestProgress, s: GameState): boolean => {
    const now = measure(step.when, s);
    if (now === null || doneOnce(step)) return evaluate(step.when, s);
    // A save from before baselining, or a step reached on load: start counting from here.
    if (p.base === undefined) {
      p.base = now;
      return false;
    }
    return now > p.base;
  };

  const advance = (s: GameState): AdvanceResult => {
    lastState = s;
    adopt(s);
    const out: AdvanceResult = { completed: [], passed: [], started: [] };
    // One conversation answers one question: if the story and an errand both wait on Bram, the talk
    // passes the story's step and the errand's waits for the next talk, so each gets its own line.
    const answered = new Set<string>();
    for (const def of ordered) {
      const p = progress.get(def.id);
      if (!p || p.status !== 'active') continue;
      // Who this quest's last passed talk was with, and whether an already-done step passed after it.
      let spoke: string | null = null;
      let bridged = false;
      while (p.step < def.steps.length) {
        const step = def.steps[p.step];
        if (!step) break;
        const talk = step.when.kind === 'talked' ? step.when.id : null;
        const carried = talk !== null && talk === spoke && bridged;
        if (talk !== null && answered.has(talk) && !carried) {
          // The talk was spent on the other question, so this step starts counting again from here.
          // Left uncounted, the next event of any kind (a bell, the quest:completed this very talk
          // queued) passed it with no conversation: Pell's letter went to Nana in silence.
          baseline(def, p, s);
          break;
        }
        if (!carried && !stepDone(step, p, s)) break;
        if (talk !== null) answered.add(talk);
        spoke = talk ?? spoke;
        bridged = talk === null;
        if (step.gives) s.items[step.gives.item] = (s.items[step.gives.item] ?? 0) + (step.gives.n ?? 1);
        out.passed.push({ quest: def.id, index: p.step, step });
        p.step += 1;
        // The next step starts counting now, so the event that passed this step cannot pass it too.
        baseline(def, p, s);
      }
      if (p.step >= def.steps.length) {
        p.status = 'complete';
        p.base = undefined;
        grantReward(def, s);
        out.completed.push(def.id);
        const next = def.then ? byId.get(def.then) : undefined;
        if (next && !progress.has(next.id)) {
          start(next, s);
          out.started.push(next.id);
        }
      }
    }
    sync(s);
    return out;
  };

  const activeIds = (): string[] =>
    defs.filter((d) => progress.get(d.id)?.status === 'active').map((d) => d.id);

  return { status, accept, advance, activeIds };
}
