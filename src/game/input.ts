/**
 * DOM input sampling. The only module allowed to listen to the keyboard and pointer for
 * gameplay purposes; it produces a plain `InputFrame` and nothing else, so everything
 * downstream stays testable.
 *
 * Edge-triggered actions (`jumpPressed`, `interactPressed`, `cancelPressed`) are latched on
 * keydown and cleared by `sample()`. If two frames elapse between presses the second is not
 * lost — the latch survives until it is read.
 */

import type { InputFrame } from '../core/contracts';
import { emptyInput } from '../core/contracts';

export interface InputSource {
  /** Read and clear the accumulated frame. Call exactly once per frame. */
  sample(camYaw: number): InputFrame;
  /** Manual look axis right now: -1 (Q, turn left) .. +1 (R, turn right). */
  readonly lookX: number;
  destroy(): void;
}

const MOVE_KEYS: Record<string, [number, number]> = {
  w: [0, 1],
  arrowup: [0, 1],
  s: [0, -1],
  arrowdown: [0, -1],
  a: [-1, 0],
  arrowleft: [-1, 0],
  d: [1, 0],
  arrowright: [1, 0],
};

/*
 * Manual look. Q and R sit either side of W and E, so the left hand never leaves the movement keys,
 * and both are otherwise unused. E would be the usual partner of Q, but E is interact. The arrows stay
 * movement keys: the pause menu, the journal and dialogue choices all read them as the move axes.
 */
const LOOK_KEYS: Record<string, number> = { q: -1, r: 1 };

const JUMP_KEYS = new Set([' ', 'spacebar', 'space']);
const INTERACT_KEYS = new Set(['e', 'enter']);
const SPRINT_KEYS = new Set(['shift']);
const CANCEL_KEYS = new Set(['escape']);

export function createInput(canvas: HTMLCanvasElement): InputSource {
  const down = new Set<string>();
  /*
   * A tap shorter than a frame used to vanish: keydown and keyup both landed before \sample()\, so the
   * move axes never saw it, and an arrow tapped in the pause menu did nothing. A key released before it
   * was sampled now stays down until the frame after it was read.
   */
  const unread = new Set<string>();
  const releaseAfterSample = new Set<string>();
  let jumpPressed = false;
  let interactPressed = false;
  let cancelPressed = false;

  const onKeyDown = (e: KeyboardEvent): void => {
    const k = e.key.toLowerCase();
    // Do not swallow browser-level shortcuts the player may need.
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (MOVE_KEYS[k] || LOOK_KEYS[k] || JUMP_KEYS.has(k) || INTERACT_KEYS.has(k) || SPRINT_KEYS.has(k) || CANCEL_KEYS.has(k)) {
      e.preventDefault();
    }
    releaseAfterSample.delete(k);
    if (down.has(k)) return; // ignore auto-repeat; jump must be an explicit re-press
    down.add(k);
    unread.add(k);
    if (JUMP_KEYS.has(k)) jumpPressed = true;
    if (INTERACT_KEYS.has(k)) interactPressed = true;
    if (CANCEL_KEYS.has(k)) cancelPressed = true;
  };

  const onKeyUp = (e: KeyboardEvent): void => {
    const k = e.key.toLowerCase();
    if (unread.has(k)) releaseAfterSample.add(k);
    else down.delete(k);
  };

  const onBlur = (): void => {
    // Losing focus must not leave a key stuck down.
    down.clear();
    unread.clear();
    releaseAfterSample.clear();
  };

  // No mouse in the game: the pointer is hidden over the play surface, so it cannot invite a drag that
  // no longer exists. Overlays (journal, menu) are their own elements and keep their cursor.
  canvas.style.cursor = 'none';

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  const isDown = (...keys: string[]): boolean => keys.some((k) => down.has(k));
  const lookAxis = (): number => {
    let x = 0;
    for (const k of down) x += LOOK_KEYS[k] ?? 0;
    return x;
  };

  return {
    /*
     * Look is keys only. The mouse used to drive it (1 radian per 320 px of drag) and it fought the
     * follow rig: drags stacked into a spin. A held key is an axis the rig turns at a fixed rate, and
     * move.ts re-resolves the walking direction while it is held, so walking and looking agree.
     */
    get lookX(): number {
      return lookAxis();
    },
    sample(camYaw: number): InputFrame {
      let mx = 0;
      let mz = 0;
      for (const k of down) {
        const v = MOVE_KEYS[k];
        if (v) {
          mx += v[0];
          mz += v[1];
        }
      }
      // Normalise so diagonals are not faster than cardinals.
      const len = Math.hypot(mx, mz);
      if (len > 1) {
        mx /= len;
        mz /= len;
      }
      const frame: InputFrame = {
        ...emptyInput(camYaw),
        moveX: mx,
        moveZ: mz,
        jumpPressed,
        jumpHeld: isDown(' ', 'spacebar', 'space'),
        sprintHeld: isDown('shift'),
        interactPressed,
        cancelPressed,
        lookX: lookAxis(),
      };
      jumpPressed = false;
      interactPressed = false;
      cancelPressed = false;
      unread.clear();
      for (const k of releaseAfterSample) down.delete(k);
      releaseAfterSample.clear();
      return frame;
    },
    destroy(): void {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    },
  };
}
