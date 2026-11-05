/**
 * The ending.
 *
 * The game had none. Reaching the mast set `flags.summit`, fired a single `finale` toast reading "The
 * summit", and that was all — a content audit watched the flag land and found nothing else read it,
 * no overlay, no dialogue, no text resembling credits anywhere in the UI. For a game whose whole
 * structure is "get the valley's radio line back up", paying the climb off with a
 * toast is the one thing that makes the goal feel like scenery.
 *
 * Deliberately not a cutscene and not terminal: it shows once, it says something specific about where
 * the player has been, and then it gets out of the way so the valley is still there. A cosy game
 * should not roll credits over a world the player was enjoying.
 */

import type { GameState } from '../../core/contracts';
import { valleyLines } from '../../data/endingLines';

export interface EndingStats {
  feathers: number;
  feathersTotal: number;
  bells: number;
  questsDone: number;
  questsTotal: number;
  zonesSeen: number;
  zonesTotal: number;
  playtime: number;
  /** One sentence per finished errand, in the card's order (data/endingLines.ts). */
  valley: string[];
  /** Finished errands with no room on the card. */
  valleyMore: number;
}

export interface Ending {
  /** Show the ending once. Returns false if it has already been shown. */
  show(stats: EndingStats): boolean;
  hide(): void;
  isOpen(): boolean;
  /**
   * True once the card has been up for `ENDING_GRACE_MS`. Before that a press does nothing: the card
   * follows Nana's last line, and the E a quick player was tapping through her dialogue closed it unread.
   */
  dismissable(): boolean;
}

/** How long the card ignores E and Escape after it appears; its "Press E" line shows when this ends. */
export const ENDING_GRACE_MS = 1600;

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** "1 h 12 m" / "42 m" / "3 m" — a playtime a person would say out loud. */
export function spokenTime(seconds: number): string {
  const total = Math.max(0, Math.round(seconds / 60));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h > 0) return `${h} h ${m} m`;
  return `${m} m`;
}

export function createEnding(root: HTMLElement): Ending {
  const panel = document.createElement('section');
  panel.className = 'ui-ending';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="ui-ending__card">
    <p class="ui-ending__kicker">Hearth Hollow</p>
    <h1 class="ui-ending__title">Home, and the Valley Talking</h1>
    <p class="ui-ending__body">The trail posts are lit all the way down the mountain, and Nana is at the blue door. Up on Brindle Peak, Edda's set is humming, and the valley has not stopped talking since: Bram with his count, and voices from every corner of it, some you have met and some you haven't yet, and the road crew bringing the plough up in the morning. Overhead, the green burns on.</p>
    <p class="ui-ending__body ui-ending__valley"></p>
    <dl class="ui-ending__stats"></dl>
    <p class="ui-ending__foot">Press <b>E</b> to keep wandering</p>
    </div>`;
  root.appendChild(panel);
  const statsEl = panel.querySelector('.ui-ending__stats') as HTMLElement;
  const valleyEl = panel.querySelector('.ui-ending__valley') as HTMLElement;
  const foot = panel.querySelector('.ui-ending__foot') as HTMLElement;

  let shown = false;
  let shownAt = 0;

  const row = (label: string, value: string): string =>
    `<div class="ui-ending__row"><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`;

  return {
    show(stats): boolean {
      if (shown) return false;
      shown = true;
      valleyEl.textContent = valleyText(stats.valley, stats.valleyMore);
      statsEl.innerHTML = [
        row('Feathers', `${stats.feathers} of ${stats.feathersTotal}`),
        row('Bells', String(stats.bells)),
        row('Side errands finished', `${stats.questsDone} of ${stats.questsTotal}`),
        row('Zones walked', `${stats.zonesSeen} of ${stats.zonesTotal}`),
        row('Time on the mountain', spokenTime(stats.playtime)),
      ].join('');
      panel.hidden = false;
      shownAt = performance.now();
      foot.classList.remove('is-ready');
      window.setTimeout(() => foot.classList.add('is-ready'), ENDING_GRACE_MS);
      return true;
    },
    hide(): void {
      panel.hidden = true;
    },
    isOpen: () => !panel.hidden,
    dismissable: () => !panel.hidden && performance.now() - shownAt >= ENDING_GRACE_MS,
  };
}

const COUNT = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen'];

/** The second paragraph: only what this player finished, or a nudge back down if they finished nothing. */
export function valleyText(lines: readonly string[], more: number): string {
  if (lines.length === 0) return 'The rest of the valley is still out there, waiting to be asked.';
  const tail = more > 0 ? ` And ${COUNT[more] ?? String(more)} more ${more === 1 ? 'errand' : 'errands'} besides.` : '';
  return `Around the valley, things are a little different since you passed through. ${lines.join(' ')}${tail}`;
}

/** Gather the numbers the ending reports. Kept out of the UI so the panel stays dumb. */
export function endingStats(
  state: GameState,
  totals: { feathers: number; errands: readonly string[]; zones: number },
): EndingStats {
  // Errands only, not the story's chapters: critic round 18 read "7 of 22" here, the story counted in
  // and its last chapter not yet closed, and then 8 done in the journal.
  const questsDone = totals.errands.filter((id) => state.quests[id]?.status === 'complete').length;
  const valley = valleyLines((id) => state.quests[id]?.status === 'complete');
  return {
    feathers: state.feathers,
    feathersTotal: totals.feathers,
    bells: state.bells,
    questsDone,
    questsTotal: totals.errands.length,
    zonesSeen: Object.values(state.visited).filter(Boolean).length,
    zonesTotal: totals.zones,
    playtime: state.playtime,
    valley: valley.lines,
    valleyMore: valley.more,
  };
}
