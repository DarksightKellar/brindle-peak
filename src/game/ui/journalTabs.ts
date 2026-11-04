/**
 * The journal's five list pages, as strings.
 *
 * Split out of `journal.ts` when the map tab arrived: the container was already at the file-size
 * ceiling, and the tab bodies are pure `model -> html` functions with no listeners of their own.
 *
 * Everything here is built at paint time from a `JournalModel` that was built from state. Nothing
 * here reads the clock, the DOM or the world.
 */

import type { AchievementDef, FishDef, GameState } from '../../core/contracts';
import type { JournalModel, JournalSettingsView } from './journalModel';
import { esc } from './html';
import { icon } from './icons';

/** `value` and `note` replace the plain count when a stat has two numbers to tell apart (the bells). */
const statHTML = (label: string, r: JournalModel['feathers'], value = esc(r.text), note = ''): string =>
  `<div class="ui-stat"><span class="ui-stat__label">${label}</span><span class="ui-stat__value">${value}</span>${note}` +
  `<div class="ui-stat__bar"><i style="width:${Math.min(100, Math.round((r.got / Math.max(1, r.total)) * 100))}%"></i></div></div>`;

/**
 * The words after "8 / 60" under the bell count: those are the bells picked up off the ground, as
 * against the purse above them (which quest rewards fill too).
 */
export const BELLS_FOUND_WORDS = 'found lying in the snow';

/**
 * The bells box leads with the purse, the same number and glyph as the HUD chip; the count of the sixty
 * lying in the valley sits under it with the bar. A critic read "46" on the chip and "BELLS 8 / 60"
 * here as one count that disagreed with itself.
 */
const bellsHTML = (m: JournalModel): string =>
  statHTML('Bells', m.bells, `${icon('bell', 12)}${m.purse}`,
    `<span class="ui-stat__note">${esc(m.bells.text)} ${esc(BELLS_FOUND_WORDS)}</span>`);

/** The kept photographs, pinned under the counts. The src is a data URL this game wrote itself. */
const printsHTML = (prints: readonly { src: string; caption: string }[]): string =>
  prints.length === 0
    ? ''
    : `<ul class="ui-prints">${prints
      .map((p) => `<li><figure class="ui-print"><img src="${esc(p.src)}" alt="${esc(p.caption)}"><figcaption>${esc(p.caption)}</figcaption></figure></li>`)
      .join('')}</ul>`;

export function notesHTML(m: JournalModel, prints: readonly { src: string; caption: string }[] = []): string {
  const stats = [m.feathers, m.bells, m.lanterns, m.fish, m.photos, m.achievements];
  const labels = ['Feathers', 'Bells', 'Lanterns', 'Fish', 'Photos', 'Feats'];
  const zones = m.zones
    .map(
      (z) =>
        `<li class="ui-zone${z.visited ? ' is-visited' : ''}"><span class="ui-zone__mark">${z.mark}</span>` +
        `<span class="ui-zone__name">${esc(z.name)}</span><span class="ui-zone__note">${z.visited ? 'noted' : 'unvisited'}</span></li>`,
    )
    .join('');
  return (
    `<div class="ui-jgrid">${stats.map((r, i) => (r === m.bells ? bellsHTML(m) : statHTML(labels[i], r))).join('')}</div>` +
    (m.carrying.length > 0 ? `<p class="ui-journal__meta">Carrying: ${m.carrying.map(esc).join(' · ')}</p>` : '') +
    printsHTML(prints) +
    `<ul class="ui-zones">${zones}</ul>` +
    `<p class="ui-journal__meta">Played ${m.playtime} · best sled ${m.sledBest}</p>`
  );
}

/**
 * Each active quest's next step in words, not a fraction (docs/GUIDE.md §3). A completed quest
 * collapses to a tick and one authored line — its blurb — so the page reads as a record rather than
 * a list of unfinished business.
 */
