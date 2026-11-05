/**
 * The walked way to a goal the straight line cannot reach.
 *
 * The goal points straight at its target, and for the mast that line ends at Windscar Ridge's north
 * face: critic round 17 followed the pin from Tuck's bridge onto the striped chimney wall, stuck there,
 * and never found the trail up. A route is a path that ends near a target (or starts near one, for the
 * way back down). While Pip is near the path, the goal aims a little way along it instead, so the pin
 * turns where the trail turns, and the distance is what is left to walk.
 *
 * Only where the path has left the straight line (`leaves`), and never within END_REACH of the target:
 * critic round 18 stood beside Bram, then Edda, with TALK up and the compass reading "73 u, behind you",
 * the walk round by the trail's far end to someone a step away.
 *
 * Pure: the path comes in as data (the trail itself lives in game/world/trail.ts).
 */

import type { Vec2 } from '../contracts';

export interface GuideRoute {
  path: readonly (readonly [number, number])[];
  /** The vertex where the path leaves the straight line; before it the straight goal already follows it. */
  leaves?: number;
}

/** A target this close to a path's end is what the path leads to: the mast, Edda, and the aurora 50 u past them. */
const END_REACH = 60;
/** Further than this from the path, Pip is off finding their own way, and the goal points straight. */
const NEAR = 60;
/** How far along the path the pin aims. Further cut the corners of the spur onto ground too steep to walk. */
const AHEAD = 14;
/** This close to a bend, the aim moves on round it. */
const AT_BEND = 3;

export interface RouteAim {
  aim: Vec2;
  /** Walking distance left: to the path, along it, and on to the target. */
  distance: number;
}

/** Where the goal should point for `target`, seen from `from`; null when no route leads there. */
export function routeAim(routes: readonly GuideRoute[], from: Vec2, target: Vec2): RouteAim | null {
  for (const r of routes) {
    const p = r.path;
    if (p.length < 2) continue;
    const [sx, sz] = p[0];
    const [ex, ez] = p[p.length - 1];
    const up = Math.hypot(target.x - ex, target.z - ez) <= END_REACH;
    const down = !up && Math.hypot(target.x - sx, target.z - sz) <= END_REACH;
    if (!up && !down) continue;
    if (Math.hypot(target.x - from.x, target.z - from.z) <= END_REACH) continue;

    // Pip's nearest point on the path, as distance along it.
    const lengths: number[] = [];
    let total = 0;
    let best = Infinity, at = 0;
    for (let i = 0; i < p.length - 1; i++) {
      const [ax, az] = p[i];
      const [bx, bz] = p[i + 1];
      const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
      const t = len > 0 ? Math.max(0, Math.min(1, ((from.x - ax) * dx + (from.z - az) * dz) / (len * len))) : 0;
      const d = Math.hypot(from.x - (ax + dx * t), from.z - (az + dz * t));
      if (d < best) {
        best = d;
        at = total + len * t;
      }
      lengths.push(len);
      total += len;
    }
    if (best > NEAR) continue;
    const bends: number[] = [0];
    for (const len of lengths) bends.push(bends[bends.length - 1] + len);
    if (at < (bends[r.leaves ?? 0] ?? 0) - AHEAD) continue;

    // The aim waits at the next bend until Pip is nearly there: past it, a stake on the spur stood in
    // the corner it cut, and Pip pushed at it.
    const bend = up ? bends.find((b) => b > at + AT_BEND) ?? total : [...bends].reverse().find((b) => b < at - AT_BEND) ?? 0;
    const goal = up ? Math.min(at + AHEAD, bend) : Math.max(at - AHEAD, bend);
    const distance = best + (up ? total - at : at) + Math.hypot(target.x - (up ? ex : sx), target.z - (up ? ez : sz));
    if (up ? goal >= total : goal <= 0) return { aim: target, distance };
    let s = 0;
    for (let i = 0; i < lengths.length; i++) {
      if (goal <= s + lengths[i] || i === lengths.length - 1) {
        const t = lengths[i] > 0 ? (goal - s) / lengths[i] : 0;
        const [ax, az] = p[i];
        const [bx, bz] = p[i + 1];
        return { aim: { x: ax + (bx - ax) * t, z: az + (bz - az) * t }, distance };
      }
      s += lengths[i];
    }
  }
  return null;
}
