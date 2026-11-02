/**
 * Authored ground textures, generated into DataTextures at boot.
 *
 * WHY THIS EXISTS
 * Every surface in the valley was flat-shaded, vertex-coloured geometry, so a face carried exactly
 * one colour across its whole ~7-unit span. At 384x216 that is 40-odd internal pixels of a single
 * value: the ground read as moulded plastic, not snow. The reference (A Short Hike) gets its ground
 * structure from authored texture tiles, which this project had none of.
 *
 * WHAT THIS IS, AND IS NOT
 * These are *albedo modulation* maps anchored at white: 255 means "leave the vertex colour alone",
 * everything below darkens. They are deliberately subtle — a loud map on snow reads as dirt — and
 * their value is in authored *shape*: wind ripples, ice cracks, rock strata at a scale the eye can
 * name. They are NOT a detail-density play. `references/pixelated-3d-look.md` measured that a
 * correlated texture moves the gradient metric by 0.0000, and that is expected; the metric is not
 * the target here, the frame is.
 *
 * DELIBERATE CHOICES
 * - DataTexture, not a canvas: pure maths, so it is deterministic across machines and testable in
 *   node without a DOM.
 * - Everything tileable. UVs are world-derived, so a texture repeats every GROUND_TILE_WORLD units;
 *   every noise lattice here is periodic, and every sine has an integer frequency, or the repeat
 *   would show as a grid.
 * - Darkening is blue-weighted (red loses most), because a neutral-grey darker patch on snow reads
 *   as soil. Snow shadow is blue.
 * - Values are written as sRGB bytes and read back by three as sRGB, so a byte of 243 is very
 *   nearly a 5 % *perceptual* change in the final frame, which is the unit this art direction is
 *   tuned in.
 */

import * as THREE from 'three';
import { clamp01, fbm } from './noise2d';

/** World units one tile covers, and how many texels it is drawn at. ~0.19 units/texel at 256. */
export const GROUND_TILE_WORLD = 48;
const SIZE = 256;

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export interface TileStats {
  /** Modulation range as a multiplier on the vertex colour, 1 = untouched. */
  min: number;
  max: number;
  mean: number;
  /** Share of texels at pure white — a blank map shows up here as 1. */
  untouched: number;
  /**
   * How much of the authored dark range survived the zero-mean balance, 0..1. Below ~0.85 the tile
   * is being flattened to pay for its own brights, and the artwork has drifted from the intent.
   */
  trim: number;
}

export interface GroundTile {
  texture: THREE.DataTexture;
  stats: TileStats;
}

/**
 * Accumulates modulation into an RGBA byte buffer.
 *
 * `m` is the luminance multiplier (1 = unchanged). Negative `m` darkens; that darkening is
 * distributed 1.0 / 0.82 / 0.52 across R/G/B so the darker a texel gets, the bluer it is: snow
 * shadow is blue. Stone passes its own split (`drop`): a crack in rock is dark, not blue.
 */
