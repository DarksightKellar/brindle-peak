# Brindle Peak — playability QA report

- **Build under test:** the production bundle served at `http://127.0.0.1:4180/` — `dist/assets/index-Dchvwoiw.js`, built 2026-10-20 08:15:30.
- **Source read for causes:** working tree at `d321d36` (clean). Note: HEAD moved to `e61ab0f` (camera occlusion, 08:27) *after* that build and `dist/` was **not** rebuilt, so the served build predates the camera-occlusion commit by two commits. Everything below was measured against the served bundle; `file:line` references are to the current tree.
- **Harness:** headless Chromium (SwiftShader, no GPU), viewport 960×540 (plus one 1920×1080 pass), driven through `window.__game` (`step`/`drive`/`teleport`/`analyse`) and through real keyboard/mouse events for every UI and input claim. 12–14 fps in software GL; physics was measured with fixed `dt`, so frame rate does not affect the numbers.
- **Scope rule:** a check passes only if a number or a DOM observation in a real browser run backs it. Unit tests were ignored.

**Totals: 60 checks — 46 PASS, 11 FAIL, 3 UNVERIFIED.** One BLOCKER, four MAJOR, three MINOR defects.

---

## 1. Check table

### Boot and rendering

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | No uncaught console/page errors | **PASS** | `errors=[]` in all 13 browser sessions (boot, physics ×2, playthrough, UI, activities ×4, persistence, diagnostics, 1080p, confirmation) |
| 2 | Frames advancing | **PASS** | `frames() 31 → 52` in 1.5 s (≈14 fps, software GL); 400+ frames over a full session |
| 3 | Canvas is an integer upscale of 384×216 at 960×540 | **PASS** | backing `768×432` for a `960×540` CSS box (2×), `image-rendering: pixelated`, DPR 1 |
| 4 | 384×216 internal target, 5 px blocks at 1080p | **PASS** | at 1920×1080: backing `1920×1080`, `analyse().blockPeriod = 5` device px |
| 5 | A scene actually renders (not black / not frozen) | **PASS** | screenshot: snowfield, cabin, trees, player, sky, shadows; `p50 = 0.616` |

### Movement

| # | Check | Result | Evidence |
|---|---|---|---|
| 6 | W moves away from the camera | **PASS** | displacement·expected = **0.9999**, `d=(3.16,−3.22)` at yaw 2.38 |
| 7 | S moves toward the camera | **PASS** | alignment **0.9999**, `d=(−2.71, 2.74)` |
| 8 | D strafes right of camera | **PASS** | alignment **0.9940**, `d=(2.80, −0.57)` at yaw 0.09 |
| 9 | A strafes left of camera | **PASS** | alignment **0.9750**, `d=(−1.76, 2.80)` at yaw 1.23 |
| 10 | Walk speed ≈ 6.5 u/s | **PASS** | **6.500 u/s** in all four directions (3rd second of a straight run, fixed dt) |
| 11 | Diagonal not faster than cardinal | **PASS** | diagonal 3.799 u/s vs W 4.509 u/s on ice; input vector is normalised |
| 12 | Shift makes the player faster | **FAIL** | walk **6.41 u/s** vs Shift+W **6.41 u/s** — no difference |
| 13 | The sprint ability can be obtained at all | **FAIL** | `state.abilities.sprint=false` at boot and never granted; forcing it true gives **9.44 u/s**, so only the gate blocks it |

### Jump, flap, glide, stamina

| # | Check | Result | Evidence |
|---|---|---|---|
| 14 | Space jumps | **PASS** | `vy = 8.633` on the press frame, `grounded=false`; apex **1.767 u** (nominal 1.84) |
| 15 | A mid-air press flaps and costs exactly 1.0 stamina | **PASS** | stamina **4.000 → 3.000** (cost 1.000), `vy 4.967 → 7.200`, `flapsUsed=1` |
| 16 | A second flap costs 1.0 and is allowed | **PASS** | cost **1.000**, stamina 2.000, `flapsUsed=2` |
| 17 | A third flap is refused (maxFlaps 2) | **PASS** | cost **0.000**, `flapsUsed=2`, `vy 8.700 → 8.333` (gravity only) |
| 18 | Holding Space while falling glides | **PASS** | 0.5 s descent: free fall **7.600 u** (`vy −24.07`, mode `air`) vs holding Space **1.500 u** (`vy −3.00`, mode `glide`) — 5× slower |
| 19 | Stamina clamps at 0, never negative | **PASS** | spending the last 1.0 with regen held off lands on exactly **0**; next frames 0.000; never negative |
| 20 | Stamina regenerates when grounded | **PASS** | **2.00 → 4.00** over 1.4 s (0.35 s delay, then 2.4/s idle), observed in a 0.1 s trace |

