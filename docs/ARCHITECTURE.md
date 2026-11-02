# First Snow — Architecture

## House rules

1. **`src/core/**` is pure.** No `three`, no DOM, no `window`, no `localStorage`, no clock unless it
   is passed in. It runs under Node and Vitest unchanged, which is what makes the gameplay testable.
2. **`src/game/**` may import `core`, never the reverse.**
3. **No TypeScript file in `src/` or `tools/` over 260 lines.** `src/core/contracts.ts` (shared types)
   is the one exemption. A file that wants to grow past it becomes two files.
4. **No `any`, no `@ts-ignore` in `src/`.**
5. **One job per module.** Computing and rendering go in separate files; so do defining content and
   applying it.
6. **No dead code, no `TODO`, no stubs.**
7. **Content is data.** Zones, NPCs, quests, dialogue, achievements, activities, pickups, items and
   fish live in `src/data/` as typed literals. Gameplay code has no quest-specific branches. Layouts
   that belong to one activity (race gates, build pieces, photo subjects, throw targets) live in
   tables beside that activity in `src/game/activities/`.
8. **Tuning numbers live in one place per domain:** `core/player/tuning.ts` for movement,
   `game/render/pixelConfig.ts` for rendering, and a constant block at the top of each activity file.
9. **Shared types live in `src/core/contracts.ts`.** If a contract is wrong, change it there once
   rather than adapting around it.

## Layout

```
src/
  main.ts          bootstrap: DOM, input, overlay keys (Tab/J, M, Esc), the debug hook
  loop.ts          requestAnimationFrame driver, clamps dt
  session.ts       owns the state and the frame order (below); each stage is in game/session/
  core/            pure TypeScript
    contracts.ts   shared types
    math/          seeded noise
    terrain/       heightfield generation and sampling
    player/        step function, movement, air control, collision, tuning
    progress/      events, conditions, quests, achievements, conversations, save
    guide/         next step and compass words (docs/GUIDE.md)
    onboarding/    the tutorial script and its machine (docs/ONBOARDING.md)
    palette.ts, imagemetrics.ts, artgate.ts   colour grade and frame measurement
  game/            the three.js side
    input.ts       the only keyboard listener for gameplay; produces an InputFrame
    session/       boot, input routing, dialogue flow, activity runner, overlays, saving, feedback
    camera/        chase rig, conversation two-shot, prop occlusion
    render/        pixel pipeline, composite shader, sky, dusk, aurora, weather, view fade
    world/         terrain mesh, props, scatter, landmarks, water, footprints, colliders, NPC bodies
    actors/        Pip's mesh
    activities/    race, build, throw, photo, fishing, skate, sled
    ui/            HUD, compass, dialogue, toasts, journal and map, menu, intro, ending, tutorial
    audio/         synthesised score and sound effects
  data/            typed content; dialogue.ts is generated (see below)
  styles/          CSS for the DOM overlay
tests/             vitest unit tests
tools/             browser harnesses and content tools
```

## Frame order

`session.update(dt, input)` runs these in order every frame:

1. Route the frame's presses: ending card, menu or journal, dialogue, activity, or the world
   (`game/session/frameInput.ts`).
2. Step Pip: movement, collision, world edge, footsteps (`playerAdvance.ts`). Movement is emptied
   while something is blocking.
3. Update the running activity and the tutorial script.
4. World rules: spring pools, zone changes (camera pull-back and a save), the summit, and the ending
   when the finale quest completes (`worldRules.ts`).
5. Collect pickups in reach; find the nearest interactable for the HUD prompt.
6. Shadow focus, footprints, Pip's mesh.
7. Camera: the viewfinder aim, the conversation focus, then `rig.update` with the Q/R look axis.
8. Fade props between the camera and Pip; update the world and the snow veil.
9. Apply events to the game state, then route them to feedback (HUD, toasts, journal, audio), then
   decide whether to autosave (`frameFeedback.ts`). State always changes before feedback, so a toast
   never announces something the state did not record.
10. Time of day (`render/dusk.ts`), then render.

## Content

- **Quests** (`src/data/quests.ts`): four story quests chained by `then` (`main: true`), plus
  errands. Each quest names its own dialogue nodes (`offer`, `waiting`, a step's `say`);
  `core/progress/conversation.ts` picks which node an NPC speaks from that data. `FINALE_QUEST`
  completing shows the ending.
- **Dialogue** is written in `src/data/dialogue.parts/*.json`. `npx vite-node
  tools/assemble-dialogue.ts` validates it and generates `src/data/dialogue.ts`; do not edit the
  generated file. `tools/story-check.ts` checks that names are introduced before they are used and that every quest
  step names its own target.
  `tools/verify-copy.sh` runs the whole chain.
- **Positions** of NPCs, pickups and activities are checked against the real heightfield in
  `tests/content.test.ts`.

## Determinism and saves

The world is generated from `WORLD_SEED` (1337, `src/data/zones.ts`): the heightfield and the prop
scatter are seeded and pure, so the same seed gives the same valley.

Progress is saved to `localStorage` under `first-snow.save.v<SAVE_VERSION>`: every 30 s, on a zone
change, and on `pagehide` / tab hide. `core/progress/save.ts` validates on load and returns null
rather than throwing; a save from another version is ignored.

## Debug hook

`main.ts` exposes `window.__game` (step frames, drive input, teleport, measure the frame) only in dev
builds or when the page is served from localhost. The tools in `tools/` depend on it.

## Tests

`npx vitest run`: 212 tests in 21 files. They cover core gameplay only: player movement, stamina
and collision, terrain and spawn-to-summit connectivity, quest and achievement logic, save/load,
content integrity, the main story played through the real conversation path, the tutorial machine,
the next-step guide, each activity's rules, camera occlusion maths, prop scatter, render sizing, audio
scheduling safety, and the UI's pure models (toast queue, typewriter, journal). The rendered picture, layout and camera feel are not unit-tested; they are
checked with the browser tools and by eye.
