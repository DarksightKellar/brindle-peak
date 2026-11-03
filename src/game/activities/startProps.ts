/**
 * Where each activity's start prop stands (startPropMeshes.ts says what it looks like).
 *
 * The critic walked past the kite spot on the ridge, the top of the Otter Slide and the Deer Trail
 * start without knowing anything was there: the prompt only appears within a few metres, and the
 * posts themselves were plain snow. Each start now has a prop that reads from thirty metres off.
 *
 * Placement is worked out from what the activity is about (`aim`: the first gate, the slide's first
 * leg, the water, the photo subject, the bell) so the prop stands beside the spot, a little to one
 * side of the line Pip will look along, and never between Pip and the thing to look at. A race's
 * banner is the exception: it spans the start line, and you set off between its posts.
 */

import type { ActivityDef, TerrainSampler, Vec2 } from '../../core/contracts';
import type { Collider } from '../../core/player/collide';
import { ACTIVITIES } from '../../data/activities';
import { BIRD_BULK } from '../world/birdBulk';
import type { PlacedMarker } from './markerLooks';
import type { StartLook } from './startPropMeshes';
import { RACE_COURSES } from './raceCourses';
import { SLIDE_COURSES } from './slidePath';
import { FISH_SPOTS } from './fishSpots';
import { PHOTO_SUBJECTS } from './photoSubjects';
import { BELL, THROW_SETUPS } from './throwSetups';
import { BUILD_SITES, woodpileFootprint } from './buildSites';

interface StartProp {
  look: StartLook;
  /** Metres from the activity post, and which side of the aim line (+1 right, -1 left, 0 on it). */
  out: number;
  side: -1 | 0 | 1;
  /** Turn the prop to face along the aim instead of facing the post. */
  alongAim?: boolean;
  /** Metres behind the post, against the aim. Default 0.6 for a prop off to one side. */
  back?: number;
}

const BY_ID: Readonly<Record<string, StartProp>> = {
  'hearth-kindling': { look: 'pennant', out: 3.2, side: 1 },
  // Well out to the side of where Pip throws from, level with it, so its pole is never between the
  // camera, Pip and a snowman.
  'pinewind-pinecone-throw': { look: 'start-cones', out: 3.8, side: 1, back: 0.8 },
  'pinewind-deer-run': { look: 'start-banner', out: 0, side: 0, alongAim: true },
  'pinewind-creek-fish': { look: 'start-stool', out: 2.2, side: 1 },
  'pinewind-glade-photo': { look: 'start-frame', out: 1.8, side: 1, alongAim: true },
  'reach-sled-hill': { look: 'start-sled', out: 2.6, side: -1 },
  'reach-ice-fish': { look: 'start-stool', out: 2.2, side: 1 },
  'reach-skate-race': { look: 'start-skates', out: 3, side: -1 },
  'reach-ice-photo': { look: 'start-frame', out: 1.8, side: 1, alongAim: true },
  'kettles-spring-fish': { look: 'start-stool', out: 2.4, side: -1 },
  'kettles-otter-slide': { look: 'start-sled', out: 2.6, side: -1 },
  'kettles-steam-photo': { look: 'start-frame', out: 1.8, side: -1, alongAim: true },
  'kettles-dam-build': { look: 'pennant', out: 2.4, side: 1 },
  'hamlet-snowman': { look: 'start-shovel', out: 4, side: -1 },
  'hamlet-bell-throw': { look: 'start-snowballs', out: 2.6, side: -1 },
  'hamlet-market-photo': { look: 'start-frame', out: 1.8, side: 1, alongAim: true },
  'ridge-kite': { look: 'start-kite', out: 3.6, side: -1 },
  'ridge-lantern-ascent': { look: 'pennant', out: 2.2, side: -1 },
  'ridge-chimney-race': { look: 'start-banner', out: 0, side: 0, alongAim: true },
  'ridge-tarn-fish': { look: 'start-stool', out: 2.2, side: 1 },
  'peak-aurora-photo': { look: 'start-frame', out: 1.8, side: 1, alongAim: true },
  'peak-thermal-flight': { look: 'start-windsock', out: 2.6, side: -1, alongAim: true },
};

const bearing = (from: Vec2, to: Vec2): number => Math.atan2(to.x - from.x, to.z - from.z);

/** The heading from the post toward what the activity is about. */
function aimOf(def: ActivityDef): number {
  const p = def.pos;
  const race = RACE_COURSES[def.id];
  if (race?.gates[0]) return bearing(p, race.gates[0]);
  const slide = SLIDE_COURSES[def.id];
  if (slide && slide.points.length > 1) return bearing(slide.points[0], slide.points[1]);
  const fish = FISH_SPOTS[def.id];
  if (fish) return bearing(p, fish);
  const photo = PHOTO_SUBJECTS[def.id];
  if (photo?.kind === 'ground') return bearing(p, photo);
  if (photo?.kind === 'aurora') return Math.PI;
  if (def.id === 'hamlet-bell-throw') return bearing(p, BELL);
  const toss = THROW_SETUPS[def.id]?.facing;
  if (toss !== undefined) return toss;
  if (def.id === 'ridge-kite') return Math.PI;
  const site = BUILD_SITES[def.id];
  if (site && Math.hypot(site.at.x - p.x, site.at.z - p.z) > 0.5) return bearing(p, site.at);
  return 0;
}

/** Where an activity's start prop stands and which way it faces. */
function placeOf(def: ActivityDef): { prop: StartProp; x: number; z: number; yaw: number } {
  const prop = BY_ID[def.id] ?? { look: 'pennant', out: 2.4, side: 1 };
  const aim = aimOf(def);
  // Right of the aim line under forward = (sin yaw, cos yaw) is (-cos, sin).
  const rx = -Math.cos(aim), rz = Math.sin(aim);
  const back = prop.back ?? (prop.side === 0 ? 0 : 0.6);
  const x = def.pos.x + rx * prop.out * prop.side - Math.sin(aim) * back;
  const z = def.pos.z + rz * prop.out * prop.side - Math.cos(aim) * back;
  return { prop, x, z, yaw: prop.alongAim ? aim : bearing({ x, z }, def.pos) };
}

/** Each activity's start prop, as kept pieces for the marker layer to stand up at boot. */
export function startPropMarkers(defs: readonly ActivityDef[], terrain: TerrainSampler): PlacedMarker[] {
  return defs.map((def) => {
    const { prop, x, z, yaw } = placeOf(def);
    return { shape: 'post', look: prop.look, keep: `start:${def.id}`, x, y: terrain.heightAt(x, z), z, yaw };
  });
}

/** Posts in a prop's own frame (startPropMeshes.ts): the pennant pole, and the banner's second post. */
const POSTS: Partial<Record<StartLook, readonly number[]>> = { 'start-banner': [-1.5, 1.5], 'start-frame': [-0.95, 0] };

/**
 * What Pip bumps into among the activity furniture that always stands: every start prop's post, and
 * Bram's woodpile (the crooked heap before, the crib after: the same ground either way).
 */
export function standingSolids(defs: readonly ActivityDef[] = ACTIVITIES): Collider[] {
  const out: Collider[] = [];
  for (const def of defs) {
    const { prop, x, z, yaw } = placeOf(def);
    for (const lx of POSTS[prop.look] ?? [0]) {
      out.push({ kind: 'circle', x: x + lx * Math.cos(yaw), z: z - lx * Math.sin(yaw), r: 0.09 + BIRD_BULK });
    }
  }
  const pile = woodpileFootprint();
  if (pile) out.push(pile);
  return out;
}
