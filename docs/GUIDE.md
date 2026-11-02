# The Field Guide: knowing where you are, and what to do next

Revision 1. Written after a play-test that ended with "I don't think you guys did any validation
whatsoever… there's nothing cozy about not knowing what to do… we need a map of sorts so we know where we
visited and where we need to explore next."

That is the brief. This document is the design; the code follows it.

## The problem, stated honestly

The game has plenty of content — 7 zones, 18 NPCs, 22 quests, 14 feathers, 60 bells, 22 activities, 20
achievements, 74 pickups. None of it was *spoken*. The journal showed counters (3 / 22) which answer "how
much is left" and never "what do I do now". The only guidance on screen was one goal line that looped. So
the design leaned on accidental discovery in a 1,024-unit world. That is not cozy; it is homework.

A cozy game does not hide what to do. It hides *what you will find when you get there*.

## Three surfaces, one job

### 1. The next step, always on screen

One line under the existing goal, naming the single next action:

    Next:  Ask Bram about the spare batteries — northeast, 210 u

- Derived from the **active quests**, never authored twice. Each quest already has ordered steps with
  `text` and a `when` condition (`src/data/quests.ts`). The next step is the first step that is not yet
  satisfied. Do not invent a parallel list of hints — a hint that can disagree with the quest is a bug
  factory.
- When several quests are active, show the one whose next step is nearest. Distance is a fact the player
  can act on; "pick a quest" is not.
- The compass word (north/northeast/…) and the distance come from the step's target position where one
  exists (an NPC, activity or zone the step names). A step with no target shows its text only, with no
  bearing — never a fake one.
- When no quest is active, the line points at the nearest **unvisited zone**: "Unexplored: the Kettles —
  west, 340 u".

**Rule:** the line never repeats the goal. Goal = the spine. Next = the very next thing.

### 2. The map — a page of the journal, and its own key

`M` opens the journal directly on the map. `Tab` still opens the journal; the map is a tab beside Field
Notes, Quests, Fish, Achievements, Settings.

The map is **schematic, not satellite**: the seven zones drawn as soft shapes in their true relative
positions from `ZONES`. It reads like a hand-drawn trail map in the same palette, not a minimap HUD.

It must answer, at a glance:

- **Where have I been?** Visited zones are filled and named. Unvisited zones are ghosts: outline only, no
  name, a `?` in the middle. The player's trail is not drawn — a trail is a diary, not a plan.
- **Where am I?** A bird-shaped arrow at `player.pos`, rotating with `player.facing`, in the accent
  colour. It is the only saturated thing on the page.
- **Where next?** One objective pin, matching the HUD's next step. If the objective is in an unvisited
  zone, the pin sits on the ghost — that is the invitation.
- **What did I find?** Markers for NPCs already talked to and activities already completed
  (`state.talked`, activity records). Nothing undiscovered is marked. Discovery is the reward; the map
  must not pre-spend it.

### 3. The quest page tells the truth

Each active quest shows its **next step** in words under the title, not just a fraction. Completed quests
collapse to a tick and a one-line epilogue. No quest shows a step whose condition is already met.

## What this is not

- Not a minimap. No persistent overlay, no compass rose, no waypoint beam in the world.
- Not fast travel. The mountain is small; walking it is the game.
- Not a completion checklist on the map page. Counters live in the journal where they already work.

## Acceptance

- A player who has never seen the game can open it, read the HUD, walk to the next step, and find it
  there — for the first three steps, without opening the journal.
- Opening the map shows visited vs unvisited zones, the player's position, and the objective pin.
- Every active quest's next step text is real and reachable; no step ever displays while already
  satisfied.
- The map adds no per-frame cost: it is built when opened and on rerender, never in `update()`.

## Sequencing

1. `nextStepFor` as a pure function in `src/core/guide/` with unit tests (this is core logic; it earns
   tests because a wrong step is a lie on screen).
2. HUD next-step line, using it.
3. Map tab and `M` key, built from `ZONES` + `state`.
4. Quest page next-step lines.
5. A browser harness that walks the first three steps and asserts each line names something real.
