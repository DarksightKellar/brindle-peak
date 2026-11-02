# Code review — architecture and hygiene

Read-only review of the tree as it stands at commit `HEAD` (working tree clean). Scope is the house
rules in `ARCHITECTURE.md` §1, the state-ownership rule in §3, and the contracts in §5 — not art
direction, not gameplay balance, not naming taste.

## Baseline (measured, not assumed)

| Gate | Command | Result |
|---|---|---|
| Types | `npx tsc --noEmit` | clean, exit 0 |
| Unit | `npx vitest run` | **199 / 199 across 14 files**, 1.45 s |

`npx tsc` and `vitest` are green, so every defect below is a defect the suite does not see. That is
the theme of this review: the tests test the maths, and several of the wiring bugs live one layer up.

## Findings

| id | severity | file:line | defect |
|---|---|---|---|
| F1 | **BLOCKER** | `src/session.ts:93` | 428-line `createSession` — seven jobs in one closure; 118 lines longer than the debt `STATE.md` records |
| F2 | **MAJOR** | `src/game/render/lightRamp.ts:76` | `applyLightRamp` is called by nothing in `src/`; ART_BIBLE §4's "single most recognisable thing" is not applied to any material |
| F3 | **MAJOR** | `src/session.ts:237` | Lantern lit is written twice (session *and* `progress.mutate`), and the event writes a running count into a per-id slot |
| F4 | **MAJOR** | `src/game/ui/menu.ts:10` | Two pixel-size lists with different numbers (`[3,4,5,6]` live, `[3,5,8]` documented and dead) |
| F5 | **MAJOR** | `src/game/activities/fishing.ts:45` | `FALLBACK_FISH` duplicates `data/fish.ts` record-for-record and is the default argument of `createActivity` |
| F6 | **MAJOR** | `src/game/world/assemble.ts:67` | Content modelling and world composition in one file; same class in `scatter.ts`, `props.ts` |
| F7 | **MAJOR** | `src/game/world/groundTexture.ts:44` | `TileStats` — the guard against a blank texture — is computed at boot and read by nothing; the test the file cites does not exist |
| F8 | MINOR | `src/game/session/interact.ts:21` | Export surface wider than the module: 51 exports used only inside their own file, 9 unreachable from anywhere |
| F9 | MINOR | `src/session.ts:52` | Save key is still `first-snow.save.v1` while payloads are `SAVE_VERSION` 2; a stale save is dropped with no notice |
| F10 | MINOR | `src/game/ui/activityHud.ts:27` | `show()` accepts `prompt` and never reads it |
| F11 | MINOR | `src/game/world/activityMarkers.ts:69` | Markers past `POOL` are dropped silently; the comment also understates the draw-call cost |
| F12 | MINOR | `src/game/activities/build.ts:42` | The position→seed idiom is copy-pasted into six activity modules with six different multipliers |
| F13 | MINOR | `src/game/world/groundTexture.ts:239` | Checker texture and `window.__ground` dev seam are built every boot for a harness that is not in the tree |
| F14 | MINOR | `src/core/palette.ts:157` | Colour maths still has two TypeScript implementations; palette hexes are restated as literals in `scene.ts` |
| F15 | MINOR | `tests/progress.test.ts:275` | The save round-trip never populates `talkedAt` / `questTalkBase`, so dropping them would still pass |
| F16 | MINOR | `src/game/world/assemble.ts:236` | One new material per lantern lit (old one leaked); `world.dispose()` frees the module-cached terrain materials that outlive it |
| F17 | MINOR | `src/session.ts:210` | `interactions.update()` runs twice per frame; the prompt can describe a different target than the one just interacted with |

---

## F1 — BLOCKER — `src/session.ts` is 428 lines and owns seven jobs

```
   688 tests/activities.test.ts        over, and the largest file in the repo
   653 src/core/contracts.ts           EXEMPT (frozen, documented)
   428 src/session.ts                  ← 1.7× the limit, and growing
   324 src/core/imagemetrics.ts
   313 tests/progress.test.ts
   280 src/game/world/props.ts
   276 src/game/world/scatter.ts
   272 src/game/world/water.ts
   272 src/game/world/assemble.ts
   272 tests/terrain.test.ts
   270 src/game/world/groundTexture.ts
   270 tests/props.test.ts
   267 src/core/palette.ts
   266 tests/content.test.ts
   260 src/game/render/pixelPipeline.ts   at the limit, not over — clean
   260 src/game/activities/fishing.ts     at the limit, not over — clean
```

For each, is it two jobs?

