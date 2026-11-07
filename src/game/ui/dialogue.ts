/**
 * Dialogue panel — bottom, name label, 45 chars/sec, E to advance, up/down (or A/D) to pick a choice
 * (GDD §8). The choices stack as a list, and the corner hint names the keys while they are up.
 *
 * advance() contract, in full:
 *   - mid-typewriter      the call completes the line and returns the node it was given (a no-op
 *                         for the caller: same id, nothing to route).
 *   - more lines in node  the call reveals the next line and returns the same node.
 *   - last line, choices  the call returns a **route stub** for the highlighted choice:
 *                         `{ id: choice.next, lines: [] }`.
 *   - node.next           the call returns a route stub for `node.next`.
 *   - nothing to go to    the call closes the panel and returns 'close'.
 * A stub carries no lines because the view has no dialogue registry; the caller resolves the id.
 *
 * The reveal is driven by the game frame (`update`), not a requestAnimationFrame loop of its own: one
 * clock for the whole game, and a paused or stepped frame pauses the text with it. On a touch screen a
 * tap on a choice highlights it and takes it, through the same interact press the keyboard sends.
 */

import type { DialogueNode } from '../../core/contracts';
import { Typewriter, countSyllables } from './typewriter';
import { KEY, TOUCH } from '../../core/keys';
import { tapKey } from '../touch';

export { CHARS_PER_SEC, Typewriter, countSyllables } from './typewriter';

export interface DialogueView {
  open(node: DialogueNode, speakerName: string, chirp: (syllables: number) => void): void;
  close(): void;
  isOpen(): boolean;
  advance(): DialogueNode | 'close';
  /** Reveal text by `dt` seconds of game time. */
  update(dt: number): void;
  /** Move the highlighted choice by `delta`, wrapping. Returns false when no choices are on screen. */
  selectChoice(delta: number): boolean;
}

const stub = (node: DialogueNode, id: string): DialogueNode => ({ id, speaker: node.speaker, lines: [] });

/**
 * Seconds the choices are up before E takes one. Critic round 5 took on three errands it meant to read
 * past: the E that finished the last line landed on "i'll do it." a beat later. A press this soon is the
 * reader's, not a decision, and it starts the wait again.
 */
export const CHOICE_ARM = 0.45;

/** The corner hint while choices are up: the pause menu's "↑↓ choose", and the interact key to take one. */
const CHOOSE_HINT = TOUCH ? 'tap a choice' : `<kbd>↑↓</kbd> choose <kbd>${KEY.interact}</kbd>`;
/** The corner hint while a line is up: the key that moves the talk on, or a tap. */
const NEXT_HINT = TOUCH ? 'tap' : KEY.interact;

