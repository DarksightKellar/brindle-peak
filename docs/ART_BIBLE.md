# FIRST SNOW — Art Bible v1.0

Derived from measured A Short Hike data (`docs/RESEARCH.md` §3). Every constraint here is either a
measurement of the benchmark or a deliberate, stated translation of it to winter.

---

## 1. Render contract

| Constant | Value | Source |
|---|---|---|
`INTERNAL_W × INTERNAL_H` | 384 × 216 | measured 5 px block at 1920 |
| `PIXEL_SIZE` default | 5 (options 3 / 5 / 8) | measured; ASH exposes this |
| Sampling | `NearestFilter`, no mipmaps, no AA | stated by dev |
| Upscale | point, to canvas | stated by dev |
| Beauty target | `HalfFloatType` + depth texture | matches `RenderPixelatedPass` |
| Normal target | `MeshNormalMaterial` override pass | reference implementation |
| Camera | perspective, FOV 38, chase distance 15–22, pitch 30–42° | framing read from screenshots |
| Draw order | beauty → normals → single composite pass | matches ASH's render-texture approach |

The composite pass, in one shader, does: nearest fetch → depth-edge darken → normal-edge emphasis →
capped haze → palette grade (hue/sat with a highlight taper/lift, §4) → distance fade → write. **Grade happens in display (sRGB)
space**, because all measured targets are sRGB. (Fog is split around the grade; see §6.)

## 2. Non-negotiable tone rules

These are pass/fail, checked by `tools/aesthetic-check.mjs` against real rendered frames:

| Rule | Target |
|---|---|
| Minimum luminance anywhere | **≥ 0.11** |
| Pixels below L 0.10 | **0 %** |
| Luminance p1 | 0.24 – 0.30 |
| Luminance p50 | 0.44 – 0.54 |
| Luminance p95 | 0.85 – 0.95 |
| Saturation p50 | 0.45 – 0.62 |
| Cool band (195–250°) share of chroma | 30 – 55 % |
| Warm band (20–50°) share of chroma | **≥ 22 %** |
| Visible pixel block period at 1080p | 5 ± 0 px |

Meaning: **no black, no grey mush, no pastel wash.** Snow is blue and bright; lamplight is amber and
vivid; the two coexist in every frame.

## 3. Palette

Hex values chosen in sRGB. `L` is HSL lightness, `S` HSL saturation.

### Snow — the dominant family
| Name | Hex | L | S | Use |
|---|---|---|---|---|
`SNOW_HI` | `#FAFDFF` | .99 | 1.00 | sun-struck crests, highlight |
`SNOW_LT` | `#E4EEF7` | .93 | .55 | lit snow plains |
`SNOW_MID` | `#C6D9EA` | .85 | .38 | default snow ground |
`SNOW_SH` | `#9CB8D2` | .72 | .36 | snow in shade |
`SNOW_DEEP` | `#7796B6` | .59 | .31 | deep shade, drifts, crevices |
`SNOW_NIGHT` | `#5A7BA0` | .49 | .28 | snow after dark |

### Ice & water
| `ICE_HI` `#CFEDF5` .88/.47 | `ICE_MID` `#9AD4E6` .75/.45 | `ICE_DEEP` `#5FA8C4` .57/.45 |
| `WATER_DEEP` `#2E6A8C` .36/.51 | `WATER_DK` `#23506E` .28/.52 | `WATER_FOAM` `#EAF6FA` .95/.60 |

### Rock
| `ROCK_LT` `#A9AEC0` .71/.16 | `ROCK_MID` `#7C8398` .54/.12 | `ROCK_DK` `#565E75` .40/.17 |
| `ROCK_WARM` `#8A7B72` .49/.10 | `ROCK_SNOWCAP` `#D9E4EF` .89/.38 |

### Pine & ground cover
| `PINE_HI` `#6E8F72` .50/.19 | `PINE_MID` `#446B52` .34/.23 | `PINE_DK` `#2C4C3E` .24/.27 |
| `PINE_NIGHT` `#223C33` .18/.27 | `BARK` `#4E3B2C` .24/.28 | `BRUSH` `#7C6A55` .41/.18 |

