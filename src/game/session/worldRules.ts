/**
 * The world's own rules, evaluated once per frame: where the player may be, which pools count as
 * soaked, when a zone changes, when a named place is reached, when the summit has been reached, and
 * when the story has ended.
 *
 * These lived inside the session's frame loop, mixed in with rendering, audio and UI calls. They are
 * content rules, not presentation, and each one has a bug behind it — the missing boundary, the
 * never-emitted spring, the summit that paid nothing — so they are worth being able to read on their
 * own and test away from a renderer.
 */

import type { EventBus, GameState, PlayerState, TerrainSampler } from '../../core/contracts';
import { PEAK } from '../../data/zones';
import { ENDING_QUEST } from '../../data/quests';
import { PLACES } from '../../data/places';
import { SPRING_POOLS } from '../world/landmarks';
import { resolveCollisions, type Collider } from '../../core/player/collide';

/** How wide the player is, for the ground-plane collider solve. */
export const PLAYER_RADIUS = 0.42;

/**
 * Push the player out of anything solid, then re-seat them on the ground.
 *
 * The height matters: resolution moves the player somewhere with different terrain underfoot, and
 * leaving the previous height would sink or float them for a frame. Terrain height is only re-read
 * when something actually pushed, so walking in the open costs nothing extra.
 */
export function applySolidWorld(
  player: PlayerState,
  colliders: readonly Collider[],
  sampler: { heightAt(x: number, z: number): number },
): boolean {
  const hit = resolveCollisions(player.pos, PLAYER_RADIUS, colliders, player.pos.y - sampler.heightAt(player.pos.x, player.pos.z));
  if (!hit) return false;
  /*
   * Only a grounded body gets placed back onto the terrain. Snapping Y on every hit is what turned a
   * mid-air brush with a fence into being yanked down to the ground — the reported "clips me back in
   * front of the fence" was this line, not the push.
   */
  if (player.grounded) player.pos.y = sampler.heightAt(player.pos.x, player.pos.z);
  return true;
}

/** How far inside the terrain grid the player is stopped. Terrain is flat-clamped past the edge. */
export const WORLD_EDGE_MARGIN = 14;

/** How close to the mast counts as arriving. The peak ZONE is 105 units wide; this is the mast. */
export const SUMMIT_RADIUS = 16;

export interface WorldRuleDeps {
  state: GameState;
  player: PlayerState;
  bus: EventBus;
  sampler: TerrainSampler;
  /** The world is a square of this side length, centred on the origin. */
  worldSize: number;
  /** Called after a zone change is recorded: pull the camera back in, and save. */
  onZoneChange(): void;
  /** Called once, when the story's last chapter (the homecoming) completes. */
  onFinale(): void;
}

/**
 * Soft world edge. Nothing clamped the player and the sampler flat-clamps past the grid, so holding a
 * direction walked onto an endless featureless plane (measured x = 589 in a +-512 world). Velocity
 * into the wall is zeroed so it feels like a bank of snow rather than a bounce.
 */
export function clampToWorld(player: PlayerState, worldSize: number): void {
  const limit = worldSize / 2 - WORLD_EDGE_MARGIN;
  if (player.pos.x > limit || player.pos.x < -limit) {
    player.pos.x = Math.min(limit, Math.max(-limit, player.pos.x));
    player.vel.x = 0;
  }
  if (player.pos.z > limit || player.pos.z < -limit) {
    player.pos.z = Math.min(limit, Math.max(-limit, player.pos.z));
    player.vel.z = 0;
  }
}

/**
 * Run the rules for this frame and return the ground sample the caller still needs for weather and
 * footstep audio, so the frame samples the terrain once rather than three times.
 */
export function applyWorldRules(d: WorldRuleDeps): ReturnType<TerrainSampler['sampleAt']> {
  const { state, player, bus, sampler } = d;
  const sample = sampler.sampleAt(player.pos.x, player.pos.z);

  // Springs had a counter, a toast and two achievements wired to `spring:soaked`, and nothing ever
  // emitted it, so 'Hot Water' and 'All Five Pools' were unattainable. Fired once per pool: the
  // counter is distinct-pool saturation, which is what "every spring, sat in" means.
  if (player.soaking) {
    const pool = SPRING_POOLS.findIndex((q) =>
      Math.hypot(player.pos.x - q.x, player.pos.z - q.z) < q.r + 1.2);
    if (pool >= 0) {
      const id = `pool-${pool + 1}`;
      if ((state.counters['spring:' + id] ?? 0) === 0) bus.emit('spring:soaked', { id });
    }
  }

  if (sample.zone !== state.zone) {
    state.zone = sample.zone;
    bus.emit('zone:entered', { id: sample.zone });
    d.onZoneChange();
  }

  // Arriving at the mast is a milestone, not the end: the ending used to fire here, so a player could
  // walk straight up, skip the whole story and be told the radio worked.
  if (!state.flags.summit && Math.hypot(player.pos.x - PEAK.x, player.pos.z - PEAK.z) < SUMMIT_RADIUS) {
    state.flags.summit = true;
    bus.emit('summit:reached', { id: 'mast' });
  }

  arrivals(player, bus);

  // The ending is the homecoming, not the radio call: the card used to show on the summit and leave a
  // long walk to a short porch chat after it (finale.ts). `ending` replaces the old `finale` flag, which
  // older saves set at the mast; a run that already saw its card there is not shown a second one.
  if (!state.flags.ending && state.quests[ENDING_QUEST]?.status === 'complete') {
    state.flags.ending = true;
    d.onFinale();
  }

  return sample;
}

/** The places each player stood inside last frame, so `place:reached` fires on arrival only. */
const inside = new WeakMap<PlayerState, Set<string>>();

/**
 * Arriving at a named spot (data/places.ts). A step that means "be there" waits on this rather than on
 * a zone entry, which fires at the zone's rim.
 */
function arrivals(player: PlayerState, bus: EventBus): void {
  let was = inside.get(player);
  if (!was) inside.set(player, (was = new Set()));
  for (const place of PLACES) {
    const now = Math.hypot(player.pos.x - place.pos.x, player.pos.z - place.pos.z) < place.radius;
    if (now && !was.has(place.id)) bus.emit('place:reached', { id: place.id });
    if (now) was.add(place.id);
    else was.delete(place.id);
  }
}
