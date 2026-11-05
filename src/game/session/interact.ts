/**
 * What the interact key can reach. Which node an NPC opens with is a content rule and lives in
 * `core/progress/conversation.ts`; this file only places the things E can be pressed on.
 */

import type { ActivityDef, Interactable, NpcDef, TerrainSampler, Vec3 } from '../../core/contracts';
import type { PickupDef } from '../../data/pickups';
import { startPropAt } from '../activities/startProps';

/**
 * How far E reaches a villager, at the least. Critic round 3 stood beside Hollis with no prompt until
 * nudged closer, and walking at Nana from the south the porch held Pip at 4.5 u, outside the old 4.
 * Beside someone is enough: their own radius can only make it longer. Facing never matters.
 */
export const NPC_RADIUS = 5.5;
export const ACTIVITY_RADIUS = 2.6;
/**
 * E reaches an activity from at least this far. Critic round 8 walked past the kite's prompt in half a
 * second and pressed at the woodpile from just outside it; their ask was three to four units. Critic
 * round 27 still stopped 3 to 4 u from the deer run's flag and the skating post and got no prompt. No two
 * activities or villagers stand within 8 u of each other, so this overlaps nothing.
 */
export const ACTIVITY_REACH_MIN = 4.6;
/** How close to an activity's start prop E reaches it. */
export const PROP_REACH = 4;
export const LANTERN_RADIUS = 2.4;
/** Carrying the lantern, Pip lights a post just by passing this close to it. */
export const LANTERN_PASS = 6;

/** The reach E has on this villager. The tutorial's talk hint shows only inside it. */
export const talkReach = (n: Pick<NpcDef, 'radius'>): number => Math.max(n.radius ?? 0, NPC_RADIUS);

/**
 * Everything the player can press E on. Pickups are collected by proximity, not by pressing, except one
 * with a price: Gus's feathers are bought with E. Critic round 26 walked onto one, lost 40 bells without
 * a prompt, and only noticed afterwards.
 */
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
      // Named: at dusk a raven and an otter in scarves are two dark shapes, and critic round 23 talked to
      // Corm thinking he was Ivy. The pill says who.
      prompt: `Talk to ${n.name}`,
    });
  }
  for (const a of activities) {
    const post = { x: a.pos.x, y: sampler.heightAt(a.pos.x, a.pos.z), z: a.pos.z };
    const at = startPropAt(a);
    const prop = { x: at.x, y: sampler.heightAt(at.x, at.z), z: at.z };
    out.push({ kind: 'activity', id: a.id, pos: post, radius: Math.max(a.radius || ACTIVITY_RADIUS, ACTIVITY_REACH_MIN), prompt: a.prompt, anchor: prop });
    // Critic round 7 walked up to the toss's cones and the kite's post and got nothing: the reach was
    // the post beside them, up to 3.8 u off, and the pill hung over empty snow. The prop answers E too,
    // and the press steps Pip onto the post the activity is played from.
    if (Math.hypot(prop.x - post.x, prop.z - post.z) > 1) {
      out.push({ kind: 'activity', id: a.id, pos: prop, radius: PROP_REACH, prompt: a.prompt, anchor: prop, standAt: post });
    }
  }
  for (const p of pickups) {
    if (p.price !== undefined) {
      out.push({
        kind: 'pickup',
        id: p.id,
        pos: { x: p.pos.x, y: sampler.heightAt(p.pos.x, p.pos.z), z: p.pos.z },
        radius: PICKUP_RADIUS + 0.6,
        prompt: `Buy · ${p.price} bells`,
      });
      continue;
    }
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
