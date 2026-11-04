/**
 * Horizontal collision for the player against the solid world: tree trunks, fences and buildings.
 *
 * Pure and three-free. Colliders are built from the same data the visuals are built from
 * (game/world/colliders.ts); this file only pushes a point out of them.
 */

/** Optional `top`: height above the ground, world units. A bird flying higher than it passes over. */
export type Collider =
  | { kind: 'circle'; x: number; z: number; r: number; top?: number }
  | { kind: 'segment'; ax: number; az: number; bx: number; bz: number; r: number; top?: number }
  | { kind: 'box'; x: number; z: number; hw: number; hd: number; yaw: number; top?: number };

function closestOnSegment(p: { x: number; z: number }, s: Extract<Collider, { kind: 'segment' }>): { x: number; z: number } {
  const dx = s.bx - s.ax, dz = s.bz - s.az, len2 = dx * dx + dz * dz;
  if (len2 <= 1e-9) return { x: s.ax, z: s.az };
  let t = ((p.x - s.ax) * dx + (p.z - s.az) * dz) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return { x: s.ax + dx * t, z: s.az + dz * t };
}

/** Push `p` out of the circle (cx, cz, r) to exactly touching distance. True when it moved. */
function pushOutOfCircle(p: { x: number; z: number }, cx: number, cz: number, r: number): boolean {
  const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;
  const d = Math.sqrt(d2);
  if (d < 1e-6) {
    // Dead centre: any direction is honest; pick +X rather than divide by zero.
    p.x = cx + r;
    p.z = cz;
    return true;
  }
  p.x = cx + (dx / d) * r;
  p.z = cz + (dz / d) * r;
  return true;
}

/**
 * Move `p` (in place) out of every collider it overlaps, for a body of `radius`. `height` is how far
 * above the ground the body is; colliders with a `top` below it are flown over. A few passes settle
 * corners where two colliders push against each other. Returns true when `p` moved.
 */
export function resolveCollisions(
  p: { x: number; z: number },
  radius: number,
  colliders: readonly Collider[],
  height = -Infinity,
  passes = 3,
): boolean {
  let movedAny = false;
  for (let pass = 0; pass < passes; pass++) {
    let moved = false;
    for (const c of colliders) {
      // 5 cm of clearance over the top before the bird counts as over it.
      if (c.top !== undefined && height > c.top + 0.05) continue;
      if (c.kind === 'circle') {
        if (pushOutOfCircle(p, c.x, c.z, c.r + radius)) moved = true;
      } else if (c.kind === 'segment') {
        const q = closestOnSegment(p, c);
        if (pushOutOfCircle(p, q.x, q.z, c.r + radius)) moved = true;
      } else {
        // Into the box's own frame, out through the nearer face, and back.
        const cos = Math.cos(c.yaw), sin = Math.sin(c.yaw);
        const dx = p.x - c.x, dz = p.z - c.z;
        const lx = dx * cos - dz * sin, lz = dx * sin + dz * cos;
        const hx = c.hw + radius, hz = c.hd + radius;
        const penX = hx - Math.abs(lx), penZ = hz - Math.abs(lz);
        if (penX <= 0 || penZ <= 0) continue;
        const ox = penX < penZ ? Math.sign(lx || 1) * hx : lx;
        const oz = penX < penZ ? lz : Math.sign(lz || 1) * hz;
        p.x = c.x + ox * cos + oz * sin;
        p.z = c.z - ox * sin + oz * cos;
        moved = true;
      }
    }
    if (!moved) break;
    movedAny = true;
  }
  return movedAny;
}

/** A round collider this big or smaller is a prop to slip round, not a wall to stop at. */
const SLIP_MAX_R = 2.5;
/** Progress along the step, as a share of it, below which the body counts as stopped. */
const STOPPED = 0.25;