function bake(name: string, shade: (u: number, v: number) => number, balance = true, drop: readonly number[] = [1, 0.82, 0.52]): GroundTile {
  const data = new Uint8Array(SIZE * SIZE * 4);
  const raw = new Float32Array(SIZE * SIZE);
  let lo = Infinity;
  let hi = -Infinity;
  let sum = 0;

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const m = clamp(shade((x + 0.5) / SIZE, (y + 0.5) / SIZE), -0.45, 0.25);
      raw[y * SIZE + x] = m;
      lo = Math.min(lo, m);
      hi = Math.max(hi, m);
      sum += m;
    }
  }

  /*
   * Balance the map at zero mean modulation by shortening the *darks*, never by lifting the brights.
   *
   * A tile whose mean is -6 % does not add structure, it darkens a whole biome by 6 % and drags the
   * tone gates with it — the ice map measured exactly that before this step existed. The obvious fix
   * (add the mean back to every texel) does not work either: it pushes the flat-white majority past
   * 255, clipping eats the correction, and the biome still comes out dark. Scaling the negative
   * deviations instead keeps every crest at its authored value and only trims the troughs, which is
   * also the direction that can never read as dirt.
   */
  let sumPos = 0;
  let sumNeg = 0;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] > 0) sumPos += raw[i];
    else sumNeg += raw[i];
  }
  const trim = balance && sumNeg < 0 ? Math.min(1, sumPos / -sumNeg) : 1;

  let white = 0;
  lo = Infinity;
  hi = -Infinity;
  sum = 0;

  for (let i = 0; i < raw.length; i++) {
    const m = clamp(raw[i] < 0 ? raw[i] * trim : raw[i], -0.45, 0.25);
    lo = Math.min(lo, m);
    hi = Math.max(hi, m);
    sum += m;
    const at = i * 4;
    const dark = m < 0 ? m : 0;
    const lift = m > 0 ? m : 0;
    data[at] = Math.round(255 * clamp(1 + dark * drop[0] + lift, 0, 1));
    data[at + 1] = Math.round(255 * clamp(1 + dark * drop[1] + lift * 0.98, 0, 1));
    data[at + 2] = Math.round(255 * clamp(1 + dark * drop[2] + lift * 0.96, 0, 1));
    data[at + 3] = 255;
    if (m >= -0.002) white++;
  }

  const texture = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
  texture.name = `ground-${name}`;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  // Crisp texels up close — a smooth snow texture is exactly the "blank map" failure the
  // pixelated-3d-look reference warns about. Mips still apply at range so the far valley does not
  // boil with texel noise 20 units out.
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  /*
   * Anisotropy 8, not the default 1. On a slope seen at a grazing angle the texture is compressed
   * along one screen axis; with isotropic filtering the sampler then picks the mip for the worst
   * axis and the ridges break up into scattered dark pixels that read as dirt. Measured on the
   * Pinewind slope: isotropic read as "mechanical dithering", anisotropic as surface.
   */
  texture.anisotropy = 8;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  return {
    texture,
    stats: { min: lo, max: hi, mean: sum / (SIZE * SIZE), untouched: white / (SIZE * SIZE), trim },
  };
}

/**
 * Wind-packed snow.
 *
 * Three periodic layers, and the *arrangement* is the art:
 *  1. drift patches — ~8-16 units, where powder lies deep; subtle, and what makes large areas vary;
 *  2. sastrugi      — wind ridges every ~8 units, warped, and present only in scoured bands. This
 *                     is the only layer with a nameable shape, and the one that carries contrast;
 *  3. grain         — a whisper of ~1 unit variation (+-1.2 %) purely so a crest is not one flat
 *                     value. Deliberately this small: at 1 texel per internal pixel anything
 *                     stronger reads as television static, which is what the +-7.5 % version did.
 *
 * No single-texel sparkle or grit. Both read as dead pixels at 384x216 — the same failure the snow
 * particle system already had to be removed for.
 *
 * History: the first version capped at +-6 % measured a 0.11/255 mean luma delta on the frame —
 * technically present, visibly nothing. This one carries roughly 3x that, concentrated in ridges
 * instead of everywhere.
 */
function snow(): GroundTile {
  return bake('snow', (u, v) => {
    const drift = (fbm(u, v, 3, 3, 3) - 0.5) * 0.08;
    const grain = (fbm(u, v, 44, 2, 41) - 0.5) * 0.024;

    /*
     * Sastrugi. An integer band count keeps the tile seamless; two warp octaves at different scales
     * stop the ridges reading as ruled parallel lines (a single coarse warp still gave a
     * recognisably machine-made stripe). The profile is asymmetric — a sharp bright crest over a
     * long shallow lee — because that is the shape wind-cut snow actually takes.
     */
    const warp = (fbm(u, v, 4, 2, 7) - 0.5) * 2.4 + (fbm(u, v, 11, 1, 77) - 0.5) * 1.1;
    const phase = Math.sin(Math.PI * (v * 6 + u * 3) + warp);
    // Ridges only where the wind has scoured; powder sits smooth between them.
    const mask = smoothstep(0.34, 0.68, fbm(u, v, 5, 2, 13));
    const crest = Math.pow(Math.max(0, phase), 2) * 0.06;
    // A narrow deep groove, not a broad one. Width matters twice over: a broad trough averages out
    // into a grey haze, and it also outweighs the crests, so the zero-mean balance then has to
    // shorten it — the measured difference between a visible ridge and a faint smear.
    const trough = Math.pow(Math.max(0, -phase), 3) * -0.34;
    const ridged = (crest + trough) * mask;

    return drift + grain + ridged;
  });
}

