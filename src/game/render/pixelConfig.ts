/**
 * Render tuning — the one place for pixel-pipeline numbers (ARCHITECTURE §1.8).
 *
 * Pure TS — no `three`, no DOM — so it loads under the node test environment. The grade itself is
 * GLSL (compositeShader.ts); its frozen TS reference is `core/palette.grade`. A second TS copy used
 * to live here as well, unused by anything, and was removed rather than kept in step by hand.
 */
import type { GradeSettings } from '../../core/contracts';
import { GRADE_SETTINGS } from '../../core/palette';

export const INTERNAL_W = 384;
export const INTERNAL_H = 216;
/**
 * ART_BIBLE §1: the block is 5 px at 1920, which is what the game ships with.
 *
 * `PIXEL_SIZE_OPTIONS` used to live here documenting 3 / 5 / 8 while the pause menu shipped its own
 * 3 / 4 / 5 / 6 — the same duplicated-constant class that produced the two grades and the two world
 * seeds. There is now one list, and the menu imports this one.
 */
export const DEFAULT_PIXEL_SIZE = 5;
export const PIXEL_SIZE_OPTIONS = [3, 4, 5, 6] as const;

export interface BackingSize {
  width: number;
  height: number;
  /** Integer upscale factor from the 384x216 contract; also the block size at 1080p. */
  scale: number;
}

/**
 * ART_BIBLE A4. Integer blocks off the *CSS* size; devicePixelRatio is never consulted — that is
 * what produced 3–4 px blocks and moiré at DPR 1.5.
 */
export function backingSize(cssW: number, cssH: number): BackingSize {
  const scale = Math.max(1, Math.floor(Math.min(cssW / INTERNAL_W, cssH / INTERNAL_H)));
  return { width: INTERNAL_W * scale, height: INTERNAL_H * scale, scale };
}

export interface RenderSize {
  width: number;
  height: number;
}

/**
 * Render-target size for a chosen pixel size: 384x216 at the default 5, scaled by 5/n elsewhere, so
 * the displayed block stays `n` px at 1920 wide (block = backing / target = 384*scale / (384*5/n)).
 */
export function renderSize(pixelSize: number): RenderSize {
  const n = Math.min(12, Math.max(1, Math.round(pixelSize)));
  return {
    width: Math.max(96, Math.round((INTERNAL_W * DEFAULT_PIXEL_SIZE) / n)),
    height: Math.max(54, Math.round((INTERNAL_H * DEFAULT_PIXEL_SIZE) / n)),
  };
}

// --- Grade: sRGB space, applied in the composite after linear -> sRGB (ART_BIBLE A1). ---

/**
 * Tuned against the corrected per-frame gate on measured spike frames, not the old pooled one.
 * saturation 2.6: lowest value where every pose's satP50 stays inside the reference band
 *   0.402..0.864 (2.4 measures 0.377, below the reference's own darkest-chroma frame; 3.2 reaches
 *   0.546 median for chroma the reference gets from autumn foliage, not from its grade).
 * lift 0.165: min 0.135..0.167, p1 0.198..0.227. 0.19 left min at 0.151..0.186 — a floor brighter
 *   than any reference frame; 0.14 put min at 0.116, needlessly near the 0.10 gate.
 * splitTonality 0.4: 0.4 / 0.55 / 0.7 measured within 1pp on both band shares — smallest push wins.
 * Lift is A7's c + floor*lift*(1-c): black reaches the floor, white stays 1.0.
 */
/**
 * The renderer's grade. Imported from `core/palette.ts` rather than restated here: this file used to
 * hold its own copy, which drifted from the one the tests exercised. One definition, one place.
 */
export const GRADE: GradeSettings = GRADE_SETTINGS;

/**
 * The grade's saturation eases from GRADE.saturation down to `saturation` as pre-grade luma rises
 * from `from` to `to`; the sky and the far fade are exempt. Shade and mid-tones keep the full boost
 * (cool blue shadows, wood, pine, open snow); sunlit faces and bright snow no longer go pastel cyan
 * or burnt orange. Starting at 0.40 also calmed open snow, but a sunlit field then read grey.
 */
