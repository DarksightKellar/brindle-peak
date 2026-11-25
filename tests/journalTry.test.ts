import { describe, expect, it } from 'vitest';
import { createGameState } from '../src/core/contracts';
import { ACTIVITIES } from '../src/data/activities';
import { QUESTS } from '../src/data/quests';
import { formatJournal } from '../src/game/ui/journalModel';
import { questsHTML, tryHTML, tryIds } from '../src/game/ui/journalTabs';

describe('a followed thing to try a long way off (critic round 116 read it under "close by", 870 u away)', () => {
  const s = createGameState({ x: -206, y: 0, z: 150 }, 6); // beside the Pinecone Toss in Pinewind
  const far = 'try:peak-thermal-flight';

  it('lists it under its own heading, above the close ones', () => {
    const html = tryHTML(ACTIVITIES, s, far);
    const following = html.indexOf('>Following<');
    const close = html.indexOf('Things to try close by');
    expect(following).toBeGreaterThanOrEqual(0);
    expect(close).toBeGreaterThan(following);
    expect(html.indexOf('peak-thermal-flight')).toBeLessThan(close);
    expect(html.slice(close)).not.toContain('peak-thermal-flight');
  });

  it('puts it first in the cursor order too, and only once', () => {
    const ids = tryIds(ACTIVITIES, s, far);
    expect(ids[0]).toBe(far);
    expect(ids.filter((id) => id === far)).toHaveLength(1);
  });

  it('has no Following heading when nothing to try is followed', () => {
    expect(tryHTML(ACTIVITIES, s, null)).not.toContain('>Following<');
  });
});

describe('finished errands at the foot of the Quests page (critic round 121)', () => {
  it('lists the open ones, then the things to try, then what is done', () => {
    const s = createGameState({ x: -206, y: 0, z: 150 }, 6);
    s.quests['the-line'] = { status: 'complete', step: 4 };
    s.quests['the-climb'] = { status: 'active', step: 0, base: 0 };
    const html = questsHTML(formatJournal(s, { quests: QUESTS }), null, null, undefined, tryHTML(ACTIVITIES, s));
    const open = html.indexOf('data-quest="the-climb"');
    const tries = html.indexOf('Things to try');
    const done = html.indexOf('>Done<');
    expect(open).toBeGreaterThanOrEqual(0);
    expect(tries).toBeGreaterThan(open);
    expect(done).toBeGreaterThan(tries);
    expect(html.indexOf('data-quest="the-line"')).toBeGreaterThan(done);
  });
});
