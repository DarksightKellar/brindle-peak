# BRINDLE PEAK — Game Design Document v1.0

*A small winter ascent. Browser, three.js, no install.*

---

## 1. One-line pitch

You are a snow bunting. The storm took out the valley's phone line. Climb Brindle Peak to reach the
radio, and along the way do small kind things for the people snowed in with you.

## 2. Pillars

1. **The journey is the reward.** No fail state, no timer, no combat, no fall damage. The only
   pressure is your own curiosity.
2. **One resource, three ways to get it.** Warm Feathers = stamina. Find them, earn them, or buy
   them. Whatever the player chooses to do, it moves them upward.
3. **Warmth inside cold.** Mechanically: hot springs restore stamina. Emotionally: every NPC is
   somebody coping with something small. The palette contrast (cool snow / warm lamplight) is the
   thesis of the whole game.
4. **Small mercies, loudly rewarded.** Every micro-goal fires a visible, audible, tactile
   acknowledgement. Abundance of dopamine, scarcity of punishment.
5. **Readable at 384×216.** If a silhouette does not read at that resolution, it does not ship.

## 3. Target experience

| | |
|---|---|
| Summit (critical path) | **50–70 min** |
| Main + most side content | **2.5–3.5 h** |
| 100 % completion | **≤ 4.5 h** (hard cap 5 h) |
| Session shape | 10–25 min meaningful chunks; save anywhere |
| Audience | Cozy-exploration players, all ages |
| Failure modes | None fatal. Getting stuck = walk downhill and try another path. |

## 4. Story

**Cast**
- **Pip** — player. A snow bunting (cream-white body, warm brown wing coverts). Round glasses. Small
  red knitted scarf. Visiting for the winter.
- **Nana Quill** — a ptarmigan, ranger of Brindle Peak Station. Dry, warm, unimpressed by drama.
- **Juniper** — Pip's older sister, ranger, stationed at the Far Relay hut beyond Windscar Ridge.
  Off-screen for the whole game. The person the call is about.

**Setup.** Pip arrives at Hearth Hollow station on the last truck before the pass closes. The storm
took the valley's line down. Juniper has not checked in for two days. The only transmitter that
reaches the district office is the radio mast on Brindle Peak.

**Beat structure**
1. *Arrival* (Hearth Hollow) — Nana teaches movement, gives the lantern, points up. Establishes the
   one goal: get to the mast.
2. *The valley* (Pinewind Wood, Frozen Reach, Kettle Springs, Hollowpine Hamlet) — free exploration.
   Each zone holds 2–4 NPC vignettes and 3–5 activities. No ordering enforced.
3. *The wall* (Windscar Ridge) — the first genuinely hard terrain. Gates on feathers. This is where
   the player must have engaged with the valley.
4. *The peak* — the mast, the call. Juniper is fine and dug in; she lost her radio in the wind.
   Relief, not drama.
5. *The flight* — an aurora-driven thermal lifts Pip off the summit. Free flight over the whole
   valley with the score at full. The player sees everything they walked.
6. *Home* — back at the station, Nana asks what Pip got up to. A generated summary of the player's
   actual journal. Sleep. Credits.

**Tone rules for all writers:** people talk the way they would in person, in warm, ordinary, whole
sentences, never clipped or tagline-like (see docs/STORY.md, Voice). No speeches. Nobody explains the theme. Humour is dry and observational. Nobody is cruel. Nobody dies.

## 5. World — Brindle Peak Valley

One contiguous heightfield, ~1024 × 1024 world units. Player ≈ 1.6 units tall. Peak ≈ 96 units.

| # | Zone | Elev | Character | Purpose |
|---|---|---|---|---|
| 1 | **Hearth Hollow** | 0–12 | Station, woodsmoke, warm windows, truck ruts | Tutorial, shop, save point, Nana |
| 2 | **Pinewind Wood** | 4–38 | Dense pine, muffled, snow falling, deer trails | Density, hidden glades, most feathers |
| 3 | **The Frozen Reach** | 0–8 | Huge frozen lake, wind-scoured ice, sled hill | Sledding, ice fishing, skating race |
| 4 | **Kettle Springs** | 14–32 | Steaming pools, mineral terraces, otter slides | Fast stamina regen, warmth, rest |
| 5 | **Hollowpine Hamlet** | 10–24 | Six buildings, bakery, bell-shop, lamplighter | Social hub, commerce, mail quests |
| 6 | **Windscar Ridge** | 44–78 | Exposed traverse, spindrift, rope bridges, gusts | The difficulty wall, wind mechanic |
| 7 | **Brindle Peak** | 84–100 | Bare rock, aurora, the mast | Climax, radio, updraft |

