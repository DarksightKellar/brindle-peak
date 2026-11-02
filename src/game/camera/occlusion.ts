/**
 * Camera occlusion against vertical props.
 *
 * The rig already marches the pivot→camera ray against the terrain sampler, which keeps the camera
 * out of hills. It knew nothing about trees, and measurement found the consequence: in pinewind,
 * 2 of 24 sampled position/facing combinations put the chase camera *inside* a pine, filling 60-70%
 * of the frame with a dark green canopy wall (p50 luminance 0.13, 36% of pixels below L 0.10, where
 * no A Short Hike frame goes below p50 0.386). The player would hit this constantly while turning
 * among trees, and it reads as a rendering fault rather than a design choice.
 *
 * This module is deliberately pure and renderer-free: it takes plain numbers, so the geometry can be
 * tested without a WebGL context and reused by any future camera work.
 */

/** A vertical cylinder standing on the ground. `base` is the ground height at (x, z). */
export interface Occluder {
  x: number;
  z: number;
  radius: number;
  base: number;
  height: number;
}

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

const EPSILON = 1e-6;

/**
 * How far along `pivot → camera` the camera may travel before entering any occluder, as a fraction
 * in [0, 1]. 1 means the whole segment is clear.
 *
 * `margin` widens every cylinder so the camera stops just short of the bark instead of clipping it.
 */
export function clearFraction(
  pivot: Point3,
  camera: Point3,
  occluders: readonly Occluder[],
  margin = 0.55,
): number {
  const dx = camera.x - pivot.x;
  const dy = camera.y - pivot.y;
  const dz = camera.z - pivot.z;
  const horizontal = dx * dx + dz * dz;
  let nearest = 1;

  for (const o of occluders) {
    const radius = o.radius + margin;
    const fx = pivot.x - o.x;
    const fz = pivot.z - o.z;
    const c = fx * fx + fz * fz - radius * radius;

    // Pivot already inside the cylinder: there is no "before", so pull almost all the way in.
    if (c <= 0) {
      const vertical = pivot.y >= o.base - margin && pivot.y <= o.base + o.height;
      if (vertical) return Math.min(nearest, 0.05);
      continue;
    }
    if (horizontal < EPSILON) continue;

    const b = 2 * (fx * dx + fz * dz);
    const discriminant = b * b - 4 * horizontal * c;
    if (discriminant <= 0) continue;

    // Entry point only: the camera comes from the pivot, so it meets the near wall first.
    const t = (-b - Math.sqrt(discriminant)) / (2 * horizontal);
    if (t < 0 || t >= nearest) continue;

    // The horizontal hit only blocks if the camera is actually at the trunk's height there.
    const y = pivot.y + dy * t;
    if (y < o.base - margin || y > o.base + o.height) continue;

    nearest = t;
  }

  return nearest;
}
