import { describe, expect, it } from 'vitest';
import { funnel } from './statistics.service.js';

describe('booking funnel (TZ AD-4)', () => {
  it('counts outcomes and conversion from request to game', () => {
    expect(
      funnel({
        PENDING: 1,
        CONFIRMED: 2,
        COMPLETED: 3,
        REJECTED: 2,
        EXPIRED: 1,
        CANCELLED_BY_PLAYER: 1,
      }),
    ).toEqual({
      requests: 10,
      confirmed: 5,
      rejected: 2,
      expired: 1,
      cancelled: 1,
      noShow: 0,
      conversion: 50,
    });
  });

  it('is zero-safe', () => {
    expect(funnel({}).conversion).toBe(0);
  });
});
