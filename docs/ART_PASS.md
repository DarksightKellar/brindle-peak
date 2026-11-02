# Art pass: authored ground + prop surface treatment

**Status:** shipped and committed. This note records why the ground and props look the way they do.

## The problem this closes

Every surface in the valley was flat-shaded, vertex-coloured geometry with no `uv` attribute at
all. One triangle spans ~7.3 world units, which is roughly 40 internal pixels at 384x216, carrying
exactly one colour. The ground was therefore made of 40-pixel blocks of one value: at play distance
it read as moulded plastic. The reference (*A Short Hike*) gets its ground structure from authored
texture tiles; this project had none.

Detail-density is **not** the target of this pass and was not optimised. It is informational (see
`references/pixelated-3d-look.md`: a correlated texture moves it by ~0.0000). The target was "does
the frame look like a place", judged by eye against before/after crops.

## What shipped

| File | Change |
|---|---|
| `src/game/world/noise2d.ts` | **new.** Tileable value noise + fBm (periodic lattice, deterministic hash). No `Math.random`, so textures are byte-identical across machines and testable in node. |
| `src/game/world/groundTexture.ts` | **new.** Three 256x256 `DataTexture` tiles — snow, lake ice, rock — built at boot from the noise module. Each covers 48 world units (0.188 u/texel). `magFilter: Nearest` (crisp texels), `LinearMipmapLinear` minification, `anisotropy 8`. Also `buildCheckTexture()`: a magenta/green checker that exists only to prove the map reaches the shader. |
| `src/game/world/terrainMaterial.ts` | **new.** Three `MeshLambertMaterial`s (snow/rock/ice), each `vertexColors: true` + its own map, cached module-wide. Publishes a dev-only harness seam. |
| `src/game/world/terrainMesh.ts` | Adds a `uv` attribute derived from **world position** (`x/48, z/48`) so the pattern never stretches on a face and the texel grid is continuous across the whole valley. Faces are now bucketed into three geometry groups by surface (snow 51 %, rock 30 %, ice 18 %) and drawn with the matching material. Buffer offsets and group offsets use separate counters (see "bugs found"). |
| `src/game/world/water.ts` | The Frozen Reach ice sheet gets world-derived UVs and the ice map. It is a separate authored disc drawn 0.02 above the flattened terrain, so without this the largest flat surface in the game — the lake — would have stayed untextured. |
| `src/game/world/props.ts` | Per-facet two-tone: every triangle gets a deterministic 0.90–1.06 multiplier in `finish()`. Same hand-painted read a two-tone texture would give, at zero UVs, textures or draw calls. Emissive (lantern glow) geometry is left flat. |

Cost: 3 x 256² RGBA textures + mips (~1.1 MB VRAM), terrain draw calls 1 → 3, lake unchanged.

### Design of the tiles

Albedo *modulation* anchored at white: 255 leaves the vertex colour untouched, values below darken,
and darkening is blue-weighted (R loses ~1.0, G 0.82, B 0.52 of the drop) because a neutral-grey
dark patch on snow reads as soil, not shadow.

- **Snow** — broad drift patches (~8-16 u), **sastrugi** wind ridges every ~8 u on a doubly-warped
  axis, present only in scoured bands; a ±1.2 % grain at ~1 u so a crest is not one flat value.
- **Ice** — plate tone, snow dust, and a crack *network* from ridged noise (`1-|2n-1|`), spacing
  4-6 u.
- **Rock** — warped strata ~3.4 u, blocky outcrops, irregular dark blotches. Deliberately no second
  line family: two sine families read as a crosshatch grid (measured, see below).

Every lattice is periodic and every sine has an integer frequency, so the 48-unit repeat is
seamless. The repeat is invisible because no feature is larger than ~2 u and the largest is a soft
patch. The maps are mean-balanced to zero by *trimming the darks* (never lifting the brights, which
clips at 255 and leaves the biome dark — measured on the ice tile at −6 % mean before this step).

## Verification

### 1. The map reaches the shader

`buildCheckTexture()` (loud magenta/green) is swapped onto the **live** material with the camera and
weather clock frozen (`pipeline.render()` called directly between captures), then counted:

| pose | magenta checker pixels |
|---|---|
| hearth | 145,868 |
| pinewind | 115,628 |
| reach (terrain) | 10,500 |
| ridge | 118,184 |
| peak | 155,080 |
| reach (lake ice sheet) | 115,876 |

A texture that never reached the material would render zero of these.

### 2. Differential, not aggregate

Same pose, same clock, same settled frame; the *only* difference is the map (set to `null` between
two synchronous `pipeline.render()` calls). Whole-frame changed-pixel counts are not used; the
measure counts pixels in the lower 62 % of frame whose luminance moves > 1.5/255.

| pose | ground px changed >1.5 L | mean abs dL (of 255) | max dL |
|---|---|---|---|
| hearth | 14.7 % | 1.55 | 32.2 |
| pinewind | 15.6 % | 1.77 | 31.5 |
| reach (terrain only) | 0.5 % | 0.05 | 15.7 |
| ridge | 47.1 % | 2.68 | 26.4 |
| peak | 50.9 % | 3.88 | 18.9 |
| reach (lake ice sheet) | 18.0 % | 1.59 | 18.2 |

`reach (terrain)` is near zero *by design*: that zone's ice is the separate lake disc, measured on
its own row.

### 3. Tone is unchanged, and so is every gate verdict

960x540 viewport (the internal render is 384x216 in both cases, so this is the shipping image).

