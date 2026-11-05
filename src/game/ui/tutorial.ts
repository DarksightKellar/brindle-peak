/**
 * The tutorial prompt bar — one line, bottom centre, above the stats.
 *
 * The intro card was a manual: six key bindings in a list, read once and forgotten. This is the
 * opposite shape. It shows exactly one thing to do, with the key names drawn as caps big enough to
 * read at a glance, and it changes only when the script moves on — no per-frame DOM work.
 *
 * It never takes input (`pointer-events: none`) and never blocks the game: a note on the snow, not a
 * modal. It is hidden entirely while a dialogue or a panel is open, so it cannot sit over someone
 * speaking.
 */

import type { TutorialBeat } from '../../core/onboarding/steps';
import { promptSegments } from '../../core/onboarding/steps';

export interface Tutorial {
  /** Show a beat's line. Calling again with the same beat is a no-op. */
  show(beat: TutorialBeat): void;
  /**
   * Fade out. The element stays in the DOM so the next show() costs nothing. `now` skips the fade: a
   * conversation opening must not have the bar fading over its first line.
   */
  hide(now?: boolean): void;
  destroy(): void;
}

export function createTutorial(root: HTMLElement): Tutorial {
  const bar = document.createElement('div');
  bar.className = 'ui-tutorial';
  bar.setAttribute('role', 'status');
  bar.setAttribute('aria-live', 'polite');
  root.appendChild(bar);

  let current: string | null = null;

  const render = (beat: TutorialBeat): void => {
    const nodes: HTMLElement[] = [];
    for (const part of promptSegments(beat)) {
      if (part.kind === 'keys') {
        const group = document.createElement('span');
        group.className = 'ui-tutorial__keys';
        for (const k of part.keys) {
          const cap = document.createElement('kbd');
          cap.className = 'ui-tutorial__cap';
          cap.textContent = k;
          group.appendChild(cap);
        }
        nodes.push(group);
      } else {
        const text = document.createElement('span');
        text.className = 'ui-tutorial__text';
        text.textContent = part.text;
        nodes.push(text);
      }
    }
    bar.replaceChildren(...nodes);
    // The full authored line, keys included, for a screen reader: the caps on their own read as
    // "W A S D walk" with nothing tying them together.
    bar.setAttribute('aria-label', beat.prompt);
  };

  return {
    show(beat: TutorialBeat): void {
      // Keyed on the words too: the walk tip's key follows the view (session/onboarding.ts `worded`).
      const key = `${beat.id}|${beat.prompt}`;
      if (key === current && bar.classList.contains('is-in')) return;
      if (key !== current) render(beat);
      current = key;
      bar.classList.remove('is-snap');
      bar.classList.add('is-in');
    },

    hide(now = false): void {
      current = null;
      bar.classList.toggle('is-snap', now);
      bar.classList.remove('is-in');
    },

    destroy(): void {
      bar.remove();
    },
  };
}
