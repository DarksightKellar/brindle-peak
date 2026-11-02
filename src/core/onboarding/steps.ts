/**
 * The first five minutes, as data (docs/ONBOARDING.md).
 *
 * One thing at a time, taught by doing, always paid for. Each beat is one physical act with one
 * prompt, one completion condition and one payout. The conditions live in `machine.ts`; this file holds
 * only the authored script and the shape of what the machine is allowed to see, so the copy can be
 * read and changed without touching sequencing logic.
 *
 * Pure by rule (`src/core/**`): no `three`, no DOM, no clock. A `Snapshot` is the entire world as far
 * as the tutorial is concerned; nothing here can reach past it.
 *
 * The order is walk, talk, map, jump, flap, sprint, journal. Talk is second on purpose: beat 1
 * completes at 12 u and Nana Quill stands 13.9 u from spawn, so the player arrives at her a moment
 * after walking completes. With "look" in that slot they would reach Nana with a look prompt up, take
 * her quest through the E pill, and then be asked to talk to her again.
 */

import type { RewardTier } from '../contracts';

export type BeatId = 'walk' | 'talk' | 'map' | 'jump' | 'flap' | 'sprint' | 'journal';

/**
 * What a finished beat hands back. No bells: the bell is a 60-item collectible and spending one on the
 * first twelve units would corrupt the currency at first contact. The receipt is the world, the meter
 * and the line.
 */
export interface BeatPayout {
  /** One line of acknowledgement, or null when the reward is the world itself. */
  readonly toast: string | null;
  /** Glyph name from `ui/icons.ts`. */
  readonly icon: string;
  readonly tier: RewardTier;
  /** True when the stamina arc should visibly pulse: "that cost breath". */
  readonly breath: boolean;
}

export interface TutorialBeat {
  readonly id: BeatId;
  /**
   * The line exactly as authored, including the key names. This is the single source of the copy; the
   * prompt bar derives its keycaps from `keys` and its words from the remainder.
   */
  readonly prompt: string;
  /** Key names the prompt teaches, in order. The bar draws one cap per entry. */
  readonly keys: readonly string[];
  readonly payout: BeatPayout;
  /**
   * Seconds the prompt may sit on screen unanswered before it is quietly dropped, unpaid. Absent means
   * it waits: walking and meeting Nana are the story's first steps, not tips. A tip the player keeps
   * ignoring is one they do not need, and "M — open the map" was still up at the ending card.
   */
  readonly patience?: number;
  /**
   * When the prompt applies. Absent means always. A tip shown out of its moment is noise: "Space again
   * in the air" was up while Pip stood still at Bram's woodpile, and "E — talk to Nana" from 13 u away
   * with Nana behind the camera. Out of context the prompt is hidden, but its patience still runs, so a
   * tip whose moment never comes lapses quietly instead of holding up the ones after it.
   */
  readonly context?: BeatContextKind;
}

/** `airborne`: Pip is off the ground. `moving`: walking on the ground. `openerInReach`: E would talk to Nana. */
export type BeatContextKind = 'airborne' | 'moving' | 'openerInReach';

/** What the glue knows about this frame, for `beatApplies`. Built by `game/session/onboarding.ts`. */
export interface BeatContext {
  airborne: boolean;
  moving: boolean;
  /** Whoever the story opens with is within talking reach, so E would start the conversation. */
  openerInReach: boolean;
}

/** Should `beat`'s prompt be on screen in this context? */
export function beatApplies(beat: TutorialBeat, ctx: BeatContext): boolean {
  if (beat.context === 'airborne') return ctx.airborne;
  if (beat.context === 'moving') return ctx.moving && !ctx.airborne;
  if (beat.context === 'openerInReach') return ctx.openerInReach;
  return true;
}

/** How long an optional tip waits, in seconds of it actually being on screen. */
export const TIP_PATIENCE = 30;

/** Beat `walk`: horizontal distance from spawn that counts as "you walked". */
export const WALK_DISTANCE = 12;
/** Beat `sprint`: continuous sprint hold, seconds. */
export const SPRINT_SECONDS = 0.6;

/**
 * Everything the machine may look at. Built by `game/session/onboarding.ts` once per frame; the machine
 * never reads the player, the camera or the world itself.
 *
 * Completion is level-triggered, so these are latched totals rather than per-frame edges: a player who
 * has already talked to Nana, or already looked around, must never be asked to do it again when the
 * script reaches that beat.
 */
