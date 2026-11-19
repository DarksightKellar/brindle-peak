# Brindle Peak — state

What the game is today, how it is checked, and what is known to be missing. Ongoing work and its
handoff notes live on the task board, `docs/board.html` (update it with `tools/board.py`).

## What is built

- **The story** runs start to finish: Nana → Bram's woodpile → batteries back to Nana, who gives Pip
  her lantern → Edda at the mast → dusk and the aurora photo → Edda's radio call reaches the valley →
  ending card → home to Nana. Four chained quests in `src/data/quests.ts`; `FINALE_QUEST` completing
  shows the ending. Once the mast quest is under way the valley eases to dusk over about a minute and
  the aurora rises (`src/game/render/dusk.ts`).
- **Errands:** 18 side quests across the seven zones, given by 18 NPCs.
- **Activities:** 22 posts. Races run through authored gate courses (`raceCourses.ts`); builds drop
  visible pieces that stay in the world (`buildSites.ts`); throws are aimed with A/D and fly as real
  projectiles (`throwSetups.ts`, `throwFlight.ts`); photos use a viewfinder at Pip's eye with
  authored subjects (`photoSubjects.ts`); fishing is a timing strike; skating is a balance meter;
  sledding is a downhill time trial. None can be failed in a way that costs progress.
- **Movement:** walk 6.5 u/s, sprint 13 u/s, jump, up to three flaps, glide, climbing; stamina
  grows with feathers. Props have colliders.
- **Guidance:** tutorial script (`docs/ONBOARDING.md`), goal line, compass and next-step line,
  journal with a map page (`docs/GUIDE.md`), opening card on a fresh save.
- **Camera:** leash follow, Q/R look, conversation two-shot, photo viewfinder
  (`docs/ART_BIBLE.md` §8).
- **Look:** 384×216 render, nearest upscale, edge and fog composite, colour grade, real-time
  shadows following Pip, footprints, falling snow.
- **Audio:** three recorded music tracks made with Lyria 3 Pro (`src/assets/music/`), one per part of
  the walk; every effect and the ambience (wind, water, birds) is synthesised as it plays.
- **Phones and tablets:** a stick, Action/Jump/Run buttons, drag to look, tap to interact
  (`src/game/touch.ts`); portrait keeps a 16:9 picture and asks to be turned sideways.
- **Credits:** at the foot of the journal's Settings page, with the three.js licence (`src/data/credits.ts`).
- **Saves:** `localStorage`, every 30 s, on zone change and when the page is hidden.

## How it is checked

| Check | Command | Covers |
|---|---|---|
| Unit tests | `npx vitest run` | 212 tests in 21 files, core gameplay only (see `docs/ARCHITECTURE.md`) |
| Types | `npm run typecheck` | strict TypeScript |
| Build | `npm run build` | production bundle |
| Copy | `tools/verify-copy.sh` | dialogue assembly, story check, tests, build |
| Browser | `npx vite-node tools/<name>.ts` | boots the real game headless and drives it through `window.__game` |

Browser harnesses worth knowing: `smoke` (boots and renders), `playtest` (talk, quest, feather,
activity), `first-five-minutes` (the tutorial end to end), `field-guide` (HUD lines name real
targets), `qa-regressions` and `controls-regressions` (earlier defects held down), `contact-sheet`
(one frame per zone, judged by `src/core/artgate.ts`). `route-walk`, `reward-cadence` and
`story-check` run in Node without a browser.

The browser tools run on SwiftShader, so their frame times mean nothing; `render-cost` reports draw
calls and triangles instead.

## Known gaps

- **Frame rate on real hardware** has not been measured, on a computer or a phone. Touch has only
  been tried in an emulated phone.
- **Music terms:** Google's Gemini API terms (which govern Lyria output through OpenRouter) say Google
  won't claim ownership, but may make similar music for others; check them before selling the game.
- The rest of the open items, and anything found since, are on `docs/board.html`.