### Warm accents — the reason it is cosy and not bleak
| Name | Hex | L | S | Use |
|---|---|---|---|---|
`SUN_HI` | `#FFEBC8` | .89 | 1.00 | low-sun rim, sky glow |
`SUN_MID` | `#F7CE86` | .75 | .87 | sunlit snow facing the light |
`AMBER` | `#E8A64F` | .61 | .77 | warm bounce, firelight on snow |
`LANTERN` | `#FFC46A` | .71 | 1.00 | all emissive |
`WOOD_LT` | `#A8764E` | .48 | .36 | planks, cabin siding |
`WOOD_MID` | `#7E5334` | .35 | .41 | beams, crates |
`WOOD_DK` | `#563724` | .24 | .41 | shadowed timber |
`BRICK` | `#B0603F` | .47 | .48 | chimney, tiles |

### Sky, haze, night
| `SKY_HI` `#DCE8F5` .91/.53 | `SKY_MID` `#B9CFE6` .81/.39 | `SKY_LOW` `#8FA8CE` .68/.39 |
| `DUSK` `#8B93D6` .69/.47 | `NIGHT` `#33406B` .31/.36 | `SHADOW_FLOOR` `#1E2A44` .19/.39 |
| `AURORA_G` `#7FE3C0` .69/.65 | `AURORA_V` `#B49BE8` .76/.58 | `AURORA_P` `#E6A8C8` .78/.56 |

### Character (Pip)
`PIP_BODY` `#F2F4F0` .95/.13 · `PIP_WING` `#C99A6A` .60/.35 · `PIP_BEAK` `#4A4038` .25/.13 ·
`PIP_SCARF` `#C4574C` .53/.52 · `PIP_GLASS` `#3B3F4A` .26/.10

**`SHADOW_FLOOR` is the darkest permitted colour in the game.** Nothing — not a cave, not the
underside of a rock, not the UI — may render darker than this.

## 4. Shading

- **Material**: `MeshLambertMaterial` with `flatShading: true`, or `MeshBasicMaterial` with baked
  vertex colours for unlit props. Prefer vertex colours over textures for everything but terrain.
- **Light ramp**: *tested and rejected.* A 3-band quantisation of N·L was implemented, wired to all
  156 lit materials in the world, and measured (`docs/LIGHT_RAMP.md`; the code is preserved as
  `docs/rejected/light-ramp.patch`). It cost shadow depth at every pose — p1 rose everywhere, and
  contrast fell 0.092 → 0.080 on a sunlit reach pose, crossing this project's own ≥ 0.09 rule — and
  the bands read as posterisation, not as stylised light. The original claim here, that banding is
  "the single most recognisable thing about the reference's look", was **never measured against a
  reference frame**; it was design prose, and it did not survive contact with the renderer. Shading
  ships as smooth Lambert N·L with flat-shaded facets doing the chunky work.
- **Why this section stays short on theory**: every visual rule in this document that was written from
  prose rather than from a measurement has now been wrong at least once (banding, contact-shadow
  decals, detail density). Measure first, then write the rule.
- **Ambient**: hemisphere light, sky `#A8C2DE`, ground `#6A7FB0`, intensity 0.75 by day (0.95 at
  dusk). Gives snow its blue ambient bounce for free.
- **Key / ambient balance** (`pixelConfig.ts` `DAY_LIGHT`): cool key `#DCE8F5` at 4.0, sun 23° up.
  The key was 5.0 against an ambient of 0.62, and the look swung with the camera: with the sun behind
  you every face in view is sun-facing, so the cabin, the logs and Pip's back blew out to burnt orange
  and the snow went pale, while facing the sun the same faces were near-black (critic round 2). Over
  eight headings at Hearth Hollow and Pinewind, blown highlights ranged 3–16 %; at 4.0 / 0.75 they
  range 0.5–4 %, p50 is unchanged, and shade is still the ambient's blue. Raising the sun to 30° or
  37° evened walls against snow further but flattened the relief of the slopes, so the sun stays low.
