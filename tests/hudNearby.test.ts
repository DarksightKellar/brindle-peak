import { describe, expect, it } from 'vitest';
import { createNearbyNotice } from '../src/game/ui/hudNearby';
import { fresh } from './progressFixtures';

describe('nearby notice', () => {
  it('drops a named errand once it is done, whatever its seconds left', () => {
    const notice = createNearbyNotice([]);
    const s = fresh();
    const bundle = { id: 'errand:ilsa-kindling:2', label: 'Errand nearby: The Bundle', pos: { x: 10, z: 0 } };
    expect(notice.update(s, { x: 0, z: 0 }, 0, [bundle])).toContain('The Bundle');
    // Still on offer a moment later: still said.
    expect(notice.update(s, { x: 1, z: 0 }, 500, [bundle])).toContain('The Bundle');
    // Done (no longer among the things to name) inside its few seconds: gone.
    expect(notice.update(s, { x: 2, z: 0 }, 1000, [])).toBe('');
  });
});
