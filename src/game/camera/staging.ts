/**
 * Who faces whom: villagers turn to Pip, and in a conversation both turn a little toward the lens.
 *
 * Villagers stood however the world placed them (`NpcDef.yaw`), so the critic met Bram, Ilsa and Edda
 * from behind, and talked to their backs. Now:
 *  - a villager Pip walks up to (NOTICE) turns to face the bird, and turns back to what they were
 *    doing once Pip leaves;
 *  - in a conversation the speaker faces Pip, and both cheat toward the camera the way actors do on a
 *    stage (CHEAT): the two-shot stands nearly square to the pair (shot.ts), so facing straight at each
 *    other would be two profiles. Turned a little toward the lens, both faces read three-quarter on;
 *  - in the radio finale's staged shot everyone keeps their place: Edda faces her set.
 * Turns ease (TURN, BACK); reduce-motion takes them at once.
 */

import type { NpcDef, PlayerState } from '../../core/contracts';
import { shortestTurn } from './shot';

/** A villager's body in the scene: only its turn is touched. */
export interface Body {
  rotation: { y: number };
}

export interface Staging {
  /**
   * @param speaker who Pip is talking with (standing near), or null.
   * @param shotYaw the two-shot's camera heading, or null while it has none.
   * @param still the staged finale: everyone keeps their place.
   */
  update(dt: number, speaker: string | null, shotYaw: number | null, still: boolean, reduced: boolean): void;
}

/** Nearer than this and a villager turns to look at Pip. */
const NOTICE = 5;
/** How far each turns from facing the other toward the camera. */
const CHEAT_PIP = (40 * Math.PI) / 180;
const CHEAT = (30 * Math.PI) / 180;
/** Turning to Pip (most of the way in about half a second), and turning back. */
const TURN = 0.18;
const BACK = 0.45;

/** `from` turned by `by` toward the direction `to`. */
const toward = (from: number, to: number, by: number): number => from + Math.sign(shortestTurn(from, to)) * by;

export function createStaging(d: {
  bodies: ReadonlyMap<string, Body>;
  npcs: readonly NpcDef[];
  player: PlayerState;
}): Staging {
  return {
    update(dt, speaker, shotYaw, still, reduced): void {
      const pip = d.player.pos;
      const ease = (tau: number): number => (reduced ? 1 : 1 - Math.exp(-Math.max(0, dt) / tau));
      for (const npc of d.npcs) {
        const body = d.bodies.get(npc.id);
        if (!body) continue;
        const line = Math.atan2(pip.x - npc.pos.x, pip.z - npc.pos.z);
        const near = Math.hypot(pip.x - npc.pos.x, pip.z - npc.pos.z) < NOTICE;
        let want = npc.yaw;
        if (!still && npc.id === speaker) {
          // Where the camera stands, seen from the pair: behind its heading.
          want = shotYaw === null ? line : toward(line, shotYaw + Math.PI, CHEAT);
          const pipWant = shotYaw === null ? line + Math.PI : toward(line + Math.PI, shotYaw + Math.PI, CHEAT_PIP);
          d.player.facing += shortestTurn(d.player.facing, pipWant) * ease(TURN);
        } else if (!still && speaker === null && near) {
          want = line;
        }
        const turning = want !== npc.yaw;
        body.rotation.y += shortestTurn(body.rotation.y, want) * ease(turning ? TURN : BACK);
      }
    },
  };
}