- **Highlight saturation taper** (`SAT_TAPER`): the grade's 2.6× saturation eases to 1.4× as
  pre-grade luma rises from 0.55 to 0.95 (sky and far fade exempt). Shade and mid-tones keep the full
  boost; sunlit faces stop going pastel cyan or orange. Lit windows and lanterns measure the same
  with or without it (already at their gamut edge). Starting the taper at 0.40 calmed open snow too,
  but a sunlit field then read grey.
- **Snow and ice surface** (`snowSurface.ts`, GLSL in `snowSurfaceShader.ts`, `SNOW_LOOK`): a shader
  patch on the terrain's snow and ice materials and the lake sheet, found in the scene by name; the
  world's colours and geometry are untouched, rock is left alone. Why: the 48-unit authored tiles
  mip-average to one value past a few metres and the grade turned that into a flat blue fill, so
  mid-ground snowfields, slopes and the lake read as untextured (critic round 3). Every feature is
  anchored to world position and sized by the pixel footprint: each size draws only while it spans a
  set range of pixels, so detail per screen area is the same at Pip's feet and across the valley,
  and nothing slides when the camera moves.
  - Snow: **posterised drifts** (three noise sizes, 60 / 19 / 6 u, cut into three flat tones 20 %
    whiter or bluer, hard pixel-stepped edges, the way the reference draws snow); **wind marks**
    (short one-pixel strokes across the wind with a one-pixel lit edge on the sun side, cells of
    1.4 / 4.5 / 14 / 45 u, each drawn while a cell spans ~6-90 px); the two broad ripple families
    (13 / 41 u) as normal tilt only, so the low sun draws them; **glints** (one pixel, one candidate
    per 0.7 u cell, only where the sun reaches, near only, 45 % at full dusk).
  - Ice: one smooth tone field from world position on both the sheet and the terrain beneath it
    (the sheet's per-triangle colours, interleaved with terrain poking through, drew as a mosaic of
    big flat triangles); plate cracks one pixel wide at any range (cell borders, 15 u), white crazing
    near (4.5 u), hard-edged wind-polished patches and frost streaks along the wind.
  - Tried and rejected, from Kettle Springs, the plain below the hamlet, Hearth Hollow and the Frozen
    Reach, day, dusk and aurora: lit wind ripples at every scale (read as planks and speed lines,
    worse when the camera faces along the wind); the authored tile again at 4x and 13x (barely
    visible); a soft, unposterised mottle at ±3.5 % (swallowed by the grade); drifts at ±10 %
    (invisible); ±50 % (too loud). Measured with `__game.analyse()`, same pose off / on: p1 and p95
    unchanged at three spots (Reach p1 0.449 → 0.414 from the cracks), p50 within ±0.02, contrast
    unchanged or up (Reach 0.159 → 0.171), saturation p50 up to +0.04 (Kettle 0.63 → 0.67), edge
    density 0.0019 → 0.0021-0.0025. No gate verdict changed.
- **Shadows**: real-time shadows **ON** — `BasicShadowMap` with a player-following frustum. This
  section previously said OFF; that was wrong in practice. Rendering without them produced a
  featureless whiteout where nothing had readable form. At 384×216 the hard shadow edge is one of the
  few pieces of large-scale structure the resolution can still carry.

## 5. Outlines

Depth + normal edge detection, one low-res pixel wide, exactly as the reference implementation:

- `depthEdgeStrength = 0.45`, `normalEdgeStrength = 0.30`, both tuned by the conformance harness.
- Depth edges **multiply down** toward `SHADOW_FLOOR` (never to black).
- Normal edges **multiply up** slightly (×1.15 max), which reads as a lit rim — this is why ASH reads
  as "soft outline" rather than "toon line".
- No screen-space post outline pass, no inverted-hull outlines.

## 6. Fog & atmosphere

- **Fog is two stages** (`src/game/render/compositeShader.ts`, numbers in `pixelConfig.ts` `FOG`):
  1. A cold **haze** before the grade: exponential-squared, density 0.003, colour `SKY_LOW`
     (dusk `#8690A6`), **capped at 10 %**.
  2. A **distance fade** after the grade, toward the sky dome's own horizon colour (day `#C4D8EE`,
     dusk `#A5A0B5`): smoothstep from 40 u to 400 u, at most 62 %, then all the way over the last
     15 % before the far plane so the clip edge never shows.
