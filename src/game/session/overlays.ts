/**
 * Which overlay is on top, and what Escape means right now.
 *
 * This is small enough to look trivial and it is where a real defect lived: main.ts returned early
 * for anything "blocking", both overlays counted as blocking, so Escape — the one key the pause menu
 * documents — could not close either of them and a keyboard-only player was trapped. Escape now
 * closes the topmost overlay, and the two panels refuse to stack.
 *
 * It also has to know whether an activity is running, because dialogue and activities consume Escape
 * through the input frame instead; fighting them here would cancel a minigame on the same keypress
 * that closes a panel. So no panel opens over a running activity at all: a race clock ticking behind
 * the journal, and an Escape that closed the journal and quit the race together, were both reported.
 * The ending card takes its own Escape through the frame too, so the menu never stacks on it.
 *
 * Nor does the journal open over a conversation: Tab mid-sentence laid the book on top of the dialogue
 * box, and the next E was read by both.
 */

import type { GameState } from '../../core/contracts';
import type { Presentation } from './presentation';

export interface OverlayRouter {
  toggleJournal(): void;
  /** `M`: the map's own key, and a page of the same journal (docs/GUIDE.md §2). */
  toggleMap(): void;
  toggleMenu(): void;
  escape(): void;
}

export interface OverlayDeps {
  ui: Presentation;
  state: GameState;
  isActivityRunning(): boolean;
}

export function createOverlayRouter(d: OverlayDeps): OverlayRouter {
  const { ui, state } = d;
  const busy = (): boolean => d.isActivityRunning() || ui.ending.isOpen();
  const talking = (): boolean => ui.dialogue.isOpen();

  return {
    toggleJournal(): void {
      if (busy() || talking()) return;
      if (!ui.journal.isOpen() && ui.menu.isOpen()) ui.menu.toggle();
      ui.journal.toggle(state);
    },
    /*
     * M opens the journal straight to the map. If the journal is already open on another page, M turns
     * to the map rather than closing the book — the key asked for the map, not for a toggle of
     * whatever was in front. Pressing it again on the map does close it, so it is never a dead key.
     */
    toggleMap(): void {
      if (busy() || talking()) return;
      if (ui.menu.isOpen()) ui.menu.toggle();
      if (ui.journal.isOpen() && ui.journal.currentTab() !== 'Map') {
        ui.journal.setTab('Map', state);
        return;
      }
      ui.journal.toggle(state, 'Map');
    },
    toggleMenu(): void {
      if (busy()) return;
      if (!ui.menu.isOpen() && ui.journal.isOpen()) ui.journal.toggle(state);
      ui.menu.toggle();
    },
    escape(): void {
      if (ui.journal.isOpen()) {
        ui.journal.toggle(state);
        return;
      }
      if (ui.menu.isOpen()) {
        ui.menu.toggle();
        return;
      }
      if (ui.dialogue.isOpen() || busy()) return;
      ui.menu.toggle();
    },
  };
}
