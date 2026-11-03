/**
 * Journal — the completion surface (GDD §8), and now the map too (docs/GUIDE.md §2).
 *
 * The container only: it owns the panel, the tab strip, which page is showing, and when to repaint.
 * The view model lives in `journalModel.ts`, the list pages in `journalTabs.ts`, and the map in
 * `journalMap.ts`.
 *
 * Two things about repainting, because they are the cost model:
 *
 *  - The map is built inside `paint()`, which runs when the journal opens and when the state
 *    signature changes. It is never touched from `update()`.
 *  - The frame loop asks for a rerender every frame while the journal is open. The signature check
 *    turns that into a real paint only when something a page displays has actually moved.
 */

import type { GameState } from '../../core/contracts';
import { ACHIEVEMENTS } from '../../data/achievements';
import { FISH } from '../../data/fish';
import { QUESTS } from '../../data/quests';
import { errandLineFor } from './errandLine';
import { mapHTML } from './journalMap';
import type { JournalContent, JournalModel } from './journalModel';
import { formatJournal } from './journalModel';
import { achHTML, fishHTML, notesHTML, questsHTML, settingsHTML } from './journalTabs';

// The journal's public surface: the model is re-exported here so callers (and the tests) keep one
// import for the whole surface.
export { FEATHERS_TOTAL, formatJournal, formatPlaytime } from './journalModel';

/** `Map` is the field guide's page; `M` opens the journal straight to it. */
export const TABS = ['Field Notes', 'Map', 'Quests', 'Fish', 'Achievements', 'Settings'] as const;
export type JournalTab = (typeof TABS)[number];

export interface Journal {
  /** Toggle. When opening, start on `on` if given, else on whichever page was last read. */
  toggle(s: GameState, on?: JournalTab): void;
  setTab(tab: JournalTab, s: GameState): void;
  /** Left/right: the next (`1`) or previous (`-1`) page, wrapping at the ends. */
  turnPage(dir: number): void;
  /** Up/down: scroll a long page by `px` (negative is up). */
  scroll(px: number): void;
  /** Up/down on the Quests page: move the errand cursor. False when there is nothing to pick. */
  select(dir: number): boolean;
  /** E/Enter on the Quests page: follow the errand under the cursor. */
  activate(s: GameState): void;
  currentTab(): JournalTab;
  isOpen(): boolean;
  rerender(s: GameState): void;
  destroy(): void;
}

function tabHTML(
  tab: JournalTab,
  m: JournalModel,
  s: GameState,
  content: JournalContent,
  tracked: string | null,
  cursor: string | null,
): string {
  switch (tab) {
    case 'Field Notes':
      return notesHTML(m, content.prints?.() ?? []);
    case 'Map':
      return content.map
        ? mapHTML(s, content.map, content.mapDecor?.())
        : '<p class="ui-empty">No map to draw: the valley content is not loaded.</p>';
    case 'Quests':
      return questsHTML(m, tracked, cursor);
    case 'Fish':
      return fishHTML(m, s, content.fish);
    case 'Achievements':
      return achHTML(m, content.achievements);
    case 'Settings':
      return settingsHTML(content.settings);
  }
}

/**
 * Everything the six pages read, flattened. Cheap on purpose: a few dozen short strings, built only
 * while the journal is open.
 */
function signature(tab: JournalTab, s: GameState, tracked: string | null): string {
  const quests = Object.entries(s.quests).map(([id, q]) => `${id}:${q.status}:${q.step}`);
  const counters = Object.entries(s.counters).map(([k, v]) => `${k}=${v}`);
  // Playtime is printed on Field Notes only. Carrying it in every page's signature repainted the map
  // once a second for nothing — the per-frame cost the map is not allowed to add.
  const clock = tab === 'Field Notes' ? String(Math.floor(s.playtime)) : '';
  return [
    tab,
    tracked,
    clock,
    s.feathers,
    s.bells,
    Object.keys(s.items).join(','),
    counters.join(','),
    Object.keys(s.talked).join(','),
    Object.keys(s.visited).join(','),
    quests.join(','),
    Object.keys(s.achievements).join(','),
    Object.keys(s.fish).join(','),
    Object.keys(s.photos).join(','),
    Object.keys(s.lanterns).join(','),
    Object.keys(s.sledBests).join(','),
    Math.round(s.player.pos.x),
    Math.round(s.player.pos.z),
    s.player.facing.toFixed(2),
  ].join('|');
}

