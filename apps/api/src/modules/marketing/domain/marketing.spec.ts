import { describe, expect, it } from 'vitest';
import { Campaign, CampaignClosedError, EMPTY_STATS, exceedsBlockRatio } from './campaign.js';
import { hasQuota, isWithinSendingWindow } from './marketing-policy.js';

const now = new Date('2026-11-12T10:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

describe('marketing policy (TZ 4.6.1)', () => {
  it('MK-3: sends only between 10:00 and 21:00 local time', () => {
    expect(isWithinSendingWindow(9)).toBe(false);
    expect(isWithinSendingWindow(10)).toBe(true);
    expect(isWithinSendingWindow(20)).toBe(true);
    expect(isWithinSendingWindow(21)).toBe(false);
  });

  it('MK-2: at most 2 marketing messages in a rolling week', () => {
    expect(hasQuota([], now)).toBe(true);
    expect(hasQuota([daysAgo(1)], now)).toBe(true);
    expect(hasQuota([daysAgo(1), daysAgo(3)], now)).toBe(false);
    expect(hasQuota([daysAgo(8), daysAgo(3)], now)).toBe(true);
  });

  it('MK-7: alerts when more than 2% of reached users blocked the bot', () => {
    expect(exceedsBlockRatio({ ...EMPTY_STATS, delivered: 98, blocked: 2 })).toBe(false);
    expect(exceedsBlockRatio({ ...EMPTY_STATS, delivered: 97, blocked: 3 })).toBe(true);
    expect(exceedsBlockRatio(EMPTY_STATS)).toBe(false);
  });
});

describe('Campaign', () => {
  it('advances a cursor and finishes; a closed campaign cannot change', () => {
    const c = Campaign.start({ id: 'c1', kind: 'NEW_VENUES', cityId: 'x', venueIds: ['v1'], now });
    c.advance('u5');
    expect(c.cursor).toBe('u5');
    c.finish(now);
    expect(c.status).toBe('DONE');
    expect(() => c.cancel(now)).toThrow(CampaignClosedError);
  });
});
