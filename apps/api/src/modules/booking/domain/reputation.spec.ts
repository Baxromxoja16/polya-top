import { describe, expect, it } from 'vitest';
import { isRestricted, isUnreliable, type Reputation } from './reputation.js';

const now = new Date('2026-11-12T10:00:00Z');
const days = (n: number) => new Date(now.getTime() - n * 86_400_000);
const rep = (noShow: number, lastDaysAgo: number | null): Reputation => ({
  completed: 10,
  noShow,
  lateCancel: 0,
  lastNoShowAt: lastDaysAgo === null ? null : days(lastDaysAgo),
});

describe('Reputation (TZ 4.8)', () => {
  it('3+ no-shows marks the player as unreliable', () => {
    expect(isUnreliable(rep(2, 1))).toBe(false);
    expect(isUnreliable(rep(3, 1))).toBe(true);
  });

  it('5+ no-shows restricts booking for 30 days after the last one', () => {
    expect(isRestricted(rep(4, 1), now)).toBe(false);
    expect(isRestricted(rep(5, 1), now)).toBe(true);
    expect(isRestricted(rep(5, 29), now)).toBe(true);
    expect(isRestricted(rep(5, 31), now)).toBe(false);
  });
});
