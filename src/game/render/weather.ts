/**
 * Falling snow — carried as atmosphere, not as debris.
 *
 * DEVIATION FROM ART_BIBLE §6 (two GPU point layers, 900 / 2500), measured on the spike at
 * 384x216. A `PointsMaterial` sprite is never smaller than one internal pixel, and one internal
 * pixel is a 5x5 device window at 1080p. A/B of each pose with snow on vs off (same seed) found
 * 280–656 internal blocks altered by the flakes, 90–138 of them by more than 0.15 L, peaking at
 * +0.45 L — 2x2 blocks of L 0.68 sitting on ground of L 0.27. That is the "scattered rectangular
 * artifacts" read: at this resolution a flake can only be a dead pixel.
 *
 * Sub-pixel sizes, lower opacity and fewer particles all reduce it but cannot remove it, because
 * the floor is one whole block. So the weather is a band-limited veil evaluated in the composite
 * (`pixelPipeline.ts` `snowVeil`), in texel space: a slow falling haze at a 22-texel cell plus a
 * finer 4-texel layer, peak amplitude `AMOUNT` of luminance. Neighbouring blocks differ by under
 * 0.01, so no isolated high-contrast pixel is representable, while the frame still gains a moving
 * low-frequency veil that reads as snowfall against fog.
 *
 * This module owns the *motion model*: elapsed time, a gust-modulated lateral drift, and the
 * intensity envelope. The composite owns the look. Nothing is added to the scene, so there is also
 * nothing for the normal-override pass to catch (ART_BIBLE A3 stays satisfied by construction).
 */

export interface SnowVeil {
  /** Horizontal offset of the veil, in texels. */
  drift: number;
  /** Downward offset of the veil, in texels. */
  fall: number;
  /** Peak veil amplitude in sRGB units; 0 means "not snowing". */
  amount: number;
}

export interface Snowfall {
  /** Advance the weather and return the veil the composite should draw this frame. */
  update(dt: number, wind: number): SnowVeil;
  /** Jump the clock. A frame is reproducible from pose + weather time, never from page uptime. */
  seek(seconds: number, wind: number): SnowVeil;
  /** Turn the weather off without tearing the object down (the A/B seam). */
  setEnabled(on: boolean): void;
  dispose(): void;
}

/** Peak veil amplitude. Measured at 0.045: no block differs from the snow-off frame by more than
 *  0.045, and none differs by 0.05, so weather can never out-contrast the scene it falls through. */
const AMOUNT = 0.045;
/** Texels per second the veil falls. Slow: it is haze, and fast drift reads as TV static. */
const FALL = 14;
/** Gust depth: the amount breathes ±12 % so the veil does not look like a static texture. */
const GUST_DEPTH = 0.12;

export function createSnowfall(): Snowfall {
  let time = 0;
  let enabled = true;
  const veilAt = (seconds: number, wind: number): SnowVeil => ({
    drift: seconds * Math.max(0, wind) * 1.6,
    fall: seconds * FALL,
    amount: enabled ? AMOUNT * (1 + Math.sin(seconds * 0.47) * GUST_DEPTH) : 0,
  });

  return {
    update(dt: number, wind: number): SnowVeil {
      if (enabled) time += Math.min(Math.max(dt, 0), 1 / 20);
      return veilAt(time, wind);
    },
    seek(seconds: number, wind: number): SnowVeil {
      time = Math.max(0, seconds);
      return veilAt(time, wind);
    },
    setEnabled(on: boolean): void {
      enabled = on;
    },
    dispose(): void {
      time = 0;
      enabled = false;
    },
  };
}
