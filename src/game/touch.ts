/**
 * Touch controls for phones and tablets: a stick in the lower left for walking, Jump, Run and Action
 * in the lower right, Journal, Map and Pause in the upper right, and the view itself for the rest: a
 * drag turns it, a tap on a villager or a thing to do interacts with it, and a tap while someone is
 * talking moves the talk on.
 *
 * The buttons press the same keys the keyboard does (core/keys.ts), so the journal, the menu, the
 * dialogue and every activity answer them without knowing touch exists. Only the stick and the drag
 * are new to input (game/input.ts), because they are analog.
 *
 * The layer sits outside the game's box, over the whole screen: in landscape the controls lie over the
 * picture's corners; in portrait, where the picture keeps to 16:9, they sit in the space below it.
 */

import { BINDINGS, type Action } from '../core/keys';
import type { InputSource } from './input';

export type ScreenMode = 'dialogue' | 'journal' | 'menu' | 'ending' | 'activity' | 'play';

export interface TouchHost {
  input: InputSource;
  canvas: HTMLCanvasElement;
  mode(): ScreenMode;
  tapHits(x: number, y: number): boolean;
}

export interface TouchControls {
  /** Show the controls that fit what has the screen now. Call once a frame. */
  update(): void;
}

/** Press or release an action's first key, as the keyboard would. */
export function pressKey(action: Action, down: boolean): void {
  const key = BINDINGS[action][0];
  if (key === undefined) return;
  window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { key, bubbles: true }));
}

/** A press and release, for taps. */
export function tapKey(action: Action): void {
  pressKey(action, true);
  pressKey(action, false);
}

/** Keep a finger's events on the control it started on; a browser that refuses still works, just loosely. */
function capture(el: Element, id: number): void {
  try {
    el.setPointerCapture(id);
  } catch {
    /* not a live pointer */
  }
}

/** A touch that moved less than this, CSS pixels, and was quick, is a tap rather than a drag. */
const TAP_SLOP = 12;
const TAP_MS = 450;
/** The stick's travel, as a share of its base's radius, before it reads full. */
const STICK_REACH = 0.75;
/** Below this the stick reads as centred. */
const STICK_DEAD = 0.12;

const html = (
  '<div class="touch__stick" aria-label="Walk"><div class="touch__knob"></div></div>' +
  '<div class="touch__acts">' +
  '<button class="touch__btn touch__btn--run" data-hold="sprint" type="button">Run</button>' +
  '<button class="touch__btn touch__btn--act" data-hold="interact" type="button">Action</button>' +
  '<button class="touch__btn touch__btn--jump" data-hold="jump" type="button">Jump</button>' +
  '</div>' +
  '<div class="touch__menu">' +
  '<button class="touch__btn touch__btn--sm" data-tap="journal" type="button">Journal</button>' +
  '<button class="touch__btn touch__btn--sm" data-tap="map" type="button">Map</button>' +
  '<button class="touch__btn touch__btn--sm" data-tap="pause" type="button">Pause</button>' +
  '<button class="touch__btn touch__btn--sm touch__full" type="button" aria-label="Full screen">⛶</button>' +
  '</div>'
);

