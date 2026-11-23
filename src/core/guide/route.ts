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
/** Within END_REACH, a walk along the path this many times the straight line (plus a little) is a detour. */
const DETOUR = 1.5;
/** Further than this from the path, Pip is off finding their own way, and the goal points straight. */
// 120 since critic round 87: 70 u off the trail below Windscar, the goal pointed straight up the face and
// it stalled there. From this far the way back onto the trail is still the walkable one.
const NEAR = 120;
/** How far along the path the pin aims. Further cut the corners of the spur onto ground too steep to walk. */
const AHEAD = 14;
/** This close to a bend, the aim moves on round it. */
const AT_BEND = 3;
/** From this far before a bend the aim eases round it (see `ease` in routeAim). */
const EASE = 8;
const EASE_RATE = 2;
/** Off the path by d, the aim is d × SLANT along it: back onto it at about 25° rather than square on. */
const SLANT = 2;

export interface RouteAim {
  aim: Vec2;
  /** Walking distance left: to the path, along it, and on to the target. */
  distance: number;
  /** How far Pip stands off the path. */
  off: number;
}

/** Among the cliffs, Pip this far off the path is not on the trail, and is led back to it (routeAim). */
const ON_PATH = 8;
/** A target this close is pointed at straight wherever Pip stands. */
const FACE_TO_FACE = 25;
/** A target this much nearer another route's path than this one's is not this route's to lead to. */
const OTHER_STRETCH = 20;
/** A hold this far off the path is not on it. */
const HOLD_ON = 4;
/** A hold this far behind along the path is given up: walked past, it no longer turns the pin round. */
const HOLD_BACK = 20;
/** This close to a hold, the aim moves on. */
const HOLD_REACH = 3;

/** `pt`'s nearest point on `p`, as distance along it and distance off it. */
function along(p: GuideRoute['path'], pt: Vec2): { at: number; off: number } {
  let total = 0, best = Infinity, at = 0;
  for (let i = 0; i < p.length - 1; i++) {
    const [ax, az] = p[i];
    const [bx, bz] = p[i + 1];
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
    const t = len > 0 ? Math.max(0, Math.min(1, ((pt.x - ax) * dx + (pt.z - az) * dz) / (len * len))) : 0;
    const d = Math.hypot(pt.x - (ax + dx * t), pt.z - (az + dz * t));
    if (d < best) {
      best = d;
      at = total + len * t;
    }
    total += len;
  }
  return { at, off: best };
}

/**
 * Where the goal should point for `target`, seen from `from`; null when no route leads there.
 *
 * `holds`: places on the path the aim waits at until Pip is there, Nana's unlit lantern posts. The aim
 * used to move on once Pip drew level with a post, and a walk 10 to 15 u off the trail drew level with
 * half of them without lighting one; the walk home goes by the lit posts, and came down half dark.
 */