| file | verdict |
|---|---|
| `session.ts` | **Yes, seven.** Boot/wiring (93–151), overlay routing (186–204), the interact verb (205–240), dialogue stepping (242–250), world rules — edge clamp, gust cycle, spring saturation, summit (250–390), autosave + `SAVE_KEY` (52, 163), teardown (415–426). This is `main.ts`'s job, the mode router's job, and four world systems' job in one closure. |
| `imagemetrics.ts` | Marginally. It is one job (measure a frame) plus `formatMetrics` and two unrelated speckle detectors. Over by 64 after `countContrastSpecks` was moved in. |
| `props.ts` | **Yes.** 280: prop budget/variant *data* (15–28) plus `GeoBuilder` and nine geometry builders (63–276). "A file that both defines content and applies it is wrong" (§1.5). |
| `scatter.ts` | **Yes.** Places props (186–238) and instances them into a `Group` (240–276). `STATE.md` already concedes this one. |
| `water.ts` | No. The lake and its springs are one subject; three builders is not two jobs. Over by 12. |
| `assemble.ts` | **Yes.** See F6. |
| `groundTexture.ts` | No. One job (bake albedo tiles), over by 10. |
| `palette.ts` | No. One domain: colour. |
| `tests/activities.test.ts` | 688 lines, 2.6× the limit. `ARCHITECTURE.md` §1.3 states the rule without a test exemption; §6 says critical paths only, which 688 lines is not. |

**Why it matters.** The rule is not decoration: `session.ts` is the file where F3, F17 and the silent
lantern refusal all live, and they live there because it is the only place that has the loop, the
state and the UI in scope at once. A 428-line closure is where invariants go to die.

**Smallest fix.** Extract in this order, no behaviour change, no new abstractions:
1. `game/session/worldRules.ts` — the edge clamp, the spring-saturation test and the summit trigger
   (~60 lines out; each becomes a function of `(player, sample, state, bus)`).
2. `game/session/modes.ts` — `toggleJournal` / `toggleMenu` / `escape` / the `blocked` predicate
   (~40 lines). It already has a natural home next to `router.ts`.
3. `game/session/save.ts` — `safeLoad`, `persist`, `SAVE_KEY`, `SAVE_EVERY` (~30 lines).
That is 130 lines, which brings the file to ~300 and makes the next 40 obvious. This round added the
ending, the activity HUD and the marker layer *inside* `update()`; splitting is now cheaper than it
was.

`STATE.md` line 300 records `session.ts` at 310 lines and `README.md` line 75 at 299. Both are stale:
the file is 428, so the debt grew ~40 % while it was being documented as static.

---

## F2 — MAJOR — the 3-band light ramp is dead code, and the tool hides it

`grep -rn applyLightRamp` over the whole tree:

```
src/game/render/lightRamp.ts:76:export function applyLightRamp(material: THREE.Material): void {
tools/artspike/artspike.ts:11:import { applyLightRamp } from '../../src/game/render/lightRamp';
tools/artspike/artspike.ts:46:  applyLightRamp(m);
```

Confirmed: the art lead is right. The only caller is `tools/artspike/artspike.ts`, a spike harness that
builds its own primitives and never runs in the game. Every lit material in `src/` is constructed
without it — `props.ts:174`, `assemble.ts:26`, `terrainMaterial.ts:30`, `water.ts:165`,
`playerMesh.ts:26` all build a bare `MeshLambertMaterial` and return it.

**Why it matters.** `ART_BIBLE.md:98` calls this "the single most recognisable thing about the
reference's look" and specifies the numbers (`1.0 / 0.78 / 0.60`, +8°/−12°). `scene.ts:6` describes
the shipped lighting as "`MeshLambertMaterial` + `flatShading` + **the 3-band ramp**" — so the code's
own header claims a feature it does not have. Nothing catches it: `core/artgate.ts` gates luminance
percentiles, chroma bands and edge density, none of which can see a missing N·L quantisation. This is
the same failure shape as the two duplications in `STATE.md` — a feature validated against a thing
that is not what ships — except here the validator is a spike, not a test.

Two further points, because they decide what "fix it" means:

1. **The patch would not produce stairs even if wired.** `lightRamp.ts:51` computes
   `vec3 irradiance = dotNL * directLight.color * mul;` — the smooth `dotNL` survives; the band only
   scales it. ART_BIBLE asks for `dotNL` to be *replaced* by the stair value. So the honest fix is a
   one-token change (`float stair = band < 0.5 ? uBandMul.x : …; irradiance = stair * color`) — but
   discovering that requires reading the shader, which nobody did because nothing renders it.
2. **`tools/artspike/artspike.ts` (257 lines) exists only to keep this code looking alive.** Its own
   header calls it "a self-contained slice of the winter look… so the pipeline can be measured before
   the world modules land". The world modules landed. It is a spike occupying the tree, and it is what
   a grep-based dead-code check trips over.

