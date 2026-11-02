# First Snow — content & progression audit

- **Build under test:** the production bundle at `http://127.0.0.1:4180/` — `dist/assets/index-C_1SJjSy.js`, `dist/index.html` written 08:52:01. HEAD is `67d746f` ("Give the activities their objects back"); `src/game/world/props.ts`, `terrainMesh.ts` and `water.ts` are modified in the working tree and are **not** in this bundle, so every number below describes the served build, not the newest source.
- **Harness:** headless Chromium (SwiftShader, no GPU), 960×540, driven through `window.__game` (`step(n, dt)` at a fixed 1/60, `drive()`, `teleport()`, `session.interact()`), plus real keyboard/mouse for the input claims. Software rendering runs at 12–14 fps, so all timing was taken from fixed-`dt` stepping; frame rate does not affect any number here. Rendering cost was cut with the game's own `setPixelSize(8)` setting where a run needed thousands of frames (a display setting, not a gameplay one).
- **Scope rule:** a check passes only if a number, a DOM observation or a state readout from a real browser run backs it. Reading source is used only to explain a cause, never to assert a result.
- **Read-only:** no file under `src/`, `tools/` or `tests/` was modified. Harness scripts live in `/tmp/audit-*.mjs`; raw JSON logs in `/tmp/acts.log`, `/tmp/quests.log`, `/tmp/collect*.log`.

**Totals: 174 content items audited — 168 work, 6 are dead (4 quests that can never be offered, 2 achievements that can never fire). One BLOCKER (there is no ending), four MAJOR, eight MINOR.**

| Category | Items | Verified working | Dead |
|---|---|---|---|
| Quests | 22 | **18 offered and completed end-to-end** | **4 never offered** |
| Achievements | 20 | **18 triggered in a browser** | **2 have no event source** |
| Activities | 22 | **22 started and completed** | 0 |
| Feathers | 14 | **14 collected, cap 4 → 18** | 0 |
| Bells | 60 | **60 collected** | 0 |
| Lanterns | 12 | **12 lit (after the ability)** | 0 |
| NPCs | 18 | **18 open dialogue** | 0 |
| Fish species | 6 | **6 catchable** | 0 |

---

## 1. Is the game finishable? What happens at the summit

**Yes, the summit is reachable on foot, and no, the game does not end there.**

Measured while walking (the input frame is driven with `moveZ: 1, sprintHeld: true`, i.e. the same frame a held W+Shift produces, at a fixed 1/60 dt) from `(344, −338)`, 26.1 u from `PEAK (330, −360)`:

| t (s) | position | distance to peak | `flags.summit` |
|---|---|---|---|
| 1 | (339.49, 90.24, −345.68) | 17.17 | false |
| 2 | (334.80, 93.10, −353.95) | **7.72** | **true** |

State change on crossing 16 u: `state.flags.summit = true`, one event `summit:reached`, and exactly one new toast:

```
"The summit"   class="ui-toast ui-toast--finale"
```

That is the entire ending. Measured immediately afterwards:

- No overlay opens: `dialogue=false, menu=false, activity=null, bodyClasses=""`, `session.isBlocking() = false`.
- No text anywhere in `#ui` matching `/the end|credits|thanks for playing|complete|finished|ending/i` — **0 matches**.
- The player keeps walking: 19.1 u away in 3 s, frames still advancing (432 → 734).
- No quest completes (none active in that run); achievements = `["summit"]` only, and that one had already fired on entering the *peak zone* (see D10), not at the mast.
- The journal reads `Feats 1 / 20`, `Brindle Peak noted` — the same journal as any other zone.

**The epilogue that was written for this moment cannot be reached.** `nana-home` ("Kettle On" — giver Nana, `requires: visited peak`, reward 20 bells, `data/quests.ts:148-152`) is the closing beat: *"She will ask what you got up to. She will already know."* Talking to Nana after reaching the peak does not offer it (verified: `state.quests` gains nothing). She only ever says her `-done` line ("So. Batteries. Take the lantern…"). So the game has a summit and no ending, and the one quest authored to close the story is one of four that no NPC can hand out (D1).

