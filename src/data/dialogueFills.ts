/**
 * Run-time line sources for dialogue nodes that name one in `fill` (see DialogueNode.fill).
 *
 * The engine picks conversations by quest step, not by what else the player did, so a homecoming
 * that wants to mention the errands Pip ran draws the lines from here. The words are the writer's
 * (src/data/endingLines.ts); this file only decides which of them a run hears.
 */

import type { GameState } from '../core/contracts';
import { NANA_HEARD, NANA_POSTS, VALLEY_LINES } from './endingLines';
import { PICKUPS } from './pickups';

/** Nana says "just one, tonight": she adds at most this many things she has heard. */
const NANA_HEARD_MAX = 2;

/** Every trail post. `state.lanterns` holds only the ones Pip lit; the valley lights the rest. */
const POSTS = PICKUPS.filter((p) => p.kind === 'lantern').length;

/**
 * The roll-call's voices, by node, and who speaks each. A voice is heard only from someone Pip has met:
 * critic round 5 heard Orla, Skiff, Ivy, Wren and Gus answer as old friends on a run that had met none of
 * them. Bram is not here: the story runs through his woodstore, so every run has met him.
 */
export const RADIO_VOICES: Readonly<Record<string, string>> = {
  'edda-line-orla': 'orla',
  'edda-line-skiff': 'skiff',
  'edda-line-ivy': 'ivy',
  'edda-line-wren': 'wren',
  'edda-line-gus': 'gus',
};

/** How Edda names a voice that stayed off the air, and where to find them. */
const RADIO_WHERE: Readonly<Record<string, string>> = {
  orla: 'Orla at the hamlet bakery',
  skiff: 'Skiff out on the Frozen Reach',
  ivy: 'Ivy at the springs',
  wren: 'Wren in the pines',
  gus: 'Gus at the bell shop',
};

/** Nodes a run passes over, by id: a roll-call voice Pip has never met (see RADIO_VOICES). */
export const DIALOGUE_SKIPS: Readonly<Record<string, (s: GameState) => boolean>> = Object.fromEntries(
  Object.entries(RADIO_VOICES).map(([node, npc]) => [node, (s: GameState) => s.talked[npc] !== true]),
);

export const DIALOGUE_FILLS: Readonly<Record<string, (s: GameState) => string[]>> = {
  // Edda signs off knowing who stayed quiet because Pip has not met them, and says where they are: the
  // roll-call ends by pointing at the valley still to see.
  'radio-unmet': (s) => {
    const unmet = Object.values(RADIO_VOICES).filter((npc) => s.talked[npc] !== true).map((npc) => RADIO_WHERE[npc]);
    if (unmet.length === 0) return [];
    const list = unmet.length === 1 ? unmet[0] : `${unmet.slice(0, -1).join(', ')} and ${unmet[unmet.length - 1]}`;
    return [`There's more of the valley than came on tonight. ${list[0].toUpperCase()}${list.slice(1)}, for a start.`, "Go and say hello. They'll want to meet the bird who fixed the line."];
  },
  // Orla asks for a snowman with the flour. Critic round 15 had built one 20 u from her bakery and was
  // still told not to forget it: she has seen it, or reminds Pip, whichever is true. Said first.
  'orla-snowman': (s) =>
    (s.counters['activity:hamlet-snowman'] ?? 0) > 0
      ? ["Was that your snowman on the green? It leans. I like it."]
      : ["Still no snowman on the green, I see. Somebody ought to enjoy the snow."],
  // In the card's order, so the threads between two people come first.
  'nana-heard': (s) =>
    VALLEY_LINES.map(([quest]) => quest)
      .filter((quest) => s.quests[quest]?.status === 'complete' && NANA_HEARD[quest] !== undefined)
      .slice(0, NANA_HEARD_MAX)
      .map((quest) => NANA_HEARD[quest] as string),
  // Her line about the posts says who lit them on this run: she used to say she watched Pip light
  // them all the way down, on a run where Pip had lit four of twelve and the rest lit themselves.
  // Ivy's roll-call line says how the pools are on this run: "steaming" sat oddly beside her errand
  // about them going cold when the dam was never mended.
  'ivy-radio': (s) => [
    s.quests['ivy-springs']?.status === 'complete'
      ? "Kettle Springs here. Dam's whole again, and the pools are steaming."
      : "Kettle Springs here. Pools are cooling, but there's warm enough yet.",
  ],
  'nana-posts': (s) => {
    const lit = Object.keys(s.lanterns).length;
    return [lit >= POSTS ? NANA_POSTS.all : lit > 0 ? NANA_POSTS.some : NANA_POSTS.none];
  },
};
