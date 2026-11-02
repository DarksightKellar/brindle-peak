# The First Five Minutes

A new player is taught the game by a short script of prompts, one at a time, each one a thing to do
rather than a thing to read.

## Rules

- Exactly one prompt on screen.
- Every lesson is a physical act, and every completed lesson pays straight away: a toast, a pulse of
  the stamina bar, or just the world.
- Nothing is gated and nothing times out. A player who ignores every prompt can still play; the
  script waits.
- Completion is level-triggered: if the player already did the thing before its prompt came up, the
  beat completes the moment it becomes current. Nobody is asked to do what they just did.
- No bells are paid for tutorial beats, and there is no skip key (`Esc` is the pause menu).
  `skip()` exists on the machine for tests.

## Beats

Each beat becomes current only when the one before it is done.

| # | Id | Prompt | Completes when | Pays |
|---|----|--------|----------------|------|
| 1 | `walk` | `W A S D — walk toward the cabin` | 12 u from spawn | toast |
| 2 | `talk` | `E — talk to Nana at the cabin door` | any dialogue has been opened | toast |
| 3 | `map` | `M — open the map to see where you are` | the journal's Map page has been open | nothing |
| 4 | `jump` | `Space — jump` | Pip has jumped (left the ground rising faster than a climb) | toast |
| 5 | `flap` | `Space again in the air — flap to gain height` | a flap has been spent | stamina pulse, toast |
| 6 | `sprint` | `Hold Shift — run` | sprinting has drained stamina for 0.6 s | stamina pulse, toast |
| 7 | `journal` | `Tab — open your journal` | the journal has been opened | toast, shown when the journal closes |

The prompt text lives in `src/core/onboarding/steps.ts`. When beat 7 completes the script retires
and the save records it as done.

## Why talk is second

`SPAWN` is (-372, 358) and Nana stands at (-358.3, 355.3), about 14 u away (`src/data/zones.ts`,
`src/data/npcs.ts`). Beat 1 completes at 12 u, just before she comes into reach, so the talk prompt
appears as the player arrives at her. During beats 1 and 2 the HUD compass points at Nana.

## Placement

- The prompt bar sits bottom centre, just above the stats line. The goal line stays at the top the
  whole time; the two cannot collide.
- The next-step line (docs/GUIDE.md) is hidden while the script runs, so the script is the only
  thing telling a new player what to do next.
- The bar hides while a dialogue or a panel is open and comes back when it closes. A toast earned
  behind the journal waits until the journal closes.
- On a fresh save an opening card states where Pip is and that Nana is waiting. It never takes
  input or pauses the game, and it leaves on the first key or click.

## Code

| Layer | File | Rule |
|-------|------|------|
| Data | `src/core/onboarding/steps.ts` | the beat table and the `Snapshot` type. Pure. |
| Logic | `src/core/onboarding/machine.ts` | `observe(snapshot, dt) -> events`, `skip()`, `isDone()`. Pure, unit-tested. |
| Glue | `src/game/session/onboarding.ts` | builds snapshots from the player and UI, saves progress, drives the UI. |
| Render | `src/game/ui/tutorial.ts` | the prompt bar. |

The machine never reads the world: it gets a `Snapshot` and returns events, so the order and the
completion rules are tested in `tests/onboarding.test.ts` without a browser.
`tools/first-five-minutes.ts` plays the script end to end in a real browser.

Progress is saved as the current beat id, so quitting after beat 3 resumes at beat 4. An unknown or
missing id restarts the script instead of throwing.

## Not doing

- No cutscenes, no camera takeover, no pausing.
- No arrow in the world over the objective.
- No "tutorial complete" screen. The last beat simply stops prompting.
