/**
 * The prop library — one builder per silhouette in ART_BIBLE §7.
 *
 * Flat-shaded, vertex-coloured, zero textures: at 384x216 a prop is a silhouette, so budget goes
 * into outline and facets. Snow is a rule, not an authoring chore — `add()` takes an optional cap
 * colour applied to every upward-facing triangle, which is how rock tops, stumps and posts get
 * their snow without extra geometry. PROP_BUDGET is asserted per kind by tests.
 */
import * as THREE from 'three';
import { GEO, GeoBuilder, propMatrix } from './geoBuilder';

export type PropKind = 'pine' | 'bare' | 'rock' | 'drift' | 'brush' | 'fence' | 'signpost' | 'lantern' | 'stump';

export const PROP_BUDGET: Readonly<Record<PropKind, number>> = {
  pine: 90, bare: 70, rock: 48, drift: 30, brush: 24, fence: 20, signpost: 24, lantern: 30, stump: 20,
};

/** Visual variants each kind ships with. */
export const PROP_VARIANTS: Readonly<Record<PropKind, number>> = {
  pine: 3, bare: 2, rock: 2, drift: 2, brush: 2, fence: 2, signpost: 2, lantern: 2, stump: 2,
};

/** Stacked cones, irregular tier offset, snow rims on the branch rings. */
function pine(b: GeoBuilder, variant: number): void {
  const sapling = variant === 2, laden = variant === 1;
  const tiers = sapling ? 2 : 4, sides = sapling ? 5 : 6;
  const h = sapling ? 5.2 : laden ? 8.4 : 9.8;
  const r0 = sapling ? 1.05 : laden ? 2.3 : 1.95;
  b.cyl(0, -0.12, 0, 0.22, h * 0.62, 'BARK');
  for (let i = 0; i < tiers; i++) {
    const f = i / tiers;
    const y = h * (0.2 + 0.6 * f);
    const r = r0 * (1 - 0.54 * f);
    const th = h * (sapling ? 0.52 : 0.34);
    b.cone(0.05 * Math.sin(i * 2.1), y, 0.05 * Math.cos(i * 1.7), r, th, i % 2 ? 'PINE_MID' : 'PINE_DK', sides);
    if (i > 0 || laden) b.cone(0, y - 0.1, 0, r * 1.07, 0.26, 'SNOW_LT', sides);
  }
  b.cone(0, h * 0.8, 0, r0 * 0.3, h * 0.26, 'SNOW_HI', sides);
}

/**
 * Four to six bare branch segments, no leaves — the deciduous winter read. The lowest branch starts
 * above Pip's head (1.5 u), even on a small tree: lower, it ran through him as he passed the trunk.
 */
