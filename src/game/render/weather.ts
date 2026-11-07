/**
 * Falling snow — flakes drawn in the composite, how much of it decided here.
 *
 * History: ART_BIBLE §6 asked for two GPU point layers. At 384x216 a point sprite is never smaller
 * than one internal pixel, so on still frames each flake measured as a dead 2x2 block, and the weather
 * became a faint drifting veil instead. In play the veil barely showed and the director called it
 * not great. Moving flakes, drawn on a texel lattice at three depths in the composite
 * (`compositeShader.ts` `flakes`), read as snowfall where the veil read as nothing.
 *
 * Snow is set by place: a steady fall in the valley, heavy in Pinewind Wood and on Windscar Ridge,
 * where gusts blow it sideways. This module owns the *motion model*: elapsed time, a lateral drift
 * integrated from the wind (so a gust speeds the flakes up instead of jumping them), and an amount
 * that eases between places. The composite owns the look. Nothing is added to the scene, so there is
 * nothing for the normal-override pass to catch (ART_BIBLE A3 stays satisfied by construction).
 */

export interface SnowVeil {
  /** Horizontal offset of the flakes, in texels (scaled by the layer's own speed in the shader). */
  drift: number;
  /** Downward offset, in texels: FALL texels a second. */
  fall: number;
  /** How much is falling: 0 none, 1 a steady fall, 2 heavy. */
  amount: number;
}

export interface Snowfall {
  /**
   * Advance the weather and return what the composite should draw this frame.
   * `wind` is the sideways push (about 0.6 calm, 2.4 in a gust); `want` is the place's snow
   * (1 steady, 2 heavy). The amount eases toward `want`, so walking between places changes it gently.
   */
  update(dt: number, wind: number, want?: number): SnowVeil;
  /** Jump the clock. A frame is reproducible from pose + weather time, never from page uptime. */
  seek(seconds: number, wind: number, want?: number): SnowVeil;
  /** Turn the weather off without tearing the object down (the A/B seam). */
  setEnabled(on: boolean): void;
  dispose(): void;
}

/** Texels per second the slowest layer falls; the shader scales each layer from this. */
const FALL = 14;
/** Texels of sideways drift per second per unit of wind. */
const DRIFT = 6;
/** How fast the amount follows the place, in amount per second (about two seconds from steady to heavy). */
const EASE = 0.5;
/** The place's snow when none is given. */
const STEADY = 1;

export function createSnowfall(): Snowfall {
  let time = 0;
  let drift = 0;
  let amount = -1; // -1 until the first frame says where the player stands: no fade-in on load
  let enabled = true;
  const out = (): SnowVeil => ({ drift, fall: time * FALL, amount: enabled ? Math.max(0, amount) : 0 });

  return {
    update(dt: number, wind: number, want = STEADY): SnowVeil {
      if (!enabled) return out();
      const step = Math.min(Math.max(dt, 0), 1 / 20);
      time += step;
      drift += step * Math.max(0, wind) * DRIFT;
      if (amount < 0) amount = want;
      const by = EASE * step;
      amount = want > amount ? Math.min(want, amount + by) : Math.max(want, amount - by);
      return out();
    },
    seek(seconds: number, wind: number, want = STEADY): SnowVeil {
      time = Math.max(0, seconds);
      drift = time * Math.max(0, wind) * DRIFT;
      amount = want;
      return out();
    },
    setEnabled(on: boolean): void {
      enabled = on;
    },
    dispose(): void {
      time = 0;
      drift = 0;
      enabled = false;
    },
  };
}
