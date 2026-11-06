/**
 * Noticing the first feather.
 *
 * Feathers were never introduced: a critic found one of fourteen by accident and never learned what it
 * did. Until the first one is picked up, the HUD notices any feather within reach: a feather glyph sits
 * on the compass strip at its bearing for as long as it is near, and the very first time one comes near
 * the line under the goal says so (once a run) while the feather chip by the stamina bar shows its 0.
 * After the first pickup the bar visibly lengthens (hudStamina.ts) and the HUD stops pointing: the rest
 * are for finding.
 */

import type { GameState, Vec2 } from '../../core/contracts';
import { compassWord, formatDistance } from '../../core/guide/compass';
import { viewWay } from './hudNearby';
import { PICKUPS } from '../../data/pickups';

/** A feather nearer than this is worth pointing at, in world units. */
export const FEATHER_NOTICE_RANGE = 40;
/** How long the one-time line stays, in ms. */
export const FEATHER_LINE_MS = 9000;

/** One short line introducing feathers: each one is more breath for running and flapping. */
export const FEATHER_LINE = 'A feather nearby. Each one gives you longer breath for running and flapping';

const FEATHERS = PICKUPS.filter((p) => p.kind === 'feather');

export interface FeatherNotice {
  /** The feather the compass should show, or null. */
  feather: Vec2 | null;
  /** The one-time line, bearing included, or '' when it is not showing. */
  line: string;
  /** True on the frame the line first appears, so the chip can be shown with it. */
  started: boolean;
}

export function createFeatherNotice(): { update(s: GameState, from: Vec2, nowMs: number, viewYaw?: number): FeatherNotice } {
  let lineUntil = -1;

  return {
    update(s, from, nowMs, viewYaw): FeatherNotice {
      if (s.feathers > 0) return { feather: null, line: '', started: false };
      let best: Vec2 | null = null;
      let bestD = FEATHER_NOTICE_RANGE;
      for (const f of FEATHERS) {
        if (s.flags[`picked:${f.id}`]) continue;
        const d = Math.hypot(f.pos.x - from.x, f.pos.z - from.z);
        if (d < bestD) {
          bestD = d;
          best = f.pos;
        }
      }
      const started = best !== null && lineUntil < 0;
      if (started) lineUntil = nowMs + FEATHER_LINE_MS;
      if (!best || nowMs >= lineUntil) return { feather: best, line: '', started };
      // Against the view, as the nearby line says it (hudNearby.ts `viewWay`).
      const dx = best.x - from.x, dz = best.z - from.z;
      const where = bestD < 1.5 ? '' : ` — ${viewYaw === undefined ? compassWord(dx, dz) : viewWay(dx, dz, viewYaw)}, ${formatDistance(bestD)}`;
      return { feather: best, line: `${FEATHER_LINE}${where}`, started };
    },
  };
}
