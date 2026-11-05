/**
 * The journal's view model: pure `GameState -> JournalModel`.
 *
 * Split from `journal.ts` when the map tab arrived and the container hit the file-size ceiling. The
 * model is the part worth reading on its own: it decides what each page is allowed to claim, and it is
 * where "a quest shows its next step, not a fraction" is implemented (docs/GUIDE.md §3).
 *
 * Totals come from the content handed in (pickups, quests, fish…); anything without one shows a plain
 * count rather than a fake denominator. Feathers and bells count what was FOUND in the world, never the
 * wallet: quests pay bells too, so "bells / 60" used to read 120 / 60.
 */

import type { AchievementDef, Condition, FishDef, GameState, QuestDef, QuestStatus, ZoneId } from '../../core/contracts';
import { ZONE_IDS } from '../../core/contracts';
import type { GuideContent } from '../../core/guide/nextStep';
import { nextStepOf } from '../../core/guide/nextStep';
import { evaluate } from '../../core/progress/conditions';
import { CHAPTER_DONE, VALLEY_LINES } from '../../data/endingLines';
import { NPCS } from '../../data/npcs';
import { RADIO_QUEST } from '../../data/quests';
import { ZONE_NAMES } from '../../data/zoneNames';
import type { MapDecor } from './journalMap';

export const FEATHERS_TOTAL = 14; // GDD R1, only when no pickup table is supplied
const ACHIEVEMENTS_TOTAL = 20; // GDD R3

/** `text` is "3 / 14", or a bare "3" when no authored total exists. */
export interface CountRow { got: number; total: number; text: string }
export interface JournalZone { id: ZoneId; name: string; visited: boolean; mark: string }
export interface JournalQuest {
  id: string;
  title: string;
  status: QuestStatus;
  step: number;
  /** The step at the saved index; kept for the available and locked rows. */
  stepText: string;
  /** The first step whose condition does not hold yet — null when nothing is left to do. */
  nextText: string | null;
  /** What came of a finished quest (`doneLine`), else its authored one-liner. */
  epilogue: string;
  /** A live errand: one the player can pick to follow (the story is always followed). */
  trackable: boolean;
  /** Part of the main story: its step is the goal line at the top of the screen. */
  main: boolean;
}
export interface JournalAch { id: string; name: string; desc: string; unlocked: boolean }
export interface JournalSettingsView { pixelSize: number; master: number; music: number; reduceMotion: boolean }

export interface JournalContent {
  quests?: readonly QuestDef[];
  achievements?: readonly AchievementDef[];
  fish?: readonly FishDef[];
  lanternsTotal?: number;
  /** The placed feathers and bells, so the journal can count finds rather than the wallet. */
  pickups?: readonly { id: string; kind: string }[];
  photosTotal?: number;
  /** Item names, for the "carrying" line on Field Notes. */
  items?: readonly { id: string; name: string; handedOver?: Condition }[];
  /** The photographs kept so far (ui/polaroid.ts), pinned on Field Notes. Read at paint time. */
  prints?: () => readonly { id: string; src: string; caption: string }[];
  /** Everything the map page needs: zones, people, activities and the names to print. */
  map?: GuideContent;
  /** The map's land, trail and anchors; a function so the relief is traced on first open, not at boot. */
  mapDecor?: () => MapDecor;
  /**
   * Called at render time, not at construction.
   *
   * This used to be a value copied in once, and nothing ever passed one, so the Settings tab showed a
   * hardcoded 5x / 80% / 60% forever while the menu's sliders moved. A read-out that cannot be wrong
   * has to be read, so it is a function now.
   */
  settings?: () => JournalSettingsView;
}

export interface JournalModel {
  feathers: CountRow;
  /** Bells picked up off the ground, of those placed. */
  bells: CountRow;
  /** Every bell Pip holds, rewards included: the HUD chip's number. */
  purse: number;
  lanterns: CountRow;
  /**
   * Posts Pip lit, once the valley has lit the rest after the radio call; null before it. Critic round 16
   * read "Lanterns 2 / 12" in the journal after watching every post come on down the mountain.
   */
  lanternsLitByPip: number | null;
  fish: CountRow;
  photos: CountRow;
  achievements: CountRow;
  zones: JournalZone[];
  quests: JournalQuest[];
  /** What Pip carries, by name, in the order picked up. */
  carrying: string[];
  achievementsList: JournalAch[];
  playtime: string;
  sledBest: string;
}

const tally = (got: number, total: number | null = null): CountRow => ({
  got,
  total: total ?? got,
  text: total === null ? `${got}` : `${got} / ${total}`,
});

const owned = (r: Readonly<Record<string, number>>): number => Object.keys(r).filter((k) => r[k] > 0).length;

/** The outcome sentence for a finished quest: the ending card's line for an errand, or a chapter's. */
function doneLine(id: string): string | null {
  return VALLEY_LINES.find(([q]) => q === id)?.[1] ?? CHAPTER_DONE[id] ?? null;
}