**Wayfinding.** No map. Trail lanterns (12) double as signposts and as a collection goal — light one
and the next becomes faintly visible. Signposts at forks. Nana's directions are vague on purpose.

**Traversal**
`WASD` move · `Space` jump · `Space` again in air = **wing flap** (costs stamina) · hold `Space`
while falling = **glide** · hold toward a steep face = **climb** (costs stamina) · `Shift` =
**sprint** (unlocked) · `E` interact · drag = camera yaw/zoom.

**Unlocks (the only progression)**
- **Lantern** — from Nana, act 1.
- **Felted Boots** (sprint) — reward from the hamlet cobbler quest.
- **Sled** — found leaning on the Frozen Reach boathouse. Ride any slope downhill. No cost, pure joy.
- **Warm Feathers ×24** — +1 max stamina each. 8 comfortable for the summit route; a skilled player
  can do it with 6 via the ridge scramble.

**Stamina.** One bar. Drains on flap/climb/sprint. Regenerates: slowly anywhere; fast while standing
still; very fast in a hot spring; **not at all** during a wind gust on Windscar Ridge. No cold meter
— the cold is expressed through movement cost and colour, not a second resource to manage.

## 6. Content inventory (the dopamine budget)

| System | Count | Reward |
|---|---|---|
| Warm Feathers | 24 | +1 stamina |
| Bells (currency) | ~140 scattered | buy feathers, soup, bait |
| Trail lanterns | 12 | wayfinding + achievement per zone completed |
| NPC quests | 22 | feather, bells, item, or ability |
| Named NPCs | 18 | dialogue, vignette |
| Fish species (journal) | 6 | bells, journal page |
| Photo subjects | 5 | journal page |
| Sled courses | 3 | time + medal |
| Treasure maps | 2 | chest with 3 feathers |
| Hot springs | 5 | regen spots + achievement |
| Achievements | 38 | toast + journal entry |

Every one of the above fires a **toast**, a **chirp**, a **particle puff** and a **journal write**.
That is the dopamine hit: four channels, one moment, ~1.2 s, never blocking input.

## 7. Systems

**Quest model.** Each quest is data: `id, giver, zone, steps[], reward, dialogue keys`. Steps are
declarative conditions evaluated against game state (`talkedTo:x`, `hasItem:y`, `visited:z`,
`count:k>=n`, `activity:done`). No per-quest code. Adding content = adding a data entry.

**Activities** are small self-contained minigame modules with a shared `Activity` interface
(`start/update/complete/abort`), so the world can host them anywhere.

**Achievements.** Data-driven listeners on the event bus (`feather:collected`, `zone:entered`,
`fish:caught`, …). Unlock → toast queue.

**Journal.** Field-notes page per zone: feathers, bells, quests, fish, photos, landmarks. This *is*
the summary shown at the end.

**Save.** localStorage, autosave on zone change, activity complete, and every 30 s. Versioned schema
with migration stub.

## 8. UI

Minimal, diegetic where possible.
- **Stamina**: arc of feather pips beside the player, fades when full.
- **Interact prompt**: single key glyph above the target, world-space.
- **Dialogue**: bottom panel, typewriter, chirp per character, `E` to advance, up to 2 choices.
- **Toast**: top-centre, icon + name + one line, stacks to 3, 2.5 s each.
- **Journal / Pause**: `Esc`. Tabs: Field Notes, Quests, Fish, Achievements, Settings (pixel size,
  volume, reduce motion).
- **No minimap. No compass by default. No damage. No numbers larger than two digits.**

## 9. Audio

