import { Money } from '@polya/shared-kernel';
import { describe, expect, it } from 'vitest';
import { InvalidPromotionError, Promotion, promotionRange } from './promotion.js';

const now = new Date('2026-11-12T05:00:00Z');
const inHours = (h: number) => new Date(now.getTime() + h * 3_600_000);
const make = (percent: number, startIn: number, hours: number) =>
  Promotion.create(
    'p1',
    {
      venueId: 'v1',
      pitchId: 'pt1',
      cityId: 'c1',
      range: promotionRange(inHours(startIn), hours),
      percent,
      basePrice: Money.of(150_000),
      createdBy: 'u1',
      createdAt: now,
    },
    now,
  );

describe('Promotion (TZ 4.9)', () => {
  it('EC-M8: the discount must be 10–50%', () => {
    expect(() => make(9, 1, 2)).toThrow(InvalidPromotionError);
    expect(() => make(90, 1, 2)).toThrow(InvalidPromotionError);
    expect(make(20, 1, 2).discountedPrice.amount).toBe(120_000);
  });

  it('only within the next 24 hours, 1–6 whole hours', () => {
    expect(() => make(20, 23, 2)).toThrow(InvalidPromotionError);
    expect(() => make(20, -1, 2)).toThrow(InvalidPromotionError);
    expect(() => make(20, 1, 7)).toThrow(InvalidPromotionError);
    expect(make(20, 22, 2).slotStarts()).toEqual([inHours(22).getTime(), inHours(23).getTime()]);
  });

  it('MK-3 exception: becomes stale once its last hour has started', () => {
    const p = make(20, 1, 2);
    expect(p.isStale(inHours(1.5))).toBe(false);
    expect(p.isStale(inHours(2))).toBe(true);
  });
});
