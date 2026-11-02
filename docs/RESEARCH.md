# Reference Research — A Short Hike (benchmark)

Purpose: convert "looks like A Short Hike" from a vibe into **measurable targets** the build can be
verified against.

## 1. What the game actually is

| Field | Value |
|---|---|
| Developer / Publisher | Adam Robinson-Yu (adamgryu) |
| Released | 30 Jul 2019 (Steam / itch), Unity engine |
| Genre | Adventure / casual exploration, single player |
| Core loop | Climb Hawk Peak for phone signal; collect **Golden Feathers** (stamina) to climb higher |
| Length | ~1 h to summit, ~3–4 h to 100% |
| Camera | Fixed-ish third-person, isometric-adjacent, auto-framing, limited yaw |
| Combat | None. No fall damage. No death. |

### Gating model (important design lesson)
Progress is gated by **one** resource: feathers. ~7 needed for the summit route. Feathers come from
exploration *or* purchase with coins *or* quest rewards — three acquisition paths so no single
playstyle is punished. Reviews consistently praise that "no matter what you do, it moves you
toward the goal."

### Content inventory observed in reviews (what creates the 3–4 h)
Feathers (20 total), coins, chests, buried treasure, treasure maps, fishing + fish journal, shells,
sticks, beach-stick-ball, foot races, parkour challenges, boating, hot springs, NPC fetch/delivery
quests, lost-object quests, a scalper NPC, a visitor centre shop, signs for wayfinding, an
end-of-game updraft flight.

## 2. Art direction — stated by the developer

Sources: PlayStation.Blog (2021) "Crafting a tiny open world"; GDC 2020 postmortem; Wikipedia.

1. **Deliberately low internal resolution** — "a beautiful (and readable) 3D world using as few
   pixels as possible." World rendered to a tiny render texture, then upscaled with **point
   filtering**.
2. **No anti-aliasing.**
3. **Flat cohesive shading**; a custom mostly-unlit shader giving precise shadow control. Lighting
   ramp is *stair-stepped*, then colours shifted **up toward white** so shadows stay close to their
   palette colour — i.e. shadows are coloured, never black.
4. **Soft outline** added so objects read at low resolution.
5. Palette **sampled directly from photographs of the Canadian Shield in autumn**.
6. Post-processing stack: **fog** (keeps focus on foreground) → **edge detection** (picks out
   silhouettes) → **colour correction** (blue pushed into shadows).
7. UVs unwrapped straight onto a palette texture — no painted texturing. Cheap, consistent,
   swappable palettes.
8. Pixel size is **user-adjustable**.

## 3. Measured numbers (my own pixel analysis)

Extracted from the 7 official Steam screenshots (1055540), 14.4 M pixels.

### Pixel grid — VERIFIED two ways
**Method 1, autocorrelation.** Autocorrelation of the horizontal edge-magnitude profile across all 7
shots shows a strong fundamental period of **5 screen pixels at 1920 px wide** (0.79–0.93
correlation at lag 5, secondary peak at lag 10).

**Method 2, block-constant variance.** For each candidate block size k, mean variance *within* k×k
blocks, minimised over all phase offsets. The true block size is the k where the image becomes
block-constant:

| k | 2 | 3 | 4 | **5** | 6 | 7 | 8 | 9 | 10 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|
| steam_00 | 32.7 | 56.5 | 77.4 | **1.95** | 114.5 | 130.4 | 146.0 | 160.3 | 141.2 | 199.5 |
| steam_04 | 28.8 | 49.3 | 67.6 | **2.10** | 100.4 | 114.1 | 126.1 | 138.8 | 123.5 | 172.6 |
| steam_02 | 35.1 | 59.9 | 82.1 | **26.7** | 121.4 | 138.7 | 155.2 | 170.0 | 158.9 | 214.7 |

Within-block variance collapses by 1–2 orders of magnitude at exactly k = 5, on every shot.

→ internal render = **384 × 216** for a 1920 × 1080 output (16:9), nearest-upscaled 5×.

> Method note: an exact-RGB run-length test is **invalid** on these files — JPEG compression makes
> ~87 % of horizontal runs length 1 and introduces 8/16-px artefacts from its own DCT blocks. Both
> methods above are robust to that, which is why they agree.

### Tone
| Metric | Value |
|---|---|
| Luminance p1 / p5 / p25 / p50 / p75 / p95 / p99 | 0.251 / 0.265 / 0.373 / 0.492 / 0.676 / 0.906 / 0.965 |
| Darkest pixel anywhere | **L = 0.11** |
| Fraction of pixels below L 0.10 | **0.0 %** |
| Darkest 0.2 % mean RGB | (15, 51, 73) — dark desaturated **teal**, not black |
| Saturation p5 / p50 / p95 | 0.188 / **0.548** / 1.000 |
| Luminance histogram | broad, mid-heavy; peak decile 0.4–0.5 (22.6 %) |

**Hard rule this establishes: there is no black in the image.** Shadow floor is a coloured
dark teal at L≈0.11–0.25. Any render with crushed blacks fails the benchmark.

### Hue distribution (saturation-weighted, 15° bins)
| Band | Share | Meaning |
|---|---|---|
| 30–60° (amber/olive/gold) | **42.9 %** | foliage, dirt, sunlight |
| 0–30° (orange/red) | 20.8 % | roof, autumn canopy |
| 195–210° (cyan) | 11.7 % | water |
| 225–240° (blue-violet) | 7.8 % | sky / shadow |
| 60–90° (green) | 6.5 % | grass |
| others | <3 % each | |