- Why: this section used to say one exp² fog at 0.018 (the code had already dropped to 0.0045 as a
  "pastel wash" fix). Either way, every hill and tree line past ~120 u became exactly the fog colour,
  and the 2.6× saturation in the grade turned that colour a vivid flat blue: pines read as
  placeholder spikes, hills as a flat blue mesa. The grade multiplies the chroma of whatever the haze
  mixed in, so even 20 % haze turns a dark pine blue. Keeping the haze small and doing distance
  *after* the grade keeps each layer's own light, shade and hue, and makes each layer further away
  paler, which is what separates near / middle / far.
- Tried and rejected, from the same four eye-level spots (Kettle Springs, Hollowpine Hamlet,
  Pinewind, Hearth Hollow), day, dusk and aurora: capping the old fog at 55 % (trees darker but
  still one blue, far-plane edge visible); a two-stage fog entirely before the grade (far trees
  went to pale ghosts); a pale `SKY_MID` haze (milky wash); fog thinned by height (little gain for
  a camera matrix per frame, and uneven between zones at different heights).
- Measured with `__game.analyse()` on the chase view at those spots: p50 unchanged (±0.01), contrast
  up at Hearth (0.150 → 0.165), Pinewind (0.217 → 0.225) and Hamlet (0.145 → 0.149), saturation p50
  down slightly at Kettle Springs (0.88–0.90 → 0.86, back inside the reference max 0.864). The reference
  frames and the gate thresholds in A8 are unaffected.
- The still-camera ease that opens vistas (designed here at 0.018 → 0.009) is **not built**;
  `FOG.restDensity` is unused.
- **Sky** (`sky.ts`, `SKY`, `SKY_HIGH`): day zenith `#9AB6DC`, horizon `#C4D8EE` (were `#A8C2DE` /
  `#CFE0F0`; the near-white horizon, which the far fade also lands on, made views with the sun
  behind you read washed out). As the camera climbs from y 40 to 85 the day dome blends to a deep
  zenith `#5576B2` that comes down to within 0.3 of the horizon, so the low strip of sky the chase
  camera sees is blue behind the pale summit ridge instead of white (Brindle Peak was a whiteout).
  The horizon colour is not changed with height: a deeper horizon made shaded slopes merge with the
  sky, and the far fade must keep landing on it.
- Falling snow: not particles (a flake is never smaller than one 5×5 block and read as dead pixels;
  see `weather.ts`). It is a band-limited veil in the composite, a few percent of luminance. Its
  noise lattice tiles and its offset wraps on that tile: the old `sin` hash ran on coordinates that
  grew with play time, lost precision after ~10 minutes, and turned the veil into hard vertical
  stripes over sky and snow (critic round 2, Kettle Springs onward, worst at dusk).
- Wind gusts on Windscar Ridge: screen-space streak overlay at 12 % alpha + a lateral force applied
  to the player. Never obscures the HUD.

## 7. Prop library & silhouette rules

Every prop must be recognisable as a **filled silhouette at 4 pixels tall**.

| Prop | Budget (tris) | Notes |
|---|---|---|
Pine (3 variants) | 90 | stacked cones, irregular, snow-laden top ring |
Bare deciduous | 70 | 4–6 branch segments, no leaves |
Rock cluster | 48 | 2–3 chunky polyhedra, snow cap on upward faces |
Cabin / hut | 140 | box + prism roof + snow slab + emissive window quad |
Station building | 220 | larger cabin + porch + mast flag |
Lantern post | 30 | post + emissive orb + warm light quad |
Fence run | 20/segment | instanced |
Signpost | 24 | post + angled board |
Sled | 26 | deck + 2 runners |
Bridge | 60 | planks + 2 ropes |
Snow drift | 30 | squashed icosphere, vertex-coloured |
Hot spring | 40 | basin ring + emissive-ish water disc + steam quads |
Character | 260 | body, head, beak, tail, 2 wings, 2 feet, scarf, glasses |
Fish (×6) | 24 | one body + tail; colour variant per species |
NPC (×18) | 180–260 | shared base mesh + per-species head/prop variation |

