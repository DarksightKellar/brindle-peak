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
import { makeRng } from '../../core/contracts';

/** Every snow lattice tiles on 64 cells of 7, 13 or 31 texels; this is a length all three repeat on. */
export const WRAP = 64 * 7 * 13 * 31;

export interface SnowVeil {
  /** Horizontal offset of the flakes, in texels (scaled by the layer's own speed in the shader). */
  drift: number;
  /** Downward offset, in texels: FALL texels a second. */
  fall: number;
  /** How much is falling: 0 none, 1 a steady fall, 2 heavy. */
  amount: number;
  /**
   * Where a passing gust has carried each layer (far, mid, near), in texels, +y up. Each layer now and
   * then catches a gust of its own for a few seconds and is blown off in another direction from the
   * rest, so the fall never moves as one sheet.
   */
  layers: readonly [Gust, Gust, Gust];
}

export type Gust = readonly [number, number];

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
/** Each layer's own fall speed, texels a second (the shader's far, mid and near lattices). */
const LAYER_SPEED = [16, 28, 52] as const;
/** Chance a second that a calm layer catches a gust; twice that when the wind is up. */
const GUST_CHANCE = 1 / 9;
/** A gust's push, as a share of its layer's fall speed. */
const GUST_PUSH = 0.7;

interface LayerGust {
  /** Carried so far, texels. */
  x: number;
  y: number;
  /** The current gust: direction (unit), how long, how far in. 0 duration = calm. */
  dx: number;
  dy: number;
  dur: number;
  age: number;
}

export function createSnowfall(): Snowfall {
  let time = 0;
  let drift = 0;
  let amount = -1; // -1 until the first frame says where the player stands: no fade-in on load
  let enabled = true;
  const rng = makeRng(0x5a0f1a);
  const gusts: LayerGust[] = LAYER_SPEED.map(() => ({ x: 0, y: 0, dx: 0, dy: 0, dur: 0, age: 0 }));
  const out = (): SnowVeil => ({
    drift,
    fall: time * FALL,
    amount: enabled ? Math.max(0, amount) : 0,
    layers: [[gusts[0].x, gusts[0].y], [gusts[1].x, gusts[1].y], [gusts[2].x, gusts[2].y]],
  });

  /** Blow each layer along: start a gust now and then, carry it, let it die away. */
  const blow = (step: number, wind: number): void => {
    gusts.forEach((g, i) => {
      if (g.dur === 0) {
        if (rng.range(0, 1) > step * GUST_CHANCE * (wind > 1.5 ? 2 : 1)) return;
        // Any way but straight down: sideways either way, often lifting, sometimes back against the wind.
        const a = rng.range(-0.35, Math.PI + 0.35);
        g.dx = Math.cos(a);
        g.dy = Math.sin(a) * 0.6;
        g.dur = rng.range(2, 5);
        g.age = 0;
      }
      g.age += step;
      // Rises and falls away smoothly, so a layer drifts off course and back rather than jerking.
      const push = Math.sin(Math.PI * Math.min(1, g.age / g.dur)) * LAYER_SPEED[i] * GUST_PUSH * step;
      g.x = (g.x + g.dx * push) % WRAP;
      g.y = (g.y + g.dy * push) % WRAP;
      if (g.age >= g.dur) g.dur = 0;
    });
  };

  return {
    update(dt: number, wind: number, want = STEADY): SnowVeil {
      if (!enabled) return out();
      const step = Math.min(Math.max(dt, 0), 1 / 20);
      time += step;
      drift += step * Math.max(0, wind) * DRIFT;
      blow(step, wind);
      if (amount < 0) amount = want;
      const by = EASE * step;
      amount = want > amount ? Math.min(want, amount + by) : Math.max(want, amount - by);
      return out();
    },
    seek(seconds: number, wind: number, want = STEADY): SnowVeil {
      time = Math.max(0, seconds);
      drift = time * Math.max(0, wind) * DRIFT;
      amount = want;
      for (const g of gusts) Object.assign(g, { x: 0, y: 0, dur: 0, age: 0 });
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