export function createTouchControls(host: TouchHost): TouchControls {
  document.documentElement.dataset.touch = 'on';
  const root = document.createElement('div');
  root.className = 'touch';
  root.innerHTML = html;
  document.body.appendChild(root);

  const hint = document.createElement('div');
  hint.className = 'turn-hint';
  hint.innerHTML = '<span class="turn-hint__phone"></span><p>Turn your phone sideways to play.</p>';
  document.body.appendChild(hint);

  // No long-press menus, text selection or double-tap zoom anywhere in the game.
  window.addEventListener('contextmenu', (e) => e.preventDefault());

  // ── Buttons ─────────────────────────────────────────────────────────────────────────────────
  for (const b of root.querySelectorAll<HTMLButtonElement>('[data-hold]')) {
    const action = b.dataset.hold as Action;
    let held: number | null = null;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (held !== null) return;
      held = e.pointerId;
      capture(b, e.pointerId);
      b.classList.add('is-down');
      pressKey(action, true);
    });
    const up = (e: PointerEvent): void => {
      if (held !== e.pointerId) return;
      held = null;
      b.classList.remove('is-down');
      pressKey(action, false);
    };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
  }
  for (const b of root.querySelectorAll<HTMLButtonElement>('[data-tap]')) {
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      tapKey(b.dataset.tap as Action);
    });
  }
  const full = root.querySelector('.touch__full') as HTMLButtonElement;
  if (!document.fullscreenEnabled) full.hidden = true;
  full.addEventListener('click', () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
      return;
    }
    void document.documentElement.requestFullscreen({ navigationUI: 'hide' })
      .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
      .catch(() => undefined);
  });

  // ── Stick ───────────────────────────────────────────────────────────────────────────────────
  const stick = root.querySelector('.touch__stick') as HTMLElement;
  const knob = root.querySelector('.touch__knob') as HTMLElement;
  let stickId: number | null = null;
  const moveStick = (e: PointerEvent): void => {
    const r = stick.getBoundingClientRect();
    const radius = (r.width / 2) * STICK_REACH;
    let x = (e.clientX - (r.left + r.width / 2)) / radius;
    let y = (e.clientY - (r.top + r.height / 2)) / radius;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    knob.style.transform = `translate(${x * radius}px, ${y * radius}px)`;
    const on = Math.hypot(x, y) > STICK_DEAD;
    host.input.setStick(on ? x : 0, on ? -y : 0);
  };
  const releaseStick = (e: PointerEvent): void => {
    if (stickId !== e.pointerId) return;
    stickId = null;
    knob.style.transform = '';
    stick.classList.remove('is-down');
    host.input.setStick(0, 0);
  };
  stick.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (stickId !== null) return;
    stickId = e.pointerId;
    capture(stick, e.pointerId);
    stick.classList.add('is-down');
    moveStick(e);
  });
  stick.addEventListener('pointermove', (e) => {
    if (e.pointerId === stickId) moveStick(e);
  });
  stick.addEventListener('pointerup', releaseStick);
  stick.addEventListener('pointercancel', releaseStick);

  // ── The view: drag to look, tap to interact ────────────────────────────────────────────────
  const { canvas } = host;
  let viewId: number | null = null;
  let startX = 0, startY = 0, lastX = 0, startT = 0, travelled = 0;
  canvas.addEventListener('pointerdown', (e) => {
    if (viewId !== null) return;
    viewId = e.pointerId;
    capture(canvas, e.pointerId);
    startX = lastX = e.clientX;
    startY = e.clientY;
    startT = performance.now();
    travelled = 0;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== viewId) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    travelled = Math.max(travelled, Math.hypot(e.clientX - startX, e.clientY - startY));
    // Until the finger has clearly moved it may still be a tap, so the view waits.
    if (travelled > TAP_SLOP) host.input.addLookDrag(dx);
  });
  const viewUp = (e: PointerEvent): void => {
    if (e.pointerId !== viewId) return;
    viewId = null;
    if (e.type !== 'pointerup' || travelled > TAP_SLOP || performance.now() - startT > TAP_MS) return;
    const mode = host.mode();
    if (mode === 'dialogue' || mode === 'ending') {
      tapKey('interact');
      return;
    }
    if (mode !== 'play') return;
    const r = canvas.getBoundingClientRect();
    if (host.tapHits(e.clientX - r.left, e.clientY - r.top)) tapKey('interact');
  };
  canvas.addEventListener('pointerup', viewUp);
  canvas.addEventListener('pointercancel', viewUp);

  // Panels over the view take taps too: the talk moves on, and the ending card lets you keep wandering.
  // A choice is picked by the dialogue itself (ui/dialogue.ts), so a tap on one is left to it.
  document.getElementById('ui')?.addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    if (el.closest('.ui-dlg__choice')) return;
    if (el.closest('.ui-dlg') || (el.closest('.ui-ending') && !el.closest('button'))) tapKey('interact');
  });

  let shown = '';
  return {
    update(): void {
      const mode = host.mode();
      if (mode === shown) return;
      shown = mode;
      root.dataset.mode = mode;
      // A held control under an overlay that hides it would stay held; let go of everything.
      if (mode === 'journal' || mode === 'menu' || mode === 'dialogue' || mode === 'ending') {
        host.input.setStick(0, 0);
        knob.style.transform = '';
        stickId = null;
      }
    },
  };
}
