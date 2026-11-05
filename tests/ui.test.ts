import { describe, expect, it } from 'vitest';
import type { GameState, QuestDef, QuestStep } from '../src/core/contracts';
import type { GuideStep } from '../src/core/guide/nextStep';
import { FRESH_STEP_S, NEAR_STEP, nextStepFor, worthShowing } from '../src/core/guide/nextStep';
import { QUESTS } from '../src/data/quests';
import { NPCS } from '../src/data/npcs';
import { ACTIVITIES } from '../src/data/activities';
import { PLACES } from '../src/data/places';
import { ZONES } from '../src/data/zones';
import { ZONE_NAMES } from '../src/data/zoneNames';
import { ZONE_IDS, createGameState } from '../src/core/contracts';
import { MAX_TOASTS, TOAST_LIFE, ToastQueue, splitToast } from '../src/game/ui/toasts';
import { CHARS_PER_SEC, Typewriter } from '../src/game/ui/dialogue';
import { ICON_NAMES, icon } from '../src/game/ui/icons';
import { FEATHERS_TOTAL, formatJournal, formatPlaytime } from '../src/game/ui/journal';
import { ACHIEVEMENTS } from '../src/data/achievements';
import { NOTICE_MS, createNearbyNotice } from '../src/game/ui/hudNearby';

const state = (): GameState => createGameState({ x: 0, y: 1.5, z: 0 }, 6);

describe('toast queue (GDD R5)', () => {
  it('never shows a pickup toast', () => {
    const q = new ToastQueue();
    expect(q.push('Bell', 'bell', 'pickup')).toBeNull();
    expect(q.size).toBe(0);
    expect(q.list()).toHaveLength(0);
  });

  /*
   * Policy change after play. The queue used to refuse a new toast when it was full and nothing on
   * screen was quieter — which meant a player who finished an activity while three zone/quest toasts
   * were up got no confirmation at all, the single moment the feedback exists for. The newest reward
   * now always shows; what is protected is a finale, not the oldest entry.
   */
  it('holds at most three, and the newest reward is shown rather than swallowed', () => {
    const q = new ToastQueue();
    q.push('Feather one', 'feather', 'discovery');
    q.push('Feather two', 'feather', 'discovery');
    q.push('Feather three', 'feather', 'discovery');
    expect(q.size).toBe(MAX_TOASTS);

    const four = q.push('Feather four', 'feather', 'discovery');
    expect(four).not.toBeNull();
    expect(q.size).toBe(MAX_TOASTS);
    // Oldest out, newest in: the player sees the thing that just happened.
    expect(q.list().map((t) => t.text)).toEqual(['Feather two', 'Feather three', 'Feather four']);
  });

  it('never displaces a finale for a quieter toast', () => {
    const q = new ToastQueue();
    q.push('The summit', 'star', 'finale');
    q.push('Quest done', 'quest', 'milestone');
    q.push('New zone', 'mountain', 'milestone');

    expect(q.push('A fish', 'fish', 'discovery')).toBeNull();
    expect(q.list().map((t) => t.text)).toContain('The summit');
  });

  it('evicts the quietest tier first, so a finale is never displaced by a discovery', () => {
    const q = new ToastQueue();
    q.push('Quest done', 'quest', 'milestone');
    q.push('A fish', 'fish', 'discovery');
    q.push('New zone', 'mountain', 'milestone');

    q.push('The summit', 'star', 'finale');
    const tiers = q.list().map((t) => t.tier);
    expect(q.size).toBe(3);
    expect(tiers).not.toContain('discovery');
    expect(tiers).toContain('finale');

    // A discovery arriving at a full, loud stack is dropped outright.
    expect(q.push('Another fish', 'fish', 'discovery')).toBeNull();
  });

  it('expires each tier at its own lifetime', () => {
    const q = new ToastQueue();
    q.push('A fish', 'fish', 'discovery');
    q.push('The summit', 'star', 'finale');
    expect(TOAST_LIFE.discovery).toBeLessThan(TOAST_LIFE.finale);

    expect(q.update(TOAST_LIFE.discovery - 0.1)).toEqual([]);
    expect(q.update(0.2)).toEqual([1]); // the discovery, not the finale
    expect(q.list().map((t) => t.tier)).toEqual(['finale']);
    q.update(TOAST_LIFE.finale);
    expect(q.size).toBe(0);
  });

  it('splits "Name — line" for the two-line treatment', () => {
    expect(splitToast('Feather — the third of fourteen')).toEqual({
      name: 'Feather',
      line: 'the third of fourteen',
    });
    expect(splitToast('Feather')).toEqual({ name: 'Feather', line: '' });
  });
});

