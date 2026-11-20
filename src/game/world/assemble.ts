/**
 * World assembly + the two mesh families the team never assigned: NPC bodies and pickups.
 *
 * The Prop Artist built scenery, landmarks and water; the Gameplay Engineer built Pip. Nobody
 * built the 18 characters or the 74 objects you can pick up, so integration surfaced it. This
 * file closes that gap and is the single place the world is composed.
 *
 * All geometry is primitives, flat-shaded, vertex/material-coloured from PALETTE. Emissive
 * materials set `allowOverride = false` so the normal pass does not swallow them (ART_BIBLE A3).
 */

import type { SoundSpot, SoundWorld } from '../audio/ambience';
import * as THREE from 'three';
import type { NpcDef, TerrainSampler } from '../../core/contracts';
import type { Collider } from '../../core/player/collide';
import { WORLD_SEED } from '../../data/zones';
import { buildScatterGroup, scatterProps } from './scatter';
import type { PropKind } from './props';
import type { Occluder } from '../camera/occlusion';
import { LANDMARKS, SPRING_POOLS, buildLandmarks, hamletHouseSpots } from './landmarks';
import { buildWater, updateWater } from './water';
import { buildSteam, updateSteam } from './steam';
import { buildFarPeak } from './farPeak';
import { buildTerrainMesh } from './terrainMesh';
import type { PickupDef } from '../../data/pickups';
import { buildNpc, buildPickup } from './npcBodies';
import { buildColliders } from './colliders';
import { BIRD_BULK } from './birdBulk';
import { buildNamedPlaces } from './namedPlaces';
import { buildLanternPost, setPostLit, updatePostFlares } from './lanternPosts';
import { SPECIES_SIZE } from './npcSpecies';

/**
 * Which scattered props the camera must not pass through, and how big to treat them.
 *
 * Radii are deliberately smaller than each prop's bounding sphere: a pine's sphere circumscribes its
 * canopy, and using that would pull the camera in whenever it came within five units of any tree,
 * which in a wood is always. These values keep the camera off the trunk and out of the inner canopy
 * while leaving open ground alone. Multiplied by each instance's scale.
 */
const OCCLUDER_PROFILE: Partial<Record<PropKind, { radius: number; height: number }>> = {
  pine: { radius: 1.7, height: 9 },
  bare: { radius: 0.9, height: 7 },
  rock: { radius: 1.5, height: 2.4 },
};

export interface WorldBuild {
  group: THREE.Group;
  /** NPC id -> scene object, positioned on the terrain. */
  npcs: Map<string, THREE.Object3D>;
  /** Pickup id -> scene object, positioned on the terrain. */
  pickups: Map<string, THREE.Object3D>;
  /** Vertical props the camera must not pass through. Static for the life of the world. */
  occluders: Occluder[];
  /** What the player walks into. Static: nothing in this world moves. */
  colliders: Collider[];
  /** Where the world's sounds come from: pools, stoves, pines, the lake ice, the owl. */
  sounds: SoundWorld;
  setCollected(id: string): void;
  /** `flare`: lit just now, in view of the player, rather than restored from the save. */
  setLanternLit(id: string, flare?: boolean): void;
  update(dt: number, elapsed: number): void;
  dispose(): void;
}