All props **instanced** where count > 20. Target: < 260 draw calls for the whole valley in view.

## 8. Camera

Code: `src/game/camera/rig.ts` (chase, look, viewfinder), `shot.ts` (two-shot geometry),
`conversation.ts` (who a conversation frames).

- **Chase.** FOV 38°, 15 u behind Pip, 13° pitch, looking at a pivot 1.35 u above Pip's feet.
- **Leash follow.** The view turns only as Pip moves across it: a sideways step turns it by about
  0.6 × step / distance. Walking straight toward or away from the camera turns nothing, and standing
  still turns nothing. It never eases toward Pip's facing.
- **Q / R look.** Turns the view by hand at about 95°/s. It never decays, and the leash never takes
  it back. It does nothing while dialogue, the journal or the menu is open, or in the
  photo viewfinder.
- **Pull-back** on entering a new zone: distance 15 → 24 over 1.4 s, then back over another 1.4 s.
- **Conversation two-shot.** When Pip talks to someone within 10 u, Pip turns to face them and the
  camera eases (0.6 s) to a three-quarter shot from Pip's side, 62° off the line between the two, so
  Pip is the near figure and the speaker faces the lens. Distance is 7.5 u plus 0.9 × the gap
  between them, at most 12. Leaving eases back to where the chase camera would be.
- **Photo viewfinder.** During a photo the camera eases (0.3 s) to Pip's eye, 1.0 u above the feet,
  and looks along the activity's aim (A/D turn, W/S tilt). Pip is hidden once the camera is inside
  the bird. The chase keeps updating underneath, so leaving returns to it exactly.
- **Throws** swing the chase heading toward the throw's aim so the target is in view.
- **Occlusion.** The pivot-to-camera ray is marched against the terrain; a hill pulls the camera in
  to 0.4 u in front of the hit (never closer than 2.5 u) and keeps it 0.8 u above the ground. Trees
  and rocks never move the camera: whatever stands between it and Pip is faded with a screen-door
  dither (`src/game/render/viewFade.ts`).
- **Reduce motion** (pause menu) makes every camera ease snap instead.
- No roll, no shake.

## 9. UI style

- Font: system monospace stack, 2 px letter spacing, no shadows.
- Panels: `NIGHT` at 88 % alpha, 1 px `SNOW_SH` border, 4 px corner radius — rounded corners are
  drawn as pixel-stepped corners, not CSS curves.
- Accent colour for all interactive text: `LANTERN`.
- Icons: 12 × 12 px, drawn as inline SVG on a 12 px grid so they stay crisp under the pixel upsample.
- Toasts slide in from the top, 180 ms, hold 2.2 s, fade 240 ms. Max 3 stacked.
- Everything UI renders **at native canvas resolution above the pixelated 3D layer** — UI is crisp,
  world is chunky. (The reference does the same.)

## 10. Acceptance harness

`tools/aesthetic-check.mjs` loads the real build in headless Chromium with SwiftShader, drives it to
4 fixed camera poses via a debug hook, screenshots the canvas, and asserts every rule in §2. Frame
failures name the violated metric and the measured value. This runs in CI-equivalent form as
`npm run check:art`.

---

# REVISION v1.1 — pipeline corrections verified against three.js r186 source

These four corrections were each checked by reading the installed `node_modules/three` source, not
taken from documentation. Ignoring any one of them breaks the look.

## A1. The beauty target is LINEAR, not sRGB

`src/renderers/webgl/WebGLPrograms.js:213` sets, for any render target:

```
outputColorSpace: currentRenderTarget === null ? renderer.outputColorSpace : ColorManagement.workingColorSpace
```

So anything rendered into our 384×216 target is written in **linear-sRGB working space**, and a raw
`ShaderMaterial` gets no `<colorspace_fragment>` to convert it.