export function createJournal(root: HTMLElement, content: JournalContent = {}): Journal {
  const rootEl = document.createElement('div');
  rootEl.className = 'ui-journal';
  rootEl.hidden = true;
  rootEl.innerHTML =
    '<section class="panel ui-journal__panel"><div class="panel__in">' +
    '<header class="ui-journal__head"><h2 class="ui-journal__title">Journal</h2>' +
    `<nav class="ui-tabs">${TABS.map((t) => `<button class="ui-tab" type="button">${t}</button>`).join('')}</nav></header>` +
    '<div class="ui-journal__body"></div>' +
    '<footer class="ui-journal__foot">←→ pages · ↑↓ scroll · Esc / J close · M map · nothing here is missable</footer></div></section>';
  root.appendChild(rootEl);
  // Authored content by default, so the journal is complete without the host wiring anything.
  const src: JournalContent = { quests: QUESTS, achievements: ACHIEVEMENTS, fish: FISH, ...content };

  const body = rootEl.querySelector('.ui-journal__body') as HTMLElement;
  const tabButtons = Array.from(rootEl.querySelectorAll('.ui-tab')) as HTMLElement[];
  let tab: JournalTab = 'Field Notes';
  let state: GameState | null = null;
  let lastSig = '';
  const errands = src.map ? errandLineFor(src.map) : null;
  /** The errand under the Quests page's cursor; the tracked one when the page opens. */
  let cursor: string | null = null;
  let pickable: string[] = [];

  const paint = (s: GameState): void => {
    state = s;
    const m = formatJournal(s, src);
    pickable = m.quests.filter((q) => q.trackable).map((q) => q.id);
    if (cursor === null || !pickable.includes(cursor)) {
      const tracked = errands?.trackedId() ?? null;
      cursor = tracked !== null && pickable.includes(tracked) ? tracked : pickable[0] ?? null;
    }
    for (const [i, t] of TABS.entries()) tabButtons[i].classList.toggle('is-on', t === tab);
    body.innerHTML = tabHTML(tab, m, s, src, errands?.trackedId() ?? null, cursor);
    lastSig = signature(tab, s, errands?.trackedId() ?? null);
    body.querySelector('.ui-quest.is-cursor')?.scrollIntoView?.({ block: 'nearest' });
  };

  const follow = (s: GameState, id: string): void => {
    if (!errands) return;
    errands.track(s, id);
    cursor = id;
    paint(s);
  };

  // A pointer is hidden over the game, but a click on an errand row should still do what E does.
  body.addEventListener('click', (e) => {
    const row = (e.target as HTMLElement).closest?.('.ui-quest.is-pickable') as HTMLElement | null;
    const id = row?.dataset.quest;
    if (id && state) follow(state, id);
  });

  // A new page starts at its top; a repaint of the same page keeps the reader's place.
  const turnTo = (next: JournalTab): void => {
    tab = next;
    if (state && !rootEl.hidden) paint(state);
    body.scrollTop = 0;
  };

  for (const [i, b] of tabButtons.entries()) b.addEventListener('click', () => turnTo(TABS[i]));

  return {
    toggle(s: GameState, on?: JournalTab): void {
      const opening = rootEl.hidden;
      rootEl.hidden = !opening;
      if (!opening) return;
      if (on !== undefined) tab = on;
      cursor = null;
      paint(s);
      body.scrollTop = 0;
    },
    setTab(next: JournalTab, s: GameState): void {
      if (next === tab) return;
      state = s;
      turnTo(next);
    },
    turnPage(dir: number): void {
      const i = TABS.indexOf(tab) + Math.sign(dir);
      turnTo(TABS[(i + TABS.length) % TABS.length]);
    },
    scroll(px: number): void {
      body.scrollTop += px;
    },
    select(dir: number): boolean {
      if (tab !== 'Quests' || pickable.length === 0 || !state) return false;
      const at = cursor === null ? -1 : pickable.indexOf(cursor);
      const next = Math.max(0, Math.min(pickable.length - 1, at + Math.sign(dir)));
      cursor = pickable[next];
      paint(state);
      return true;
    },
    activate(s: GameState): void {
      if (tab !== 'Quests' || cursor === null) return;
      follow(s, cursor);
    },
    currentTab(): JournalTab {
      return tab;
    },
    isOpen(): boolean {
      return !rootEl.hidden;
    },
    rerender(s: GameState): void {
      if (rootEl.hidden) return;
      const sig = signature(tab, s, errands?.trackedId() ?? null);
      if (sig === lastSig) return;
      paint(s);
    },
    destroy(): void {
      rootEl.remove();
    },
  };
}