describe('typewriter', () => {
  it('reveals at the rated speed and reports completion', () => {
    const tw = new Typewriter('hello world', 45);
    expect(CHARS_PER_SEC).toBeGreaterThan(0);
    expect(tw.text).toBe('');
    expect(tw.complete).toBe(false);
    const after = tw.update(0.1); // 45 * 0.1 = 4.5 chars
    expect(after).toBe('hell');
    expect(tw.revealed).toBe(4);
    tw.update(0.1);
    expect(tw.revealed).toBe(9);
  });

  it('skip completes instantly and load rewinds', () => {
    const tw = new Typewriter('a long line of dialogue');
    tw.update(0.05);
    expect(tw.skip()).toBe('a long line of dialogue');
    expect(tw.complete).toBe(true);
    tw.load('next');
    expect(tw.complete).toBe(false);
    expect(tw.text).toBe('');
  });

  it('finishes exactly on the string, never past it', () => {
    const tw = new Typewriter('snow', 45);
    for (let i = 0; i < 50; i++) tw.update(0.1);
    expect(tw.text).toBe('snow');
    expect(tw.revealed).toBe(4);
  });
});

describe('icons', () => {
  it('renders every glyph as a real svg and falls back on an unknown name', () => {
    expect(new Set(ICON_NAMES).size).toBe(ICON_NAMES.length);
    for (const name of ICON_NAMES) {
      const svg = icon(name);
      expect(svg, name).toContain('<svg');
      expect(svg, name).toContain('</svg>');
      expect(svg, name).not.toContain('undefined');
      expect(svg, name).not.toContain('NaN');
    }
    expect(icon('no-such-icon')).toContain('<svg');
    expect(icon('feather', 24)).toContain('width="24"');
  });
});

