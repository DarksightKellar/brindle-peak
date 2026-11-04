/**
 * Breath, bottom-left: the stamina bar, its one-word state, and the feather and bell chips beside it.
 *
 * Pulled out of hud.ts. Two changes from critic round 2:
 *
 *  - The bar is as long as Pip's breath. Each feather adds a flap's worth of stamina, and that used to be
 *    invisible: a fixed-width bar just filled the same strip. Now a feather visibly lengthens it, which is
 *    the whole explanation of what feathers are for.
 *  - Running out used to print "Spent — 0.0 / 8 · Bells 8 · Feathers 0" at the bottom of the screen: a
 *    number, a fraction and two counts that have nothing to do with breath. Now one word sits at the end
 *    of the bar, in the bar's own warning colour, only while it applies.
 */

import type { GameState, PlayerState } from '../../core/contracts';
import { TUNING } from '../../core/player/tuning';
import { icon } from './icons';

/** How long the feather count lingers after a feather, in ms. */
export const FEATHER_HOLD_MS = 2600;

/**
 * The bar's one word: what the bar is while it is being spent, puffing when breath is low, winded when
 * it has run out. Critic round 5 ran up the climb into "WINDED" with no warning and nothing on screen
 * saying what the bar was.
 */
export const BREATH_WORDS = { using: 'Breath', tired: 'Puffing', spent: 'Winded' } as const;

/** Below this share of a full bar, Pip is puffing: a warning a few seconds of sprint before winded. */
export const PUFFING = 0.35;

/** Bar length in CSS px: the starting breath, plus a step per feather's worth. */
const BAR_BASE_PX = 112;
const BAR_STEP_PX = 10;

export interface HudStamina {
  update(s: GameState, p: PlayerState): void;
  /** Flash the bar: the receipt for a lesson that cost breath. */
  pulse(): void;
  /** Show the feather chip for `ms` even when it would be hidden: the HUD pointing at the count. */
  showFeathers(ms: number): void;
}

export function createHudStamina(layer: HTMLElement): HudStamina {
  const stack = document.createElement('div');
  stack.className = 'ui-hud__stamina';
  stack.innerHTML =
    '<div class="ui-hud__chips">' +
    // A collected bell used to change a number only the journal showed. Sixty of them exist.
    '<div class="ui-hud__bells is-hidden">' +
    `<span class="ui-hud__ficon">${icon('bell', 12)}</span>` +
    '<b class="ui-hud__bnum">0</b></div>' +
    '<div class="ui-hud__feathers is-hidden">' +
    `<span class="ui-hud__ficon">${icon('feather', 12)}</span>` +
    '<b class="ui-hud__fnum">0</b></div>' +
    '</div>' +
    '<div class="ui-hud__barrow"><div class="ui-hud__bar"><i></i></div>' +
    '<span class="ui-hud__breath" hidden></span></div>';
  layer.appendChild(stack);

  const barBox = stack.querySelector('.ui-hud__bar') as HTMLElement;
  const bar = stack.querySelector('.ui-hud__bar i') as HTMLElement;
  const breath = stack.querySelector('.ui-hud__breath') as HTMLElement;
  const featherBox = stack.querySelector('.ui-hud__feathers') as HTMLElement;
  const featherNum = stack.querySelector('.ui-hud__fnum') as HTMLElement;
  const bellBox = stack.querySelector('.ui-hud__bells') as HTMLElement;
  const bellNum = stack.querySelector('.ui-hud__bnum') as HTMLElement;

  let lastFeathers = -1;
  let lastBells = -1;
  let lastMax = -1;
  let lastWord = '';
  let featherUntil = 0;
  let forcedUntil = 0;

  // Bound once: a pulse is a one-shot class, removed when its keyframes finish so the next one can
  // restart it. A per-pulse listener would pile up if the animation were ever suppressed.
  stack.addEventListener('animationend', () => stack.classList.remove('is-pulse'));

  const pop = (el: HTMLElement): void => {
    el.classList.remove('is-pop');
    void el.offsetWidth; // restart the animation
    el.classList.add('is-pop');
  };

  // The count shows when it changes (beside the bar it just lengthened) and when the HUD points at it.
  const updateFeathers = (s: GameState, now: number): void => {
    if (s.feathers !== lastFeathers) {
      const gained = lastFeathers >= 0 && s.feathers > lastFeathers;
      lastFeathers = s.feathers;
      featherNum.textContent = String(s.feathers);
      if (gained) {
        featherUntil = now + FEATHER_HOLD_MS;
        pop(featherBox);
      }
    }
    featherBox.classList.toggle('is-hidden', !(now < featherUntil || now < forcedUntil));
  };

  const updateBells = (s: GameState): void => {
    if (s.bells === lastBells) return;
    const gained = s.bells > lastBells && lastBells >= 0;
    lastBells = s.bells;
    bellNum.textContent = String(s.bells);
    bellBox.classList.toggle('is-hidden', s.bells <= 0);
    if (gained) pop(bellBox);
  };

  return {
    update(s: GameState, p: PlayerState): void {
      const fill = p.maxStamina > 0 ? Math.max(0, Math.min(1, p.stamina / p.maxStamina)) : 0;
      bar.style.width = `${Math.round(fill * 100)}%`;
      if (p.maxStamina !== lastMax) {
        const grew = lastMax > 0 && p.maxStamina > lastMax;
        lastMax = p.maxStamina;
        const extra = Math.max(0, p.maxStamina - TUNING.staminaMaxBase);
        barBox.style.width = `${BAR_BASE_PX + extra * BAR_STEP_PX}px`;
        if (grew) pop(barBox);
      }
      updateFeathers(s, performance.now());
      updateBells(s);

      // Tiredness has to be visible before it stops you. Winded is the moment a flap would be refused;
      // puffing comes well before it. It used to sit below winded (half a jump's breath against a
      // flap's), so it could never show and the bar went straight from full colour to winded.
      const spent = p.stamina < TUNING.drainFlap;
      const tired = !spent && fill < PUFFING;
      stack.classList.toggle('is-spent', spent);
      stack.classList.toggle('is-tired', tired);
      const word = spent ? BREATH_WORDS.spent : tired ? BREATH_WORDS.tired : fill < 0.995 ? BREATH_WORDS.using : '';
      if (word !== lastWord) {
        lastWord = word;
        breath.textContent = word;
        breath.hidden = word === '';
      }
    },

    pulse(): void {
      stack.classList.remove('is-pulse');
      void stack.offsetWidth; // restart the animation from its first frame
      stack.classList.add('is-pulse');
    },

    showFeathers(ms: number): void {
      forcedUntil = performance.now() + ms;
    },
  };
}
