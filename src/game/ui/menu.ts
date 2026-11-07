/**
 * Pause menu — the settings surface (GDD §8): pixel size, master/music volume, reduce motion,
 * plus the key list. The journal shows these values read-only; the controls live here because
 * this module owns the callbacks.
 *
 * No global key listener: the host routes Esc to `toggle()` and the arrows, Enter and Space to
 * `move`/`adjust`/`activate` (session/overlayNav.ts), so one key never fights the journal for the
 * same event. The game has no mouse; the click handlers stay only because they are harmless.
 */

import { PIXEL_SIZE_OPTIONS } from '../render/pixelConfig';
import { KEY, TOUCH } from '../../core/keys';

/** Menu-facing alias of the single render-layer list; there must not be a second copy. */
export const PIXEL_SIZES: readonly number[] = PIXEL_SIZE_OPTIONS;

export interface Menu {
  toggle(): void;
  isOpen(): boolean;
  /** Up/down: move the selection one row (`-1` up, `1` down). Stops at the ends. */
  move(dir: number): void;
  /** Left/right: nudge the selected row's value (`-1` less, `1` more). */
  adjust(dir: number): void;
  /** Act on the selected row. `key` names the press, so reset can ask for the same key twice. */
  activate(key: string): void;
  /** What the controls are set to right now, for anything that has to report them. */
  readSettings(): { pixelSize: number; master: number; music: number; reduceMotion: boolean };
  onSetPixelSize(cb: (n: number) => void): void;
  onSetVolume(cb: (master: number, music: number) => void): void;
  destroy(): void;
}

const RESET_LABEL = 'Reset progress';

/** The controls, as the pause menu lists them. Every key named comes from core/keys.ts, the table input listens to. */
const KEY_LIST =
  '<ul class="ui-keys">' +
  `<li><b>${KEY.walk.replace(/ /g, '')}</b><span>walk</span></li>` +
  `<li><b>${KEY.jump}</b><span>jump · flap · glide</span></li>` +
  `<li><b>${KEY.sprint}</b><span>sprint</span></li>` +
  `<li><b>${KEY.look}</b><span>look</span></li>` +
  `<li><b>${KEY.interact}</b><span>interact</span></li>` +
  `<li><b>${KEY.pause}</b><span>pause</span></li>` +
  `<li><b>${KEY.journalAll}</b><span>journal</span></li>` +
  `<li><b>${KEY.map}</b><span>map</span></li>` +
  // What the journal's pages do with the keys: critic round 33 found them only by reading the pages.
  `<li><b>↑↓ ${KEY.interact}</b><span>map: travel</span></li>` +
  `<li><b>↑↓ ${KEY.interact}</b><span>quests: follow</span></li>` +
  '</ul>' +
  `<p class="ui-menu__hint">↑↓ choose · ←→ change · ${KEY.interact} select · ${KEY.pause} close</p>`;

/** On a touch screen: the stick, the buttons, and what a finger does on the view (game/touch.ts). */
const TOUCH_LIST =
  '<ul class="ui-keys">' +
  '<li><b>Stick</b><span>walk</span></li>' +
  '<li><b>Drag</b><span>look around</span></li>' +
  '<li><b>Jump</b><span>jump · flap · glide</span></li>' +
  '<li><b>Run</b><span>sprint</span></li>' +
  '<li><b>Tap</b><span>talk to someone, or try a thing</span></li>' +
  '<li><b>Action</b><span>the same, and in activities</span></li>' +
  '<li><b>Map</b><span>tap a walked place to go there</span></li>' +
  '<li><b>Journal</b><span>tap an errand to follow it</span></li>' +
  '</ul>';

/**
 * `onReset` wipes saved progress and starts over. The player asked for a way back to a clean run, and a
 * save file you cannot clear is a trap — especially in a game whose whole loop is "find the things".
 */