### Camera

| # | Check | Result | Evidence |
|---|---|---|---|
| 21 | Pointer drag changes yaw | **PASS** | yaw **2.377 → 3.556 rad** for a 120 px drag |
| 22 | Wheel changes the view (zoom) | **PASS** | screenshot bytes differ (112 556 vs 113 048) after one wheel notch |
| 23 | Pitch does not invert | **UNVERIFIED** | there is no pitch input at all: drag only adds yaw, wheel only changes distance, pitch is the constant 13°. Nothing can invert, but there is also no vertical look to test |
| 24 | Camera never goes below the terrain | **UNVERIFIED** | `rig.occluded() = false` at ridge, chimney face and peak, and the frames keep a sane range (`p1 0.25–0.42`, `p50 0.72–0.77`), but the camera transform is not exposed on `__game`, so the Y clamp (`rig.ts:114`) could not be measured directly |

### NPCs, dialogue, quests

| # | Check | Result | Evidence |
|---|---|---|---|
| 25 | Interact prompt appears in range | **PASS** | prompt pill hidden→visible, verb `"Talk"` |
| 26 | E opens dialogue (Nana Quill, Hearth Hollow) | **PASS** | `dialogueOpen=true`, speaker `"Nana Quill"`, `isBlocking()=true` |
| 27 | Dialogue text advances on its own (typewriter) | **PASS** | 0 → 9 characters in 0.7 s, no input |
| 28 | E advances the dialogue | **PASS** | line 1 completed ("You made it. Last truck through."), next E starts the following line |
| 29 | Esc closes the dialogue | **PASS** | `dialogueOpen=false`, `isBlocking()=false` |
| 30 | A second NPC in a different zone opens dialogue | **PASS** | Wren, Pinewind Wood (`zone=pinewind`, speaker `"Wren"`) |
| 31 | Further NPCs work (Bram, Hollis) | **PASS** | Bram (`"Bram"`), Hollis dialogue opened by E at (−308,296) |
| 32 | Opening a dialogue accepts the giver's quest | **PASS** | `the-line` → `{status:"active", step:0}` on the first E at Nana |
| 33 | A quest is only completed by doing its objective | **FAIL** | accepted at Nana, then talking to Bram alone → `{status:"complete", step:2}`; the "tell Nana" leg was skipped and the reward paid out |
| 34 | Quest rewards are paid (bells + ability) | **PASS** | bells **0 → 8** (before any bell was picked up) and `abilities.lantern = true` |
| 35 | A quest that awards a feather raises the stamina cap | **UNVERIFIED** | no quest reward sets `feathers` — rewards in `data/quests.ts` are bells/items/abilities only (`lantern` line 32, `sled` line 76). The pickup path is verified (#38) |
| 36 | Journal reflects accepted and completed quests | **PASS** | Quests tab: `"The Line's Down active Ask Bram about the spare batteries."` → later `"The Line's Down complete Done."` |

### Pickups

| # | Check | Result | Evidence |
|---|---|---|---|
| 37 | Walking onto a bell increments the counter | **PASS** | bells **0 → 1** standing on `bell-hearth-c1` (−300,262); **8 → 9** in the other session |
| 38 | A feather raises the stamina cap | **PASS** | feathers **0 → 1**, `maxStamina` **4 → 5**, HUD pips **4 → 5** |
| 39 | Pickups are suppressed while a dialogue is open | **PASS** | dialogue open, standing on `bell-hearth-c2`: bells **1 → 1**, feathers **1 → 1** |
| 40 | Pickups resume after the dialogue closes | **PASS** | bells **1 → 2** on the first frame after Esc |

### Activities (minigames)

| # | Check | Result | Evidence |
|---|---|---|---|
| 41 | An activity starts and takes over input | **PASS** | E at the Woodpile: `isBlocking()=true`, prompt `"Stack"`; W held 0.8 s moves **0.000 u** |
| 42 | A second activity starts in another zone | **PASS** | Creek Pool fishing, Pinewind: `isBlocking()=true`, prompt `"Fish"` |
| 43 | An activity shows instructions / score / progress | **FAIL** | visible `#ui` elements **16 → 12** (only the prompt pill disappears); on-screen text `["E","Stack"]` → `[]`; zero DOM elements match any activity class; no 3D representation either |
| 44 | Activity logic can be completed (fishing) | **PASS** | correctly timed press at 0.817 s (bite 0.80 s) → `fish={char:1}`, `counters={fish:1, activity:pinewind-creek-fish:1}`, toasts "New fish in the journal", "First Cast" |
| 45 | Activity can be completed by a player (build type) | **FAIL** | 7 E presses → `counters={}`; the three parts sit **4.20 / 2.01 / 2.82 u** from the natural start and **4.87 / 4.81 u** from each other, press reach is **1.8 u**, and movement is frozen (0.000 u). Teleporting onto each part completes it (`activity:hearth-kindling=1`, toast "Done — 3"), so only the flow is broken |
| 46 | Esc exits an activity without killing input | **PASS** | `isBlocking()=false`, then W moves the player 1.62 u / 2.21 u / 3.07 u |

### Journal / menu state machine

| # | Check | Result | Evidence |
|---|---|---|---|
| 47 | Tab and J open and close the journal | **PASS** | Tab opens (`journalOpen=true`), Tab closes; J opens |
| 48 | Esc opens the pause menu | **PASS** | `menuOpen false → true` |
| 49 | Esc closes the pause menu | **FAIL** | 2nd Esc: `menuOpen=true`; only clicking **Resume** closes it |
| 50 | Esc closes the journal | **FAIL** | J then Esc: `journalOpen=true`; only Tab/J closes it, although the footer says "Esc — close" |
| 51 | Overlays never stack | **FAIL** | Esc (menu) then Tab → `menuOpen=true` **and** `journalOpen=true` |
| 52 | The player can always get out | **PASS** | every stuck-open state was recoverable with mouse Resume or Tab — no permanent lock |

### World, persistence, HUD

| # | Check | Result | Evidence |
|---|---|---|---|
| 53 | No fail state: 250 u drop | **PASS** | max fall speed 136.8 u/s, lands and stays grounded, XZ drift 0.000 u, stamina 4/4 unchanged, frames keep advancing |
| 54 | Terrain: lands on the surface, rests, walks in every zone | **PASS** | 8 spots (hearth, pinewind, reach, kettles, hamlet, ridge, summit, spawn): rest drift over 1 s = **0.0000**, `grounded=true`, walked 6.02 u in 1 s (2.8 u on ice, by design) |
| 55 | The player cannot walk off the world | **FAIL** | walked east from x=490 for 8 s → **x = 541.5** (world half-extent 512); earlier to **x = 589.0**. Beyond the edge the terrain is clamped flat, so the player stands on an endless featureless blue plane (screenshot `world_edge.png`) |
| 56 | Walking lays footprints; standing still does not | **PASS** | 7.10 u walked → **10 new prints** (0.62 u spacing) |
| 57 | Footprints fade | **PASS** | 96 live prints → **0** after 93 s of game time |
| 58 | Progress persists across a page reload | **FAIL** | feather picked 0.5 s before `reload()` was **lost** (feathers 1 → 0); a bell survived only because a zone-change save happened in between. There is a save (`localStorage["first-snow.save.v1"]`) written every 30 s and on zone change, and none on exit |
| 59 | The zone the player is standing in is marked visited | **FAIL** | at spawn `state.visited = {}` and the journal reads `"— Hearth Hollow unvisited"` / `"— Pinewind Wood unvisited"` while `state.zone = "hearth"` |
| 60 | Any save exists at all | **PASS** | `first-snow.save.v1` present with `{version:1, player:{pos,facing,stamina}, …}`; position restored after reload: (−152.9, 16.0, 116.7) |

---

## 2. Defects

### D1 — BLOCKER: activities are invisible, and the build-type ones cannot be finished

Every one of the 22 minigames is a black box. Starting one removes the interact prompt, freezes the player, and puts **nothing** on screen — no instructions, no score, no timer, no target, no progress. Three of them (all `build` kind: Woodpile, Snowman, Stone Dam) can never be completed, because their parts are further apart than the press reach while movement is frozen.

**Reproduction**
1. Spawn at (−360, 360). Walk east to the Woodpile at (−338, 312) (or `__game.teleport(-338, 309.3)`).
2. Stand in the prompt radius. The HUD shows `E Stack`.
3. Press **E**. `isBlocking()` becomes `true`, the prompt disappears, nothing else appears.
4. Hold **W** for 0.8 s → the player moves **0.000 u**.
5. Press **E** seven more times → `state.counters` stays `{}`.
6. Press **Esc** to get out.

**Observed vs expected**

| | Observed | Expected |
|---|---|---|
| Visible `#ui` elements while running | 16 → 12 (**fewer**; only the prompt is removed) | a new panel/overlay (instructions, score, progress) |
| Visible text | `["E","Stack"]` → `[]` | at least a title + progress |
| DOM nodes with an activity class | **0** | ≥ 1 |
| Player movement during the activity | 0.000 u (W held 0.8 s) | either free movement toward the parts, or a reason on screen |
| Progress after 7 E presses | `counters={}` | `activity:hearth-kindling ≥ 1` |
| Distance to the parts | 4.20 / 2.01 / 2.82 u from the natural start; parts **4.87 / 4.81 u** apart | within press reach 1.8 u |
| Proof the logic itself works | teleporting onto parts 2 and 3 → `counters={activity:hearth-kindling:1}`, toast "Done — 3" | — |

**Likely cause**
- No activity presentation layer exists at all. `session.ts:177` creates the instance and `session.ts:230` updates it, but nothing renders it; `presentation.ts:30-62` builds only HUD, toasts, dialogue, journal and menu. No CSS class for an activity exists in `src/styles/ui.css`, and nothing outside `src/game/activities/**` reads `subjectOf`, `targetPosition`, `tension` or `strikeAt` (grep: 0 references), so the photo subjects, throw targets, build parts and the fishing float are never drawn.
- Movement is frozen by `session.ts:203` (`blocked … || active !== null`) feeding `emptyInput` at `session.ts:214`.
- The build flow is impossible by construction: `build.ts:11-16` puts the three parts on a **2.7 u ring** with a **1.8 u** press reach, so adjacent parts are ~4.8 u apart, and the player cannot move (`build.ts:43`, `withinReach`).

**Impact:** the three `build` activities (Woodpile, Snowman, Stone Dam) can never be completed, which hard-blocks the quests `bram-count`, `orla-flour` and `ivy-springs` and the `snow-sculptor` achievement. The other 19 activities are blind — no instructions, no score, no target — so the player can only brute-force them (fishing *is* completable blind: I caught a char by pressing E at the computed bite time, with nothing on screen to tell me when). 15 of the 22 quests contain an `activity` step, and the 8 `activity:*` achievements can only be stumbled into.

---

### D2 — MAJOR: Escape cannot close the pause menu or the journal, and overlays stack

**Reproduction**
1. With nothing open, press **Esc** → the pause menu opens.
2. Press **Esc** again → the menu stays open. Only a mouse click on **Resume** dismisses it.
3. Close it, press **Tab** (journal) then **Esc** → the journal stays open (only Tab/J closes it).
4. Press **Esc** (menu opens) then **Tab** → both overlays are open at once.

**Observed vs expected**

| | Observed | Expected |
|---|---|---|
| `menuOpen` after 1st / 2nd Esc | `true` / **`true`** | `true` / `false` |
| `journalOpen` after Esc | **`true`** | `false` |
| Menu + journal simultaneously | **`true`, `true`** | never |

**Likely cause:** `main.ts:60` — `if (session.isBlocking()) return;` and `session.ts:306` count the menu and the journal as "blocking", so Escape returns before `toggleMenu()` can run. The UI copy promises the opposite: `journal.ts:142` "Esc — close", `journal.ts:221` "Esc closes the journal and opens the pause menu", `menu.ts:39` "Esc pause · journal".

**Impact:** a keyboard-only player who presses Esc is frozen inside the pause menu until they use the mouse. The one key the game documents for this is dead.

---

### D3 — MAJOR: Shift-sprint is dead — the ability is never granted

**Reproduction:** hold **Shift+W** for 2 s, then **W** for 2 s, from the spawn point.

**Observed vs expected:** 6.41 u/s with Shift vs 6.41 u/s without. `state.abilities.sprint = false` at boot and after completing two quests. Forcing `abilities.sprint = true` yields **9.44 u/s**, so the input and the tuning are fine — the unlock does not exist.

**Likely cause:** `step.ts:169` gates sprint on `env.abilities.sprint`; `contracts.ts:560` initialises it `false`; no `QuestReward` in `data/quests.ts` (or anywhere in `src/data`) ever sets `ability: 'sprint'` — only `lantern` and `sled`. The pause menu advertises the verb (`menu.ts:39`).

---

### D4 — MAJOR: every quest's "report back to the giver" step is satisfied before you leave the giver

**Reproduction**
1. Walk to Nana (−352, 348), press **E** → "The Line's Down" accepted (`active`, step 0).
2. Press **Esc**, walk to Bram (−340, 306), press **E**.
3. Observe: the quest is already `complete`, step 2 — and the +8 bell reward has been paid — without ever returning to Nana.

**Observed vs expected:** after talking to Bram only: `{status:"complete", step:2}`, bells 0 → 8, `abilities.lantern=true`. Expected: `{status:"active", step:1}` with step 1 ("Tell Nana what Bram said") still open.

**Likely cause:** the talk event is emitted at `session.ts:170` **before** the quest is accepted at `session.ts:173`, but events are only applied at `session.ts:273` — by then the quest is active, so the giver's own `npc:talked` is recorded and `quests.advance` (`quests.ts:114-118`) satisfies the final "talked giver" step immediately. All 22 quests in `data/quests.ts` end with a talk to their giver, so all 22 lose their last leg and pay out early.

---

### D5 — MAJOR: there is no world boundary; the player can walk out of the map

**Reproduction:** stand near the east edge (`__game.teleport(490, 0)`), hold the direction that heads +x for 8 s.

**Observed vs expected:** x = **541.5** (later run: **589.0**) against a world half-extent of **512**. The terrain sampler clamps outside the grid (`heightfield.ts:111-112`), so the player does not fall — they walk onto an endless flat blue plane with no props, no landmarks and no wayfinding (`/tmp/qa/world_edge.png`). Expected: a soft wall or a return, or at least the mesh continuing.

**Likely cause:** no bounds test anywhere in `core/player/step.ts`; the only clamp is the "never below snow" correction at `step.ts:249`.

---

### D6 — MINOR: progress picked up since the last autosave is lost on reload/quit

**Reproduction:** pick up a feather at (−290, 246), then reload the page within a second.

**Observed vs expected:** before reload `feathers=1`, after reload `feathers=0` (the feather is back in the world). In the same run a bell survived only because a zone-change save happened between the two pickups. Expected: a save on unload, or pickups persisted immediately.

**Likely cause:** `persist()` runs only on a zone change (`session.ts:242`) and every 30 s (`session.ts:284`). There is no `beforeunload`/`pagehide`/`visibilitychange` listener anywhere in `src/`, and `session.destroy()` (`session.ts:308`, which does persist) is never called by `main.ts`.

---

### D7 — MINOR: the starting zone is never marked visited

**Observed:** at spawn `state.visited = {}` and the journal's Field Notes tab reads `"— Hearth Hollow unvisited"`, `"— Pinewind Wood unvisited"`, even though `state.zone = "hearth"`. Walking to Pinewind and back marks both.

**Likely cause:** `session.ts:238` only emits `zone:entered` when the sampled zone *changes*; the state starts in `hearth` (`contracts.ts:575`) so the first zone is never recorded. The journal is the only surface that reads those flags, so the visible effect is a wrong Field Notes row at spawn.

---

### D8 — MINOR: the `lantern` ability is a reward with no effect

"The Line's Down" sets `abilities.lantern = true` (verified), but nothing in `src` reads `abilities.lantern` — only `abilities.sled` (`step.ts:141`) and `abilities.sprint` (`step.ts:169`) are consumed — and lantern posts light for free at `session.ts:181-184` with no gate. Combined with D3, two of the three abilities are non-functional (one unobtainable, one unused). This is a defect in the reward design rather than a failing check of its own — check #34 passes because the flag is genuinely set.

---

## 3. Could not verify, and why

| Item | Why |
|---|---|
| Camera never below the terrain (directly) | the `THREE.Camera` is not reachable from `window.__game`; only `rig.occluded()` and the rendered frame are exposed. `occluded()` was `false` at the ridge, the chimney face and the summit, and those frames kept a normal luma range, but the `Math.max(py + dy*reach, height + CLEARANCE)` clamp in `rig.ts:114` was not measured numerically |
| "Pitch does not invert" | there is no pitch input: dragging only adds yaw (`input.ts:82`), the wheel only changes distance, and pitch is a constant 13° (`rig.ts:36`). Inversion is impossible but untestable |
| Zoom magnitude | wheel input changes the frame (screenshot diff) but the camera distance is internal to `rig.ts`, so I could not assert "one notch = N units" |
| A quest that awards a feather raising the cap | no such quest exists (`data/quests.ts` rewards: bells, items, `lantern`, `sled`, one achievement). The feather-pickup path was verified instead (cap 4 → 5) |
| Audio | headless browser with no output device, and `audio.unlock()` needs a user gesture; nothing audible can be asserted |
| Full content enumeration (18 NPCs / 22 quests / 14 feathers / 60 bells / 12 lanterns / 20 achievements / 6 fish) | sampled: 4 NPCs in 2 zones, 2 bells, 1 feather, 1 quest end-to-end, 2 activities. Exhaustive content sweeps were out of scope for "the first five minutes" |
| Persistence across a real tab close | only `reload()` was tested; there is no unload hook to test, which is itself D6 |

---

## 4. Other observations (not counted as failures)

- **Art gate at 1080p:** `analyse().failures = ["no pixels below L 0.10", "min luminance >= 0.10", "luminance p1 in reference band", "saturation p50 >= 0.38", "detail density >= 0.005"]` with `p50 = 0.616`. This is the art-acceptance gate, not gameplay; recorded because it fires on the shipping build at the reference resolution. (At 960×540 the gate additionally reports "block period is 5" because the block is 2 device px there — expected, viewport-dependent.)
- **HUD legibility:** the stamina arc is four 5×5 px pips in a 72×42 box at 960×540 (`ui.css:43-49`). It is present and correct (4 → 5 pips on a feather) but reads as four stray orange dots at this size.
- **Footprints over-stamp slightly:** after the player stops, ~2 more prints appear (the tracker's anchor lags the last stamp). Harmless.
- **Menu pixel-size buttons offer 3/4/5/6×** (`menu.ts:10`) while `pixelConfig.ts:16` declares `[3, 5, 8]`. Dead constant, no player impact.
- **Ice is very slippery to start from rest** (`frictionIce 0.15` → ~1.2 s to top speed): the first second of movement on the Frozen Reach averages 2.8 u/s instead of 6.5. Intentional per `tuning.ts`, but worth a design confirmation.
- **Stale build:** `dist/` (08:15:30) predates HEAD `e61ab0f` (08:27, camera occlusion vs trees). The QA numbers describe the shipped bundle, not the newest source. A rebuild is needed before re-testing.

---

## 5. Method note

All measurements came from `__game` hooks inside a synchronous `page.evaluate` (so real-time frames cannot pollute a fixed-`dt` run), except the UI/input checks, which used real `page.keyboard`/`page.mouse` events. Scripts live in `/tmp/qa/` (`qa_boot`, `qa_physics`, `qa_physics2`, `qa_play`, `qa_ui`, `qa_act`, `qa_act2`, `qa_act3`, `qa_act4`, `qa_save`, `qa_tiny`, `qa_dpi`, `qa_confirm`) with raw JSON output alongside them. No file under `src/`, `tools/` or `tests/` was modified.
