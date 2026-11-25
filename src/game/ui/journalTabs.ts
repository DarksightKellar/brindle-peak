/**
 * The journal's five list pages, as strings.
 *
 * Split out of `journal.ts` when the map tab arrived: the container was already at the file-size
 * ceiling, and the tab bodies are pure `model -> html` functions with no listeners of their own.
 *
 * Everything here is built at paint time from a `JournalModel` that was built from state. Nothing
 * here reads the clock, the DOM or the world.
 */

import type { AchievementDef, ActivityDef, FishDef, GameState } from '../../core/contracts';
import { compassWord, formatDistance } from '../../core/guide/compass';
import type { JournalModel, JournalSettingsView } from './journalModel';
import { esc } from './html';
import { icon } from './icons';
import { KEY } from '../../core/keys';
import { CREDITS, LICENCES } from '../../data/credits';
import { activityOffered } from '../activities/offered';

/** `value` and `note` replace the plain count when a stat has two numbers to tell apart (the bells). */
const statHTML = (label: string, r: JournalModel['feathers'], value = esc(r.text), note = ''): string =>
  `<div class="ui-stat"><span class="ui-stat__label">${label}</span><span class="ui-stat__value">${value}</span>${note}` +
  `<div class="ui-stat__bar"><i style="width:${Math.min(100, Math.round((r.got / Math.max(1, r.total)) * 100))}%"></i></div></div>`;

/**
 * The words after "8 / 60" under the bell count: those are the bells picked up off the ground, as
 * against the purse above them (which quest rewards fill too).
 */
export const BELLS_FOUND_WORDS = 'found lying in the snow';

/** What each count is for, under it: critic round 25 had 202 bells and 2 feathers and knew neither. */
export const BELLS_FOR = "Spend them on Gus's feathers in the hamlet";
export const FEATHERS_FOR = 'Each one: longer breath for running and flapping';

/**
 * The bells box leads with the purse, the same number and glyph as the HUD chip; the count of the sixty
 * lying in the valley sits under it with the bar. A critic read "46" on the chip and "BELLS 8 / 60"
 * here as one count that disagreed with itself.
 */
const bellsHTML = (m: JournalModel): string =>
  statHTML('Bells', m.bells, `${icon('bell', 12)}${m.purse}`,
    `<span class="ui-stat__note">${esc(m.bells.text)} ${esc(BELLS_FOUND_WORDS)}. ${esc(BELLS_FOR)}</span>`);