| pose | p1 | p50 | p95 | satP50 | min L | pixels < L 0.10 | edge |
|---|---|---|---|---|---|---|---|
| hearth | 0.155 → 0.155 | 0.647 → 0.643 | 0.731 → 0.731 | 0.452 → 0.455 | 0.067 → 0.073 | 0 → 0 % | 0.0103 → 0.0103 |
| pinewind | 0.114 → 0.114 | 0.694 → 0.688 | 0.790 → 0.790 | 0.963 → 0.959 | 0.059 → 0.057 | 0.1 → 0.1 % | 0.0113 → 0.0116 |
| reach | 0.475 → 0.471 | 0.588 → 0.584 | 0.788 → 0.788 | 0.991 → 0.991 | 0.139 → 0.135 | 0 → 0 % | 0.0035 → 0.0037 |
| ridge | 0.312 → 0.310 | 0.561 → 0.553 | 0.833 → 0.831 | 0.571 → 0.578 | 0.184 → 0.192 | 0 → 0 % | 0.0043 → 0.0046 |
| peak | 0.243 → 0.241 | 0.543 → 0.531 | 0.782 → 0.780 | 0.444 → 0.449 | 0.165 → 0.120 | 0 → 0 % | 0.0044 → 0.0047 |

The `artgate` failure list per pose is **identical before and after** (hearth/pinewind still fail the
p1 band and the min-luminance rule, reach still fails contrast, ridge/peak still fail the demoted
detail-density rule). Nothing that passed now fails. Worst p50 shift is −0.012 (peak), i.e. the
texture darkens the summit by about one percentage point; detail density moved 0.0044 → 0.0047
(+7 %), which is the expected near-nothing from a correlated signal.

### 4. Looked at it

Before/after 1:1 crops of the same ground, assessed blind-labelled (five independent reads):

- **hearth** — "distinct wavy ridges; reads clearly as wind-shaped snow; BEFORE looks like an
  unfinished placeholder" — preferred AFTER.
- **pinewind** — AFTER "reads as snow surface with shape, diagonal bands of light and shade, not
  random noise".
- **peak** — AFTER "directional streaks that read as material rather than noise".
- **lake** — AFTER shows a visible crack network; a full-set read still calls it "the most
  borderline frame — a large flat blue area could momentarily read as a filter, but the cracks
  resolve it".
- **full set, unlabelled** — "no surface reads as dirt; all five read as the intended snow/ice/rock
  materials; none look outright wrong".
- **pines** — per-facet tone reads as "more varied facet to facet", not confetti.

## What was tried and rejected (so nobody repeats it)

1. **±6 % modulation first.** Measured a 0.11/255 mean luma delta on the frame — present in the
   maths, invisible on screen. Any "subtle texture" claim needs this measurement before it is
   believed.
2. **±7.5 % per-texel grain.** At 1 texel per internal pixel that is exactly pixel noise. Two
   independent reads called the result "television static / a cheap filter". Grain is now ±1.2 % and
   the contrast lives in the ridges.
3. **Single-texel sparkle and grit.** Reads as dead pixels — the same failure the snow particle
   system was removed for. Deleted.
4. **Two sine families for ice cracks.** They intersect into a regular grid; a blind read called it
   "graph paper". Replaced with ridged noise (`1-|2n-1|`), which branches irregularly.
5. **Two line families for rock strata.** Same crosshatch failure, same fix: one warped family plus
   blotches.
6. **Isotropic filtering (anisotropy 1).** On a grazing slope the texture compresses along one axis
   and the ridges break into scattered dark pixels that read as dirt ("mechanical dithering" on
   Pinewind). Anisotropy 4 helped, 8 fixed it.
7. **Mean-centring the map by adding the mean back.** Clips at 255, so the correction is eaten and
   the biome still comes out dark (ice measured −3 % after correction). Trim the darks instead.
8. **Per-face tile selection to fight repetition.** Abandoned: at 0.188 u/texel the repeat period is
   48 u and no feature is over 2 u, so the repeat is not legible; switching tiles per face would put
   a hard colour seam on every 7-unit triangle edge instead.

## Bugs found (both invisible to unit tests, obvious in a frame)

- **Geometry group offsets were in floats, not vertices.** `addGroup(vertexAt, …)` was advanced by
  `pos.length` (floats), so group 2 started past the end of the buffer: only part of the mesh drew
  and the ridge/peak frames rendered as sky. Caught by colouring the material red and counting red
  pixels. Fixed with separate float/uv/vertex counters.
- **The terrain vanished on the first render after a material recompile** while probing, which
  initially looked like the same bug. It was not — but it is why every differential here calls
  `pipeline.render()` twice per toggle.

## Reproducing the numbers

Dev server on port 5181 (`vite --port 5181`), Playwright chromium + SwiftShader, viewport 960x540;
`__game.teleport/step/analyse` for poses and tone, and the dev-only `window.__ground` seam
(`{ materials, meshes, iceMaterials }`) for the map toggles. Harness scripts were scratch files
(`/tmp/art/capture.mjs`, `diff.mjs`, `icediff.mjs`) and are not in the tree — the method is described
above in enough detail to rewrite them in ten minutes, and the seam is what makes it possible.

## Not done, and why

- **No new unit test.** `tests/**` was outside this pass's remit. The generator is pure and node-safe
  (`DataTexture` from a `Uint8Array`, no DOM), so the recommended test is: min/max/mean of each
  buffer, `mean ≈ 0`, and `min < 0.15` (no flat/clipped map) — the reference's "check the buffer for
  clipping" lesson, mechanised.
- **The `applyLightRamp` 3-band ramp is dead code.** `grep applyLightRamp src/` returns only its own
  definition: the described N·L stairs are not applied to any material. That is a much bigger
  stylistic lever than this texture pass and should be its own experiment, with the art gate
  re-measured.
- **Props have no texture, only per-facet tone.** A two-tone texture needs UVs on primitives that
  are scaled non-uniformly per instance; the facet tone gives the same read at this resolution for
  none of the cost.