describe('journal model', () => {
  const filled = (): GameState => {
    const s = state();
    s.feathers = 4;
    s.bells = 12;
    s.lanterns = { hearth: 1, kettles: 1, ridge: 0 };
    s.fish = { trout: 2 };
    s.visited = { hearth: true, pinewind: true };
    s.achievements = { 'first-flight': 1 };
    s.playtime = 3725;
    s.sledBests = { 'reach-hill': 41.2 };
    s.quests = { lanterns: { status: 'active', step: 1 } };
    return s;
  };

  it('counts collections against their authored totals', () => {
    const m = formatJournal(filled());
    expect(m.feathers.text).toBe(`4 / ${FEATHERS_TOTAL}`);
    expect(m.bells.text).toBe('12'); // no pickup table supplied: a plain count, never a fake total
    expect(m.lanterns.got).toBe(2); // the zero entry is not a lit lantern
    expect(m.lanterns.text).toBe('2'); // no authored total, so no invented denominator
    expect(m.fish.got).toBe(1);
    expect(m.photos).toMatchObject({ got: 0, text: '0' });
    expect(m.achievements.got).toBe(1);
    expect(m.playtime).toBe('1h 02m');
    expect(m.sledBest).toBe('41.2s');
  });

  it('keeps an offer Pip said "not now" to on the Quests page until it is taken (critic round 34)', () => {
    const s = filled();
    s.flags['declined:tuck-rope'] = true;
    const row = formatJournal(s, { quests: QUESTS }).quests.find((q) => q.id === 'tuck-rope');
    expect(row).toMatchObject({ title: 'The Good Rope', status: 'available', trackable: false });
    expect(row?.stepText).toBe('Bram asked, and you said not now. Talk to Bram again to take it on.');
    s.quests['tuck-rope'] = { status: 'active', step: 0 };
    expect(formatJournal(s, { quests: QUESTS }).quests.filter((q) => q.id === 'tuck-rope').map((q) => q.status)).toEqual(['active']);
  });

  it('counts every post lit once the radio call has the valley light the rest, and keeps Pip\'s share', () => {
    const s = filled();
    expect(formatJournal(s, { lanternsTotal: 12 })).toMatchObject({ lanterns: { text: '2 / 12' }, lanternsLitByPip: null });
    s.quests['the-mast'] = { status: 'complete', step: 2 };
    expect(formatJournal(s, { lanternsTotal: 12 })).toMatchObject({ lanterns: { got: 12, text: '12 / 12' }, lanternsLitByPip: 2 });
  });

  /*
   * The unlock value is the ORDER the player earned it in, not a boolean: the tracker writes
   * `s.achievements[id] = Object.keys(s.achievements).length`, so the first achievement anyone earns
   * is stored as 0. A `> 0` test therefore marked precisely that one as Locked while the header said
   * "Unlocked 1 / 20" — seen in the journal on a fresh save after talking to Nana.
   */
  it("treats the first-earned achievement (stored as order 0) as unlocked", () => {
    const s = state();
    s.achievements = { 'nanas-porch': 0 };
    const m = formatJournal(s, { achievements: ACHIEVEMENTS });
    expect(m.achievements.got).toBe(1);
    expect(m.achievements.text).toBe(`1 / ${ACHIEVEMENTS.length}`);
    const nanas = m.achievementsList.find((a) => a.id === 'nanas-porch');
    expect(nanas?.unlocked).toBe(true);
    expect(m.achievementsList.filter((a) => a.unlocked)).toHaveLength(1);
  });

  it('lists every zone with its visit mark', () => {
    const m = formatJournal(filled());
    expect(m.zones.map((z) => z.id)).toEqual([...ZONE_IDS]);
    expect(m.zones.find((z) => z.id === 'hearth')?.visited).toBe(true);
    expect(m.zones.find((z) => z.id === 'pinewind')?.visited).toBe(true);
    expect(m.zones.find((z) => z.id === 'reach')?.visited).toBe(false);
  });

  it('reads quest step text from content when it is supplied', () => {
    const def: QuestDef = {
      id: 'lanterns',
      title: 'Light the Way',
      giver: 'nana',
      zone: 'hearth',
      offer: 'o',
      waiting: 'w',
      steps: [
        { id: 's1', text: 'Find the lantern', when: { kind: 'flag', id: 'lantern' } },
        { id: 's2', text: 'Light three lanterns', when: { kind: 'count', id: 'lanterns', n: 3 } },
      ],
      reward: { feathers: 1 },
      blurb: 'Nana wants the path lit.',
    };
    const m = formatJournal(filled(), { quests: [def] });
    expect(m.quests[0].title).toBe('Light the Way');
    expect(m.quests[0].stepText).toBe('Light three lanterns');
    expect(m.quests[0].status).toBe('active');
    expect(formatJournal(filled()).quests[0].stepText).toBe('Step 2');
  });

  it('formats playtime without a leading zero hour', () => {
    expect(formatPlaytime(0)).toBe('0m');
    expect(formatPlaytime(59)).toBe('0m');
    expect(formatPlaytime(600)).toBe('10m');
    expect(formatPlaytime(3600)).toBe('1h 00m');
  });
});