/** After the radio call every post is on; the note under it keeps Pip's own share. */
const lanternsHTML = (m: JournalModel): string =>
  m.lanternsLitByPip === null
    ? statHTML('Lanterns', m.lanterns)
    : statHTML('Lanterns', m.lanterns, esc(m.lanterns.text),
      `<span class="ui-stat__note">${m.lanternsLitByPip} lit by you, the rest by the valley</span>`);

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
    `<div class="ui-jgrid">${stats.map((r, i) => (r === m.bells ? bellsHTML(m) : r === m.lanterns ? lanternsHTML(m)
      : r === m.feathers ? statHTML(labels[i], r, esc(r.text), `<span class="ui-stat__note">${esc(FEATHERS_FOR)}</span>`) : statHTML(labels[i], r))).join('')}</div>` +
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
  between = '',
): string {
  if (m.quests.length === 0) {
    return `<p class="ui-empty">No quests yet. Someone by a warm window is waiting.</p>${between}`;
  }
  // Each errand that can be followed says how far its next place is, and the nearest says so.
  const far = new Map<string, { text: string; d: number }>();
  for (const q of m.quests) {
    // Errands only: the story's distance is the compass's, measured along the trail (core/guide/route.ts).
    // Picked up here once the story became a row you can pick, it measured something else entirely:
    // critic round 23 read "203 u northeast" under the goal while the compass said 57 u south.
    const at = q.trackable && q.status === 'active' && !q.main ? where?.(q.id) ?? null : null;
    if (at) far.set(q.id, at);
  }
  let nearest: string | null = null;
  for (const [id, at] of far) if (nearest === null || at.d < (far.get(nearest)?.d ?? Infinity)) nearest = id;
  const rows = m.quests.map((q): string => {
    const tick = q.status === 'complete' ? '✓ ' : '';
    const line =
      q.status === 'complete'
        ? q.epilogue
        : q.status === 'active'
          ? q.nextText ?? '—'
          : q.stepText;
    const cls = q.status === 'active' ? ' ui-quest__step--next' : '';
    const on = q.id === tracked;
    // Critic round 10 read "following" on an errand while the goal and compass named the story, and
    // took them to disagree. They don't: the story is the goal at the top, the followed errand the line
    // under it. The page now says so in those words.
    // Critic round 46 met "line under the goal", "the goal only" and "active" on the same page and could
    // not tell which was being followed: whatever E picked now says "following", story or errand.
    const status = on ? 'following' : q.main && q.status === 'active' ? 'the goal'
      : q.status === 'available' ? 'on offer' : q.status === 'locked' ? 'waiting'
      // A finished chapter of the story isn't an errand: critic round 76 counted two "complete" here and
      // read "Errands for villagers 1 of 18" on the end card as a mismatch.
      : q.main && q.status === 'complete' ? 'story, done' : q.status;
    const pick = q.trackable ? ` is-pickable${q.id === cursor ? ' is-cursor' : ''}${on ? ' is-tracked' : ''}` : '';
    const html =
      `<li class="ui-quest is-${q.status}${pick}" data-quest="${esc(q.id)}"><div class="ui-quest__row"><span class="ui-quest__title">${tick}${esc(q.title)}</span>` +
      `<span class="ui-quest__status">${status}</span></div>` +
      (far.has(q.id)
        ? `<p class="ui-quest__where">${esc(far.get(q.id)?.text ?? '')}${q.id === nearest && far.size > 1 ? ' · nearest' : ''}</p>`
        : '') +
      `<p class="ui-quest__step${cls}">${esc(line)}</p></li>`;
    return html;
  });
  const hint = m.quests.some((q) => q.trackable)
    // Critic round 41 read the old "E puts an errand on the line under the goal, or on the story, follows
    // it alone" twice and still could not tell what E would do. Critic round 48 then read "the compass
    // points there" and watched the big diamond stay on the story: during the story a followed errand
    // gets the small one, after it the big one.
    // The key by its binding: the line said "E" after interact moved to F, and critic round 78 pressed E
    // (which looks round) on the page and saw nothing happen.
    ? `<p class="ui-journal__meta">↑↓ choose · ${KEY.interact} follows it: its step goes under the goal, with its own diamond on the compass · ${KEY.interact} again lets it go</p>`
    : '';
  // `between` (the things to try) goes after the errands under way or on offer, and before the ones still
  // waiting and the finished ones. Critic round 121 found the things to try sinking under a growing list of
  // those, a long way down the page.
  const listed = (...status: readonly string[]): string => rows.filter((_, i) => status.includes(m.quests[i].status)).join('');
  const open = listed('active', 'available');
  const waiting = listed('locked');
  const done = listed('complete');
  return (
    `${hint}${open !== '' ? `<ul class="ui-quests">${open}</ul>` : ''}${between}` +
    (waiting !== '' ? `<h3 class="ui-try__head">Waiting</h3><ul class="ui-quests">${waiting}</ul>` : '') +
    (done !== '' ? `<h3 class="ui-try__head">Done</h3><ul class="ui-quests">${done}</ul>` : '')
  );
}

/** How many of the nearest untried activities the Quests page lists. */
const TRY_ROWS = 6;
/**
 * Within this, an activity is "close by": a short walk, under a minute. It was 250, and critic round 75
 * read things 140 to 240 u off as nearby; on foot they are not.
 */
const TRY_NEAR = 80;

/**
 * Things to try: the nearest activities not yet done, with how far and which way. Critic round 9
 * found the kite, the sled, the skating and the toss only as a line that flashed by, or not at all;
 * the map drew their marks, but nothing said which were near. The page now does. Each says what Pip
 * does there: critic round 48 could not plan from "Boathouse Hill" or "Ice Hole" until 15 u away.
 * The close ones and the ones a walk away are listed under their own headings.
 */
function tryRows(activities: readonly ActivityDef[], s: GameState) {
  const from = s.player.pos;
  return activities
    .filter((a) => (s.counters[`activity:${a.id}`] ?? 0) === 0 && activityOffered(a, s))
    .map((a) => ({ a, dx: a.pos.x - from.x, dz: a.pos.z - from.z }))
    .map((e) => ({ ...e, d: Math.hypot(e.dx, e.dz) }))
    .sort((x, y) => x.d - y.d)
    .slice(0, TRY_ROWS);
}

