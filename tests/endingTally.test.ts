import { describe, expect, it } from 'vitest';
import { tally } from '../src/game/ui/ending';

// Critic round 54 read "Errands 1 of 18, Things tried 4 of 22" straight after the finale as a mark against it.
describe('the ending card counts', () => {
  it('says what was done, then that more is waiting, without a total to fall short of', () => {
    expect(tally(1, 18, 'seen through', 'more waiting')).toBe('one seen through, more waiting');
    expect(tally(5, 9, '', 'more to see')).toBe('five, more to see');
    expect(tally(16, 22, '', 'more to see')).toBe('16, more to see');
  });

  it('names what is waiting when nothing is done, and "every one" when all is', () => {
    expect(tally(0, 18, 'seen through', 'more waiting')).toBe('18 waiting for you');
    expect(tally(6, 6, '', 'more to see')).toBe('every one');
  });
});