/**
 * Lake ice. Large plates separated by thin crack lines, plus a faint frost bloom — the read at
 * 384x216 is meant to be "this is a different material from the snow", which the flat vertex colour
 * alone never managed against a fogged blue lake.
 */
function ice(): GroundTile {
  return bake('ice', (u, v) => {
    const plate = (fbm(u, v, 2, 2, 57) - 0.5) * 0.07;
    const frost = (fbm(u, v, 9, 2, 61) - 0.5) * 0.03;
    // Wind-blown snow dusted across parts of the lake: the bright half of the balance, and what
    // stops the cracks being the only feature (a crack-only map is unbalanced, and balancing it by
    // trimming the cracks makes them barely visible — measured).
    const dust = smoothstep(0.52, 0.82, fbm(u, v, 6, 2, 83)) * 0.06;
    // Ridged noise, not sine families: two sine crack families intersected into a regular grid (a
    // VLM read it as "graph paper", and it was right). `1 - |2n-1|` peaks form an irregular,
    // organic line network — cracks that branch and wander, which is what frozen water does.
    const ridge = 1 - Math.abs(2 * fbm(u, v, 3, 3, 5) - 1);
    const crack = smoothstep(0.9, 0.995, ridge);
    return plate + frost + dust - crack * 0.2;
  });
}

/**
 * Exposed rock, laid on a wall from the side (terrainMesh.ts), so v runs up the face. Courses of
 * stone ~4 units deep: a dark band in each, and a thin pale ledge of snow on top of it. There are
 * deliberately NO line families crossing: two sine families at different angles read as a diagonal
 * crosshatch grid (they did, measured against the first version), which is the one thing rock
 * without real geometry must not be.
 *
 * Not balanced to zero mean like the snow and ice: rock is meant to come out darker than the snow
 * round it. Balanced, the dark courses were trimmed to the size of the ledges, and a cliff in shade
 * stayed one flat blue sheet (critic 3, "a flat blue wall").
 */
function rock(): GroundTile {
  return bake('rock', (u, v) => {
    const warp = (fbm(u, v, 3, 3, 29) - 0.5) * 1.6 + (fbm(u, v, 9, 1, 47) - 0.5) * 0.6;
    const phase = Math.sin(Math.PI * 2 * (v * 12 + u * 2) + warp);
    // Each course thickens and thins along the face, and a ledge holds snow only here and there.
    const thick = (fbm(u, v, 4, 2, 71) - 0.5) * 0.7;
    const course = -0.3 * smoothstep(-0.15 - thick, 0.5 - thick, -phase);
    const ledge = 0.22 * smoothstep(0.8, 0.96, phase) * smoothstep(0.38, 0.6, fbm(u, v, 6, 2, 91));
    // Outcrops at ~2 units and the odd deep blotch; no per-texel grit, which read as noise.
    const blocky = (fbm(u, v, 12, 2, 33) - 0.5) * 0.12;
    const blotch = smoothstep(0.6, 0.8, fbm(u, v, 7, 2, 19)) * -0.12;
    return course + ledge + blocky + blotch;
  }, false, [0.86, 0.92, 1]);
}

/**
 * A high-contrast checker, NOT shipped to the player: it exists so a harness can prove the map
 * reaches the shader. A subtle texture that measures nothing is indistinguishable from a texture
 * that was never wired, and this project has already been bitten by exactly that.
 */
import { buildCheckTexture } from './checkTexture';

let cached: { snow: GroundTile; ice: GroundTile; rock: GroundTile; checker: THREE.DataTexture } | null = null;

export function groundTiles(): { snow: GroundTile; ice: GroundTile; rock: GroundTile; checker: THREE.DataTexture } {
  if (!cached) cached = { snow: snow(), ice: ice(), rock: rock(), checker: buildCheckTexture() };
  return cached;
}