export const SAT_TAPER = { from: 0.55, to: 0.95, saturation: 1.4 } as const;


/**
 * Exponential-squared fog, applied once (ART_BIBLE A2 / §6). §6's 0.018 base saturates visibility
 * at ~55 u: p50 0.812, saturation 0.097, a pastel wash. Denser options measured 0.007 -> p50 0.633 /
 * sat 0.658 and 0.010 -> 0.676 / 0.848 — brighter than the reference's 0.484 median and at the top
 * of its chroma band.
 *
 * 0.0045 uncapped then turned everything past ~120 u into the one fog blue: the grade multiplies
 * chroma by 2.6, so a dark pine with even 20 % haze came out a flat blue spike, and the hills a flat
 * blue mesa. Now two stages (compositeShader.ts): the haze is capped at `hazeCap`, so it only cools
 * things; distance itself is a fade after the grade toward the sky's horizon colour, from
 * `fadeStart` to `fadeEnd` at most `fadeMax`, so each layer further away is paler and still keeps
 * its own light and shade. Capping the haze alone (no fade) kept trees dark but blue and showed the
 * far-plane edge; a pale haze before the grade went milky; fog by height added little for the cost.
 */
export const FOG = {
  density: 0.003, restDensity: 0.0022, hazeCap: 0.1,
  fadeStart: 40, fadeEnd: 400, fadeMax: 0.62,
  /** SKY_LOW, the haze colour at a low sun: cool enough to stay out of the warm band. */
  color: '#8FA8CE',
} as const;

/** Soft outline (ART_BIBLE §5). Strengths in the units the shader works in. */
export const EDGE = {
  depth: 0.45, normal: 0.3,
  /** Multiplied by the normal edge indicator: 1 + 0.3*0.5 = x1.15 max emphasis. */
  normalGain: 0.5,
  /** View-space metres summed over 4 neighbours; the reference's 0.01/0.02 window-depth. */
  depthThreshold: [0.55, 1.15] as [number, number],
  /** Copy of the reference's 0.0025 window-depth bias, rescaled to metres. */
  normalDepthBias: 0.03,
} as const;

export const CAMERA = { fov: 38, near: 0.1, far: 400 } as const;

/**
 * Sky dome gradient. The sun sits ahead-left of every spike pose on purpose — a backlit ridge gives
 * the warm/cool split §2 asks for, and it is the only large-area warm source a winter scene has.
 */
export const SKY = {
  // The sun's glow is a pale warm white: after the 2.6x grade even this lands as a soft gold.
  // Zenith and horizon one step deeper than they were (#A8C2DE / #CFE0F0): the near-white horizon,
  // which the far fade also lands on, is what made a view with the sun behind you read washed out.
  zenith: '#9AB6DC', horizon: '#C4D8EE', sun: '#FFF0D8',
  sunAzimuth: 5.07,
  /**
   * Sun elevation, radians. Raised from 0.24 after measuring the lit-snow colour: at 14 degrees the
   * key contributes N dot L = 0.24, which is comparable to the cool hemisphere ambient, so a warm
   * sun and a cool sky summed on blue-ish snow cancelled to grey (measured linear saturation 0.066,
   * predicted 0.062). Chroma on a mostly-flat snowfield only appears when one light source
   * dominates. At 0.40 the sun wins on lit faces and ambient wins in shade, which is the
   * warm-light / cool-shadow split the art bible actually asks for.
   *
   *
   * Raising it further to even out the view swing (critic round 2) was tried: 0.52 and 0.65 do even
   * out sun-facing walls against the snow, but they flatten the relief of the slopes, and the summit
   * read whiter still. The swing is handled by the key / ambient balance in DAY_LIGHT instead.
   */
  sunElevation: 0.4,
} as const;

