/**
 * The map's marks for things to do, and for the errand being worked on (journalMap.ts draws them).
 *
 * Critic round 3: nothing said where the activities were. A start was found by walking into its prompt,
 * and several have nothing standing in the world. Each activity in a zone Pip has walked now has a small
 * glyph for its kind on the map: warm while it is still to do, quiet once done. Unwalked ground keeps
 * its secrets, so the map fills in as the valley is explored.
 *
 * The tracked errand (errandLine.ts) gets the story pin's smaller, dimmer sibling, the same mark that
 * hangs under the compass strip, so "the warm pool" is a place on the page and not only a sentence.
 *
 * Strings only, built at paint time like the rest of the map.
 */

import type { GameState } from '../../core/contracts';
import { evaluate } from '../../core/progress/conditions';
import type { GuideContent, GuideStep } from '../../core/guide/nextStep';
import { esc } from './html';

type Px = (n: number) => number;

/** One glyph per activity kind, about ten map pixels across, drawn around (0, 0). */
export const KIND_GLYPH: Readonly<Record<string, string>> = {
  fish: 'M-5 0 C-2 -4 2 -4 4 0 C2 4 -2 4 -5 0 Z M4 0 L7 -3 V3 Z',
  photo: 'M-5 -3 H5 V4 H-5 Z M-2 -3 V-5 H2 V-3 M0 -0.5 A1.6 1.6 0 1 0 0 2.7 A1.6 1.6 0 1 0 0 -0.5',
  sled: 'M-6 2 H4 Q7 2 6 -1 M-4 2 V-1 H3 V2',
  skate: 'M-5 3 H5 M-4 3 V-4 H0 L3 0 H4 V3',
  race: 'M-3 5 V-5 L5 -2.5 L-3 0',
  throw: 'M0 -5 A5 5 0 1 0 0.01 -5 M0 -2 A2 2 0 1 0 0.01 -2',
  build: 'M-5 4 H5 V0 H-5 Z M-3 0 V-4 H3 V0',
};
const FALLBACK = 'M-3 5 V-5 L5 -2.5 L-3 0';

/** A glyph for every activity in walked ground: `is-todo` until it has been done once. */
export function activityMarks(s: GameState, content: GuideContent, px: Px, py: Px): string {
  return content.activities
    .filter((a) => s.visited[a.zone] === true)
    .map((a) => {
      const done = evaluate({ kind: 'activity', id: a.id }, s);
      return `<path class="ui-map__act ${done ? 'is-done' : 'is-todo'}" data-activity="${esc(a.id)}" ` +
        `transform="translate(${px(a.pos.x)} ${py(a.pos.z)}) scale(1.4)" d="${KIND_GLYPH[a.kind ?? ''] ?? FALLBACK}"/>`;
    })
    .join('');
}

/** The errand pin: a smaller amber diamond on a short stem. */
export const SIDE_PIN = '<path class="ui-map__side-stem" d="M0 0 V-9"/><path class="ui-map__side-mark" d="M0 -15 L4 -10 L0 -5 L-4 -10 Z"/>';

/** The tracked errand's pin, or nothing when it has no place or is the story pin's target. */
export function sidePin(step: GuideStep | null, main: { x: number; z: number } | null, px: Px, py: Px): string {
  const at = step?.target ?? null;
  if (!step || !at || (main !== null && main.x === at.x && main.z === at.z)) return '';
  return `<g class="ui-map__side" data-quest="${esc(step.questId ?? '')}" data-step="${step.stepIndex ?? ''}" ` +
    `transform="translate(${px(at.x)} ${py(at.z)})">${SIDE_PIN}</g>`;
}
