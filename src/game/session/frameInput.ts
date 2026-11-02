/**
 * Where a frame's presses go, and whether the world should move at all.
 *
 * This was the first twenty lines of `session.update`, and it is the most order-sensitive part of the
 * frame: the ending must be dismissed before `interact` runs, or the press that closes the summit card
 * also talks to the mast behind it; a conversation must consume E before the world sees it, or one tap
 * both advances dialogue and picks something up. The pause menu and the journal come between the two:
 * above a conversation, below the summit card.
 *
 * Pulling it out gives that ordering a name and a home, and lets it be reasoned about without the
 * player, the renderer or the audio kit in scope.
 */

import type { InputFrame } from '../../core/contracts';
import type { ActivityRunner } from './activityRunner';
import type { DialogueFlow } from './dialogueFlow';
import type { Presentation } from './presentation';
import { createOverlayNav } from './overlayNav';

export interface FrameInputDeps {
  ui: Presentation;
  flow: DialogueFlow;
  runner: ActivityRunner;
  /** Act on the world: talk, pick up, start an activity. */
  interact(): void;
}

/**
 * Routes this frame's presses, and reports whether the world is held still.
 *
 * `blocked` means the player must not move, collect or interact this frame — an overlay is up, or an
 * activity that is not free-roam is running. It does not mean time stops: playtime advances either way.
 */
export type FrameInput = (input: InputFrame) => boolean;

/** One per session, so the edge memory below belongs to this run rather than to the module. */
export function createFrameInput(d: FrameInputDeps): FrameInput {
  const { ui } = d;
  const routeOverlayNav = createOverlayNav();
  /**
   * Last horizontal direction seen, so holding A or D moves the highlight once instead of cycling the
   * options at frame rate. Dialogue selection is an edge, not a level.
   */
  let lastChoiceSign = 0;

  return (input) => {
    const blocked = ui.dialogue.isOpen() || ui.journal.isOpen() || ui.menu.isOpen()
      || ui.ending.isOpen() || (d.runner.isRunning() && !d.runner.freeRoam());

    // Dismiss the ending first, so the press that closes it does not also interact with the mast. A press
    // in its first moments is swallowed, not taken (ending.ts `dismissable`): it was the dialogue's E.
    const endingTook = ui.ending.isOpen() && (input.interactPressed || input.cancelPressed);
    if (endingTook && ui.ending.dismissable()) ui.ending.hide();

    /*
     * Then the pause menu and the journal, which sit above any conversation: their keys are theirs, and
     * an E that picks a menu row must not also advance the line behind it. The press that closed the
     * ending is spent and does not reach them.
     */
    if (ui.menu.isOpen() || ui.journal.isOpen()) {
      lastChoiceSign = 0;
      routeOverlayNav(endingTook ? { ...input, interactPressed: false } : input, ui);
      return blocked;
    }
    routeOverlayNav(input, ui); // closed: only lets it forget the last hold

    if (ui.dialogue.isOpen() && input.cancelPressed) {
      lastChoiceSign = 0;
      d.flow.close();
    } else if (ui.dialogue.isOpen()) {
      /*
       * Up/down (W/S, the arrows) pick options, as the pause menu teaches with "↑↓ choose", and A/D and
       * left/right still do: the choices stack as a list, so down and right both mean "the next one".
       * The mouse used to be the only way to choose, and then E silently took the first option.
       */
      const axis = Math.abs(input.moveZ) > 0.5 ? -Math.sign(input.moveZ) : Math.abs(input.moveX) > 0.5 ? Math.sign(input.moveX) : 0;
      if (axis !== 0 && axis !== lastChoiceSign) ui.dialogue.selectChoice(axis);
      lastChoiceSign = axis;
      if (input.interactPressed) d.flow.advance();
    } else {
      lastChoiceSign = 0;
      if (!blocked && input.interactPressed) d.interact();
    }

    // The goal line and the compass wait for the conversation to end (hud.ts `setHeld`). Set after the
    // presses, so the frame a conversation opens on is already held and the frame it closes on is not.
    ui.hud.setHeld(ui.dialogue.isOpen());
    return blocked;
  };
}