**Verdict:** the world is traversable to the top and the summit flag fires, but "finishing" the game is a single 3.5-second toast followed by more walking. There is no credits sequence, no final conversation, no completion state.

---

## 2. Quests — 18 of 22 can be completed, 4 can never be accepted

Method: each quest was accepted by walking up to its giver and pressing E, then every step was performed in order in the browser (talks, zone visits, activities), then the giver was talked to again. Reward deltas were read from `GameState` immediately before and after the completing action.

| # | Quest | Zone | Steps | Accepted | Completed | Reward paid (measured) |
|---|---|---|---|---|---|---|
| 1 | The Line's Down | hearth | talk, talk | yes | **complete** | **+8 bells, `abilities.lantern=true`** |
| 2 | One Mitten | hearth | talk, visit, talk | yes | **complete** | **+12 bells, `items.mitten=1`** |
| 3 | Nine Hundred and Six | hearth | activity, talk, talk | yes | **complete** | +10 bells (aggregate, see below) |
| 4 | Wren's Sounds | pinewind | activity, visit, talk | yes | **complete** | **+12 bells, `items.sketchbook=1`** |
| 5 | Something for a Head | pinewind | activity, talk, talk | yes | **complete** | **+10 bells, `items.headband=1`** |
| 6 | The Ledger | pinewind | activity, talk, talk | yes | **complete** | +14 bells |
| 7 | A Bundle for Ivy | pinewind | visit, talk, talk | yes | **complete** | **+15 bells** |
| 8 | The Long Hill | reach | activity, talk, talk | yes | **complete** | **+12 bells, `abilities.sled=true`** |
| 9 | Six Hours, One Fish | reach | activity, talk, talk | yes | **complete** | +10 bells, `items.bait=1` |
| 10 | Four Loaves | hamlet | talk, activity, talk | yes | **complete** | +12 bells, `items.soup=2` |
| 11 | The Blue House | hamlet | visit, talk, talk | yes | **complete** | **+10 bells, `items.letter=1`** |
| 12 | The Bell Ring | hamlet | activity, talk, talk | yes | **complete** | **+18 bells** |
| 13 | Forty-One Degrees | kettles | activity, talk, talk | yes | **complete** | +14 bells, `items.charm=1` |
| 14 | Verbatim-ish | kettles | talk, talk, talk | yes | **complete** (already satisfied at acceptance) | +12 bells |
| 15 | As Far As the Pines | kettles | activity, visit, talk | yes | **complete** | **+9 bells** |
| 16 | The Good Rope | ridge | talk, visit, talk | yes | **complete** | **+16 bells, `items.key=1`** |
| 17 | Forty, Gusting | ridge | activity, activity, talk | yes | **complete** | **+15 bells** |
| 18 | The Only Radio | peak | visit, activity, talk | yes | **complete** | **+20 bells, achievement `summit`** |
| 19 | **Nettle Chimney** | ridge | activity, talk, talk | **NO** | — | — |
| 20 | **Kettle On** | hearth | talk, visit, talk | **NO** | — | — |
| 21 | **The Night Bake** | hamlet | activity, talk, talk | **NO** | — | — |
| 22 | **Four Blue Houses** | hamlet | talk, talk, talk | **NO** | — | — |

**Reward integrity:** after all 18 completions the run held **`bells: 229`**, which is exactly the sum of the 18 rewards that can be paid (8+12+10+12+10+14+15+12+10+12+10+18+14+12+9+16+15+20 = **229**) with no bell pickups in that run. All eight item rewards are in state (`mitten 1, sketchbook 1, headband 1, bait 1, soup 2, letter 1, charm 1, key 1`). Both ability rewards are live (`lantern`, `sled`). So **no reachable quest fails to pay**, and none pays twice.

**The four dead quests** (`chimney-line`, `nana-home`, `orla-night-bake`, `pell-address`) are each the *second* quest for an NPC who already gives one (`sable`, `nana`, `orla`, `pell`). `interact.ts:25-33` picks an entry node from `npc.quest`, and `mechanics.ts:89-97` only ever calls `quests.accept(npc.quest)` — one NPC, one quest. Talking to Sable with `sable-kite` complete leaves `state.quests` untouched; the same for the other three. Nothing else in `src` references these four ids (grep: only `data/quests.ts`), so there is no alternate hand-off.