**Therefore the composite shader must do `linear → sRGB` itself, then grade in sRGB.** All the
measured targets in §2 are sRGB display values. Grading linear values against sRGB thresholds would
produce a washed-out, wrong image and would falsely pass on luminance while failing on saturation.

Leave `renderer.outputColorSpace` alone — it has no effect on a `ShaderMaterial` writing to screen.

## A2. Fog must happen exactly once

If `scene.fog` is set *and* the composite applies fog, Lambert materials fog in the beauty pass too,
and the result is double-fogged. Set `scene.fog = null` and apply fog only in the composite.
`MeshNormalMaterial` has no fog chunk, so the normal pass is unaffected either way.

## A3. The normal-override pass needs two guards

`Material.allowOverride` defaults to `true` (verified `Material.js:439`, honoured at
`WebGLRenderer.js:2139`). Consequence: snow particles, water discs and steam quads get rendered with
opaque `MeshNormalMaterial`, write depth, and inject edge noise into the outline.

- Set `material.allowOverride = false` on **every** transparent / emissive / billboard material.
- Construct the override as `new MeshNormalMaterial({ flatShading: true })` — verified default is
  `flatShading = false` (`MeshNormalMaterial.js:151`). With flat-shaded beauty materials, a smooth
  normal pass produces edges that do not line up with the visible facets.
- Leave `samples: 0`. MSAA + a depth texture is a known-bad combination; MSAA is irrelevant at 384×216.
- Instancing and skinning are fine: `USE_INSTANCING` / `USE_SKINNING` are derived from the object, not
  the material.

## A4. Device pixel ratio breaks the "5 px" rule

A 384×216 target upscaled by nearest to a canvas of `cssSize × devicePixelRatio` only gives exact
integer blocks at integer multiples (5× = 1920×1080). At DPR 1.5 you get 3–4 px blocks and moiré, and
§2 fails mechanically.

**Fix:** compute `scale = max(1, floor(min(w/384, h/216)))`, set the canvas **backing store** to
`384*scale × 216*scale`, size it with CSS, and set `image-rendering: pixelated`. Never multiply by DPR.
The acceptance harness pins viewport 1920×1080 at `deviceScaleFactor: 1`.

## A5. Pip is invisible on snow — fix the character read

`PIP_BODY #F2F4F0` on `SNOW_LT #E4EEF7` is near-identical in **both** luminance and hue. At 384×216 the
player would be a 4 px red scarf and nothing else. Corrections:

- Pip's **back, wing coverts and tail** use `PIP_WING #C99A6A` (warm brown) — a snow bunting's actual
  winter plumage, so this is also correct ornithology. Front stays cream.
- A **persistent soft contact ellipse** under Pip at all times (dark, `SHADOW_FLOOR` at 45 % alpha,
  radius 0.55 u). Not a shadow — a readability affordance.
- The interact prompt is distinguished by **shape** as well as `LANTERN` colour, so colour-blind
  players are not dependent on hue.

## A6. HUD adjustments from player-experience review

- **Stamina arc caps at 8 pips.** 14 feathers beside a ~25 px character is wider than the character.
  Beyond 8, the arc becomes a thin bar. Never 14 discrete pips.
- Bell count is shown **only in the shop and the journal**, never in the HUD. The HUD stays two
  numbers at most.
- UI renders above the pixel layer at native canvas resolution and is exempt from the pixel grid, as
  in the reference.

## A7. Grade constants are owned by `src/core/palette.ts`

The palette table and the grade math moved into `src/core/palette.ts` (pure, unit-tested) because four
modules need the same colours and `src/data` / `src/game/world` may not import `src/game/render`.

The lift is `c + shadowFloor·lift·(1-c)`. This form is required, not stylistic: the naive
`c·(1-k) + floor·k` costs 6.5 % off every highlight and would stop snow ever reaching white. Proven
floor: worst-case luminance 0.122 across a 25³ sRGB sweep; white stays exactly 1.0.

---

# REVISION v1.2 — the acceptance gate was wrong; here is the corrected one

## A8. Per-frame thresholds must be derived from per-frame observations

