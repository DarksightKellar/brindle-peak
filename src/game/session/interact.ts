/**
 * What the interact key can reach. Which node an NPC opens with is a content rule and lives in
 * `core/progress/conversation.ts`; this file only places the things E can be pressed on.
 */

import type { ActivityDef, Interactable, NpcDef, TerrainSampler, Vec3 } from '../../core/contracts';
import type { PickupDef } from '../../data/pickups';

/**
 * How far E reaches a villager, at the least. Critic round 3 stood beside Hollis with no prompt until
 * nudged closer, and walking at Nana from the south the porch held Pip at 4.5 u, outside the old 4.
 * Beside someone is enough: their own radius can only make it longer. Facing never matters.
 */
export const NPC_RADIUS = 5.5;
export const ACTIVITY_RADIUS = 2.6;
export const LANTERN_RADIUS = 2.4;

/** The reach E has on this villager. The tutorial's talk hint shows only inside it. */
export const talkReach = (n: Pick<NpcDef, 'radius'>): number => Math.max(n.radius ?? 0, NPC_RADIUS);

/** Everything the player can press E on. Pickups are collected by proximity, not by pressing. */
export function buildInteractables(
  sampler: TerrainSampler,
  npcs: readonly NpcDef[],
  activities: readonly ActivityDef[],
  pickups: readonly PickupDef[],
): Interactable[] {
  const out: Interactable[] = [];
  for (const n of npcs) {
    out.push({
      kind: 'npc',
      id: n.id,
      pos: { x: n.pos.x, y: sampler.heightAt(n.pos.x, n.pos.z), z: n.pos.z },
      radius: talkReach(n),
      prompt: 'Talk',
    });
  }
  for (const a of activities) {
    out.push({
      kind: 'activity',
      id: a.id,
      pos: { x: a.pos.x, y: sampler.heightAt(a.pos.x, a.pos.z), z: a.pos.z },
      radius: a.radius || ACTIVITY_RADIUS,
      prompt: a.prompt,
    });
  }
  for (const p of pickups) {
    if (p.kind !== 'lantern') continue;
    out.push({
      kind: 'lantern',
      id: p.id,
      pos: { x: p.pos.x, y: sampler.heightAt(p.pos.x, p.pos.z), z: p.pos.z },
      radius: LANTERN_RADIUS,
      prompt: 'Light',
    });
  }
  return out;
}

/** Proximity collection radius for feathers and bells. Generous, deliberately. */
export const PICKUP_RADIUS = 1.9;

export function inPickupRange(player: Vec3, p: PickupDef): boolean {
  return Math.hypot(player.x - p.pos.x, player.z - p.pos.z) < PICKUP_RADIUS;
}
