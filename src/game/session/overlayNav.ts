/**
 * Arrow keys, Enter and Space inside the pause menu and the journal.
 *
 * The game is keyboard-only, and these two panels were the last things that still needed a pointer.
 * They read the same input frame the world does — WASD and the arrows arrive as the move axes, E and
 * Enter as interact, Space as jump — so there is no second keyboard listener to fight the first, and
 * the session already holds Pip still while either panel is up.
 *
 * The axes are levels, and the input layer drops key auto-repeat, so repeat is made here: one step on
 * the press, then a steady step while held. A key already held when a panel opens does nothing until
 * it is let go, or walking into Esc would scroll the menu on the way in.
 */

import type { InputFrame } from '../../core/contracts';
import type { Presentation } from './presentation';

const REPEAT_DELAY = 0.38;
const REPEAT_EVERY = 0.11;
/** Journal scroll per Up/Down step: about three list rows, so a tap is visible and a hold reads as a glide. */
const SCROLL_STEP = 48;

interface Axis {
  sign: number;
  /** Seconds-clock time of the next repeat; Infinity while a carried-in hold is waiting for release. */
  next: number;
}

const signOf = (v: number): number => (Math.abs(v) > 0.5 ? Math.sign(v) : 0);

/** One step on press and on each repeat tick, else 0. */
function pulse(a: Axis, v: number, now: number): number {
  const sign = signOf(v);
  if (sign !== a.sign) {
    a.sign = sign;
    a.next = now + REPEAT_DELAY;
    return sign;
  }
  if (sign === 0 || now < a.next) return 0;
  a.next = now + REPEAT_EVERY;
  return sign;
}

/** Routes one frame's presses into whichever of the two panels is open. */
export type OverlayNav = (input: InputFrame, ui: Presentation) => boolean;

/**
 * One per session: the repeat timers and the carried-in hold belong to this run's panels, not to the
 * module. Returns false, and touches nothing, when neither panel is open.
 */
export function createOverlayNav(): OverlayNav {
  const axisX: Axis = { sign: 0, next: 0 };
  const axisZ: Axis = { sign: 0, next: 0 };
  let wasOpen = false;
  return (input, ui) => {
    const open = ui.menu.isOpen() || ui.journal.isOpen();
    if (!open) {
      wasOpen = false;
      return false;
    }
    if (!wasOpen) {
      wasOpen = true;
      axisX.sign = signOf(input.moveX);
      axisZ.sign = signOf(input.moveZ);
      axisX.next = axisZ.next = Infinity;
    }

    const now = performance.now() / 1000;
    const x = pulse(axisX, input.moveX, now);
    // Forward (W, Up) is +Z, and up the list is the previous row or the top of the page.
    const z = pulse(axisZ, input.moveZ, now);
    if (ui.menu.isOpen()) {
      if (z !== 0) ui.menu.move(-z);
      if (x !== 0) ui.menu.adjust(x);
      if (input.interactPressed) ui.menu.activate('interact');
      else if (input.jumpPressed) ui.menu.activate('jump');
      return true;
    }

    if (x !== 0) ui.journal.turnPage(x);
    if (z !== 0) ui.journal.scroll(-z * SCROLL_STEP);
    return true;
  };
}