describe('the errand line', () => {
  const at = (distance: number | null, kind: GuideStep['kind'] = 'quest'): GuideStep => ({
    kind, questId: 'q', questTitle: 'q', stepIndex: 0, stepText: 'Ask Bram.', zone: 'hearth',
    target: distance === null ? null : { x: 0, z: 0 }, bearing: null, distance,
  });

  it('names an errand when it is near or new, and leaves a far one to the journal (not homework)', () => {
    expect(worthShowing(at(NEAR_STEP), 999)).toBe(true);
    expect(worthShowing(at(600), 1)).toBe(true);
    expect(worthShowing(at(600), FRESH_STEP_S)).toBe(false);
    expect(worthShowing(at(600, 'explore'), 0)).toBe(false);
    expect(worthShowing(at(null), 0)).toBe(false);
  });

  // Hollis's mitten step, "walk into Pinewind Wood", was handed out inside the wood and led to empty snow.
  // Every step ends at a person, an activity, a place, or a zone the player walks into from elsewhere.
  it('ends every quest step at something the player can see and act on', () => {
    const where = (c: QuestStep['when']): string | undefined => c.kind === 'talked'
      ? NPCS.find((n) => n.id === c.id)?.zone : c.kind === 'reached' ? PLACES.find((p) => p.id === c.id)?.zone
      : c.kind === 'activity' ? ACTIVITIES.find((a) => a.id === c.id)?.zone : c.kind === 'visited' ? c.id : undefined;
    const dead = QUESTS.flatMap((q) => q.steps.filter((st, i) => {
      const zone = where(st.when);
      return zone === undefined || (st.when.kind === 'visited' && zone === (i === 0 ? q.zone : where(q.steps[i - 1].when)));
    }).map((st) => `${q.id}/${st.id}`));
    expect(dead).toEqual([]);
  });

  it('gives no bearing to a "walk into" step while the player stands in that zone', () => {
    const steps: QuestStep[] = [{ id: 'go', text: 'Walk into the wood.', when: { kind: 'visited', id: 'pinewind' } }];
    const walk = { id: 'w', title: 'w', giver: 'x', zone: 'hearth', blurb: '', offer: 'o', waiting: 'o', steps, reward: {} } as QuestDef;
    const s = state(); s.quests.w = { status: 'active', step: 0, base: 0 };
    const content = { quests: [walk], npcs: NPCS, activities: ACTIVITIES, zones: ZONES, places: PLACES, zoneNames: ZONE_NAMES };
    expect(nextStepFor(s, { x: -300, z: 300 }, content, 'side')?.target).not.toBeNull();
    s.zone = 'pinewind';
    expect(nextStepFor(s, { x: -230, z: 150 }, content, 'side')?.target).toBeNull();
  });
});

describe('nearby line (round 7)', () => {
  // No activities, so only the errand passed in can be named.
  const quiet = (): ReturnType<typeof createNearbyNotice> => createNearbyNotice([]);
  const errand = { id: 'errand:orla-flour:0', label: 'Errand nearby: Four Loaves', pos: { x: 0, z: 50 } };

  it('names another errand coming near, with its bearing', () => {
    expect(quiet().update(state(), { x: 0, z: 0 }, 0, [errand])).toBe('Errand nearby: Four Loaves — south, 50 u');
  });

  it('names it again after Pip has gone well away and come back', () => {
    const n = quiet();
    const s = state();
    n.update(s, { x: 0, z: 0 }, 0, [errand]);
    expect(n.update(s, { x: 0, z: 0 }, NOTICE_MS + 1, [errand])).toBe('');
    n.update(s, { x: 0, z: 400 }, NOTICE_MS + 2, [errand]);
    expect(n.update(s, { x: 0, z: 0 }, NOTICE_MS + 3, [errand])).toBe('Errand nearby: Four Loaves — south, 50 u');
  });

  it('drops the line when a hop carries Pip out of range inside its few seconds', () => {
    const n = quiet();
    const s = state();
    n.update(s, { x: 0, z: 0 }, 0, [errand]);
    expect(n.update(s, { x: 700, z: 0 }, 100, [errand])).toBe('');
  });
});