export function createMenu(root: HTMLElement, onReset?: () => void): Menu {
  const layer = document.createElement('div');
  layer.className = 'ui-menu';
  layer.hidden = true;
  layer.innerHTML =
    '<section class="panel ui-menu__panel" role="dialog" aria-label="Paused"><div class="panel__in">' +
    '<h2 class="ui-menu__title">First Snow</h2>' +
    '<p class="ui-menu__sub">Paused</p>' +
    '<button class="ui-btn ui-menu__resume" type="button">Resume</button>' +
    '<div class="ui-menu__group ui-menu__nav"><span class="ui-menu__label">Pixel size</span>' +
    '<div class="ui-sizes" role="group" aria-label="Pixel size"></div></div>' +
    '<label class="ui-slider ui-menu__nav"><span>Master</span>' +
    '<input class="ui-slider__master" type="range" min="0" max="100" step="5" value="80"></label>' +
    '<label class="ui-slider ui-menu__nav"><span>Music</span>' +
    '<input class="ui-slider__music" type="range" min="0" max="100" step="5" value="60"></label>' +
    '<label class="ui-toggle ui-menu__nav"><input class="ui-toggle__motion" type="checkbox">' +
    '<span>Reduce motion</span></label>' +
    (TOUCH ? TOUCH_LIST : KEY_LIST) +
    // Far from Resume, and quiet: critic round 4 found it one row under the button a pause is for.
    `<button class="ui-btn ui-menu__reset" type="button">${RESET_LABEL}</button>` +
    '</div></section>';
  root.appendChild(layer);

  const sizes = layer.querySelector('.ui-sizes') as HTMLElement;
  const master = layer.querySelector('.ui-slider__master') as HTMLInputElement;
  const music = layer.querySelector('.ui-slider__music') as HTMLInputElement;
  const motion = layer.querySelector('.ui-toggle__motion') as HTMLInputElement;
  const resume = layer.querySelector('.ui-menu__resume') as HTMLButtonElement;
  const reset = layer.querySelector('.ui-menu__reset') as HTMLButtonElement;

  let pixel = 5;
  let sizeCb: ((n: number) => void) | null = null;
  let volCb: ((master: number, music: number) => void) | null = null;

  const setPixel = (n: number): void => {
    pixel = n;
    for (const [i, size] of PIXEL_SIZES.entries()) {
      buttons[i].setAttribute('aria-pressed', String(size === n));
      buttons[i].classList.toggle('is-on', size === n);
    }
    sizeCb?.(n);
  };

  const buttons = PIXEL_SIZES.map((n) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ui-size';
    b.textContent = `${n}×`;
    b.setAttribute('aria-pressed', String(n === pixel));
    b.addEventListener('click', () => setPixel(n));
    if (n === pixel) b.classList.add('is-on');
    sizes.appendChild(b);
    return b;
  });

  const volume = (): void => {
    volCb?.(Number(master.value) / 100, Number(music.value) / 100);
  };
  const setMotion = (on: boolean): void => {
    motion.checked = on;
    document.documentElement.dataset.reduceMotion = on ? 'on' : 'off';
  };
  master.addEventListener('input', volume);
  music.addEventListener('input', volume);
  motion.addEventListener('change', () => setMotion(motion.checked));

  // Rows in key order. The key list is not a row: it is reading, not a control.
  const rows = [resume, ...Array.from(layer.querySelectorAll('.ui-menu__nav')), reset] as HTMLElement[];
  const RESUME = rows.indexOf(resume);
  let sel = RESUME;
  // Which key armed the wipe; empty when it is not armed.
  let armedBy = '';

  const disarm = (): void => {
    armedBy = '';
    delete reset.dataset.armed;
    reset.textContent = RESET_LABEL;
  };
  const select = (i: number): void => {
    if (i !== sel) disarm();
    sel = i;
    for (const [j, r] of rows.entries()) r.classList.toggle('is-sel', j === i);
  };
  const close = (): void => {
    layer.hidden = true;
    disarm();
  };
  const pressReset = (key: string): void => {
    // Two-step, because this throws away a run: the label becomes the confirmation, and only the
    // same key pressed again confirms it.
    if (armedBy !== key) {
      armedBy = key;
      reset.dataset.armed = '1';
      reset.textContent = 'Really? Press again to reset';
      return;
    }
    onReset?.();
  };
  const nudge = (el: HTMLInputElement, dir: number): void => {
    el.value = String(Math.max(0, Math.min(100, Number(el.value) + dir * Number(el.step))));
    volume();
  };

  resume.addEventListener('click', close);
  reset.addEventListener('click', () => pressReset('click'));
  select(RESUME);

  return {
    move(dir: number): void {
      select(Math.max(0, Math.min(rows.length - 1, sel + Math.sign(dir))));
    },
    adjust(dir: number): void {
      const row = rows[sel];
      if (row.contains(sizes)) {
        const i = PIXEL_SIZES.indexOf(pixel) + Math.sign(dir);
        if (i >= 0 && i < PIXEL_SIZES.length) setPixel(PIXEL_SIZES[i]);
      } else if (row.contains(master)) nudge(master, dir);
      else if (row.contains(music)) nudge(music, dir);
      else if (row.contains(motion)) setMotion(dir > 0);
    },
    activate(key: string): void {
      const row = rows[sel];
      if (row === resume) close();
      else if (row === reset) pressReset(key);
      else if (row.contains(motion)) setMotion(!motion.checked);
      else if (row.contains(sizes)) setPixel(PIXEL_SIZES[(PIXEL_SIZES.indexOf(pixel) + 1) % PIXEL_SIZES.length]);
    },
    readSettings() {
      return {
        pixelSize: pixel,
        master: Number(master.value) / 100,
        music: Number(music.value) / 100,
        reduceMotion: motion.checked,
      };
    },
    toggle(): void {
      if (!layer.hidden) {
        close();
        return;
      }
      layer.hidden = false;
      // Every opening starts on Resume, the row a pause is most often for.
      select(RESUME);
    },
    isOpen(): boolean {
      return !layer.hidden;
    },
    onSetPixelSize(cb: (n: number) => void): void {
      sizeCb = cb;
      cb(pixel);
    },
    onSetVolume(cb: (masterLevel: number, musicLevel: number) => void): void {
      volCb = cb;
      cb(Number(master.value) / 100, Number(music.value) / 100);
    },
    destroy(): void {
      layer.remove();
      sizeCb = null;
      volCb = null;
    },
  };
}