**Step-level defect (no quest is impossible, but 14 of 18 need a repeated conversation).** See D3: 14/18 quests required at least one extra talk to the same NPC (21 of the 41 talk steps). With the retry they all complete; without it they sit at the same step forever, with no feedback.

---

## 3. Achievements — 18 of 20 fire, 2 are dead

Every achievement's trigger was checked against the set of event names the game actually emits. The complete emit list in `src` is: `feather:collected`, `bell:collected`, `npc:talked`, `quest:started`, `quest:completed`, `achievement:unlocked`, `activity:completed`, `fish:caught`, `photo:taken`, `lantern:lit`, `zone:entered`, `summit:reached`, `toast`. **`spring:soaked` is never emitted anywhere** (grep: it appears only in `core/contracts.ts:430`, `core/progress/progress.ts:109`, `core/progress/conditions.ts:12` and a dead branch in `game/session/router.ts:87`).

| Achievement | Trigger | Fired in browser? | Evidence |
|---|---|---|---|
| You Made It | talked nana | **yes** | after first conversation |
| Into the Pines | visited pinewind | **yes** | zone toast + unlock |
| Thin Ice | visited reach | **yes** | zone toast + unlock |
| Steam and Snow | visited kettles | **yes** | zone toast + unlock |
| Six Chimneys | visited hamlet | **yes** | zone toast + unlock |
| The Wall | visited ridge | **yes** | zone toast + unlock |
| The Mast | visited peak | **yes** (but at zone entry — D10) | fired at (344,−338), 26.1 u from PEAK |
| First Cast | count fish ≥ 1 | **yes** | after 1 catch |
| Six Species | count fish ≥ 6 | **yes** — but on 6 *catches*, not 6 species (D11) | fired with the Fish page reading 5/6 |
| Five Frames | count photo ≥ 5 | **yes** | after the 5th photo (there are exactly 5 photo activities) |
| Hot Water | count `spring` ≥ 1 | **NO — dead** | counter never exists |
| All Five Pools | count `spring` ≥ 5 | **NO — dead** | counter never exists |
| Lantern Chain | activity ridge-lantern-ascent | **yes** | "Done — 12" |
| Long Slide | activity kettles-otter-slide | **yes** | "Done — 10" |
| Clean Ice | activity reach-skate-race | **yes** | "Done — 3" |
| Snow Sculptor | activity hamlet-snowman | **yes** | after 3 parts |
| Kite String | activity ridge-kite | **yes** | "Done — 0" (zero hits — D9) |
| Chimney Top | activity ridge-chimney-race | **yes** | "Done — 12" |
| Night Colour | activity peak-aurora-photo | **yes** | "Done — 92" |
| Home Again | activity peak-thermal-flight | **yes** | "Done — 12" |

**18/20 verified by unlocking them in a real run** (16 in one 22-activity sweep, plus `nanas-porch` and `six-species` in dedicated runs).

**The two dead ones are not a wiring accident with a hidden path.** `step.ts:246` sets `state.soaking = grounded && surface === 'spring'`, and soaking really does change stamina regen (`step.ts:77`, `regenSoak`) — I found real spring surface at Kettle Springs and stood in it (`player.soaking === true`, stamina regenerating faster). But the counter the achievements read (`counters.spring`) is only written by `spring:soaked`, and nothing emits it, so `counters.spring` stays `undefined` forever. The whole "soak in five pools" idea exists as terrain, not as content.

---

## 4. Collectibles

**Feathers — 14/14, and every one raises the cap.** With the player standing on each position in turn (feathers are proximity pickups): `feathers 1..14`, `maxStamina 5..18` (base 4), exactly +1 per feather. Journal: `Feathers 14 / 14`.

**Bells — 60/60.** All 60 positions collected, `state.bells = 60`, **0 of 60 failed to register**. Bells are pickup tier: a chirp and the HUD counter, no toast (`router.ts:38-41`), which is a deliberate design decision and works as intended.

**Lanterns — 12/12, gated, and the gate works.** In a fresh run with no quests:

