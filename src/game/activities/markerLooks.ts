/**
 * What an activity marker can look like, beyond the four contract shapes.
 *
 * `MarkerSpec.shape` lives in core/contracts.ts and is shared with other work, so it is not widened
 * here. A `PlacedMarker` is still a valid `MarkerSpec` — every one carries a contract shape as its
 * fallback — and adds an optional `look` the marker layer draws instead. A renderer that ignores
 * the extra fields still draws something in the right place.
 *
 * Two families:
 *   transient — unlit, pooled, redrawn every frame and hidden when the activity ends (gates, the aim
 *               line, the snowball in flight, the puff of a hit);
 *   kept      — lit, flat-shaded pieces that stay in the world after the activity ends (the logs of
 *               a woodpile, a snowman, the stones of a dam). A spec is kept when it has `keep`.
 */

import type { MarkerSpec } from '../../core/contracts';
import type { StartLook } from './startPropMeshes';

export type TransientLook =
  | 'arch' | 'beam' | 'hoop' | 'lamp' | 'lamp-post' | 'shot' | 'pinecone' | 'dot' | 'puff' | 'target' | 'pulse'
  | 'sled' | 'kite' | 'arrow' | 'arrow-rim' | 'arrow-floor' | 'arrow-floor-rim' | 'beacon' | 'fish' | 'fin' | 'halo' | 'streak' | 'stake' | 'mitten';

export type PieceLook =
  | 'log' | 'snowball' | 'stone' | 'stone-laid' | 'stone-held' | 'carrot' | 'coal' | 'twig' | 'hat' | 'scarf' | 'pool' | 'hole' | 'deer' | 'snowman-target' | 'empty'
  | StartLook;

export type MarkerLook = TransientLook | PieceLook;

export interface PlacedMarker extends MarkerSpec {
  look?: MarkerLook;
  /** Rotation about world Y, radians. */
  yaw?: number;
  /** Rotation about the marker's own Z after yaw: tips a target over, angles a twig arm. */
  tilt?: number;
  /** Rotation about the marker's own X after yaw: noses an arrow up or down. */
  pitch?: number;
  /** Colour in place of the look's own, for a transient marker (a fish's body and fins). */
  color?: string;
  /** Uniform scale. When set it replaces the strength-based scale. */
  size?: number;
  /** Drawn faintly through whatever stands in front of it: a race's next gate behind a crag. */
  through?: boolean;
  /**
   * Group key for a kept piece. Each frame the layer replaces a group with exactly the pieces sent
   * under its key, and leaves every other group alone, so a finished build stays standing after the
   * activity closes. A lone `look: 'empty'` spec clears its group (a rebuild starting from nothing).
   */
  keep?: string;
}

export const PIECE_LOOKS: ReadonlySet<MarkerLook> = new Set<MarkerLook>([
  'log', 'snowball', 'stone', 'stone-laid', 'stone-held', 'carrot', 'coal', 'twig', 'hat', 'scarf', 'pool', 'hole', 'deer', 'snowman-target', 'empty',
  'pennant', 'start-sled', 'start-kite', 'start-banner', 'start-windsock', 'start-stool', 'start-frame',
  'start-snowballs', 'start-cones', 'start-skates', 'start-shovel',
]);