export function routeAim(routes: readonly GuideRoute[], from: Vec2, target: Vec2, holds: readonly Vec2[] = []): RouteAim | null {
  // A route leads to what stands at its end, not to something beside another stretch of the trail: the
  // Chimney Scramble's post (round 111) stood 55 u past the end of the way to Tuck's bridge, 11 u off the
  // trail beyond it, and critic round 114 at the chimney's foot read 164 u, back to the bridge and out again.
  const offs = routes.map((r) => (r.path.length < 2 ? Infinity : along(r.path, target).off));
  const nearest = Math.min(...offs);
  for (const [ri, r] of routes.entries()) {
    const p = r.path;
    if (p.length < 2) continue;
    if (offs[ri] > nearest + OTHER_STRETCH) continue;
    const [sx, sz] = p[0];
    const [ex, ez] = p[p.length - 1];
    const up = Math.hypot(target.x - ex, target.z - ez) <= END_REACH;
    const down = !up && Math.hypot(target.x - sx, target.z - sz) <= END_REACH;
    if (!up && !down) continue;
    const straight = Math.hypot(target.x - from.x, target.z - from.z);

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
    // A target close at hand is pointed at straight. Among the cliffs (past slantUntil) that holds only
    // while the path's walk there is not far longer: critic round 90, under Windscar's face, read Tuck
    // 43 u away straight up it, while the trail round by the spur to his bridge is some 250 u. On open
    // ground the straight line is walkable: critic round 91, beside Bram's woodpile, was sent the long
    // way back to the trail's start, and read the distance rising as it walked up to the pile.
    // How far apart along the path Pip and the target are, not the walk to the path's end and back: by
    // that, critic round 94 stood beside Edda, 18 u from the trail's end at the mast, and read "32 u by
    // the trail".
    // Where the target stands along the path: at its end for one past it (Edda beyond the mast), short of the
    // end for one beside it. The walk is measured to there, not to the end and back: the Chimney Scramble's
    // post stands beside the trail 55 u short of the bridge, and critic round 114 read 164 u for a 40 u walk.
    const stop = along(p, target);
    // The way to it along the path: toward the path's end, or back along it when Pip has walked past it (west of
    // Tuck's gorge, the chimney's post is back over the bridge).
    const fwd = stop.at >= at;
    const walk = best + Math.abs(stop.at - at) + stop.off;
    const cliffs = r.slantUntil !== undefined && at >= (bends[r.slantUntil] ?? total) - AHEAD;
    const apart = Math.abs(at - stop.at);
    // Among the cliffs the straight line is taken only from the trail itself: critic round 102 stood 16 u
    // off it above the gorge under Tuck's bridge, read Tuck 43 u straight, walked the pin down into the
    // gorge and stuck against its far wall. Close at hand (FACE_TO_FACE) or at the path's end, it still is.
    const offCliffs = cliffs && best > ON_PATH && straight > FACE_TO_FACE && Math.abs(stop.at - at) > AHEAD;
    if (straight <= END_REACH && (!cliffs || apart <= straight * DETOUR + 15) && !offCliffs) continue;
    if (at < (bends[r.leaves ?? 0] ?? 0) - AHEAD) continue;

    // The aim waits at the next bend until Pip is nearly there: past it, a stake on the spur stood in
    // the corner it cut, and Pip pushed at it.
    const bend = fwd ? bends.find((b) => b > at + AT_BEND) ?? total : [...bends].reverse().find((b) => b < at - AT_BEND) ?? 0;
    // Off the path, the aim is further along it, so the way back meets it at a slant, not square on.
    const open = r.slantUntil === undefined || at < (bends[r.slantUntil] ?? total);
    const ahead = open ? Math.max(AHEAD, best * SLANT) : AHEAD;
    // Within EASE of a bend the aim starts round it, twice as fast as Pip closes on it, so the pin swings
    // through the turn instead of holding on the corner and then flipping to "behind you": at the
    // hairpin at the ridge foot it went from ahead to behind in one stride.
    const ease = (b: number): number => (fwd ? b + EASE_RATE * Math.max(0, at - (b - EASE)) : b - EASE_RATE * Math.max(0, b + EASE - at));
    const round = fwd ? (bend < total ? ease(bend) : bend) : bend > 0 ? ease(bend) : bend;
    const goal = fwd ? Math.min(at + ahead, round) : Math.max(at - ahead, round);
    const distance = walk;
    // The first hold from a little behind Pip up to the aim: the aim waits on the path beside it until Pip
    // is there. Beside it, not at it: on the spur a post stands on the steep side of the trail, and an aim
    // at the post itself sent Pip up the slope, climbing.
    let aimAt = goal;
    let held = false;
    for (const h of holds) {
      const o = along(p, h);
      if (o.off > HOLD_ON || (Math.abs(o.at - at) <= HOLD_REACH && best <= HOLD_REACH)) continue;
      const due = fwd ? o.at > at - HOLD_BACK && o.at <= goal : o.at < at + HOLD_BACK && o.at >= goal;
      if (due && (!held || (fwd ? o.at < aimAt : o.at > aimAt))) {
        aimAt = o.at;
        held = true;
      }
    }
    if (!held && (fwd ? goal >= stop.at : goal <= stop.at)) return { aim: target, distance, off: best };
    let s = 0;
    for (let i = 0; i < lengths.length; i++) {
      if (aimAt <= s + lengths[i] || i === lengths.length - 1) {
        const t = lengths[i] > 0 ? (aimAt - s) / lengths[i] : 0;
        const [ax, az] = p[i];
        const [bx, bz] = p[i + 1];
        return { aim: { x: ax + (bx - ax) * t, z: az + (bz - az) * t }, distance, off: best };
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
    // Round a building there is no trail to be off.
    if (span(from, legs[0]) > AT_CORNER) return { aim: legs[0], distance, off: 0 };
    // On the corner: the next leg, or straight on when the target is round it.
    return legs.length > 1 ? { aim: legs[1], distance, off: 0 } : null;
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