| Step | Observed |
|---|---|
| Stand at `lantern-hearth-1` with `abilities.lantern = false` | HUD prompt reads **"Press E to light"** |
| Press E | `lanterns` 0 → **0**, no toast, no change |
| Same at `lantern-hearth-2` | 0 → **0** |
| Complete "The Line's Down" (Nana → Bram → Bram again → Nana) | **+8 bells, `abilities.lantern = true`** |
| Light all twelve | **12 / 12**, one toast per post ("Lantern 9/12"), journal `Lanterns 12 / 12` |

The gate itself produces a prompt that does nothing (D8) — the player is invited to press E and gets silence. It does **not** soft-lock anything: no quest, achievement or activity reads `abilities.lantern` or the lantern count (`sable-kite` and `lantern-chain` use the *activity* `ridge-lantern-ascent`, not the posts), and `the-line` is offered by the NPC standing at spawn, so the ability cannot realistically be missed. Skipping it costs exactly the 12 lanterns, their toasts and 8 bells.

---

## 5. Activities — 22 of 22 can be completed

Method: for each activity, stand in its prompt radius, press E, read the HUD, then finish it with the inputs its own HUD names (E for build/fish/photo/throw, W+Shift for race, A/D for skate and sled), supplied through `drive()` at a fixed 1/60 dt. One session, all 22, no page errors.

| Activity | Kind | HUD on start (verbatim) | Completed | Result |
|---|---|---|---|---|
| Woodpile | build | "Press E to place each part, in order. / 0 / 3 placed" | **yes** | "Done — 3" |
| Pinecone Toss | throw | "Five snowballs, three targets. / 0 / 3 targets · 5 snowballs left" | **yes** | "Done — 1" (1 hit) |
| Deer Trail Run | race | "Steer with A / D and hold Shift to run. / 0% of the course" | **yes** | 0→87%→finish |
| Creek Pool | fish | "Press E the moment the float dips." | **yes** | "Done — 4", "First Cast" |
| Hoarfrost Glade | photo | "Turn until the subject is centred, then press E." | **yes** | "Done — 91", "Photograph kept" |
| Boathouse Hill | sled | "Steer with A / D." | **yes** | "Done — 13" |
| Ice Hole | fish | as above | **yes** | "Done — 3", "New fish" |
| Reach Skate Race | skate | "Steer with A / D." | **yes** | "Done — 3", "Clean Ice" |
| Pressure Ridges | photo | as above | **yes** | "Done — 90" |
| Warm Pool | fish | as above | **yes** | caught |
| Otter Slide | sled | as above | **yes** | "Done — 10", "Long Slide" |
| Steam Columns | photo | as above | **yes** | "Done — 84" |
| Stone Dam | build | as above | **yes** | "Done — 3" |
| Snowman | build | as above | **yes** | "Done — 3", "Snow Sculptor" |
| Bell Ring | throw | as above | **yes** | "Done — 0" (no hits) |
| Market Lamps | photo | as above | **yes** | "Done — 92" |
| Kite Line | throw | as above | **yes** | "Done — 0" (no hits) |
| Lantern Ascent | race | as above | **yes** | "Done — 12", "Lantern Chain" |
| Chimney Scramble | race | as above | **yes** | "Done — 12", "Chimney Top" |
| High Tarn | fish | as above | **yes** | caught |
| Aurora | photo | as above | **yes** | "Done — 92", "Night Colour", "Five Frames" |
| Thermal Descent | race | as above | **yes** | "Done — 12", "Home Again" |

Every completion incremented `counters["activity:<id>"]` exactly once and produced the "Done — N" toast. The D1 blocker from the QA pass (no HUD, unbuildable build activities) is genuinely fixed: build parts are now within reach (3 presses from the spot), and all four activity kinds that were blind now narrate themselves.

Two caveats, both defects rather than failures: **throw activities complete with zero hits** (D9), and **photo/throw aiming cannot be adjusted once the activity starts** (D5) — all five photos completed only because the camera was already facing the subject when E was pressed.

---

## 6. Cozy judgement — where it lands, and where it does not

**What lands.**

