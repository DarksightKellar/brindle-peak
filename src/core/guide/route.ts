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
export function along(p: GuideRoute['path'], pt: Vec2): { at: number; off: number } {
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
export function routeAim(
  routes: readonly GuideRoute[],
  from: Vec2,
  target: Vec2,
  holds: readonly Vec2[] = [],
  gaps: readonly GuideGap[] = [],
): RouteAim | null {
  const found = trailAim(routes, from, target, holds);
  return gaps.length > 0 ? roundGap(gaps, routes, from, target, holds, found) : found;
}

/**
 * A drop the guide must not point across: Tuck's gorge, and the bridge that crosses it. Critic round 125,
 * coming home, stood on the ledge east of the gorge 18 u south of the trail, and the aim a little way back
 * along the trail lay west of it, at the bridge's far end. The straight line there runs over a 14 u drop.
 */
export interface GuideGap {
  /** The gap's deep stretch, as a line. */
  line: readonly [readonly [number, number], readonly [number, number]];
  /** How far either side of the line its walls reach. */
  width: number;
  /**
   * The crossing's two ends, one either side of the line, a few steps out from it on its centre line. The
   * way between them is the lane: Tuck's bridge between its end posts is about 1.5 u wide to walk.
   */
  ends: readonly [readonly [number, number], readonly [number, number]];
  /**
   * Fences flaring out from the crossing's end posts, each from the post to its outer corner. A walk to an
   * end comes in between them; from the ledge south of Tuck's gorge the straight line to the bridge's end
   * ran through the south flare, and the way on is round its corner.
   */
  flares?: readonly (readonly [readonly [number, number], readonly [number, number]])[];
}

/** Round a flare's corner this far out past it, so the walk on to the end clears the corner post. */
const ROUND = 3;

/** A way that keeps this close to the crossing's centre line where it meets the gap is walking the crossing. */
const ON_CROSSING = 0.6;
/** Pip this close to the crossing's centre line, between its ends, is in the lane: the deck's width, and a little. */
const LANE = 2;
/**
 * In the lane, the aim is this far along it: close, so a walk that came in to one side straightens up
 * before the end posts. With the trail's aim 14 u on, a walk 1 u to one side came onto the deck at its
 * edge, and Pip slipped off it.
 */
const LANE_AHEAD = 4;

/** Where line a→b meets line c→d, as the fraction along a→b; null when they don't meet between the ends. */
function meet(a: Vec2, b: Vec2, c: Vec2, d: Vec2): number | null {
  const rx = b.x - a.x, rz = b.z - a.z, sx = d.x - c.x, sz = d.z - c.z;
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * sz - (c.z - a.z) * sx) / den;
  const u = ((c.x - a.x) * rz - (c.z - a.z) * rx) / den;
  return t > 0 && t < 1 && u >= 0 && u <= 1 ? t : null;
}

/**
 * The aim, when the way to it runs over a gap: along the lane while Pip is in it, else to the lane's end
 * on Pip's side.
 */