/**
 * The sky high on the mountain. The dome blends toward this as the camera climbs from `from` to `to`
 * (world y; the valley floor is 0-25, the summit ~90): a deep cold zenith that comes down to within
 * `band` of the horizon, so the low strip of sky the chase camera sees is dark blue behind the pale
 * ridge, not white. Brindle Peak was a whiteout with no horizon (critic round 2). The horizon colour
 * itself is left alone, so the far fade still lands on it and distant slopes melt into the sky; a
 * deeper horizon was tried and made shaded slopes merge with the sky instead.
 */
export const SKY_HIGH = { zenith: '#5576B2', band: 0.3, from: 40, to: 85 } as const;

/**
 * The day lights (render/scene.ts builds them; render/dusk.ts eases away from them).
 *
 * Key 5.0 -> 4.0 and ambient 0.62 -> 0.75 (critic round 2: the look swung with the view). With the
 * sun behind the camera every face in view is a sun-facing one, and at 5.0 those faces (cabin, logs,
 * Pip's back) went blown and burnt orange while the snow went pale; into the sun the same faces were
 * near-black. Measured over eight headings at Hearth Hollow and Pinewind, blown highlights now range
 * 0.5-4 % instead of 3-16 %, and shade is still the ambient's blue.
 */
export const DAY_LIGHT = {
  key: '#DCE8F5', keyIntensity: 4.0,
  rim: '#8FA8CE', rimIntensity: 1.2,
  ambientSky: '#A8C2DE', ambientGround: '#6A7FB0', ambientIntensity: 0.75,
} as const;

/**
 * Blue hour, once the mast quest is under way (render/dusk.ts eases toward it). Darker and cooler than
 * day, never grim: the snow keeps a pale lavender lit band, warmth comes from the lit windows and
 * lanterns (which are unlit glow and so stay bright), and the horizon carries a soft lilac band.
 */
export const DUSK = {
  // Authored pale: the composite grade multiplies chroma by 2.6, so these land as a deep blue zenith
  // (~#2D407F on screen), a lilac horizon band (~#AA9FD4) and a faint rose where the sun went down.
  zenith: '#333952', horizon: '#A5A0B5', sun: '#B7A7B7', below: '#4A4E66',
  /** Weight of the sun lobe at full dusk. The sun sets behind the aurora (north-north-west), so it
   *  is kept faint: a pink glow there drowned the green. */
  sunGlow: 0.5,
  sunElevation: 0.2,
  key: '#BFC8DE', keyIntensity: 3.8,
  rim: '#9CA4C8', rimIntensity: 0.9,
  ambientSky: '#9DAACB', ambientGround: '#5E6E96', ambientIntensity: 0.95,
  fog: '#8690A6',
} as const;

/** The aurora curtains (render/aurora.ts). Yaw offsets from north, angles in radians. */
export const AURORA = {
  // Pale on purpose, for the same 2.6x grade: mint at the hem, teal above, a violet top edge.
  low: '#A2D894', mid: '#8EC4B0', top: '#8C80B0',
  intensity: 0.5,
  curtains: [
    { yaw: -0.12, half: 0.8, base: 0.2, height: 0.32, phase: 0.0, gain: 1.0 },
    { yaw: 0.62, half: 0.42, base: 0.31, height: 0.26, phase: 2.1, gain: 0.7 },
    { yaw: -0.62, half: 0.4, base: 0.42, height: 0.22, phase: 4.2, gain: 0.5 },
    // A low, wide, distant band just over the northern horizon: what the chase camera can glimpse.
    { yaw: 0.1, half: 1.15, base: 0.045, height: 0.13, phase: 1.3, gain: 0.6 },
  ],
} as const;

// Speckle detection lives in the instrument (core/speckle.ts) so the gate never imports the renderer
// it judges. Re-exported here for the tools and tests that already reach for it.
export { countContrastSpecks, countIsolatedHighlights, frameLuma } from '../../core/speckle';
export type { SpeckleOptions } from '../../core/speckle';