- **Almost every completed thing announces itself, in the same visual language.** Zone entry, quest started, quest completed, achievement, feather, lantern, fish, photo, activity score and the summit all produce a toast with an icon; the summit's is a bigger `finale` variant. A 22-activity sweep produced **22 completions and 16 achievements**, each with its own announcement. The exceptions are bells and items, which are silent by design (below).
- **Nothing can be lost, failed or spoiled.** No health, no death, no timer that ends a run, no quest that can be declined or broken. A missed fish costs 0.7 s of silence and recasts (measured: 6 deliberate misses, then a catch — nothing was taken away). A skate run that loses balance still awards and still pays the counter. Falling 250 u costs nothing (carried over from the QA pass). This is exactly the "cozy rules" the activity code claims, and the code tells the truth.
- **The journal reads clearly.** Five tabs (Field Notes / Quests / Fish / Achievements / Settings); Field Notes shows six progress bars with totals (`Feathers 14 / 14`, `Bells 60 / 60`, `Lanterns 12 / 12`, `Fish 5 / 6`, `Photos 5 / 5`, and `Feats`, whose ceiling is 18 / 20 because two achievements cannot fire) plus a per-zone "noted/unvisited" list, and the Quests tab prints the current step in plain language ("Ask Bram about the spare batteries." → "Done."). "Nothing here is missable" in the footer is, as far as this audit can tell, true.
- **Mini goals are dense and fair.** 14 feathers, 60 bells in 18 clusters, 12 lanterns, 22 activities, 18 quests, 18 achievements — something to do every 20–40 u of walking. The two-quest chains between zones (Pinewind → Kettle Springs, Hamlet → Hearth) are the best of it: they give the valley a postcode, as the comment claims.

**What does not land.**

- **The biggest moment is the emptiest.** The summit — the thing the whole game points at — pays one 3.5-second toast and nothing else. No one speaks, no quest closes, no credits, no music cue that is verified. Compare: picking up a feather gets the same treatment.
- **The epilogue is missing.** `nana-home` was written as the closing kettle-side scene and cannot be accepted. So the story ends mid-air: you climb the mountain, get a toast, and the last NPC with anything to say repeats her shopping list.
- **Rewards are announced as *titles*, not as *things*.** A quest completion toast reads "One Mitten" or "The Good Rope" — the player is never told "+12 bells", and **item rewards are invisible everywhere**: no toast on `item:gained` (`router.ts:83-85`), no journal page for items, and no quest condition that reads them. Eight items (mitten, sketchbook, headband, bait, soup, charm, key, letter) are paid into `state.items` and never surfaced. That is the single biggest hole in the dopamine loop: the reward exists, the acknowledgement does not.
- **Some goals are silent by design, and it reads as a bug.** Bells give a chirp and a counter bump and nothing else — defensible at 60 of them, but there is no sound on the 60th either, and no "all bells" acknowledgement anywhere.
- **A third of the twenty achievements are pure zone-entry trivia** (six of them fire the first time you walk into a zone), while the two that describe *doing* something specific and cozy — soaking in hot water, sitting in all five pools — are dead. The shape of the achievement list is right; two of its most attractive entries simply do not exist.
- **Locked achievements give no hint.** The Achievements tab renders 18 rows of "Locked" with an empty description and no "how". For a game whose brief is "a dopamine hit for every goal", the list of goals is unreadable until earned.
- **The quest log only lists what you accepted.** There is no "available" list, so the 18 quests are discoverable only by walking up to 18 people; four quests are invisible because they cannot be accepted at all. A player cannot tell the difference between "not found yet" and "does not exist".

Overall: the moment-to-moment loop is genuinely cozy and generous — dense pickups, forgiving minigames, clear journal, no punishment. The failure is at the two ends: rewards are named but not *felt* (no amounts, no items), and the ending the content was written for never happens.

---

## 7. Defects

### D1 — BLOCKER: there is no ending, and the epilogue quest cannot be accepted

Climb to the summit and the game pays one toast and continues. The quest written to close the story (`nana-home`, `data/quests.ts:148`) is unreachable because Nana's single `quest` field is already spent on `the-line`.