function roundGap(
  gaps: readonly GuideGap[],
  routes: readonly GuideRoute[],
  from: Vec2,
  target: Vec2,
  holds: readonly Vec2[],
  found: RouteAim | null,
): RouteAim | null {
  const aim = found?.aim ?? target;
  const pt = ([x, z]: readonly [number, number]): Vec2 => ({ x, z });
  for (const g of gaps) {
    const c = pt(g.line[0]), d = pt(g.line[1]);
    const e0 = pt(g.ends[0]), e1 = pt(g.ends[1]);
    // Where the way meets the line and each wall's top. A way over the bridge keeps to the crossing at all
    // of them: a slant at the bridge's middle meets the line on the planks, but comes down the wall beside
    // them first, and one to a point on the planks near their end meets only the wall.
    const len = Math.hypot(d.x - c.x, d.z - c.z) || 1;
    const nx = -(d.z - c.z) / len * g.width, nz = (d.x - c.x) / len * g.width;
    const ex = e1.x - e0.x, ez = e1.z - e0.z, elen = Math.hypot(ex, ez) || 1;
    const offCrossing = (q: Vec2): number => Math.abs((q.x - e0.x) * ez - (q.z - e0.z) * ex) / elen;
    const hits = [0, 1, -1]
      .map((k) => meet(from, aim, { x: c.x + nx * k, z: c.z + nz * k }, { x: d.x + nx * k, z: d.z + nz * k }))
      .filter((tk): tk is number => tk !== null)
      .map((tk) => ({ x: from.x + (aim.x - from.x) * tk, z: from.z + (aim.z - from.z) * tk }));
    if (hits.every((q) => offCrossing(q) <= ON_CROSSING)) continue;
    const side = (p: Vec2): number => Math.sign((d.x - c.x) * (p.z - c.z) - (d.z - c.z) * (p.x - c.x));
    const walkOn = (end: Vec2): number =>
      trailAim(routes, end, target, holds)?.distance ?? Math.hypot(target.x - end.x, target.z - end.z);
    const s = ((from.x - e0.x) * ex + (from.z - e0.z) * ez) / elen;
    if (offCrossing(from) <= LANE && s >= 0 && s <= elen) {
      // In the lane: a little way along it, toward the end on the aim's side.
      const far = side(e1) === side(aim) ? e1 : e0;
      const on = far === e1 ? Math.min(elen, s + LANE_AHEAD) : Math.max(0, s - LANE_AHEAD);
      const toFar = Math.hypot(far.x - from.x, far.z - from.z);
      return { aim: { x: e0.x + (ex * on) / elen, z: e0.z + (ez * on) / elen }, distance: toFar + walkOn(far), off: found?.off ?? 0 };
    }
    const end = side(e0) === side(from) ? e0 : e1;
    const toEnd = Math.hypot(end.x - from.x, end.z - from.z);
    // Round a flare in the way, past its corner.
    for (const [p, q] of g.flares ?? []) {
      const post = pt(p), corner = pt(q);
      const fl = Math.hypot(corner.x - post.x, corner.z - post.z) || 1;
      const ux = (corner.x - post.x) / fl, uz = (corner.z - post.z) / fl;
      // A little past the corner too: a line that grazes it catches on it.
      if (meet(from, end, post, { x: corner.x + ux, z: corner.z + uz }) === null) continue;
      const via = { x: corner.x + ux * ROUND, z: corner.z + uz * ROUND };
      const toVia = Math.hypot(via.x - from.x, via.z - from.z);
      return { aim: via, distance: toVia + Math.hypot(end.x - via.x, end.z - via.z) + walkOn(end), off: found?.off ?? 0 };
    }
    return { aim: end, distance: toEnd + walkOn(end), off: found?.off ?? 0 };
  }
  return found;
}

function trailAim(routes: readonly GuideRoute[], from: Vec2, target: Vec2, holds: readonly Vec2[]): RouteAim | null {
  // A route leads to what stands at its end, not to something beside another stretch of the trail: the
  // Chimney Scramble's post (round 111) stood 55 u past the end of the way to Tuck's bridge, 11 u off the
  // trail beyond it, and critic round 114 at the chimney's foot read 164 u, back to the bridge and out again.
  const offs = routes.map((r) => (r.path.length < 2 ? Infinity : along(r.path, target).off));
  const nearest = Math.min(...offs);
  // Two routes can lead to the same target: the way up as far as Tuck's bridge, and the way back down to it
  // from the mast. The one Pip stands nearest leads. Critic round 121, 19 u above the trail past the bridge,
  // was led 78 u back to the lower trail's end instead, and read two "back on it" distances at one spot.
  let found: RouteAim | null = null;
  /** How far off its path Pip stands for the way `found` came from. */
  let foundBest = Infinity;
  routes: for (const [ri, r] of routes.entries()) {
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
    if (found && foundBest <= best) continue;
    foundBest = best;
    if (!held && (fwd ? goal >= stop.at : goal <= stop.at)) {
      // Pointed straight at it, the walk is the straight line and the trail is not where Pip is sent: critic
      // round 132, on the summit's east face 74 u from Edda, read "108 u by the trail" with "90 u to the
      // trail, behind you" beside an arrow pointing at Edda, and walked 100 u away to the trail.
      found = best > ON_PATH ? { aim: target, distance: straight, off: 0 } : { aim: target, distance, off: best };
      continue;
    }
    let s = 0;
    for (let i = 0; i < lengths.length; i++) {
      if (aimAt <= s + lengths[i] || i === lengths.length - 1) {
        const t = lengths[i] > 0 ? (aimAt - s) / lengths[i] : 0;
        const [ax, az] = p[i];
        const [bx, bz] = p[i + 1];
        found = { aim: { x: ax + (bx - ax) * t, z: az + (bz - az) * t }, distance, off: best };
        continue routes;
      }
      s += lengths[i];
    }
  }
  return found;
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