Procedural, WebAudio, no assets.
- **Music**: 4 layers (pad, pluck arpeggio, low strings, bell). Layers fade in by altitude band and
  by weather; strings swell during flight. Slow, ~70 bpm, pentatonic, unresolved-to-resolved
  progressions.
- **SFX**: footsteps vary by surface (snow crunch, ice ring, rock), wing flap, glide wind, bell
  pickup, quest chime, achievement chime (rising third), hot-spring burble, radio static.
- **NPC voice**: short per-species chirp syllables pitched per character.
- Master gain + music/sfx split in settings. Mute respects `prefers-reduced-motion`? No — separate.

## 10. Non-goals (explicitly out of scope)

Combat · enemies · damage · death · crafting trees · inventory grids · skill trees · procedural
quests · multiplayer · mobile touch · voice acting · external art assets · a minimap.

---

# REVISION v1.1 — design review board outcome

Three independent critics (game design, technical architecture, player experience) reviewed v1.0.
The following are **binding changes**, not suggestions. Superseded numbers in the sections above are
void where they conflict with this section.

## R1. The gate is geographic, not numeric  (was: 24 feathers, 8 needed)

The v1.0 gate was walkable in ~15 minutes because the adjacent zone held "most feathers" and the shop
sold them. Fixed:

- **14 feathers total** (was 24).
- Distribution: **3 in Pinewind Wood / 2 purchasable / 9 elsewhere** (elevation > 30, quest rewards,
  buried chests). A player cannot reach the wall by farming the first two zones.
- **The wall is a place, not a number:** *Nettle Chimney*, a 26-unit vertical face on Windscar Ridge.
  The vertical budget of jump+flap+flap at max stamina is exhausted below **6 feathers**, so the top
  is physically unreachable. 6 = the direct route. **5 is possible** via the Ridge Scramble, a
  hand-placed platforming line — that is the skill path that makes the summit feel earned.
- More feathers make everything *easier*, never *possible-for-the-first-time*. That distinction is
  the whole point.

## R2. Honest length targets  (was: 2.5–3.5 h, ≤4.5 h cap)

The v1.0 content inventory buys **~148 minutes** of unique activity, not 2.5–3.5 h, and the 4.5 h cap
required ~1.3 h of padding. Corrected:

| | v1.0 claim | **v1.1 target** |
|---|---|---|
| Summit (critical path) | 50–70 min | **45–60 min** |
| Main + most side content | 2.5–3.5 h | **2.0–2.5 h** |
| 100 % completion | ≤ 4.5 h | **≤ 3.5 h** |

Hard cap of 5 h from the brief is satisfied with margin. We do not pad.

## R3. Content budget rebalanced

| System | v1.0 | **v1.1** | Why |
|---|---|---|---|
| Feathers | 24 | **14** | per R1 |
| Bells | ~140 | **60** | 140 bells bought 4 minutes of play and 140 reward events |
| Achievements | 38 | **20** | 18 of the 38 were labels on content already counted |
| Sled courses | 3 + medals | **3, personal best only** | a medal is a grade, i.e. a fail state wearing a hat |
| **Authored set-pieces** | — | **+6 at 6–10 min each** | *this* is what fills time: the skating race, the otter slide run, the lantern-lighting ascent, the snowman build, the kite on the ridge, the aurora flight |

Quest steps go from 1 to **3 average**, raising the per-quest value from ~1.5 min to ~3 min.

## R4. Structure: the summit is at 60 %, not the end

v1.0 put the emotional climax and credits at the end of the critical path, so a 50-minute player
finished and had nothing, while a completionist spent two hours *after* the payoff with no frame.

**New act structure:**

1. Arrival (Hearth Hollow) — 0–6 min
2. The valley, free exploration — 6–45 min
3. The wall (Windscar Ridge) — 45–60 min
4. **Summit and the call** — ~60 % of the player's total playtime
5. **The Descent — an act, not a cutscene.** The aurora thermal lifts Pip, and the player *plays* the
   way home: gliding the whole valley, sledding any slope, finishing anything they left. 20–40 min.
   Sledding becomes load-bearing instead of a toy. This is the best hour of the game.
6. Home at the station, journal summary, credits.

## R5. Reward tiering — four volumes, not one