**Reproduction**
1. `__game.teleport(344,-338,-2.57)`, then drive `moveZ:1, sprintHeld:true` for 2 s (holding W+Shift).
2. Observe `state.flags.summit = true`, toast "The summit" (`ui-toast--finale`), and nothing else.
3. Walk away: 19.1 u in 3 s, frames still advancing; no overlay, no text matching "the end/credits/complete".
4. Go back to Nana (−352, 348) and press E. She opens `nana-done` ("So. Batteries…"); `state.quests` does not gain `nana-home`.

| | Observed | Expected |
|---|---|---|
| Summit state change | `flags.summit=true`, 1 toast, 0 overlays | an ending beat: dialogue, credits, or at minimum the epilogue quest |
| Completion text in `#ui` | **0 matches** for /the end\|credits\|complete\|ending/ | something that says the game is over |
| `nana-home` after visiting peak | not offered | offered (its only requirement, `visited peak`, is met) |

**Cause:** `session.ts:317-320` sets the flag and emits; `router.ts:91-93` turns it into a toast and stops there. **Nothing reads `flags.summit`** (grep: written at `session.ts:318` and `progress.ts:121`, read nowhere), and nothing reads `abilities.lantern` except the lantern gate itself. `mechanics.ts:89-97` can only accept `npc.quest`, and `npcs.ts:16` gives Nana `quest: 'the-line'`, so `nana-home` has no giver.

**Impact:** the game is finishable in the literal sense (you can reach the top) and unfinishable in the sense that matters — there is no ending, and 20 bells plus the only epilogue dialogue in the game are unreachable.

---

### D2 — MAJOR: four of twenty-two quests can never be offered

`chimney-line`, `nana-home`, `orla-night-bake`, `pell-address` are authored as second quests for Sable, Nana, Orla and Pell. An NPC can only hand out `npc.quest`, which each of them already uses for their first quest.

**Reproduction:** complete `sable-kite`, then talk to Sable at (286, −152) — with `requires: visited ridge` met — and read `state.quests`. It never contains `chimney-line`. Same for the other three (all measured in the 22-quest sweep).

| | Observed | Expected |
|---|---|---|
| Quests offered by the 18 NPCs | **18 of 22** | 22 |
| `state.quests` after talking to Sable / Nana / Orla / Pell a second time | unchanged | the second quest accepted |
| References to the 4 ids outside `data/quests.ts` | **0** | a hand-off somewhere |

**Cause:** `interact.ts:25-33` (`entryNodeFor` keys off `npc.quest`) and `mechanics.ts:89-97` (`acceptQuestFor` accepts only `npc.quest`). There is no "next quest from this NPC" concept, and no dialogue node mentions the four.

**Impact:** 18% of quest content is dead, including the epilogue. Roughly 50 bells of the authored economy and four story beats are unreachable.

---

### D3 — MAJOR: a "talk to X" step does not count if X has a quest to offer — 14 of 18 quests need a repeated conversation

`session.ts:222` suppresses `npc:talked` whenever the greeting *accepts* a quest. It was written to stop a giver's own greeting satisfying their quest's final "report back" leg (QA D4, correctly fixed), but it suppresses the event for **every** NPC with an available quest, not just the one being accepted. So the first conversation with anyone who has a quest to give is invisible to every other quest's talk step.

**Reproduction**
1. Fresh page. Talk to Bram (−340, 306) → `bram-count` accepted, `state.talked` is **`{}`**.
2. Talk to Hollis → `hollis-mitten` accepted, `state.talked` still **`{}`**.
3. Talk to Hollis again → `state.talked.hollis = true`.
4. Accept `the-line` at Nana, talk to Bram once → `the-line` stays `step 0`; talk to Bram again → `step 1`.

| | Observed | Expected |
|---|---|---|
| `state.talked` after a quest-offering conversation | `{}` | `{bram:true}` as well as accepting the quest |
| Quests needing ≥1 extra conversation | **14 of 18 (78%)** | 0 |
| Talk steps that silently failed first time | **21** | 0 |
| Feedback when a step does not advance | none | anything |

**Cause:** `session.ts:222` — `if (!mech.acceptQuestFor(npc.id)) bus.emit('npc:talked', …)`.

