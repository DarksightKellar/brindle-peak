/**
 * Who the camera frames during a conversation.
 *
 * The rig's two-shot needs one point: where the speaker stands. Which way the two of them face is
 * staging.ts: the speaker turns to Pip, so the shot no longer needs their facing to choose a side.
 */

import type { NpcDef, PlayerState, TerrainSampler } from '../../core/contracts';
import type { Speaker } from './shot';

/** Farther than this and the speaker is not standing with Pip: keep the shot on Pip alone. */
const NEAR = 10;

export function conversationFocus(
  speaker: string | null, player: PlayerState, npcs: readonly NpcDef[], terrain: TerrainSampler,
): Speaker | null {
  const npc = speaker ? npcs.find((n) => n.id === speaker) : undefined;
  if (!npc) return null;
  if (Math.hypot(npc.pos.x - player.pos.x, npc.pos.z - player.pos.z) > NEAR) return null;
  return { x: npc.pos.x, y: terrain.heightAt(npc.pos.x, npc.pos.z), z: npc.pos.z };
}
