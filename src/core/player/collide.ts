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