export function createDialogue(root: HTMLElement): DialogueView {
  const panel = document.createElement('section');
  panel.className = 'ui-dlg';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-live', 'polite');
  panel.hidden = true;
  panel.innerHTML =
    '<div class="panel ui-dlg__panel"><div class="panel__in">' +
    '<div class="ui-dlg__name"></div>' +
    '<p class="ui-dlg__text"></p>' +
    '<div class="ui-dlg__choices"></div>' +
    `<div class="ui-dlg__hint">${NEXT_HINT}</div>` +
    '</div></div>';
  root.appendChild(panel);

  const nameEl = panel.querySelector('.ui-dlg__name') as HTMLElement;
  const textEl = panel.querySelector('.ui-dlg__text') as HTMLElement;
  const choiceEl = panel.querySelector('.ui-dlg__choices') as HTMLElement;
  const hintEl = panel.querySelector('.ui-dlg__hint') as HTMLElement;

  const tw = new Typewriter('');
  let node: DialogueNode | null = null;
  let line = 0;
  let voiced = 0;
  let selected = 0;
  /** Seconds the current choices have been on screen. */
  let choiceAge = 0;
  let chirpFn: (syllables: number) => void = () => undefined;

  const lineText = (): string => (node && node.lines[line]) || '';
  const atLastLine = (): boolean => !node || line >= node.lines.length - 1;

  const paint = (): void => {
    const shown = tw.text;
    textEl.textContent = shown;
    textEl.classList.toggle('is-typing', !tw.complete);
    const words = shown.split(/\s+/).filter((w) => w !== '');
    const done = tw.complete
      ? words.length
      : /\s$/.test(shown)
        ? words.length
        : Math.max(0, words.length - 1);
    while (voiced < done) {
      const w = words[voiced];
      if (w) chirpFn(countSyllables(w) || 1);
      voiced++;
    }
  };

  const renderChoices = (): void => {
    const show = !!node && atLastLine() && tw.complete && (node.choices?.length ?? 0) > 0;
    // With choices up, the corner names the keys that choose, in the pause menu's own words.
    if (hintEl.classList.contains('is-choosing') !== show) {
      hintEl.classList.toggle('is-choosing', show);
      hintEl.innerHTML = show ? CHOOSE_HINT : NEXT_HINT;
    }
    if (!show) {
      choiceEl.replaceChildren();
      choiceAge = 0;
      return;
    }
    if (choiceEl.childElementCount > 0) return;
    for (const [idx, c] of (node?.choices ?? []).entries()) {
      const b = document.createElement('div');
      b.className = 'ui-dlg__choice';
      b.textContent = c.text;
      b.classList.toggle('is-sel', idx === selected);
      choiceEl.appendChild(b);
    }
  };

  // A tap on a choice: highlight it, then take it with the same press the keyboard's interact sends.
  choiceEl.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('.ui-dlg__choice');
    if (!b) return;
    const idx = Array.from(choiceEl.children).indexOf(b);
    if (idx < 0) return;
    selected = idx;
    choiceEl.querySelectorAll('.ui-dlg__choice').forEach((c, i) => c.classList.toggle('is-sel', i === selected));
    tapKey('interact');
  });

  const close = (): void => {
    node = null;
    panel.hidden = true;
    choiceEl.replaceChildren();
  };

  return {
    open(next: DialogueNode, speakerName: string, chirp: (syllables: number) => void): void {
      node = next;
      line = 0;
      voiced = 0;
      selected = 0;
      chirpFn = chirp;
      nameEl.textContent = speakerName;
      panel.hidden = false;
      choiceEl.replaceChildren();
      tw.load(lineText());
      paint();
    },

    close,

    isOpen(): boolean {
      return node !== null;
    },

    update(dt: number): void {
      if (!node) return;
      if (!tw.complete) tw.update(Math.min(0.05, dt));
      paint();
      renderChoices();
      if (choiceEl.childElementCount > 0) choiceAge += dt;
      choiceEl.classList.toggle('is-arming', choiceEl.childElementCount > 0 && choiceAge < CHOICE_ARM);
    },

    selectChoice(delta: number): boolean {
      if (!node || !atLastLine() || !tw.complete) return false;
      const count = node.choices?.length ?? 0;
      if (count === 0) return false;
      selected = (selected + delta + count) % count;
      const buttons = choiceEl.querySelectorAll('.ui-dlg__choice');
      buttons.forEach((b, i) => b.classList.toggle('is-sel', i === selected));
      return true;
    },

    advance(): DialogueNode | 'close' {
      if (!node) return 'close';
      if (!tw.complete) {
        tw.skip();
        voiced = lineText().split(/\s+/).filter((w) => w !== '').length;
        paint();
        renderChoices();
        return node;
      }
      if (!atLastLine()) {
        line++;
        voiced = 0;
        tw.load(lineText());
        paint();
        return node;
      }
      if ((node.choices?.length ?? 0) > 0) {
        // A press while they are still arming starts the wait again: mashing through a conversation
        // never lands on a choice, and a press after a breath does.
        if (choiceAge < CHOICE_ARM) {
          choiceAge = 0;
          return node;
        }
        // A/D move the highlight, E takes it. Taking choices[0] unconditionally made the second
        // option unreachable once the mouse was gone.
        const pick = node.choices?.[selected] ?? node.choices?.[0];
        selected = 0;
        if (!pick) return node;
        return stub(node, pick.next);
      }
      const from = node;
      const nextId = from.next;
      close();
      return nextId ? stub(from, nextId) : 'close';
    },
  };
}