**Smallest fix.** Either (a) call `applyLightRamp` from the four material factories, fix line 51 to
replace rather than scale, add one art-gate note that the frame has three distinct snow luminances,
and delete the spike; or (b) delete `lightRamp.ts` and the spike, and strike the ramp from
ART_BIBLE §4 and the `scene.ts:6` comment. Do not leave a third option where the module stays and
nothing calls it. (a) is the one the art direction wants; it is roughly ten lines plus a re-measure.

---

## F3 — MAJOR — the lantern counter has two writers, and one of them writes the wrong number

`src/session.ts:236`:

```ts
} else if (target.kind === 'lantern' && !state.lanterns[target.id] && state.abilities.lantern) {
  state.lanterns[target.id] = 1;
  world.setLanternLit(target.id);
  bus.emit('lantern:lit', { id: target.id, lit: Object.keys(state.lanterns).length });
```

`src/core/progress/progress.ts:88`:

```ts
case 'lantern:lit': {
  const id = readString(f, 'id');
  if (id !== null) {
    const lit = Math.floor(readNumber(f, 'lit', (s.lanterns[id] ?? 0) + 1));
    s.lanterns[id] = Math.max(0, lit);
```

`lit` is the *running total of lit lanterns*; `mutate` stores it as *the value of this lantern*. Light
the fourth lantern and `state.lanterns['lantern-4'] = 4`. The value is then persisted by `save()`
verbatim, so a save now carries per-id counts that mean nothing.

**Why it matters.** Two violations in six lines. §3: "nothing reads `GameState` and writes it in the
same frame phase except the system that owns that field" — here the session writes, then the bus
writes again. §1.7/§1.9: the session is reaching into a slice owned by `core/progress` and guessing at
an event payload whose field name (`lit`) it does not share a definition for. Today the symptom is
invisible because the only reader, `journal.ts:68`, counts keys with a value `> 0` — which is luck, not
design. Any future `sum(values)` or `value === 1` check reads garbage.

**Smallest fix.** Delete `state.lanterns[target.id] = 1;` (line 237) and emit only
`{ id: target.id }`; `mutate`'s existing default `(s.lanterns[id] ?? 0) + 1` then does the right thing
and there is one writer. Then add the assertion this project's style asks for: a unit test that the
fourth `lantern:lit` leaves every previously-lit id at `1`.

---

## F4 — MAJOR — two pixel-size lists, different numbers

```
src/game/ui/menu.ts:10:        export const PIXEL_SIZES: readonly number[] = [3, 4, 5, 6];
src/game/render/pixelConfig.ts:14:  /** ART_BIBLE §1: measured 5 px block at 1920. Options 3 / 5 / 8. */
src/game/render/pixelConfig.ts:16:  export const PIXEL_SIZE_OPTIONS = [3, 5, 8] as const;
```

`PIXEL_SIZE_OPTIONS` has **zero** references anywhere in `src/`, `tests/` or `tools/` (see F8). The
list the player actually gets is `menu.ts`'s, which offers 4 and 6 and does not offer 8 — i.e. the
shipped control disagrees with the constant the render tuning file documents as the art-bible set.

**Why it matters.** This is the exact class that has already cost this project twice (`STATE.md`
270–292: the grade in two places, the seed in two places). It is cheap to spot precisely because the
correct copy is dead: the renderer's tuned option list never reaches the UI.

**Smallest fix.** `menu.ts` imports `PIXEL_SIZE_OPTIONS` from `pixelConfig` and renders it; delete
`PIXEL_SIZES`. Then decide, once, whether 8 belongs in the menu (if not, the comment at
`pixelConfig.ts:14` is wrong and should say so).

---

## F5 — MAJOR — `FALLBACK_FISH` is a second content table in game code

`src/game/activities/fishing.ts:45` defines six `FishDef`s; `src/data/fish.ts:8` defines the same six,
same ids, same names, same rarities, same values, same hexes. The duplicate is not inert — it is the
default argument of the factory:

```
src/game/activities/fishing.ts:118:  constructor(def: ActivityDef, table: readonly FishDef[] = FALLBACK_FISH)
src/game/activities/index.ts:42:      export function createActivity(def: ActivityDef, fish: readonly FishDef[] = FALLBACK_FISH)
```

with the comment "kept id-compatible with src/data/fish.ts so a catch always resolves to a real journal
page even when the world forgets to inject FISH".