The v1.0 §2 thresholds were taken from the **pooled** statistics of all seven reference screenshots
and then applied to **individual** frames. That is a category error, and it was caught by running the
gate over the reference itself: **the real A Short Hike screenshots failed their own gate.** steam_00,
steam_01, steam_02, steam_04 and steam_06 each failed at least one v1.0 rule.

The frame-to-frame spread in the reference is enormous and legitimate:

| frame | p1 | p50 | p95 | min L | sat p50 | cool | warm | blown | contrast | edge |
|---|---|---|---|---|---|---|---|---|---|---|
steam_00 | 0.273 | 0.484 | 0.747 | 0.110 | 0.514 | 0% | 50% | 0.2% | 0.126 | 0.009
steam_01 | 0.269 | 0.386 | 0.851 | 0.122 | 0.402 | 0% | 27% | 3.9% | 0.168 | 0.008
steam_02 | 0.257 | 0.465 | 0.745 | 0.124 | 0.532 | 37% | 35% | 1.1% | 0.175 | 0.008
steam_03 | 0.231 | 0.637 | 0.873 | 0.131 | 0.574 | 65% | 7% | 3.5% | 0.232 | 0.012
steam_04 | 0.259 | 0.457 | 0.694 | 0.116 | 0.556 | 0% | 69% | 0.1% | 0.105 | 0.010
steam_05 | 0.331 | 0.790 | 0.935 | 0.190 | 0.864 | 0% | 89% | 28.9% | 0.162 | 0.006
steam_06 | 0.175 | 0.461 | 0.718 | 0.116 | 0.595 | 45% | 28% | 1.6% | 0.160 | 0.008

p50 alone ranges **0.386 to 0.790**. A rule of "p50 must be 0.44–0.54" rejects a fifth of the actual
game. steam_05 is a bright snow-and-water shot at 28.9% blown highlights, which the v1.0 gate would
have called a failure.

### The corrected per-frame gate (`judge()` in `src/core/imagemetrics.ts`)

| rule | band | why |
|---|---|---|
no pixels below L 0.10 | == 0 | the defining structural rule; reference floor is 0.110 |
min luminance | ≥ 0.10 | same |
luminance p1 | 0.16 – 0.36 | reference observed 0.175 – 0.331 |
luminance p50 | 0.36 – 0.80 | reference observed 0.386 – 0.790 |
luminance p95 | 0.65 – 0.96 | reference observed 0.694 – 0.935 |
saturation p50 | ≥ 0.38 | reference floor 0.402 |
blown highlights | ≤ 30% | reference max 28.9% |
contrast | ≥ 0.09 | reference floor 0.105 |
block period | == 5 | invariant |
**detail density** | **≥ 0.005** | reference floor 0.006 |

### The warm/cool split is NOT a per-frame rule

One reference frame is 50 % warm / 0 % cool; another is 7 % warm / 65 % cool. Band share is a property
of a **set** of frames, not of a frame. It moved to `judgeSet()`, which requires the game as a whole to
have a cool-dominant mean (≥ 0.25, a deliberate winter shift from the reference's 0.21), a real warm
minority (≥ 0.15), at least one cool-dominant frame, at least one warm-dominant frame, and mean detail
density ≥ 0.005.

## A9. The gate must pass the benchmark — enforced by test

`tests/artgate.test.ts` hard-codes the seven reference frames' measured metrics and asserts every one
passes `judge()`. **If a future change to the gate makes the real A Short Hike screenshots fail, the
test fails.** This is the only thing preventing the gate drifting away from the thing it imitates, and
it exists because that exact drift already happened once.

Corollary: never tune a constant to satisfy the gate without re-running the reference frames. A number
that passes only our own art is not a benchmark.

## A10. Detail density is the gap that bare terrain cannot close

Measured on the pipeline spike (a ground plane, six cones, three rocks): detail density **0.001**
against a reference floor of **0.006**. Tone, saturation, hue split and outlines all passed; the render
was simply *empty*. Detail density is the metric that measures "is the world dressed", and it is the
acceptance target for all scenery work. A beautiful but sparse world fails.
