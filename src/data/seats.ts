/**
 * Somewhere to sit on the way up.
 *
 * Critic round 72 called the climb from the springs to the ridge foot "mostly empty snow": there was a
 * pond and a bothy to look at and nothing to do. A bench by the pond, facing back across it to the steam
 * over Kettle Springs, is a place to stop. Sitting fills Pip's breath, and Pip has a thought about the
 * view, which follows where the story has got to.
 *
 * The bench itself is drawn in world/wayScenes.ts; this is where it is and what Pip thinks there.
 * Pip's own words are lower case, as everywhere else Pip speaks (data/dialogue.ts).
 */

import type { GameState, Vec2 } from '../core/contracts';

export interface SeatDef {
  id: string;
  /** The middle of the seat, where Pip perches. */
  pos: Vec2;
  /** The way the bench faces, the way Pip looks while sitting: forward is (sin yaw, cos yaw). */
  yaw: number;
  /** Height of the seat above the snow; Pip is drawn perched this high. */
  height: number;
  /** What Pip thinks sitting here, from what Pip has done so far. */
  thought(s: GameState): readonly string[];
}

const done = (s: GameState, id: string): boolean => s.quests[id]?.status === 'complete';

/** Across the pond to the springs, which lie south-west, down the way Pip came. */
const POND_VIEW = Math.atan2(-22 - 116, 31 + 96);

export const SEATS: readonly SeatDef[] = [
  {
    id: 'pond-bench',
    pos: { x: 116, z: -96 },
    yaw: POND_VIEW,
    height: 0.5,
    thought(s) {
      if (done(s, 'nana-home')) {
        return [
          "it's quiet up here now. the steam's still going over the springs.",
          "somewhere down there, past all of it, nana will have the kettle on.",
        ];
      }
      if (done(s, 'the-mast')) {
        return [
          'every post below me is lit, all the way down past the springs.',
          "i can follow them home from here. there's no hurry, though. the bench is nice.",
        ];
      }
      if (done(s, 'the-climb')) {
        return [
          "the sky's starting to turn green over the peak.",
          "edda's up there by the radio, waiting for it. i'd better not sit too long.",
        ];
      }
      if (s.quests['the-climb']?.status === 'active') {
        return [
          'you can see the steam over kettle springs from here, standing up in the cold like chimney smoke.',
          "i've come a long way already. the ridge is next, and then edda's mast, right at the top.",
        ];
      }
      return [
        'the steam over the springs looks like the kettle at nana\'s, just as it starts to sing.',
        "edda's mast is up there somewhere behind me. it's a long way up, so it's good to sit down first.",
      ];
    },
  },
];