export function formatPlaytime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

const QUEST_ORDER: Readonly<Record<QuestStatus, number>> = { active: 0, available: 1, complete: 2, locked: 3 };

export function formatJournal(s: GameState, content: JournalContent = {}): JournalModel {
  const zones: JournalZone[] = ZONE_IDS.map((id) => ({
    id,
    name: ZONE_NAMES[id],
    visited: s.visited[id] === true,
    mark: s.visited[id] === true ? '✓' : '—',
  }));

  const quests: JournalQuest[] = Object.keys(s.quests)
    .map((id) => {
      const p = s.quests[id];
      const def = content.quests?.find((q) => q.id === id);
      const now = def ? nextStepOf(def, s) : null;
      return {
        id,
        title: def?.title ?? id,
        status: p.status,
        step: p.step,
        stepText: def?.steps[p.step]?.text ?? `Step ${p.step + 1}`,
        nextText: now?.step.text ?? null,
        epilogue: (p.status === 'complete' ? doneLine(id) : null) ?? def?.blurb ?? '',
        // The story is pickable too: picking it clears the line under the goal (errandLine.ts).
        trackable: p.status === 'active' && now !== null,
        main: def?.main === true,
      };
    })
    // An offer Pip said "not now" to stays on the page until it is taken: critic round 34 declined
    // Bram's rope and had nothing to find it by afterwards.
    .concat(
      (content.quests ?? [])
        .filter((q) => s.flags[`declined:${q.id}`] === true && s.quests[q.id] === undefined)
        .map((q) => {
          const who = NPCS.find((n) => n.id === q.giver)?.name ?? q.giver;
          return {
            id: q.id,
            title: q.title,
            status: 'available' as const,
            step: 0,
            stepText: `${who} asked, and you said not now. Talk to ${who} again to take it on.`,
            nextText: null,
            epilogue: q.blurb,
            trackable: false,
            main: false,
          };
        }),
    )
    .sort((a, b) => QUEST_ORDER[a.status] - QUEST_ORDER[b.status]);

  const achievementsList: JournalAch[] = content.achievements
    /*
     * Presence, not truthiness. The tracker stores the unlock ORDER as the value
     * (`s.achievements[id] = Object.keys(s.achievements).length`), so the first achievement a player
     * ever earns is stored as 0. Testing `> 0` marked exactly that one as Locked: the page said
     * "Unlocked 1 / 20" above twenty rows that all read "Locked".
     */
    ? content.achievements.map((a) => ({ id: a.id, name: a.name, desc: a.desc, unlocked: s.achievements[a.id] !== undefined }))
    : Object.keys(s.achievements).map((id) => ({ id, name: id, desc: '', unlocked: true }));

  // The save's best times also hold the races since round 10, under `race:<id>`; this stat is the sleds'.
  const bests = Object.entries(s.sledBests)
    .filter(([id, t]) => !id.startsWith('race:') && Number.isFinite(t) && t > 0)
    .map(([, t]) => t);
  const valleyLit = s.quests[RADIO_QUEST]?.status === 'complete' && content.lanternsTotal !== undefined;
  const found = (kind: string): CountRow | null => {
    if (!content.pickups) return null;
    const all = content.pickups.filter((p) => p.kind === kind);
    return tally(all.filter((p) => s.flags[`picked:${p.id}`] === true).length, all.length);
  };

  return {
    feathers: found('feather') ?? tally(s.feathers, FEATHERS_TOTAL),
    bells: found('bell') ?? tally(s.bells, null),
    purse: s.bells,
    lanterns: valleyLit ? tally(content.lanternsTotal ?? 0, content.lanternsTotal) : tally(owned(s.lanterns), content.lanternsTotal ?? null),
    lanternsLitByPip: valleyLit ? owned(s.lanterns) : null,
    fish: tally(owned(s.fish), content.fish?.length ?? null),
    photos: tally(owned(s.photos), content.photosTotal ?? null),
    achievements: tally(Object.keys(s.achievements).length, content.achievements?.length ?? ACHIEVEMENTS_TOTAL),
    zones,
    quests,
    carrying: Object.keys(s.items)
      .filter((id) => (s.items[id] ?? 0) > 0)
      // An item the game no longer has (Pell's letter, which Nana keeps since round 26) is not listed.
      .map((id) => (content.items ? content.items.find((i) => i.id === id) : { id, name: id }))
      .filter((it): it is NonNullable<typeof it> => it !== undefined)
      .filter((it) => !(it.handedOver && evaluate(it.handedOver, s)))
      .map((it) => ((s.items[it.id] ?? 0) > 1 ? `${it.name} ×${s.items[it.id]}` : it.name)),
    achievementsList,
    playtime: formatPlaytime(s.playtime),
    sledBest: bests.length > 0 ? `${Math.min(...bests).toFixed(1)}s` : '—',
  };
}
