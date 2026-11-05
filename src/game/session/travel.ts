/**
 * Going back to somewhere already walked, from the map.
 *
 * Critic round 5 spent about 40% of a 43-minute run crossing empty snow, much of it on errands that
 * send Pip 200 to 700 units back the way it came. The walk out is the valley being found; the walk back
 * is the same snow again. So the map page offers every place Pip has walked to: Up/Down picks one, E
 * puts Pip there.
 *
 * Only ground already walked: the first time anywhere is on foot, and the climb to the mast is made
 * once in full before the peak is on the list. Not on the way home after the radio call either: the
 * lit posts coming down to Nana are the ending, and a hop past them would skip it.
 *
 * Each place lands Pip on open ground beside something to do or someone to see, facing into it.
 */

import type { GameState, PlayerState, Vec2, ZoneId } from '../../core/contracts';

/** Where a hop lands, per zone, and the point Pip faces on arrival. */
export const HOP_SPOTS: Readonly<Record<ZoneId, { at: Vec2; look: Vec2 }>> = {
  // Nana's yard, by the first post, looking at the cabin.
  hearth: { at: { x: -346, z: 333 }, look: { x: -358, z: 355 } },
  // The second Pinewind post, at the edge of the pines where Ilsa and Tamsin are.
  pinewind: { at: { x: -177, z: 158 }, look: { x: -206, z: 160 } },
  // The Kettle Springs post, above the pools.
  kettles: { at: { x: -27, z: 37 }, look: { x: -40, z: 60 } },
  // The hamlet square, by the market.
  hamlet: { at: { x: 246, z: 124 }, look: { x: 250, z: 136 } },
  // On the ice by Skiff's boat.
  reach: { at: { x: 76, z: 306 }, look: { x: 64, z: 296 } },
  // The foot of Windscar Ridge, by its first post.
  ridge: { at: { x: 147, z: -143 }, look: { x: 168, z: -140 } },
  // The last post below the mast.
  peak: { at: { x: 304, z: -323 }, look: { x: 345, z: -351 } },
};

/** The order the map's list walks the places in: down the valley from home to the mast. */
const ORDER: readonly ZoneId[] = ['hearth', 'pinewind', 'kettles', 'hamlet', 'reach', 'ridge', 'peak'];

/** The quest that is the walk home: hops wait until Pip is back with Nana. */
const HOME_WALK = 'nana-home';

/** Places Pip can hop to now: walked, and not the one Pip is standing in. */
export function hopPlaces(s: GameState): ZoneId[] {
  return ORDER.filter((z) => s.visited[z] === true && z !== s.zone);
}

/** Why a hop cannot be made right now, in the player's words, or null when it can. */
export function hopBlocked(s: GameState, busy: boolean): string | null {
  if (s.quests[HOME_WALK]?.status === 'active') {
    // Says when it lifts: critic round 46 carried errands home under it and couldn't tell it would.
    return "Not tonight. Walk home past the lit posts: Nana is watching them for you. The map opens again once you're home.";
  }
  if (busy) return 'Finish what you are doing first.';
  return null;
}

/** Put Pip at `zone`'s landing spot, still, on the ground, facing into the place. */
export function hopTo(zone: ZoneId, player: PlayerState, heightAt: (x: number, z: number) => number): void {
  const spot = HOP_SPOTS[zone];
  player.pos.x = spot.at.x;
  player.pos.z = spot.at.z;
  player.pos.y = heightAt(spot.at.x, spot.at.z);
  player.vel.x = 0;
  player.vel.y = 0;
  player.vel.z = 0;
  player.facing = Math.atan2(spot.look.x - spot.at.x, spot.look.z - spot.at.z);
}
