/**
 * Who the camera frames each frame, who faces whom, and when the ending card may show.
 *
 * Most of the time that is the conversation two-shot or nothing. Two moments get a composed shot
 * (stage.ts) instead:
 *  - the radio finale: from the moment Edda keys the set the camera holds the wide shot of the mast
 *    under the aurora. When she signs off it stays there for a quiet beat on the sky (HOLD), then
 *    hands back to the chase camera, turned round behind Pip toward home. Cutting away on the frame the
 *    last box closed threw the player straight from the valley's answers to the back of a bird.
 *  - the homecoming: after Nana's last line, Pip and Nana together at her door under the dusk sky,
 *    held through the quiet beat (QUIET) and the card. The chase camera used to take over there and
 *    stood on the cabin roof with Nana out of frame.
 *
 * When a conversation closes the view is wherever the two-shot left it, often side-on or looking back
 * the way Pip came, so the first press of W walked away from what the conversation had just asked for.
 * A beat after it closes, or as the radio's shot ends, the chase heading settles round behind Pip
 * toward the goal the HUD compass points at (`goal`), unless that is right here.
 *
 * The ending card belongs to the homecoming (session/finale.ts). It waits until no conversation is
 * open, and then the quiet beat, long enough for the camera to ease out to the pair at the door and
 * rest there, so Nana's last line is not swallowed by the card.
 */

import type { NpcDef, PlayerState, TerrainSampler } from '../../core/contracts';
import { conversationFocus } from './conversation';
import type { CameraRig } from './rig';
import { homeStage, radioStage } from './stage';
import { createStaging, type Body } from './staging';
import { MAST_HEIGHT } from '../world/summit';

/** Every line of the radio call, from Edda keying the set to her sign-off, has this id (data/dialogue). */
const RADIO = 'edda-line-';
/** Whose set it is: the staged shot frames her with the mast. */
const OPERATOR = 'edda';
/** Whose door it is: the ending frames her with Pip. */
const HOME = 'nana';
/** Pip within this of Nana when the story ends: the ending shot is at her door, not wherever a load put Pip. */
const AT_HOME = 12;
/** After the radio falls quiet, hold on the sky this long before turning Pip toward home. */
export const HOLD = 2.5;
/** After the last conversation closes, this long before the ending card: the ease out (rig STAGE_EASE) and a rest. */
const QUIET = 2.8;
/** After a conversation closes, wait this long (the goal line updates), then settle toward the goal. */
const BEAT = 0.25;
/** A goal nearer than this is where Pip already stands: no turn. */
const HERE = 4;
/** The mast's antenna tip above its foot (world/summit.ts). */
const MAST_TIP = MAST_HEIGHT + 3.2;

export interface DirectorDeps {
  rig: Pick<CameraRig, 'setStage' | 'setFocus' | 'settle' | 'shotYaw'>;
  flow: { isOpen(): boolean; currentNode(): string | null; speaker(): string | null };
  ending: { isOpen(): boolean };
  player: PlayerState;
  npcs: readonly NpcDef[];
  /** The villagers' bodies in the scene, by id (world/assemble.ts `npcs`): turned by staging.ts. */
  bodies: ReadonlyMap<string, Body>;
  terrain: TerrainSampler;
  /** Where the radio mast stands. */
  mast: { x: number; z: number };
  /** Where the HUD compass points now (ui/hud.ts `target`), or null. */
  goal(): { x: number; z: number } | null;
}

export interface CameraDirector {
  /** The story is done: call `show` once no conversation is open, after a quiet beat. */
  finale(show: () => void): void;
  update(dt: number, reduced: boolean): void;
}

export function createCameraDirector(d: DirectorDeps): CameraDirector {
  let pending: (() => void) | null = null;
  let quiet = 0;
  let staged = false;
  /** Seconds since the radio fell quiet, while the staged shot holds. */
  let held = 0;
  let t = 0;
  let wasOpen = false;
  let since = -1;
  const operator = d.npcs.find((n) => n.id === OPERATOR);
  const nana = d.npcs.find((n) => n.id === HOME);
  const staging = createStaging({ bodies: d.bodies, npcs: d.npcs, player: d.player });
  const ground = (p: { x: number; z: number }) => ({ x: p.x, y: d.terrain.heightAt(p.x, p.z), z: p.z });
  const turnToGoal = (): void => {
    const at = d.goal();
    const dx = at ? at.x - d.player.pos.x : 0;
    const dz = at ? at.z - d.player.pos.z : 0;
    if (at && Math.hypot(dx, dz) > HERE) d.rig.settle(Math.atan2(dx, dz));
  };

  return {
    finale(show): void {
      pending = show;
      quiet = 0;
    },
    update(dt, reduced): void {
      const open = d.flow.isOpen();
      const node = open ? d.flow.currentNode() : null;
      const radio = node !== null && node.startsWith(RADIO);
      if (wasOpen && !open && !staged) since = 0;
      if (open || staged) since = -1;
      wasOpen = open;
      if (since >= 0 && (since += dt) >= BEAT) {
        since = -1;
        // Not on the porch at the end: the quiet beat before the card stays on Pip and Nana, not the next errand.
        if (!pending) turnToGoal();
      }
      if (pending) {
        quiet = open ? 0 : quiet + dt;
        if (quiet >= QUIET) {
          pending();
          pending = null;
        }
      }
      // Another conversation cuts the hold short; walking off does not.
      held = radio ? 0 : held + dt;
      const was = staged;
      staged = operator !== undefined && (radio || (staged && !open && (held < HOLD || d.ending.isOpen())));
      // The hold is over: the conversation's own settle was skipped while staged, so turn home now.
      if (was && !staged) turnToGoal();
      t = staged ? t + dt : 0;
      // The homecoming's quiet beat and the card that follows it, while Pip stands with Nana.
      const nearHome = nana !== undefined && Math.hypot(d.player.pos.x - nana.pos.x, d.player.pos.z - nana.pos.z) < AT_HOME;
      const home = !staged && nearHome && ((pending !== null && !open) || d.ending.isOpen());
      const shot = staged && operator
        ? radioStage(ground(d.mast), MAST_TIP, ground(operator.pos), ground(d.player.pos), t, reduced)
        : home && nana ? homeStage(ground(nana.pos), ground(d.player.pos)) : null;
      d.rig.setStage(shot);
      const speaker = d.flow.speaker();
      const focus = staged || home ? null : conversationFocus(speaker, d.player, d.npcs, d.terrain);
      d.rig.setFocus(focus);
      staging.update(dt, home ? HOME : focus ? speaker : null, home && shot ? shot.yaw : d.rig.shotYaw(), staged, reduced);
    },
  };
}