v1.0 routed ~277 events through the full four-channel celebration. Six bells in twelve seconds against
a 3-deep toast stack is noise, and it devalues the feather. Replaced:

| Tier | Fires on | Channels |
|---|---|---|
**pickup** | bells, baubles | chirp + HUD counter. **No toast, no journal, no particles.** |
**discovery** | feather, lantern, fish, photo | particles + chirp + journal. No toast. |
**milestone** | quest complete, achievement, new zone | all four channels |
**finale** | summit, the flight, credits | all four + camera move + music swell |

Full-volume events drop from ~277 to **~70**. The loud ones mean something again.

## R6. No soft-lock on the ridge

v1.0 disabled regen during gusts and left a 0-stamina player stranded with a 3–5 minute walk back.

- Stamina **always** regenerates to at least one flap's worth (`staminaFloorRatio`), gusts included.
- Every gust corridor gets a **wind-shadow alcove** — sheltered, regen enabled, no asset needed beyond
  a rock overhang. A ten-second breath, not a failure.
- A gust **pushes the player back toward safe ground**, never off a face.

## R7. Movement — the verbs and numbers v1.0 omitted

Added **mantle**: within 0.4 u of a ledge top while climbing, snap-grab and pull up over 0.25 s at no
stamina cost. Without it every successful climb ends by sliding back down the last half-metre.

Mandatory feel parameters (these are not preferences, they are what makes a browser platformer feel
responsive):

| Parameter | Value |
|---|---|
coyote time | 0.12 s |
jump input buffer | 0.12 s |
gravity rise / fall | 22 / 38 u·s⁻² (asymmetric; fall is 1.7×) |
ground accel / decel | full speed in 0.18 s / stop in 0.10 s |
air control | 0.65 × ground accel, horizontal velocity **preserved on landing** |
jump apex | ~2.0 u over ~0.38 s |
flap impulse | +2.6 u·s⁻¹, max 2 per airborne period |
glide trigger | jump **held** > 0.15 s while airborne (tap = flap; hold = glide) |
ice friction | 0.15 (deliberate contrast, not the default surface) |
run speed | 6.5 u·s⁻¹ for a 1.6 u character; sprint 9.5 |

Input is **camera-relative, always**. Manual camera yaw **does not decay** — if the player looks at
something, we do not take it back. Gentle auto-follow is a setting, default low, not off-by-force.

## R8. Footprints — "your trail is the map"

The biggest gap in v1.0. No map is a brave choice that only works if the snow remembers you.

Pip leaves footprints that fade over ~90 s. They let the player retrace a route, read where animals
went, and infer the mountain's shape. Snow is the map. This single feature is what makes "no map"
defensible rather than disorienting, and it is winter-native — the reference could not have done it.

## R9. Removed

- **Swimming.** The Frozen Reach is a frozen lake. Swim mode, water speed and swim cost are deleted
  from the contracts.
- **Medals and ranks** on sled courses. Personal best + a ghost of your own last run only.
- **Achievement toasts distinct from quest chimes** — one chime, tiered by volume.

## R10. First five minutes — a buildable spec

| Time | Beat |
|---|---|
0:00 | Fade from white. Camera 18 u back. **Brindle Peak must be legible in frame** — this is the whole promise of the game. |
0:05 | Nana, 2 lines: "You made it. Last truck through." / "Line's down. Whole valley." |
0:12 | Prompt `WASD` — walk 3 s to the porch rail. |
0:20 | Nana: the valley line is gone; only the mast on Brindle Peak reaches the district office. Camera eases to 26 u; the peak names itself once, environmentally. |
0:35 | **Lantern** granted (milestone tier). |
0:45 | Jump prompt. 0:55 flap prompt. 1:05 glide prompt — off the porch step, a 2 u drop. |
1:25 | **First feather**, 12 u from the porch, on a fork, behind a 3 u ledge that teaches climbing. |
2:10 | First bell cluster (3 bells) on the path — pickup tier, chirp only. |
2:40 | First NPC: **Hollis the hare**, first quest ("my mitten's down by the creek"). |
3:40 | First lantern post, lit. |
5:00 | Player has the lantern, 1 feather, ~5 bells, 2 verbs, 1 quest, and a visible mountain. |
