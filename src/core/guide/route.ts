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
  /**
   * The vertex up to which a drifted walk is led back at a slant (SLANT). Past it the path winds between
   * cliffs, and an aim far along it cut across them: critic round 49 followed it home into the chimney
   * face. Omitted: the whole path.
   */
  slantUntil?: number;
}

/** A target this close to a path's end is what the path leads to: the mast, Edda, and the aurora 50 u past them. */
const END_REACH = 60;
/** Further than this from the path, Pip is off finding their own way, and the goal points straight. */
const NEAR = 60;
/** How far along the path the pin aims. Further cut the corners of the spur onto ground too steep to walk. */
const AHEAD = 14;
/** This close to a bend, the aim moves on round it. */
const AT_BEND = 3;
/** Off the path by d, the aim is d × SLANT along it: back onto it at about 25° rather than square on. */
const SLANT = 2;

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
    // Off the path, the aim is further along it, so the way back meets it at a slant, not square on.
    const open = r.slantUntil === undefined || at < (bends[r.slantUntil] ?? total);
    const ahead = open ? Math.max(AHEAD, best * SLANT) : AHEAD;
    const goal = up ? Math.min(at + ahead, bend) : Math.max(at - ahead, bend);
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

/** A building's footprint as the colliders store it (core/player/collide.ts 'box'). */
export interface GuideBox {
  x: number;
  z: number;
  hw: number;
  hd: number;
  yaw: number;
}

/** A target this close, with a building in the straight line, is walked to round the building. */
const AROUND = 30;
/** How far off the walls the corner aim stands, so the pin is somewhere Pip can stand. */
const CLEAR = 1.5;
/** Pip's own bulk: a line passing this close to a wall is blocked by it. */
const BULK = 0.3;
/** At a corner this close, the aim moves on to the next leg: standing on it, the pin said "behind you". */
const AT_CORNER = 2.5;

/**
 * Where the goal should point for a near `target` that a building hides; null when nothing stands
 * between. Critic round 48 read "6 u" to Edda and "11 u" to Nana with the radio hut's and the cabin's
 * back walls in the straight line, and pushed into them. The aim is the corner to go round (two, when
 * the target is on the far side), and the distance is that walk.
 */
export function aroundAim(boxes: readonly GuideBox[], from: Vec2, target: Vec2): RouteAim | null {
  if (Math.hypot(target.x - from.x, target.z - from.z) > AROUND) return null;
  for (const b of boxes) {
    if (Math.hypot(b.x - from.x, b.z - from.z) > AROUND + b.hw + b.hd) continue;
    if (!crosses(b, from, target)) continue;
    const cos = Math.cos(b.yaw), sin = Math.sin(b.yaw);
    const hx = b.hw + CLEAR, hz = b.hd + CLEAR;
    // Round the footprint in order, so neighbours in the list share a wall.
    const corners = [[hx, hz], [hx, -hz], [-hx, -hz], [-hx, hz]].map(([lx, lz]) => ({
      x: b.x + lx * cos + lz * sin,
      z: b.z - lx * sin + lz * cos,
    }));
    const span = (a: Vec2, c: Vec2): number => Math.hypot(c.x - a.x, c.z - a.z);
    // The walk as its turning points: one corner, or two when the target is on the far side.
    let best: { legs: Vec2[]; distance: number } | null = null;
    corners.forEach((c, i) => {
      if (crosses(b, from, c)) return;
      if (!crosses(b, c, target)) {
        const d = span(from, c) + span(c, target);
        if (!best || d < best.distance) best = { legs: [c], distance: d };
        return;
      }
      for (const n of [corners[(i + 1) % 4], corners[(i + 3) % 4]]) {
        if (crosses(b, n, target)) continue;
        const d = span(from, c) + span(c, n) + span(n, target);
        if (!best || d < best.distance) best = { legs: [c, n], distance: d };
      }
    });
    if (!best) continue;
    const { legs, distance } = best as { legs: Vec2[]; distance: number };
    if (span(from, legs[0]) > AT_CORNER) return { aim: legs[0], distance };
    // On the corner: the next leg, or straight on when the target is round it.
    return legs.length > 1 ? { aim: legs[1], distance } : null;
  }
  return null;
}

/** The straight line a→b passes through box `b` (grown by Pip's bulk). */
function crosses(b: GuideBox, a: Vec2, c: Vec2): boolean {
  const cos = Math.cos(b.yaw), sin = Math.sin(b.yaw);
  const local = (p: Vec2): [number, number] => {
    const dx = p.x - b.x, dz = p.z - b.z;
    return [dx * cos - dz * sin, dx * sin + dz * cos];
  };
  const [ax, az] = local(a);
  const [cx, cz] = local(c);
  const hx = b.hw + BULK, hz = b.hd + BULK;
  // Clip the segment against the rectangle (Liang–Barsky); any length left inside is a crossing.
  let t0 = 0, t1 = 1;
  const dx = cx - ax, dz = cz - az;
  for (const [p, q] of [[-dx, ax + hx], [dx, hx - ax], [-dz, az + hz], [dz, hz - az]]) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 > t1) return false;
  }
  return t1 - t0 > 1e-6;
}
