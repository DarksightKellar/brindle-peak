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

export const DIALOGUE_FILLS: Readonly<Record<string, (s: GameState) => string[]>> = {
  // In the card's order, so the threads between two people come first.
  'nana-heard': (s) =>
    VALLEY_LINES.map(([quest]) => quest)
      .filter((quest) => s.quests[quest]?.status === 'complete' && NANA_HEARD[quest] !== undefined)
      .slice(0, NANA_HEARD_MAX)
      .map((quest) => NANA_HEARD[quest] as string),
  // Her line about the posts says who lit them on this run: she used to say she watched Pip light
  // them all the way down, on a run where Pip had lit four of twelve and the rest lit themselves.
  'nana-posts': (s) => {
    const lit = Object.keys(s.lanterns).length;
    return [lit >= POSTS ? NANA_POSTS.all : lit > 0 ? NANA_POSTS.some : NANA_POSTS.none];
  },
};