function bare(b: GeoBuilder, variant: number): void {
  const h = variant ? 4.8 : 6.4;
  const n = variant ? 4 : 6;
  b.cyl(0, -0.12, 0, 0.22, h * 0.72, 'BARK');
  for (let i = 0; i < n; i++) {
    const a = i * 2.399 + variant * 0.7;
    const y0 = h * ((variant ? 0.4 : 0.32) + 0.48 * (i / n));
    const len = (variant ? 1.05 : 1.5) * (1 - 0.07 * i);
    b.strut([0, y0, 0], [Math.cos(a) * len, y0 + len * 0.58, Math.sin(a) * len], 0.055, 'BARK');
    if (i < 2) b.strut([Math.cos(a) * len * 0.7, y0 + len * 0.4, Math.sin(a) * len * 0.7], [Math.cos(a + 0.9) * len * 1.2, y0 + len * 0.95, Math.sin(a + 0.9) * len * 1.2], 0.035, 'BARK');
  }
}
/** Two chunky polyhedra; snow arrives automatically on every face pointing up. */
function rock(b: GeoBuilder, variant: number): void {
  b.add(GEO.ico, propMatrix(0, 0.42, 0, 1.35, 0.92, 1.2, variant * 0.7), 'ROCK_MID', 'ROCK_SNOWCAP', 0.55);
  b.add(GEO.ico, propMatrix(1.0, 0.26, 0.4, 0.72, 0.56, 0.76, 0.4), 'ROCK_DK', 'ROCK_SNOWCAP', 0.55);
  if (variant) b.add(GEO.tetra, propMatrix(-0.8, 0.22, -0.5, 0.52, 0.4, 0.5, 0.5), 'ROCK_WARM', 'ROCK_SNOWCAP', 0.55);
}
/** Wind drift: a squashed icosphere plus a lee tail. */
function drift(b: GeoBuilder, variant: number): void {
  b.add(GEO.ico, propMatrix(0, 0.26, 0, 1.55, 0.62, 1.25, variant * 0.9), 'SNOW_MID', 'SNOW_HI', 0.5);
  b.add(GEO.tetra, propMatrix(1.05, 0.12, 0.36, 0.9, 0.46, 0.62, 0.8), 'SNOW_SH', 'SNOW_HI', 0.5);
  if (variant) b.add(GEO.tetra, propMatrix(-1, 0.1, -0.5, 0.62, 0.34, 0.55, 1.9), 'SNOW_SH', 'SNOW_HI', 0.5);
}
/** Twiggy clump poking through snow. */
function brush(b: GeoBuilder, variant: number): void {
  const n = variant ? 2 : 3;
  for (let i = 0; i < n; i++) {
    const a = i * 2.4 + variant;
    b.strut([Math.cos(a) * 0.16, 0, Math.sin(a) * 0.16], [Math.cos(a) * 0.5, 0.55 + 0.12 * i, Math.sin(a) * 0.5], 0.035, 'BRUSH');
  }
  b.add(GEO.tetra, propMatrix(0.1, 0.2, -0.05, 0.3, 0.22, 0.3, 0.6), 'BRUSH');
  if (variant) b.add(GEO.tetra, propMatrix(-0.22, 0.16, 0.24, 0.24, 0.18, 0.26, 1.4), 'WOOD_DK');
}
/** One post plus two rails reaching +x: instanced segments join into a continuous run. */
function fence(b: GeoBuilder, variant: number): void {
  b.box(0, -0.1, 0, 0.17, 1.4, 0.17, 'WOOD_MID', 'SNOW_LT');
  b.add(GEO.quad, propMatrix(1.3, 0.6, 0, 2.6, 0.13, 1), 'WOOD_LT');
  b.add(GEO.quad, propMatrix(1.3, 1.02, 0, 2.6, 0.11, 1), 'WOOD_LT');
  if (variant) b.add(GEO.quad, propMatrix(1.3, 0.81, 0, 2.5, 0.09, 1, 0, 0, 0.35), 'WOOD_DK');
}
/** Post plus one angled board; variants vary the board stock. */
function signpost(b: GeoBuilder, variant: number): void {
  b.cyl(0, -0.08, 0, 0.11, 1.95, 'WOOD_MID');
  b.box(0.36, 1.38, 0, 0.92, 0.28, 0.07, 'WOOD_LT', 'SNOW_LT');
  if (variant) b.add(GEO.quad, propMatrix(0.3, 1.72, 0.02, 0.7, 0.2, 1), 'WOOD_MID');
}
/** Post, arm, emissive orb and a warm glass pane — all glow geometry is unlit. */
function lantern(b: GeoBuilder, variant: number): void {
  b.cyl(0, -0.08, 0, 0.09, 2.5, 'WOOD_DK');
  b.strut([0, 2.44, 0], [0.62, 2.44, 0], 0.055, 'WOOD_DK');
  b.glow();
  b.add(GEO.octa, propMatrix(0.62, 2.26, 0, 0.26, 0.3, 0.26, variant * 0.4), 'LANTERN');
  b.add(GEO.quad, propMatrix(0.62, 2.0, 0, 0.34, 0.44, 1), 'AMBER');
  b.glow(false);
}
/** Sawn stump; the top face caps with snow by the normal rule. */
function stump(b: GeoBuilder, variant: number): void {
  const r = variant ? 0.66 : 0.48;
  b.add(GEO.stump, propMatrix(0, 0.3, 0, r, 0.72, r, variant * 0.6), 'BARK', 'SNOW_LT');
}

const BUILDERS: Readonly<Record<PropKind, (b: GeoBuilder, v: number) => void>> = {
  pine, bare, rock, drift, brush, fence, signpost, lantern, stump,
};

export function createPropMesh(kind: PropKind, variant: number): THREE.Mesh {
  const b = new GeoBuilder();
  BUILDERS[kind](b, Math.abs(variant) % PROP_VARIANTS[kind]);
  return b.finish(kind, kind === 'fence');
}
