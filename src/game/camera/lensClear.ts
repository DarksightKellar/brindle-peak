/**
 * Which objects the lens is standing in, so the view fade can take them away whole.
 *
 * Among pines the chase camera often stands inside or right beside a canopy: from Pinewind's race start
 * and leaving Hollowpine Hamlet north, half the screen was one flat green cone, and at the summit the
 * lens stood among the mast's legs. Pulling the camera in front of the tree ends up in the bird, and
 * swinging it round a tree fights the player in a wood, so the camera stays where it is and the thing it
 * stands in goes: a tree, rock or the mast whose footprint, widened by MARGIN, holds the lens. It
 * stipples out over FADE seconds and back in the same way once the lens is clear (LEAVE further out, so
 * it does not flicker at the edge). Reduce-motion takes it at once.
 *
 * The objects are the camera occluders (world/assemble.ts), which carry each trunk's spot and footprint,
 * plus the mast, which is not one: the camera looks through its lattice everywhere else.
 */

import type { TerrainSampler } from '../../core/contracts';
import { PEAK } from '../../data/zones';
import { MAST_HEIGHT } from '../world/summit';
import { CLEAR, setLensClear } from '../render/viewFade';
import type { Occluder, Point3 } from './occlusion';

/** Beyond the footprint, how near the lens may come before the object goes, and how far it must leave. */
const MARGIN = 2.2;
const LEAVE = 0.6;
/** Above the top by this much and the lens is over the object, not in it. */
const OVER = 0.5;
const FADE = 0.2;
/** The mast's legs stand 1.7 u out from its foot (world/summit.ts) on a 3.6 u plinth; red legs that
 *  near the lens are a third of the screen each, so it goes from a little further out than a tree. */
const MAST_RADIUS = 3.2;

export interface LensClear {
  /** `on` false (the viewfinder) clears nothing. */
  update(lens: Point3, list: readonly Occluder[], terrain: TerrainSampler, on: boolean, step: number, reduced: boolean): void;
}

export function createLensClear(): LensClear {
  const gone = new Map<Occluder, number>();
  let mast: Occluder | null = null;
  const items: { x: number; z: number; weight: number }[] = [];

  const inside = (o: Occluder, lens: Point3, wide: number): boolean => {
    if (lens.y > o.base + o.height + OVER || lens.y < o.base - 1) return false;
    const r = o.radius + wide;
    const dx = lens.x - o.x;
    const dz = lens.z - o.z;
    return dx * dx + dz * dz < r * r;
  };

  return {
    update(lens, list, terrain, on, step, reduced): void {
      mast ??= { x: PEAK.x, z: PEAK.z, base: terrain.heightAt(PEAK.x, PEAK.z), radius: MAST_RADIUS, height: MAST_HEIGHT + 3.2 };
      const rate = reduced ? 1 : step / FADE;
      // Fading in: anything newly holding the lens. Every frame is a scan of a few hundred numbers.
      if (on) {
        for (const o of list) if (!gone.has(o) && inside(o, lens, MARGIN)) gone.set(o, 0);
        if (!gone.has(mast) && inside(mast, lens, MARGIN)) gone.set(mast, 0);
      }
      items.length = 0;
      for (const [o, w] of gone) {
        const keep = on && inside(o, lens, MARGIN + LEAVE);
        const next = Math.min(1, Math.max(0, w + (keep ? rate : -rate)));
        if (next <= 0 && !keep) {
          gone.delete(o);
          continue;
        }
        gone.set(o, next);
        items.push({ x: o.x, z: o.z, weight: next });
      }
      // The nearest few, if the lens is ever among more than the shader has room for.
      if (items.length > CLEAR) {
        items.sort((a, b) => Math.hypot(a.x - lens.x, a.z - lens.z) - Math.hypot(b.x - lens.x, b.z - lens.z));
      }
      setLensClear(items);
    },
  };
}
