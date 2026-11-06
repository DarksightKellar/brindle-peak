/**
 * What colour the ground is, and which authored texture it wears.
 *
 * Split from terrainMesh.ts, which only tessellates. Two rules here came from a critic's frames:
 *
 *  - It is winter. The ridge and the peak are `rock` zones, and every gentle face in them used to be
 *    painted bare stone, so the walk from the springs to the ridge was a muddy olive plain. Snow now
 *    lies on anything gentle whatever the zone; stone shows only where a face is too steep to hold it.
 *  - Kettle Springs was one olive-brown sheet, the colour of `BRUSH` after the grade. Warm wet stone
 *    belongs only around the pools themselves, where the hot water melts the snow back; a few steps
 *    out it is snow again, thinner and greyer than elsewhere.
 */

import type { RGB, TerrainSample } from '../../core/contracts';
import { smoothstep } from '../../core/contracts';
import { paletteRgb } from '../../core/palette';
import { SPRING_POOLS } from './landmarks';
import type { TerrainSurfaceClass } from './terrainMaterial';

const mix = (a: RGB, b: RGB, t: number): RGB => ({
  r: a.r + (b.r - a.r) * t,
  g: a.g + (b.g - a.g) * t,
  b: a.b + (b.b - a.b) * t,
});

/** Palette resolved once at module load; the per-vertex path never parses a hex string. */
const C = {
  snowHi: paletteRgb('SNOW_HI'),
  snowLt: paletteRgb('SNOW_LT'),
  snowMid: paletteRgb('SNOW_MID'),
  snowSh: paletteRgb('SNOW_SH'),
  snowDeep: paletteRgb('SNOW_DEEP'),
  iceHi: paletteRgb('ICE_HI'),
  iceMid: paletteRgb('ICE_MID'),
  iceDeep: paletteRgb('ICE_DEEP'),
  rockLt: paletteRgb('ROCK_LT'),
  rockMid: paletteRgb('ROCK_MID'),
  rockDk: paletteRgb('ROCK_DK'),
  rockWarm: paletteRgb('ROCK_WARM'),
  snowCap: paletteRgb('ROCK_SNOWCAP'),
  sunMid: paletteRgb('SUN_MID'),
  amber: paletteRgb('AMBER'),
};

/**
 * Steeper than this and snow slides off: stone shows. Below the lower bound it is all snow. The band
 * starts just under the 0.35 a bird cannot walk up, so a face you would have to climb shows stone
 * and a slope you can walk stays white: the ground tells you which is which.
 */
const BARE_FROM = 0.3;
const BARE_FULL = 0.42;

/**
 * Bedding in the stone: a cliff was one even blue-grey sheet, "a flat blue wall" (critic 3). Rock
 * lies in courses, a dark one under a warm one, with snow caught on the ledge each course makes.
 * About 11 u from one course to the next, wandering a little across the face so the lines are not
 * ruled, and broad enough to survive a 5.4 u terrain grid. 1 on a ledge, 0 deep in a dark course.
 */
function strata(h: number, x: number, z: number): number {
  return 0.5 + 0.5 * Math.sin(h * 0.56 + 1.6 * Math.sin(x * 0.043 + z * 0.031) + 0.8 * Math.sin(z * 0.071 - x * 0.02));
}

/** Ordinary snow by height and slope: brighter up high, bluer where it tilts away. */
function snow(h: number, slope: number): RGB {
  const base = mix(C.snowMid, C.snowHi, smoothstep(6, 60, h));
  return mix(base, C.snowSh, smoothstep(0.1, 0.45, slope) * 0.7);
}

/** How close (x, z) is to a hot pool, 1 at the rim to 0 a few steps out. */
function poolWarmth(x: number, z: number): number {
  let best = 0;
  for (const p of SPRING_POOLS) {
    const d = Math.hypot(x - p.x, z - p.z) - p.r;
    // A little wobble so the thaw line is not a drawn circle.
    const wobble = 0.8 * Math.sin(Math.atan2(z - p.z, x - p.x) * 3 + p.x);
    best = Math.max(best, 1 - smoothstep(0.6, 4 + wobble, d));
  }
  return best;
}

/**
 * Surface + slope + altitude -> colour. Snow settles on anything gentle, stone is exposed on
 * anything steep, the lake is ice, and the valley floor picks up a faint warm bounce.
 */