export interface Snapshot {
  /** Horizontal distance travelled from spawn, world units. Cumulative. */
  travelled: number;
  /** The map page has been opened at least once. */
  mapOpenedEver: boolean;
  /** Sprint has been held for at least a frame right now. */
  sprintHeld: boolean;
  /** Any dialogue has been opened at least once. */
  dialogueOpenedEver: boolean;
  /** The player has been off the ground at least once since spawning. */
  leftGroundEver: boolean;
  /** At least one flap has been spent. */
  flappedEver: boolean;
  /** The journal has been opened at least once. */
  journalOpenedEver: boolean;
}

const PLAIN: BeatPayout = { toast: null, icon: 'snowflake', tier: 'discovery', breath: false };

/** The authored order. Each beat only becomes current when the one before it is done. */
export const BEATS: readonly TutorialBeat[] = [
  {
    id: 'walk',
    prompt: 'W A S D — walk toward the cabin',
    keys: ['W', 'A', 'S', 'D'],
    // Not "A bell for the path": walking pays no bell, so the line must not promise one.
    payout: { toast: "You're on your way", icon: 'mountain', tier: 'discovery', breath: false },
  },
  {
    id: 'talk',
    prompt: 'E — talk to Nana at the cabin door',
    keys: ['E'],
    payout: { toast: "Quest accepted — it's in your journal", icon: 'quest', tier: 'discovery', breath: false },
    context: 'openerInReach',
  },
  {
    id: 'map',
    /*
     * The map existed and nothing named it. Its key was printed only inside the journal's own footer, so
     * a player had to already be in the journal to find out how to open the map — which is why it was
     * reported as being thrown back in their face. The beat teaches the key, and it is the only beat
     * that points at the answer to "I don't know what to do".
     */
    prompt: 'M — open the map to see where you are',
    keys: ['M'],
    payout: PLAIN,
    patience: TIP_PATIENCE,
  },
  {
    id: 'jump',
    prompt: 'Space — jump',
    keys: ['Space'],
    payout: { toast: 'Up you go', icon: 'star', tier: 'discovery', breath: false },
    patience: TIP_PATIENCE,
  },
  {
    id: 'flap',
    prompt: 'Space again in the air — flap to gain height',
    keys: ['Space'],
    payout: { toast: 'Each flap spends breath', icon: 'feather', tier: 'discovery', breath: true },
    patience: TIP_PATIENCE,
    context: 'airborne',
  },
  {
    id: 'sprint',
    prompt: 'Hold Shift — run',
    keys: ['Shift'],
    payout: { toast: 'Sprint spends your breath', icon: 'motion', tier: 'discovery', breath: true },
    patience: TIP_PATIENCE,
    context: 'moving',
  },
  {
    id: 'journal',
    prompt: 'Tab — open your journal',
    keys: ['Tab'],
    payout: { toast: 'Everything you find goes in here', icon: 'book', tier: 'discovery', breath: false },
    patience: TIP_PATIENCE,
  },
];

export function beatById(id: string | null): TutorialBeat | null {
  if (id === null) return null;
  return BEATS.find((b) => b.id === id) ?? null;
}

/**
 * Split an authored line into the pieces the bar draws: the key group as big caps, everything else as
 * words. The keys are replaced *in place*, so a prompt whose key does not start the sentence still
 * reads correctly — `Hold Shift — run` becomes `Hold [Shift] — run` rather than a cap followed by the
 * word "Shift" a second time. A prompt with no keys is a single text segment.
 */
export type PromptSegment =
  | { readonly kind: 'keys'; readonly keys: readonly string[] }
  | { readonly kind: 'text'; readonly text: string };

export function promptSegments(beat: TutorialBeat): readonly PromptSegment[] {
  const { prompt, keys } = beat;
  const group = keys.join(' ');
  const at = group === '' ? -1 : prompt.indexOf(group);
  if (at < 0) return [{ kind: 'text', text: prompt.trim() }];

  const out: PromptSegment[] = [];
  const before = prompt.slice(0, at).trim();
  const after = prompt.slice(at + group.length).trim();
  if (before !== '') out.push({ kind: 'text', text: before });
  out.push({ kind: 'keys', keys });
  if (after !== '') out.push({ kind: 'text', text: after });
  return out;
}
