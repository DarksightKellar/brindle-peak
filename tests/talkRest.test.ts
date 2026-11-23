import { describe, expect, it } from 'vitest';
import { createGameState, emptyInput } from '../src/core/contracts';
import { createFrameInput, TALK_STAY } from '../src/game/session/frameInput';

/** A frame router over a stand-in conversation, counting presses that reach the world. */
function rig() {
  const state = createGameState({ x: 0, y: 0, z: 0 }, 6);
  let talking = true;
  let reached = 0;
  const shut = { isOpen: () => false };
  const ui = {
    dialogue: { isOpen: () => talking, selectChoice: () => undefined },
    journal: shut, menu: shut,
    ending: { isOpen: () => false, dismissable: () => false, hide: () => undefined },
    hud: { setHeld: () => undefined },
  };
  const route = createFrameInput({
    ui: ui as never,
    flow: { advance: () => { talking = false; }, close: () => { talking = false; } } as never,
    runner: { isRunning: () => false, freeRoam: () => true } as never,
    interact: () => { reached++; },
    state,
  });
  const frame = (press = false): void => { route({ ...emptyInput(0), interactPressed: press }, 1 / 60); };
  return { state, frame, reached: () => reached };
}

describe('pressing on past the last line', () => {
  it('does not reopen the talk while Pip stands where it ended, until a longer pause', () => {
    const r = rig();
    r.frame(true); // the last line's E closes the talk
    for (let i = 0; i < 72; i++) r.frame(); // 1.2 s
    r.frame(true);
    expect(r.reached()).toBe(0);
    for (let i = 0; i < Math.ceil(TALK_STAY * 60); i++) r.frame();
    r.frame(true);
    expect(r.reached()).toBe(1);
  });

  it('lets E through after the short rest once Pip has stepped away', () => {
    const r = rig();
    r.frame(true);
    r.state.player.pos = { x: 1, y: 0, z: 0 };
    for (let i = 0; i < 72; i++) r.frame();
    r.frame(true);
    expect(r.reached()).toBe(1);
  });
});

describe('closing the journal (critic round 115 found itself talking to Wren)', () => {
  it('keeps an F that lands with the closing key out of the world, and lets the next one through', () => {
    const state = createGameState({ x: 0, y: 0, z: 0 }, 6);
    let open = true;
    let reached = 0;
    const ui = {
      dialogue: { isOpen: () => false, selectChoice: () => undefined },
      journal: { isOpen: () => open, activate: () => undefined, select: () => false, scroll: () => undefined, turnPage: () => undefined },
      menu: { isOpen: () => false },
      ending: { isOpen: () => false, dismissable: () => false, hide: () => undefined },
      hud: { setHeld: () => undefined },
    };
    const route = createFrameInput({
      ui: ui as never,
      flow: { advance: () => undefined, close: () => undefined } as never,
      runner: { isRunning: () => false, freeRoam: () => true } as never,
      interact: () => { reached++; },
      state,
    });
    const frame = (press = false): void => { route({ ...emptyInput(0), interactPressed: press }, 1 / 60); };
    frame();
    open = false; // Tab closed it between frames, with F down in the same gap
    frame(true);
    expect(reached).toBe(0);
    frame(true);
    expect(reached).toBe(1);
  });
});