function touchesWall(p: { x: number; z: number }, radius: number, colliders: readonly Collider[], height: number): boolean {
  for (const c of colliders) {
    if (c.top !== undefined && height > c.top + 0.05) continue;
    if (c.kind === 'circle') {
      if (c.r > SLIP_MAX_R && Math.hypot(p.x - c.x, p.z - c.z) < c.r + radius + 0.05) return true;
    } else if (c.kind === 'segment') {
      const q = closestOnSegment(p, c);
      if (Math.hypot(p.x - q.x, p.z - q.z) < c.r + radius + 0.05) return true;
    } else {
      const cos = Math.cos(c.yaw), sin = Math.sin(c.yaw);
      const dx = p.x - c.x, dz = p.z - c.z;
      const ox = Math.max(0, Math.abs(dx * cos - dz * sin) - c.hw), oz = Math.max(0, Math.abs(dx * sin + dz * cos) - c.hd);
      if (Math.hypot(ox, oz) < radius + 0.05) return true;
    }
  }
  return false;
}

/** A slip under way: which side Pip is stepping round on (+1 left, -1 right) and frames left of it. */
export interface Slip {
  side: number;
  frames: number;
}

/** Frames a slip keeps to its side once begun: about half a second, enough to clear a rock. */
const SLIP_FRAMES = 30;

/**
 * `resolveCollisions` for a body that stepped from `from` to `p`, which also slips round small props.
 *
 * Pushing a point out of a circle sends it straight back the way it came when it walks at the centre,
 * and two rocks side by side make a notch whose pushes cancel. Critic round 11 stood pinned for 80 s of
 * a race against a sign post and a rock, holding W, until it flapped over. When a step makes almost no
 * headway and only small round props are in the way, it is turned 35°, 70° or 100° to one side, the
 * one that gets furthest, and `slip` keeps Pip on that side for half a second, the way a player steps
 * round a rock. One sidestep alone is not enough: out of a notch, the next straight step slides back
 * into it. Walls, fences and buildings still stop Pip.
 */
export function resolveWithSlip(
  from: { x: number; z: number },
  p: { x: number; z: number },
  radius: number,
  colliders: readonly Collider[],
  height = -Infinity,
  slip: Slip = { side: 1, frames: 0 },
): boolean {
  const mx = p.x - from.x, mz = p.z - from.z;
  const m = Math.hypot(mx, mz);
  const hit = resolveCollisions(p, radius, colliders, height);
  if (!hit || m < 1e-4) {
    if (!hit) slip.frames = 0;
    return hit;
  }
  const ux = mx / m, uz = mz / m;
  const ax = p.x - from.x, az = p.z - from.z;
  const going = slip.frames > 0;
  if (!going && ax * ux + az * uz > STOPPED * m) return hit;
  if (touchesWall(p, radius, colliders, height)) {
    slip.frames = 0;
    return hit;
  }
  // Headway counts, but so does getting anywhere at all: out of a notch the way round starts sideways
  // and a little back, along a rock's face.
  const score = (dx: number, dz: number): number => dx * ux + dz * uz + Math.hypot(dx, dz);
  // A slip under way keeps its side; a new one starts on the side the push already leans to.
  const lean = Math.sign(ux * az - uz * ax) || 1;
  const sides = going ? [slip.side] : [lean, -lean];
  let best: { x: number; z: number; side: number } | null = null;
  let bestScore = going ? -Infinity : score(ax, az);
  for (const deg of [35, 70, 100]) {
    for (const s of sides) {
      const a = (s * deg * Math.PI) / 180;
      const q = { x: from.x + mx * Math.cos(a) - mz * Math.sin(a), z: from.z + mx * Math.sin(a) + mz * Math.cos(a) };
      resolveCollisions(q, radius, colliders, height);
      const dx = q.x - from.x, dz = q.z - from.z;
      const sc = score(dx, dz);
      const len = Math.hypot(dx, dz);
      if (len > 0.4 * m && dx * ux + dz * uz > -0.7 * len && sc > bestScore + 1e-6) {
        best = { x: q.x, z: q.z, side: s };
        bestScore = sc;
      }
    }
    if (best && !going) break;
  }
  if (best && (going || score(best.x - from.x, best.z - from.z) > score(ax, az))) {
    p.x = best.x;
    p.z = best.z;
    slip.frames = going ? slip.frames - 1 : SLIP_FRAMES;
    slip.side = best.side;
  } else {
    slip.frames = 0;
  }
  return hit;
}