**Why it matters.** §1.7, "Content is data, not code". `session.ts:230` does pass `FISH`, so behaviour
is currently identical — but `score` per fish becomes bells through `host.award`, and the fallback's
copy would pay its own prices. Two tables that agree today and are edited independently is the
definition of the bug class this project keeps re-learning. The comment's premise (the world might
"forget to inject") is also solved better by a required parameter than by a silent second source.

**Smallest fix.** Delete `FALLBACK_FISH`; `import { FISH } from '../../data/fish'` and use it as the
default. Four call sites, no signature change for callers, one table. `tests/activities.test.ts:183`
then imports the real table, which is what it meant to test.

---

## F6 — MAJOR — `assemble.ts` both composes the world and models every actor

`assemble.ts` (272) does two jobs that the ownership table separates:

- **Composition** (178–267): build terrain, scatter, landmarks, water, then a shadow traversal, an
  occluder set, and the `update`/`dispose`/`setCollected` surface.
- **Actor modelling** (67–160): `buildNpc` and `buildPickup` construct 18 NPCs and 74 pickups out of
  spheres, cones and a species table, including `SPECIES_SCALE`, `HAS_EARS`, `HAS_TAIL` and the `hare`
  branch.

`STATE.md:307` already concedes this ("`assemble.ts` both composes the world and models 18 NPCs + 74
pickups"), and the debt is unchanged. The same shape appears twice more, both unlisted:

- `scatter.ts:186` places and `:240` instances (276).
- `props.ts:15` declares the prop budget/variants and `:276` builds the geometry (280).

**Why it matters.** §1.5. The practical cost is visible in F16: because actor meshes are built inside
`buildWorld`, the per-lantern material allocation and the world `dispose()` are entangled, and the
teardown path cannot be reasoned about without reading all 272 lines.

**Smallest fix.** `game/actors/npcMesh.ts` ← `buildNpc` + species tables; `game/actors/pickupMesh.ts`
← `buildPickup`. `assemble.ts` keeps composition and calls them. For `scatter.ts`, split
`scatterProps()` (pure, returns `Placement[]`) from `buildScatterGroup()` (three.js) — the pure half is
then testable in node, which is the stated reason for the split rule.

---

## F7 — MAJOR — the blank-texture guard is computed and thrown away

`groundTexture.ts:44` defines `TileStats` with explicit intent:

```ts
/** Share of texels at pure white — a blank map shows up here as 1. */
untouched: number;
/** ... Below ~0.85 the tile is being flattened to pay for its own brights ... */
trim: number;
```

`bake()` computes it for all three tiles at `:146`. `grep -rn "untouched\|TileStats"` over
`src/ tools/ tests/` returns the interface, the field and the assignment at `:146` — plus two
`it('... untouched ...')` test titles, which are the English word. No code reads it. Nothing asserts
it or logs it.

The file also cites a test that is not in the tree:

```
src/game/world/groundTexture.ts:20:  *   node (see tests/terrainTexture.test.ts) without a DOM.
```

`ls tests/` → `activities, artgate, audio, content, footprints, imagemetrics, occlusion, palette,
player, progress, props, render, terrain, ui`. No `terrainTexture.test.ts`.

**Why it matters.** `STATE.md:103–112` records this bug being *found once already*: a variant that
"was a blank white square — a bug invisible in review and obvious from the test pattern". The
instrument built to catch its recurrence measures every boot and reports to nobody, and the test the
docstring promises was never written. `ART_PASS.md` even specifies it: "min/max/mean of each buffer,
`mean ≈ 0`, and `min < 0.15`". A pure function that produces a `Uint8Array` is the cheapest test in
this repo.

**Smallest fix.** `tests/terrainTexture.test.ts` (node, no DOM):
`for (const t of [snow, ice, rock]) expect(t.stats.untouched).toBeLessThan(0.5)` and
`expect(Math.abs(t.stats.mean)).toBeLessThan(0.01)`. Export `snow/ice/rock` or a `tilesForTest()`
seam — they are already pure. ~25 lines, and the docstring stops lying.

---

## F8 — MINOR — the export surface is wider than every module needs

Mechanical scan of every `export const|function|class` in `src/`, counting references outside the
defining file:

**9 have zero references anywhere, inside or out:**

| symbol | file:line |
|---|---|
| `distXZ` | `src/core/contracts.ts:56` |
| `rgbAt` | `src/core/imagemetrics.ts:224` |
| `grantAchievement` | `src/core/progress/achievements.ts:36` |
| `PIXEL_SIZE_OPTIONS` | `src/game/render/pixelConfig.ts:16` |
| `TOAST_SLIDE_MS` | `src/game/ui/toasts.ts:32` |
| `groundSpawn` | `src/game/world/assemble.ts:270` |
| `TOTAL_TARGET` | `src/game/world/scatter.ts:31` |
| `ICE_SURFACE_Y` | `src/game/world/water.ts:270` |
| `ICE_TINT` | `src/game/world/water.ts:272` |

All nine are in `STATE.md`'s debt list, which is accurate on this point — except that the list also
names `STRIKE_TENSION` and `targetPosition`, which each have an internal use and are merely
over-exported, not dead. The list is 12 long, 10 correct.

**51 more are exported but referenced only inside their own file.** Most are harmless constants
(`SLED`, `PHOTO`, `RACE`, `BUILD`, `SUN_DIR`) but the *new* modules this round added eight:
`ACTIVITY_RADIUS`, `LANTERN_RADIUS`, `NPC_RADIUS`, `PICKUP_RADIUS`, `questsByGiver`
(`session/interact.ts`), `formatClock`, `hintFor` (`ui/activityHud.ts`), `spokenTime`, `EndingStats`
(`ui/ending.ts`). None is consumed outside its module, so each is a public commitment nobody asked for
(§1.9, "narrow surface").

**Why it matters.** Beyond tidiness, F2 and F4 were both *hidden by a wide surface*: `applyLightRamp`
looked used because a tool imported it, and the correct pixel-size list looked maintained because it
was exported. Dead exports are how dead code stays off the radar.

**Smallest fix.** Drop `export` from the 51 internal-only symbols; delete the eight outside
`contracts.ts`. `distXZ` and `InteractionTarget` live in the frozen file, so they get reported to the
Director rather than edited. If a symbol exists for tests only, say so in its docstring
(`footprintCount()` already does).

---

## F9 — MINOR — save key says v1, payload says v2, and rejection is silent

```
src/session.ts:52:        const SAVE_KEY = 'first-snow.save.v1';
src/core/contracts.ts:610:  export const SAVE_VERSION = 2;
```

`load()` rejects any save whose `version !== 2` (`save.ts:109`) and `safeLoad()` turns that into
`null` (`session.ts:84–91`), so a player who has a v1 save starts a clean run. `contracts.ts:606`
argues for exactly that — resuming into a state where every quest completes on sight would be worse —
and the reasoning is sound. What is missing is a key change or a notice: the key still advertises v1,
so the *name* of the storage slot no longer describes its contents, and the only signal the player gets
is their progress vanishing.

**Smallest fix.** Rename to `first-snow.save.v2` (old key is then genuinely orphaned rather than
misleading), and have `safeLoad` return a discriminated `{ state } | { rejected: true }` so
`session.ts` can push one toast — "This run can't be resumed; starting fresh." Two lines of UI, and the
failure stops being silent, which is the project's stated style.

---

## F10 — MINOR — `ActivityHud.show()` takes a prompt it never uses

```ts
src/game/ui/activityHud.ts:27:  show(def: { name: string; kind: ActivityKind; prompt: string }): void;
src/game/ui/activityHud.ts:74:    show(def): void {
src/game/ui/activityHud.ts:75:      name.textContent = def.name;
src/game/ui/activityHud.ts:76:      hint.textContent = hintFor(def.kind);
```

`def.prompt` is passed by `session.ts:235` and read by nothing. Either the interaction prompt ("Build
a snowman") was meant to appear under the title, or it should not be in the signature.

**Smallest fix.** Delete `prompt` from the parameter type and the call site, or render it as the
kicker at `:60` (which currently hardcodes the word "Activity" for every kind).

---

## F11 — MINOR — markers past the pool vanish without a word

```ts
src/game/world/activityMarkers.ts:22:  const POOL = 6;
src/game/world/activityMarkers.ts:69:    for (let i = 0; i < Math.min(specs.length, POOL); i++) {
```

Today the maximum is 3 (build parts, `SNOWMAN_PARTS`) or 3 (targets) or 1 (float, ring), so nothing is
lost — but the seventh marker would disappear silently, and this project's rule is "fail loudly in
tests, never silently". The same paragraph's cost claim is also wrong: `:53` creates **one material per
mesh**, so the worst case is 6 draw calls, not the "four draw calls regardless of content" promised at
`:10`.

**Smallest fix.** `if (specs.length > POOL) throw new Error(...)` in `sync`, or size the pool from a
constant the activities import. Correct the draw-call sentence or give the pool one shared material
(which would make it true and cheaper).

---

## F12 — MINOR — six copies of the same seed idiom

```
build.ts:42    (Math.abs(def.pos.x * 211  + def.pos.z * 97)     % 6283) / 1000
photo.ts:60    Math.abs(Math.round(def.pos.x * 6151 + def.pos.z * 3079)) >>> 0
race.ts:58     (Math.abs(def.pos.x * 613  + def.pos.z * 271)    % 6283) / 1000
skate.ts:70    Math.abs(def.pos.x * 1229 + def.pos.z * 4513)
sled.ts:70     (Math.abs(def.pos.x * 37   + def.pos.z * 11)     % 6283) / 1000
targets.ts:75  Math.abs(Math.round(def.pos.x * 3571 + def.pos.z * 823)) >>> 0
```

Six modules, six multiplier pairs, two spellings of the same operation, and the magic `6283` (2π×1000)
in five of them. §1.8: "tuning numbers live in one place per domain".

**Why it matters.** It is not a bug today each module only has to be stable with itself. It is a bug
waiting for the first "why does the photo subject move when I nudge the activity 1 unit?" — and the
answers will differ per module because the multipliers differ.

**Smallest fix.** One function in `core/math/noise.ts` (or a new `core/math/seed.ts`):
`export const seedFromPos = (p: Vec2): number`, plus `angleFromSeed(seed): number`. Six one-line
deletions. Note this is *not* a determinism violation — all six are deterministic — so it is hygiene,
not F2-class.

---

## F13 — MINOR — the ghost harness: checker texture and dev seam built every boot

```
src/game/world/groundTexture.ts:239  export function buildCheckTexture(): THREE.DataTexture
src/game/world/groundTexture.ts:268  if (!cached) cached = { snow: snow(), ice: ice(), rock: rock(), checker: buildCheckTexture() };
src/game/world/terrainMaterial.ts:39  material.userData.checker = tiles.checker;
src/game/world/terrainMaterial.ts:65  const seam: GroundDevSeam | null = import.meta.env.DEV && typeof window !== 'undefined' ? ...
```

`grep -rn "__ground\|groundDevSeam"` over `src/ tools/ tests/` shows the writer (`terrainMaterial.ts`)
and two consumers inside `src` (`terrainMesh.ts:230`, `water.ts:189`) that only *populate* the seam.
Nothing in the tree ever reads `__ground`, `userData.checker`, `meshes` or `iceMaterials`:
`ART_PASS.md` says the harness scripts were scratch files under `/tmp` and are gone. So a 64×64
`DataTexture` is generated and uploaded, and a mutable global is published in dev builds, to serve a
workflow that no longer exists in the repo.

**Why it matters.** §1.6 ("if it is intentionally deferred, it is not in the tree") and the same theme
as F2: harness-only code makes production surface look exercised.

**Smallest fix.** Either commit the ten-line harness that uses it (`tools/ground-check.ts`) or delete
`buildCheckTexture`, `userData.checker` and `GroundDevSeam`. Keeping the *checker texture* is cheap;
keeping an unread global is not.

---

## F14 — MINOR — colour maths and palette values still live in more than one place

Two surviving duplications, both documented as debt in `STATE.md` (306) and both still true:

1. **A second TypeScript implementation of the grade.** `core/palette.ts:97–184`
   (`scaleSaturation`, `shiftHue`, `splitTone`, `rgbToHsl`, `hslToRgb`, `grade`) and
   `game/render/pixelConfig.ts:118–187` (`satScale`, `hueShiftSrgb`, `splitToneSrgb`, `rgbToHsl`,
   `hslToRgb`, `gradeSrgb`) are ~100 lines of parallel maths, plus a third copy in GLSL. The *numbers*
   are now single-sourced (`GRADE = GRADE_SETTINGS`, `pixelConfig.ts:67`) and `tests/render.test.ts`
   asserts the mirror against the frozen `core.palette.grade` over a sweep — so this is contained, not
   live. It is still two implementations of one formula; a fix in one that forgets the other is
   caught only where the sweep reaches.
2. **Palette hexes restated as literals.** `scene.ts:130` `'#8FA8CE'` is `FOG.color`
   (`pixelConfig.ts:79`); `scene.ts:139` `'#A8C2DE'` is `SKY.zenith` (`pixelConfig.ts:100`). The
   hemisphere values also disagree with the written spec: `ART_BIBLE.md:102` asks for sky `#B9CFE6`,
   ground `#7796B6`, intensity 0.55; the code ships `#A8C2DE` / `#6A7FB0` / 0.62. One of the two is
   wrong, and the file that would tell you which is not the file that changes.

**Smallest fix.** (1) is not worth rewriting now that the constants are unified and the equivalence
test sweeps — but `pixelConfig` should import `hueShiftSrgb`'s core equivalent rather than restate it
if the sweep is ever weakened. (2) is a two-line import: `new THREE.DirectionalLight(FOG.color, 1.2)`,
`new THREE.HemisphereLight(SKY.zenith, ...)`, and reconcile the ART_BIBLE numbers in the same commit.

---

## F15 — MINOR — the save round-trip cannot see the fields this round added

`tests/progress.test.ts:275` builds a "fully populated state" and asserts `load(save(s))` equals it.
The fixture sets `talked`, `visited`, `fish`, `photos`, `lanterns`, `sledBests`, `quests`,
`achievements` — and **never** sets `talkedAt` or `questTalkBase`, so both round-trip as `{}`.

```ts
s.talked['hollis'] = true; s.visited['pinewind'] = true; ...
// no s.talkedAt[...] anywhere in the save/load block
```

`save.ts:125–126` does read them and `:146–147` does require them, so the wiring is right — verified.
But a future `load` that dropped them (or defaulted them to `{}`) would keep this test green, and the
consequence is the D4 bug coming back: every quest's report step satisfying itself.

**Smallest fix.** Two lines in the fixture:
`s.talkedAt['hollis'] = 3; s.questTalkBase['mitten:hollis'] = 2;`. The `toEqual` then covers them.

---

## F16 — MINOR — material leak per lantern, and a dispose path that poisons module caches

```ts
src/game/world/assemble.ts:236:  setLanternLit(id) { … o.material = glow(PALETTE.LANTERN); }
src/game/world/assemble.ts:256:  dispose() { group.traverse(o => { o.geometry.dispose(); … o.material.dispose(); }) }
```

Two things:

- `setLanternLit` allocates a **new** `MeshBasicMaterial` every call and drops the old one without
  disposing it. Bounded (12 lanterns, and the boot loop at `session.ts:151` re-lights saved ones), so it
  is a leak of a dozen objects, not a runaway. It is also the reason `dispose()` must walk materials at
  all.
- `dispose()` frees every material it finds — including `terrainMaterials()`, which are **module-level
  cached** (`terrainMaterial.ts:23`) and shared by every world. Dispose a world, build another, and the
  new terrain reuses disposed materials. `Session.destroy()` is the only caller and it has **no caller
  in `src/`, `tests/` or `tools/`** — so the teardown path is unexercised and this latent bug has never
  run.

**Why it matters.** "No exported function that nothing calls": `destroy()` is the largest such surface
in the game, and it is the one guarding a use-after-free.

**Smallest fix.** Build the lantern material once per pickup at construction and toggle
`material.color` / a second preallocated emissive material instead of allocating; and have
`terrainMaterial` expose `disposeTerrainMaterials()` that `world.dispose()` calls *and* clears the
cache. Then either delete `destroy()` or add one test that creates, destroys and recreates a session
headlessly — which is also the only way to know the teardown works at all.

---

## F17 — MINOR — the proximity scan runs twice per frame

```
src/session.ts:210:  const target = interactions.update(player.pos);     // inside interact()
src/session.ts:355:  const nearest = blocked ? null : interactions.update(player.pos);   // for the prompt
```

`interact()` re-queries the interaction system, then `update()` queries it again later in the same
frame for the HUD prompt. Two O(n) scans of every interactable per frame, and — more importantly — the
prompt the player sees is computed from a *second* sample that can disagree with the target the press
actually used if anything moved between them (the step, the edge clamp, or an activity starting).

**Smallest fix.** Cache the nearest in a module-scope `let nearestCache` written once, after the
player step, before both the interact routing and the prompt. Removes the duplicate scan and one class
of "I pressed E on the sign and talked to the tree" report.

---

# Debt recorded in STATE.md — re-verified

Instructions were to confirm these are still true rather than re-report them.

| STATE.md claim | Status now |
|---|---|
| `session.ts` 310 lines | **Worse.** 428. |
| `imagemetrics.ts` 300 (this one is `README.md:75`, not STATE) | **Worse.** 324. |
| `pixelConfig.ts` ~267 | **Fixed.** 192 — split, and `GRADE` is now imported from core rather than restated. |
| `scatter.ts` 276 | Unchanged. |
| `tests/activities.test.ts` 685 / `tests/props.test.ts` 270 | 688 / 270. Unchanged. |
| `~13 unreferenced exports` | 10 are truly dead, 2 (`STRIKE_TENSION`, `targetPosition`) are only over-exported. 9 new ones from this round (F8). |
| Colour maths in four places | True: `core/palette.ts`, `pixelConfig.ts`, GLSL, `imagemetrics.ts` (the last is the intentional instrumentation copy). |
| `assemble.ts` composes + models NPCs/pickups | True, unchanged (F6). |
| Scattered magic numbers (`gust`, `GROUND_OFFSET`, `GRID`) | True. `session.ts` alone carries `9`/`3` (gust cycle), `2.4`/`0.6` (snow), `16` (summit radius), `2.4` (footstep beat), `1.2` (spring tolerance), `180/22` (chirp pitch). |
| `scene.ts` comment says shadows off while the pipeline enables them | True (`scene.ts:6` vs `pixelPipeline.ts:179`). Now also false about the 3-band ramp (F2). |
| `step.ts` glide-hold in a module-level `WeakMap` | True — hidden mutable state in a module documented as pure. Not re-reported as new. |
| Species behaviour in render code | True (`assemble.ts` `SPECIES_SCALE` / `HAS_EARS` / `HAS_TAIL`), and it is now also why F6 is hard to split. |
| Lantern prompt appears before the ability and then silently refuses | True. `interact.ts:85` registers every lantern; `session.ts:236` requires `state.abilities.lantern` and does nothing otherwise. The prompt is the only feedback. |
| Fourth toast dropped while three are live | True. `toasts.ts:18` `MAX_TOASTS = 3`, `:52` returns `null` on the fourth. |
| Quest items paid but shown nowhere | Out of scope here (UI/content), untouched by this review. |

---

# Verified clean (so the next session does not re-do these)

- **`npx tsc --noEmit`** — exit 0. **`npx vitest run`** — 199/199.
- **Layer purity, `src/core/**`** — zero imports of `three`, zero of `src/game/**` or `src/data/**`.
  The full import graph is `contracts`, `math/noise`, `terrain/heightfield`, `player/*`,
  `progress/*`, `palette`, `imagemetrics`, `artgate`. Layer rule holds.
- **Purity inside core** — no `document`, `window`, `localStorage`, `Date.now`, `performance.now`,
  `requestAnimationFrame`, `Math.random`. The only `Math.random` hits in the tree are four *comments*
  asserting its absence. Core runs under node as claimed.
- **Determinism** — `Math.random` appears nowhere in `src/` at all, including world generation. One
  `WORLD_SEED` (`data/zones.ts:19`), and every consumer uses it: `session.ts:95`, `assemble.ts:192`
  (scatter group), `assemble.ts:225` (occluders), plus all four test files via import. The hardcoded
  `20260120` from `STATE.md` is gone — verified by grep, not by trusting the note.
- **`GROUND_TILE_WORLD = 48`** — defined once (`groundTexture.ts:35`) and imported by both consumers
  (`terrainMesh.ts:29,172–174`, `water.ts:20,69`). No second literal `48` in any UV path; the other
  `48`s in the tree are a prop count, `SEGMENTS`, a sphere width and a bell coordinate. The art pass's
  scale really is single-sourced.
- **The grade** — one `GRADE_SETTINGS` in `core/palette.ts:185`, imported by `pixelConfig.ts:67` and
  fed to the shader from there; the renderer does not restate the numbers. The historic duplication is
  genuinely fixed.
- **`progress()` / `markers()`** — implemented substantively by `build`, `fishing`, `photo`, `targets`
  (throw) and `race`: real labels, real fractions, real world positions. `skate` and `sled` implement
  neither, which is defensible: both are scored by elapsed time and the HUD clock *is* the score
  (`activityHud.ts:89` renders it when the readout is absent). No implementer returns a dummy.
- **`talkedAt` / `questTalkBase` semantics** — one writer (`progress.ts:76`), one baseline point
  (`quests.ts:117`, after the greeting is applied), one consumer (`conditions.ts:27`) with a correct
  fallback to the `talked` boolean for non-giver NPCs. Two unit tests cover the greeting-is-not-the-
  report rule and the "talk to somebody else" case. This fix is sound.
- **`save.ts`** — both new fields are required (`:146–147`) and rebuilt into the returned object
  (`:172–173`); unknown keys are dropped; no path throws (`:102, :185` both `catch → null`). The
  validation is honest. Only the test coverage (F15) and the key name (F9) are wrong.
- **No `TODO` / `FIXME` / `HACK` / `XXX` / `debugger` / `@ts-ignore` / `@ts-expect-error` / `any`**
  anywhere in `src/`, `tests/`, `tools/`. No commented-out code (the two hits from a heuristic grep are
  prose).
- **No stub returning a placeholder** in any exported surface.
- **Files at the limit** — `pixelPipeline.ts` and `fishing.ts` are exactly 260; not violations.
- **`contracts.ts` is 653 lines and frozen.** Exempt as documented; nothing in this review touches its
  contents.

## The one-line summary

The maths is tested and the layers are clean; the wiring is where the defects are. Two of the seven
findings that matter are the same shape as the bugs this project has already paid for once: a feature
that exists but is applied to nothing (the light ramp), and a constant that exists in two versions
with different numbers (the pixel sizes). Both are invisible to a green test suite, and both are
cheap to fix now.
