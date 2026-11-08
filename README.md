# Brindle Peak

A small, cozy winter exploration game for the browser, built on three.js. You play Pip, a snow
bunting who has come to spend the winter at Nana Quill's cabin. The valley radio has gone quiet, and
fixing it takes Pip across the valley and up to the radio mast on Brindle Peak.

## Run

```bash
npm install
npm run dev                        # http://127.0.0.1:5180
npm run build && npm run preview   # http://127.0.0.1:4180
```

## Controls

Keyboard only. There is no mouse look and no drag; the pointer is hidden over the game.

| Key | Does |
|---|---|
| `WASD` / arrows | move |
| `Space` | jump; again in the air to flap; hold while falling to glide |
| `Shift` | sprint |
| `E` / `Enter` | interact, advance dialogue |
| `Q` / `R` | turn the camera left / right |
| `Esc` | pause menu; closes whatever overlay is open |
| `Tab` / `J` | journal |
| `M` | map (a page of the journal) |

In dialogue, `A`/`D` pick a choice. In the pause menu and journal, the arrows move and change values
and `Enter` selects. There is no fail state.

## The game

- **Story.** Nana asks Pip to fetch spare batteries from Bram, who first wants his woodpile stacked
  straight. Nana then gives Pip her lantern, which lights the trail posts up the mountain. Pip takes
  the batteries to Edda at the mast on Brindle Peak; dusk falls, Pip photographs the aurora, and
  Edda's radio reaches the whole valley. An ending card follows, and the last step is going home to
  Nana. Optional errands fill the seven zones.
- **Activities.** Gate-to-gate races on authored courses, builds that place pieces in the world,
  aimed throws, a photo viewfinder with authored subjects, fishing, skating (a balance meter) and
  sledding.
- **Content.** 7 zones, 18 NPCs, 22 quests (4 story, 18 errands), 22 activities, 14 feathers,
  60 bells, 12 lantern posts, 20 achievements, 6 fish.
- **Tech.** three.js 0.186, TypeScript, Vite. No asset files: every mesh is built in code and every
  sound is synthesised at runtime. The scene renders at 384×216 and is upscaled with nearest
  filtering (`src/game/render/pixelPipeline.ts`).

## Checks

```bash
npm test             # 212 unit tests (vitest) covering core gameplay
npm run typecheck    # tsc --noEmit
npm run build
```

`tools/` holds browser harnesses (Playwright, headless Chromium on SwiftShader) run with
`npx vite-node tools/<name>.ts` against a running server. They drive the `window.__game` debug hook,
which exists only in dev builds or when the game is served from localhost. Most default to a dev
server on `127.0.0.1:5182` (`npx vite --port 5182`); `smoke`, `playtest`, `qa-regressions` and
`contact-sheet` default to the preview server on 4180. `GAME_URL` overrides either.

After editing dialogue, run `tools/verify-copy.sh`: it reassembles `src/data/dialogue.ts` from
`src/data/dialogue.parts/*.json`, checks the story, and runs the tests and the build.

## Docs

| | |
|---|---|
| `docs/board.html` | the task board for ongoing work; update it with `python tools/board.py patch.json` |
| `docs/STATE.md` | what is built, how it is checked, and what is known to be missing |
| `docs/ARCHITECTURE.md` | layers, house rules, frame order |
| `docs/ONBOARDING.md` | the tutorial script for the first five minutes |
| `docs/GUIDE.md` | the goal line, next-step line, compass and map |
| `docs/STORY.md`, `docs/BEATS.md` | the story and the writers' brief |
| `docs/ART_BIBLE.md` | render contract, palette, camera |

The other files in `docs/` are reports from earlier review passes. They describe the build as it was
when they were written.