export function groundColour(sample: TerrainSample, x: number, z: number): RGB {
  const slope = sample.slope;
  const h = sample.height;

  let base: RGB;
  if (sample.surface === 'rock') {
    // Dark, faintly warm stone: these faces mostly stand in shade, where a mid-grey turned the same
    // blue as the snow beside it and a cliff read as a smooth white wall.
    const course = strata(h, x, z);
    let stone = mix(C.rockDk, C.rockWarm, 0.3 + 0.5 * smoothstep(0.35, 0.8, course));
    stone = mix(stone, C.rockDk, smoothstep(0.5, 0.9, slope) * (1 - course) * 0.8);
    stone = mix(stone, C.rockWarm, smoothstep(70, 96, h) * 0.3);
    // Snow lodged on the ledges: a pale line along the top of each course, less on the sheerest walls.
    stone = mix(stone, C.snowCap, smoothstep(0.82, 0.97, course) * (1 - smoothstep(0.55, 0.85, slope)) * 0.7);
    // Wind-scoured snow on the heights: whiter than the valley, bluer on the tilt.
    const cover = mix(mix(C.snowLt, C.snowHi, smoothstep(40, 90, h)), C.snowSh, smoothstep(0.15, 0.5, slope) * 0.6);
    base = mix(cover, stone, smoothstep(BARE_FROM, BARE_FULL, slope));
  } else if (sample.surface === 'ice') {
    base = mix(C.iceMid, C.iceHi, smoothstep(0, 0.06, slope) * 0.6);
    base = mix(base, C.iceDeep, smoothstep(0.02, 0.12, slope) * 0.5);
  } else if (sample.surface === 'spring') {
    // Thin, grey-blue snow over warm ground, giving way to wet stone at the pools.
    const thin = mix(C.snowSh, C.snowMid, 0.55 - 0.3 * smoothstep(0.1, 0.4, slope));
    const thaw = poolWarmth(x, z);
    const wet = mix(C.rockDk, C.rockWarm, 0.55);
    base = mix(thin, wet, thaw * 0.6);
    base = mix(base, C.amber, thaw * thaw * 0.15);
  } else if (sample.surface === 'path') {
    // Trodden snow, not soil: packed snow sits a step below fresh, with a faint warm cast. The real
    // warmth is the window light laid on it (windowLight.ts).
    base = mix(C.snowMid, C.snowSh, 0.35 + 0.4 * smoothstep(0.04, 0.3, slope));
    base = mix(base, C.sunMid, 0.08);
  } else if (sample.surface === 'deep-snow') {
    base = mix(C.snowSh, C.snowMid, 0.45 + 0.55 * smoothstep(6, 34, h));
    base = mix(base, C.snowDeep, smoothstep(0.12, 0.5, slope) * 0.5);
  } else {
    base = snow(h, slope);
    // A face too steep to walk shows stone through the snow in courses, as the bare rock does: critic
    // rounds 60 and 61 climbed past steep snow faces that were one flat blue sheet.
    const steep = smoothstep(0.42, 0.8, slope);
    if (steep > 0) {
      const course = strata(h, x, z);
      const stone = mix(C.rockDk, C.rockWarm, 0.25 + 0.4 * course);
      // In patches a few courses across, not right round the face: whole courses read as broad
      // stripes on a big slope (critic round 66, "dark-blue banded walls").
      const patch = 0.25 + 0.75 * smoothstep(-0.15, 0.45, Math.sin(x * 0.17 + 1.9 * Math.sin(z * 0.11)) * Math.sin(z * 0.15 - 1.3 * Math.sin(x * 0.08)));
      base = mix(base, stone, steep * smoothstep(0.25, 0.6, 1 - course) * 0.5 * patch);
    }
  }

  // Low ground catches the low sun, a touch: more than this and blue snow reads as tan.
  const warmth = (1 - smoothstep(4, 24, h)) * 0.14;
  return mix(base, C.amber, warmth);
}

/** Which authored texture a face gets: the rock map only where stone actually shows. */
export function surfaceClassOf(sample: TerrainSample): TerrainSurfaceClass {
  if (sample.surface === 'rock' && sample.slope > (BARE_FROM + BARE_FULL) / 2) return 'rock';
  if (sample.surface === 'ice') return 'ice';
  return 'snow';
}