/**
 * The things to try the Quests page lists, as followable ids (`try:<id>`, errandLine.ts), in page order.
 * The page lists the nearest; one already being followed stays on it wherever it is.
 */
export function tryIds(activities: readonly ActivityDef[], s: GameState, tracked: string | null = null): string[] {
  // In the order the page shows them: the followed one under its own heading, then the close ones, then
  // the far ones. The cursor goes down the page in that order: critic round 100 followed the wrong row
  // when they differed. Critic round 116 read a followed row 870 u off under "close by", where it used to go.
  const rows = tryRows(activities, s);
  const ids = [...rows.filter((e) => e.d <= TRY_NEAR), ...rows.filter((e) => e.d > TRY_NEAR)]
    .map((e) => `try:${e.a.id}`)
    .filter((id) => id !== tracked);
  const kept = tracked?.startsWith('try:') && activities.some((a) => `try:${a.id}` === tracked && (s.counters[`activity:${a.id}`] ?? 0) === 0);
  return kept && tracked ? [tracked, ...ids] : ids;
}

export function tryHTML(activities: readonly ActivityDef[], s: GameState, tracked: string | null = null, cursor: string | null = null): string {
  const from = s.player.pos;
  const ids = tryIds(activities, s, tracked);
  const rows = ids
    .map((id) => activities.find((a) => `try:${a.id}` === id))
    .filter((a): a is ActivityDef => a !== undefined)
    .map((a) => ({ a, dx: a.pos.x - from.x, dz: a.pos.z - from.z }))
    .map((e) => ({ ...e, d: Math.hypot(e.dx, e.dz) }));
  const list = (part: typeof rows): string => part.map((e) => {
    const id = `try:${e.a.id}`;
    const where = e.d < 4 ? 'here' : `${formatDistance(e.d)} ${compassWord(e.dx, e.dz)}`;
    const what = e.a.what ? `<span class="ui-try__what">${esc(e.a.what)}</span>` : '';
    const on = id === tracked;
    const cls = ` is-pickable${id === cursor ? ' is-cursor' : ''}${on ? ' is-tracked' : ''}`;
    return `<li class="ui-try${cls}" data-quest="${esc(id)}"><span class="ui-try__name">${esc(e.a.name)}${what}</span><span class="ui-quest__where">${esc(on ? `following · ${where}` : where)}</span></li>`;
  }).join('');
  const followed = rows.filter((e) => `try:${e.a.id}` === tracked);
  const near = rows.filter((e) => e.d <= TRY_NEAR && !followed.includes(e));
  const far = rows.filter((e) => !near.includes(e) && !followed.includes(e));
  let html = '';
  if (followed.length > 0) html += `<h3 class="ui-try__head">Following</h3><ul class="ui-tries">${list(followed)}</ul>`;
  if (near.length > 0) html += `<h3 class="ui-try__head">Things to try close by</h3><ul class="ui-tries">${list(near)}</ul>`;
  if (far.length > 0) html += `<h3 class="ui-try__head">Things to try, a walk away</h3><ul class="ui-tries">${list(far)}</ul>`;
  // Followed like an errand: critic round 77 read "High Tarn, 36 u west" here and had nothing to follow it by.
  if (rows.length > 0) html += `<p class="ui-journal__meta">↑↓ to one of these and ${KEY.interact} follows it, as it does an errand · ${KEY.interact} again lets it go</p>`;
  return html;
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
      .join('')}</ul><p class="ui-empty">${KEY.pause} closes the journal.</p>` + creditsHTML()
  );
}

/** The credits, and the licence text each library asks to travel with it (data/credits.ts). */
function creditsHTML(): string {
  return (
    '<section class="ui-credits" aria-label="Credits">' +
    '<h3 class="ui-credits__title">Brindle Peak</h3>' +
    `<dl class="ui-credits__list">${CREDITS.map((c) => `<dt>${esc(c.role)}</dt><dd>${esc(c.who)}</dd>`).join('')}</dl>` +
    LICENCES.map((l) => `<h4 class="ui-credits__lic">${esc(l.name)}</h4><pre class="ui-credits__text">${esc(l.text)}</pre>`).join('') +
    '</section>'
  );
}