export function questsHTML(
  m: JournalModel,
  tracked: string | null = null,
  cursor: string | null = null,
  where?: (id: string) => { text: string; d: number } | null,
): string {
  if (m.quests.length === 0) {
    return '<p class="ui-empty">No quests yet. Someone by a warm window is waiting.</p>';
  }
  // Each errand that can be followed says how far its next place is, and the nearest says so.
  const far = new Map<string, { text: string; d: number }>();
  for (const q of m.quests) {
    const at = q.trackable && q.status === 'active' ? where?.(q.id) ?? null : null;
    if (at) far.set(q.id, at);
  }
  let nearest: string | null = null;
  for (const [id, at] of far) if (nearest === null || at.d < (far.get(nearest)?.d ?? Infinity)) nearest = id;
  const rows = m.quests.map((q) => {
    const tick = q.status === 'complete' ? '✓ ' : '';
    const line =
      q.status === 'complete'
        ? q.epilogue
        : q.status === 'active'
          ? q.nextText ?? '—'
          : q.stepText;
    const cls = q.status === 'active' ? ' ui-quest__step--next' : '';
    const on = q.id === tracked;
    const status = on ? 'following' : q.status;
    const pick = q.trackable ? ` is-pickable${q.id === cursor ? ' is-cursor' : ''}${on ? ' is-tracked' : ''}` : '';
    return (
      `<li class="ui-quest is-${q.status}${pick}" data-quest="${esc(q.id)}"><div class="ui-quest__row"><span class="ui-quest__title">${tick}${esc(q.title)}</span>` +
      `<span class="ui-quest__status">${status}</span></div>` +
      (far.has(q.id)
        ? `<p class="ui-quest__where">${esc(far.get(q.id)?.text ?? '')}${q.id === nearest && far.size > 1 ? ' · nearest' : ''}</p>`
        : '') +
      `<p class="ui-quest__step${cls}">${esc(line)}</p></li>`
    );
  });
  const hint = m.quests.some((q) => q.trackable)
    ? '<p class="ui-journal__meta">↑↓ choose an errand · E follow it</p>'
    : '';
  return `${hint}<ul class="ui-quests">${rows.join('')}</ul>`;
}

export function fishHTML(m: JournalModel, s: GameState, fish: readonly FishDef[] | undefined): string {
  const head = `<p class="ui-journal__meta">Caught ${esc(m.fish.text)}</p>`;
  if (!fish) return `${head}<p class="ui-empty">No creel yet. Ice fishing opens on the Frozen Reach.</p>`;
  const rows = fish.map((f) => {
    const n = s.fish[f.id] ?? 0;
    return (
      `<li class="ui-fishrow is-${f.rarity}${n > 0 ? '' : ' is-locked'}"><span class="ui-fishrow__name">${n > 0 ? esc(f.name) : '???'}</span>` +
      `<span class="ui-fishrow__note">${n > 0 ? `${f.rarity} · ${n}` : '—'}</span></li>`
    );
  });
  return `${head}<ul class="ui-fish">${rows.join('')}</ul>`;
}

export function achHTML(m: JournalModel, defs: readonly AchievementDef[] | undefined): string {
  const rows = m.achievementsList.map(
    (a) =>
      `<li class="ui-achrow${a.unlocked ? '' : ' is-locked'}"><span class="ui-achrow__icon">${icon(a.unlocked ? 'achievement' : 'lock', 12)}</span>` +
      `<span class="ui-achrow__name">${a.unlocked ? esc(a.name) : 'Locked'}</span>` +
      `<span class="ui-achrow__desc">${a.unlocked ? esc(a.desc) : ''}</span></li>`,
  );
  if (!defs && m.achievements.total > m.achievements.got) {
    rows.push(
      `<li class="ui-achrow is-locked"><span class="ui-achrow__icon">${icon('lock', 12)}</span>` +
        `<span class="ui-achrow__name">Locked</span><span class="ui-achrow__desc">${m.achievements.total - m.achievements.got} still out there</span></li>`,
    );
  }
  return `<p class="ui-journal__meta">Unlocked ${esc(m.achievements.text)}</p><ul class="ui-ach">${rows.join('')}</ul>`;
}

export function settingsHTML(settings: (() => JournalSettingsView) | undefined): string {
  const v = settings?.() ?? { pixelSize: 5, master: 0.8, music: 0.6, reduceMotion: false };
  const rows: Array<[string, string]> = [
    ['Pixel size', `${v.pixelSize}×`],
    ['Master volume', `${Math.round(v.master * 100)}%`],
    ['Music', `${Math.round(v.music * 100)}%`],
    ['Reduce motion', v.reduceMotion ? 'On' : 'Off'],
  ];
  return (
    `<ul class="ui-settings">${rows
      .map(([k, val]) => `<li class="ui-setting"><span class="ui-setting__key">${k}</span><span class="ui-setting__val">${val}</span></li>`)
      .join('')}</ul><p class="ui-empty">Esc closes the journal.</p>`
  );
}