**Impact:** every cross-quest talk step is a coin flip on whether it registers. It is recoverable (talk again) and the journal shows the step still open, but with no feedback a player has no reason to think the conversation "didn't count". It made 14 of 18 quests need a retry in a scripted run that was *trying* to complete them.

---

### D4 — MAJOR: two achievements have no event source and can never fire

`hot-water` (count `spring` ≥ 1) and `every-spring` (count `spring` ≥ 5) read `counters.spring`, which is written only by `spring:soaked` — an event no code emits.

**Reproduction:** stand in a hot spring (grid scan of Kettle Springs found surface `spring`; `player.soaking === true` and stamina regenerated at the soak rate), sit for 2 s, read `state.counters`. `counters.spring` is `undefined`; `achievements` never gains either id.

| | Observed | Expected |
|---|---|---|
| `counters.spring` after soaking | `undefined` | ≥ 1 |
| Achievements unlocked | 0 of 2 | 2 of 2 |
| Emitters of `spring:soaked` in `src` | **0** | ≥ 1 |

**Cause:** the event exists in `contracts.ts:430`, is handled in `progress.ts:109` and routed in `router.ts:87`, and nothing calls `emit('spring:soaked')`. The mechanic that should drive it (`state.soaking`, `step.ts:246`) exists and works.

**Impact:** 2 of 20 achievements are permanently locked. With 18 unlockable, the Feats counter can never read 20/20, and the journal's "Unlocked 18/20" is the ceiling.

---

### D5 — MAJOR: the camera cannot be turned while an activity is running, so the photo/throw instructions are impossible to follow

The activity HUD says "Turn until the subject is centred, then press E" (photo) and "Press E to throw… three targets" (throw). While an activity is active the session feeds `emptyInput()` to the player step, which zeroes `lookX`, so mouse yaw is discarded. Aiming can only be done *before* pressing E, by walking toward the subject so the chase camera falls in behind you.

**Reproduction**
1. Stand at Hoarfrost Glade (−228, 150) and press E to start the photo.
2. During the activity, inject `lookX: 0.5` for one frame → `rig.yaw()` changes by **−0.13** (the camera's own drift toward the player's facing), not **+0.37**.
3. A 200 px mouse drag with nothing open moves yaw **1.790 → 3.057 (+1.267)**; the same drag inside the activity produces no yaw change in the drag direction.
4. Complete the photo only by setting the player's facing toward the subject *before* E: pre-aimed, 5 of 5 photos completed with scores 84–92; the cone is cos 0.968 (~14.5°).

| | Observed | Expected |
|---|---|---|
| `lookX` during an activity | forced to 0 (`session.ts:266`) | applied to the camera |
| Photos completed without pre-aiming | cannot be tested to completion — no way to centre after start | completable by following the on-screen instruction |
| Photos completed with pre-aiming | 5 / 5 | 5 / 5 |

**Cause:** `session.ts:256` computes `blocked` including `active !== null`, then `session.ts:266` substitutes `emptyInput(rig.yaw())`, whose `lookX` is 0.

**Impact:** two of the seven activity kinds (5 photo + 3 throw = 8 of 22 activities) ask the player to aim with a control that is dead. They are still completable — throwing works because a fixed heading eventually catches a swinging target, and photos work if you happen to walk in facing the ring — but the instruction on screen cannot be obeyed. This is why all three throw activities scored 0–1 hits out of 3 in my sweep while still "completing".

---

### D6 — MINOR: the photo HUD claims "Centred — press E" before anything has been aimed

The readout's `hint` field starts as `'aim'`, and `progress()` renders `'aim'` as "Centred — press E". Observed at all five photo activities immediately on start (`Centred — press E · 0s`) while the subject was demonstrably not centred (the first press then returned the same hint). A player is told they are ready when they are not.

### D7 — MINOR: quest items are paid, saved, and never shown

`item:gained` is silent (`router.ts:83-85`), the journal has no items page, and no quest condition uses `hasItem`. Measured: all eight items present in `state.items` after the quest sweep; the only occurrence of any item word in the entire `#ui` text is the quest *title* "One Mitten". Eight rewards are invisible.

### D8 — MINOR: the lantern gate invites an action it silently refuses