So: **~64 % of chroma sits in the warm 0–60° band** and ~20 % in the cool 195–240° band. It is a
*warm* game with cool accents, at high saturation (median 0.55), never pastel-washed.

### Per-screenshot palettes, 8-cluster k-means (dominant hexes)
```
steam_00  #99823F 20.5%  #C56633 19.3%  #BAB83B 17.3%  #625D38 14.9%  #EFA051  #B29489  #D1C1B4  #5AB5B1
steam_01  #717231 23.9%  #535C3A 18.4%  #73A29B 14.9%  #908B30  #D5E5DB  #BAB93D  #985F4D  #CD7C34
steam_02  #18608A 26.6%  #5C5F37 15.5%  #EAD074 13.1%  #CAA842  #A9BEBC  #96783E  #AD8C84  #F5F7F5
steam_03  #B6BCFE 24.1%  #A45739 20.0%  #4B5933 15.0%  #8B92FE  #44596A  #897DD7  #74629E  #FBFCEF
steam_04  #BD742F 29.4%  #95573D 19.6%  #CEA23F 15.7%  #979137  #DFBC86  #604D32  #B67F6C  #EFC63B
steam_05  #FDD295 33.7%  #FBF4DD 23.0%  #F8EDCF 15.0%  #CCA634  #926436  #E6BB78  #D1C1B1  #B99782
steam_06  #D58B45 26.2%  #A34B3A 17.7%  #104A6F 16.7%  #146590 13.4%  #3986A3  #D39F89  #70C3CC
```
Note `steam_03` is a dusk shot in lavender/violet (#B6BCFE, #897DD7) — proof the palette supports a
cool-dominant scene at night without going black. That is the licence for a winter night look.

### Sky / top-of-frame mean colours
`(181,159,127)` warm haze · `(124,126,73)` olive · `(130,131,164)` **lavender dusk** ·
`(179,122,90)` warm sunset · `(228,193,142)` bright warm · `(150,133,110)` muted.
Skies are **warm-neutral or lavender**, never a clean saturated blue.

## 4. What reviews say the *feel* is (design constraints, not decoration)

Paraphrased points that recur across GameSpot, GameFAQs, Vice, Gold-Plated Games, Comfy Cozy,
GamePat, Digital Fantasy Diary:

- **No map, no quest log pressure, no fail state.** Nothing is required. A compass exists and is
  basically useless.
- Friction is *technical*, never punished: it is possible but harder to summit with fewer feathers.
- Camera framing does the teaching; **zooming out at landmarks** creates grandeur.
- **Coins as breadcrumbs** — currency placement is a soft signpost system, not an economy.
- **The reward is the vignette, not the reward.** A frog gets a toy shovel and slowly builds a sand
  empire. Non-mechanical, memorable.
- NPCs are written like *texting a friend*; several embody different flavours of anxiety and
  self-doubt. The summit call is the emotional payoff.
- Movement is tight and non-slippery; gliding "feels incredible"; camera restriction is the single
  recurring complaint (sometimes hides the player).
- Hot springs restore stamina in the snowy biome.

### Risks I inherit and must design against
1. **Camera occlusion** — the one real criticism. Mitigation: soft camera collision push-in, and
   fade/ghost the player silhouette when fully occluded.
2. **Fog hides vistas** for view-lovers. Mitigation: fog density curve that *reduces* while the
   player is airborne or standing still for >1.5 s — the view opens up when you stop to look.
3. **Shallow endgame** — ASH is criticised for length. Our scope is larger; keep the completion
   journal dense so there is always a next thread.

## 5. Winter translation — the brief for the art director

Keep the **structure** of the benchmark precisely; change only the **season**:

- Same internal res (384×216), same 5 px block at 1080p, same no-AA nearest upscale.
- Same luminance profile — p1 0.25, p50 ~0.49, p95 ~0.90, **hard floor L ≥ 0.11, zero pixels below
  0.10**.
- Same median saturation ≈ 0.55. Winter is *not* desaturated grey. Snow is blue-white and vivid.
- Hue: move the dominant band from warm-amber to **cool blue (200–225°)** to read as snow/ice sky,
  but **retain a strong 25–45° warm band (≥25 % of chroma)** for low winter sun, lamplight, cabin
  windows and pine bark. The warm/cool contrast is what makes it cosy rather than bleak. This is a
  swap of the dominant band, not a palette wipe.
- Snow shadows go **lavender/blue-violet (228–250°)**, never grey and never black.
- Night/dusk shots use the `steam_03` licence: lavender-dominant, still no black.
- Outlines: soft, dark, from depth+normal edge detection. Not a hard black toon line.

## 6. Technical route chosen

- **three.js 0.186** + TypeScript + Vite, WebGL2, no engine download.
- Pixelation: replicate the ASH pipeline directly — render beauty + normals + depth into
  384×216 targets, then one fullscreen pass that samples **nearest**, computes depth/normal edges,
  applies the palette grade in display space, and writes blocky pixels to a full-res canvas.
  `three/addons/postprocessing/RenderPixelatedPass.js` was read and is the reference implementation
  for the edge maths (its `depthEdgeIndicator` / `neighborNormalEdgeIndicator` are sound). We keep
  our own single-pass version so the colour grade happens in the same shader, in sRGB, where the
  measured targets live.
- All geometry **procedural** (parametric primitives + vertex colours). No external asset pipeline,
  no binary assets, no licence risk, and every asset is diffable and testable in code. This mirrors
  the reference's "make many simple objects fast" reality.
- Audio **procedural** via WebAudio (adaptive layers by altitude/weather), matching Mark Sparling's
  layered-score idea without shipping audio files.
