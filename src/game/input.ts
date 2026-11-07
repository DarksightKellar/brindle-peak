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
import { BINDINGS } from '../core/keys';

export interface InputSource {
  /** Read and clear the accumulated frame. Call exactly once per frame. */
  sample(camYaw: number): InputFrame;
  /** Manual look axis right now: -1 (turn left) .. +1 (turn right); keys in core/keys.ts. */
  readonly lookX: number;
  /** The touch stick: x right, y forward, each -1..1; 0, 0 when let go. */
  setStick(x: number, y: number): void;
  /** A drag across the view, in CSS pixels since the last call (positive turns the view right). */
  addLookDrag(dx: number): void;
  destroy(): void;
}

/** A drag of this many CSS pixels turns the view one radian. */
const DRAG_PX_PER_RADIAN = 260;
/** The heading rig turns look x 1.65 rad/s (camera/heading.ts LOOK_RATE); a drag asks for its own speed. */
const LOOK_RATE = 1.65;
/** The most a drag may ask for, in look units: a flick, not a spin. */
const DRAG_LOOK_MAX = 5;

// Every binding comes from core/keys.ts, the same table the on-screen hints name keys from.
const axis = (keys: readonly string[], v: [number, number]): [string, [number, number]][] => keys.map((k) => [k, v]);
const MOVE_KEYS: Record<string, [number, number]> = Object.fromEntries([
  ...axis(BINDINGS.up, [0, 1]),
  ...axis(BINDINGS.down, [0, -1]),
  ...axis(BINDINGS.left, [-1, 0]),
  ...axis(BINDINGS.right, [1, 0]),
]);

/*
 * Manual look, either side of W, so the left hand never leaves the movement keys. The arrows stay
 * movement keys: the pause menu, the journal and dialogue choices all read them as the move axes.
 */
const LOOK_KEYS: Record<string, number> = Object.fromEntries([
  ...BINDINGS.lookLeft.map((k): [string, number] => [k, -1]),
  ...BINDINGS.lookRight.map((k): [string, number] => [k, 1]),
]);

const JUMP_KEYS = new Set(BINDINGS.jump);
const INTERACT_KEYS = new Set(BINDINGS.interact);
const SPRINT_KEYS = new Set(BINDINGS.sprint);
const CANCEL_KEYS = new Set(BINDINGS.pause);

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
  let stickX = 0;
  let stickY = 0;
  let dragDx = 0;
  let dragLook = 0;
  let lastSample = performance.now();

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
    let x = dragLook;
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
    setStick(x: number, y: number): void {
      stickX = x;
      stickY = y;
    },
    addLookDrag(dx: number): void {
      dragDx += dx;
    },
    sample(camYaw: number): InputFrame {
      // The drag since the last frame becomes a turning speed for this one, so the view keeps up with
      // the finger and stops when it stops.
      const now = performance.now();
      const elapsed = Math.max(1 / 240, (now - lastSample) / 1000);
      lastSample = now;
      const want = dragDx / DRAG_PX_PER_RADIAN / elapsed / LOOK_RATE;
      dragLook = Math.max(-DRAG_LOOK_MAX, Math.min(DRAG_LOOK_MAX, want));
      dragDx = 0;
      let mx = stickX;
      let mz = stickY;
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
        jumpHeld: isDown(...JUMP_KEYS),
        sprintHeld: isDown(...SPRINT_KEYS),
        interactPressed,
        interactHeld: [...INTERACT_KEYS].some((k) => down.has(k)),
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