Before `abilities.lantern`, standing at a post shows the HUD prompt "Press E to light". Pressing E does nothing: `lanterns` stays `{}`, no toast, no sound hook that is verified, no explanation. The gate works (0 lit before the quest, 12 lit after) but reads as a broken button rather than a locked door.

### D9 — MINOR: throw activities complete on zero hits

Five snowballs, three targets, and the round ends when the pouch is empty regardless of score. Measured: "Done — 0" for Bell Ring and Kite Line, both of which still completed `gus-ledger` / `sable-kite` steps and unlocked `kite-string`. The goal ("Ring the shop bell cleanly", "Get the kite above the crest") is satisfied by missing every throw. Cozy, but the mini-goal is not a goal.

### D10 — MINOR: "The Mast" fires on entering the peak zone, not at the mast

The achievement's description is "The only radio that reaches the district office"; its trigger is `visited: peak`, which fires at the **zone boundary** (radius 105). Observed: "The Mast" toast at (344, −338), **26.1 u** from `PEAK` and before `flags.summit`. The quest step "Reach the mast" (`the-mast`, step 0) is satisfied the same way — a player who enters the peak zone and immediately turns back has "reached the mast" without seeing it.

### D11 — MINOR: "Six Species" counts catches, not species

`six-species` triggers on `count fish ≥ 6`. Measured: it unlocked while the Fish page read **"Caught 5 / 6"** (char, burbot, pike, grayling, smelt) — the sixth catch was a duplicate. The journal page and the achievement disagree about what "six species" means.

### D12 — MINOR: a fourth toast is silently dropped when three are live

`ToastQueue.push` refuses a toast whose tier is not louder than the weakest already on screen (`toasts.ts:52-59`). Measured: with three toasts live, collecting feathers 2, 3, 4 produced **no** new toast. In normal play toasts expire in 1.8–3.5 s so this is rare, but the two shop feathers at (300,120) and (306,126) are 8.5 u apart — about one second of walking — so the second one's acknowledgement is likely to be discarded.

### D13 — MINOR: no acknowledgement for completing a collectible set

`Feathers 14/14`, `Bells 60/60` and `Lanterns 12/12` are reached with no event, toast, achievement or sound beyond the last individual pickup. The Field Notes bars fill and stop.

---

## 8. What could not be verified, and why

| Item | Why |
|---|---|
| Audio | headless browser, no output device; `audio.unlock()` needs a gesture. Nothing audible is asserted anywhere in this report. |
| Visual/art quality | SwiftShader screenshots at 1152×648 showed repeated HUD tiles composited across the frame (a headless capture artefact, not a game state I could reproduce in the DOM), so the frames were not usable for aesthetic judgement. Section 6 is based on measured behaviour and UI copy, not on how it looks. |
| A full 2-hour human playthrough | the audit drove every content item, but each in isolation; no single continuous session reached 100% completion. Playtime measured in the 22-quest sweep: 121.9 s of game time for 18 quests because teleport replaces walking. |
| Whether a player *notices* D3 | the scripted run knew to retry; a human might not. The journal does show the step still open, so the information is available. |
| `six-species` / Fish 6/6 in one save | each species was verified caught, and the 6/6 set is reachable (char/smelt/grayling on first casts, burbot and pike on the 2nd/3rd cast at Pinewind, Ghost Trout on the 7th cast at the Reach hole after 6 deliberate misses — observed: `fish: {ghost-trout: 1}`, "Done — 16"). Not collected into one journal in a single session. |

## 9. Method note

Raw logs: `/tmp/acts.log` (22 activities), `/tmp/quests.log` (22 quests, 18 completed, final state `bells: 229`), `/tmp/collect2.log` (14 feathers, 60 bells, lantern gate), `/tmp/audit-lantern.mjs` (quest → ability → 12 posts), `/tmp/fishcalc3.mjs` + `/tmp/audit-ghost.mjs` (fish seed model and Ghost Trout), `/tmp/shot-*.png` (frames, unusable for aesthetics). Every state claim is a read of `window.__game.session.state` (or `player`), and every UI claim is a read of the live DOM (`.ui-activity`, `.ui-hud__prompt`, `.ui-journal__body`, `.ui-toast`) in the same page that produced the state change.