export function buildWorld(
  sampler: TerrainSampler,
  npcs: readonly NpcDef[],
  pickups: readonly PickupDef[],
): WorldBuild {
  const group = new THREE.Group();
  const terrain = buildTerrainMesh(sampler);
  terrain.receiveShadow = true;
  group.add(terrain);

  // WORLD_SEED, not a literal. This call site was missed when the seed was unified: the game was
  // scattering props with 20260120 while every test in tests/props.test.ts validated 1337, so the
  // prop counts, ice restrictions and spacing guarantees were being checked against a layout the
  // player never sees.
  const scatter = buildScatterGroup(sampler, WORLD_SEED);
  group.add(scatter);
  // Kept as a named group: structure colliders must be derived from the authored landmarks only.
  // Running the same traversal over the whole world would box the InstancedMesh scatter batches and
  // wall off entire zones.
  const landmarks = buildLandmarks(sampler);
  group.add(landmarks);
  group.add(buildWater(sampler));
  group.add(buildSteam(sampler));
  group.add(buildFarPeak(sampler));
  const places = buildNamedPlaces(sampler);
  group.add(places.group);

  const npcMap = new Map<string, THREE.Object3D>();
  for (const def of npcs) {
    const obj = buildNpc(def);
    obj.position.set(def.pos.x, sampler.heightAt(def.pos.x, def.pos.z), def.pos.z);
    group.add(obj);
    npcMap.set(def.id, obj);
  }

  const pickupMap = new Map<string, THREE.Object3D>();
  /** Bells and feathers float; lantern posts are planted in the snow and stay still. */
  const floating: { obj: THREE.Object3D; restY: number }[] = [];
  const posts = pickups.filter((p) => p.kind === 'lantern');
  for (const def of pickups) {
    if (def.kind === 'lantern') {
      // Each post's lamp arm reaches toward the next one up the trail; the last toward the summit.
      const next = posts[posts.indexOf(def) + 1]?.pos ?? { x: def.pos.x + 10, z: def.pos.z - 30 };
      const post = buildLanternPost(sampler, def.pos.x, def.pos.z, next);
      group.add(post);
      pickupMap.set(def.id, post);
      continue;
    }
    const obj = buildPickup(def);
    obj.position.x = def.pos.x;
    obj.position.z = def.pos.z;
    // A feather on a ledge hangs a little lower over it than one over the snow does.
    obj.position.y += sampler.heightAt(def.pos.x, def.pos.z) + (def.lift ? def.lift - 0.4 : 0);
    group.add(obj);
    pickupMap.set(def.id, obj);
    floating.push({ obj, restY: obj.position.y });
  }

  // Everything casts and receives. One traversal after assembly rather than sprinkling flags
  // through five files that belong to other agents.
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      // Light laid on the snow (lamp pools, window pools) is not a solid: it must not shade itself.
      // The ground does not cast either: its flat-shaded facets shaded each other in a stair-step
      // checker down every slope facing away from the sun. The slope's own shading already darkens it.
      const m = o.material;
      o.castShadow = o.name !== 'terrain' && !(m instanceof THREE.Material && m.transparent);
      o.receiveShadow = true;
    }
  });

  // One placements call serves both consumers: camera occluders and player colliders. They used to
  // be derived from different sources, which is how a prop could block the camera and not the player.
  const placements = scatterProps(sampler, WORLD_SEED);
  const occluders: Occluder[] = [...places.occluders];
  for (const p of placements) {
    const profile = OCCLUDER_PROFILE[p.kind];
    if (!profile) continue;
    occluders.push({
      x: p.x, z: p.z, base: p.y,
      radius: profile.radius * p.scale,
      height: profile.height * p.scale,
    });
  }

  // The places that make a noise, read off the same layout the player walks through.
  const spot = (x: number, z: number): SoundSpot => ({ x, y: sampler.heightAt(x, z), z });
  const station = LANDMARKS.find((l) => l.id === 'station');
  const pines = placements.filter((p) => p.kind === 'pine');
  const sounds: SoundWorld = {
    pools: SPRING_POOLS.map((p) => spot(p.x, p.z)),
    stoves: [...(station ? [spot(station.x, station.z)] : []), ...hamletHouseSpots().map((h) => spot(h.x, h.z))],
    pines: Float32Array.from(pines.flatMap((p) => [p.x, p.z])),
    owls: npcs.filter((n) => n.species === 'owl').map((n) => spot(n.pos.x, n.pos.z)),
    isIce: (x, z) => sampler.sampleAt(x, z).surface === 'ice',
  };

  return {
    group,
    npcs: npcMap,
    pickups: pickupMap,
    occluders,
    sounds,
    colliders: [
      ...buildColliders(landmarks, placements),
      ...places.colliders,
      // Nana's posts: the upright at the anchor (lanternPosts.ts); the arm and lamp are overhead.
      ...posts.map((p): Collider => ({ kind: 'circle', x: p.pos.x, z: p.pos.z, r: 0.13 + BIRD_BULK })),
      // Villagers are small obstacles: Pip walks round them and stops in front of them to talk,
      // instead of through them. A bird with more clearance than a villager's head is over them.
      ...npcs.map((n): Collider => ({ kind: 'circle', x: n.pos.x, z: n.pos.z, r: 0.5 * (SPECIES_SIZE[n.species] ?? 1), top: 1.5 })),
    ],
    setCollected(id: string): void {
      const o = pickupMap.get(id);
      if (o) o.visible = false;
    },
    setLanternLit(id: string, flare = false): void {
      const post = pickupMap.get(id);
      if (post) setPostLit(post, flare);
    },
    update(dt: number, elapsed: number): void {
      updatePostFlares(dt);
      updateWater(dt);
      updateSteam(elapsed);
      // Set from the clock, not accumulated per frame: the old `+=` drifted with the frame rate.
      for (const { obj, restY } of floating) {
        if (!obj.visible) continue;
        obj.rotation.y = elapsed * 0.9;
        obj.position.y = restY + Math.sin(elapsed * 2 + obj.position.x) * 0.1;
      }
    },
    dispose(): void {
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const m = o.material;
          if (Array.isArray(m)) m.forEach((x) => x.dispose());
          else m.dispose();
        }
      });
    },
  };
}
