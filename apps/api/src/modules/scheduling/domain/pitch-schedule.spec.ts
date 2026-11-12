import { Money } from '@polya/shared-kernel';
import { describe, expect, it } from 'vitest';
import { OpeningHours } from './opening-hours.js';
import {
  InvalidPriceError,
  InvalidScheduleError,
  PitchSchedule,
  PricingPlan,
} from './pitch-schedule.js';
import { parsePriceInput } from './price-input.js';
import { slotsOf } from './slots.js';

const now = new Date('2026-11-12T10:00:00Z');

describe('PitchSchedule', () => {
  it('uniform schedule has the same hours every day', () => {
    const s = PitchSchedule.uniform('p1', OpeningHours.of(8, 0), now);
    expect(s.hoursOn(1)?.format()).toBe('08:00–00:00');
    expect(s.hoursOn(7)?.format()).toBe('08:00–00:00');
    expect(s.uniformHours?.format()).toBe('08:00–00:00');
  });

  it('a different day breaks uniformity; a closed day is null', () => {
    const s = PitchSchedule.uniform('p1', OpeningHours.of(8, 0), now);
    s.setDay(7, null, now);
    expect(s.hoursOn(7)).toBeNull();
    expect(s.uniformHours).toBeUndefined();
  });
});

describe('PricingPlan', () => {
  it.each([999, 5_000_001])('rejects out-of-range price %s', (amount) => {
    expect(() => PricingPlan.create('p1', Money.of(amount), now)).toThrow(InvalidPriceError);
  });

  it('accepts a normal price', () => {
    expect(PricingPlan.create('p1', Money.of(150_000), now).basePerHour.amount).toBe(150_000);
  });
});

describe('parsePriceInput (EC-O2)', () => {
  it.each([
    ['150000', 150_000],
    ['150 000', 150_000],
    ["150 000 so'm", 150_000],
    ['150.000', 150_000],
    ['150k', 150_000],
    ['150 ming', 150_000],
    ['1.5 mln', 1_500_000],
    ['1,5 млн', 1_500_000],
    ['200 тыс', 200_000],
    ['80 000 сум', 80_000],
  ])('%j → %s', (input, amount) => {
    expect(parsePriceInput(input)).toEqual({ kind: 'ok', amount });
  });

  it('asks to confirm a value that looks like thousands', () => {
    expect(parsePriceInput('150')).toEqual({ kind: 'confirm', amount: 150_000 });
  });

  it.each(['', 'arzon', '-5', '10 mln', '0', '1.5'])('%j is invalid', (input) => {
    expect(parsePriceInput(input).kind).toBe('invalid');
  });
});

describe('Schedule exceptions and slots (SP-2, EC-S1)', () => {
  const TZ = 'Asia/Tashkent';

  it('an exception overrides the weekly hours; past exceptions are rejected', () => {
    const s = PitchSchedule.uniform('p1', OpeningHours.of(8, 0), now);
    s.setException('2026-11-20', null, '2026-11-12', now);
    s.setException('2026-11-21', OpeningHours.of(10, 14), '2026-11-12', now);
    expect(s.hoursFor('2026-11-20')).toBeNull();
    expect(s.hoursFor('2026-11-21')?.format()).toBe('10:00–14:00');
    expect(s.hoursFor('2026-11-22')?.format()).toBe('08:00–00:00');
    expect(() => s.setException('2026-11-01', null, '2026-11-12', now)).toThrow(
      InvalidScheduleError,
    );
  });

  it('EC-S1: overnight slots belong to the opening business day', () => {
    const s = PitchSchedule.uniform('p1', OpeningHours.of(22, 2), now);
    const slots = slotsOf(s, '2026-11-13', TZ);
    expect(slots.map((x) => x.hour)).toEqual([22, 23, 24, 25]);
    expect(slots.map((x) => x.start.toISOString())).toEqual([
      '2026-11-13T17:00:00.000Z',
      '2026-11-13T18:00:00.000Z',
      '2026-11-13T19:00:00.000Z',
      '2026-11-13T20:00:00.000Z',
    ]);
    expect(slots.every((x) => x.businessDate === '2026-11-13')).toBe(true);
  });

  it('a closed day has no slots', () => {
    const s = PitchSchedule.uniform('p1', OpeningHours.of(8, 0), now);
    s.setDay(7, null, now);
    expect(slotsOf(s, '2026-11-15', TZ)).toEqual([]);
  });
});

describe('Pricing rules (SP-4, EC-S5)', () => {
  const plan = () => {
    const p = PricingPlan.create('p1', Money.of(100_000), now);
    p.addRule(
      {
        id: 'evening',
        days: { kind: 'ALL' },
        fromHour: 18,
        toHour: 2,
        pricePerHour: Money.of(150_000),
      },
      now,
    );
    p.addRule(
      {
        id: 'weekend',
        days: { kind: 'WEEKEND' },
        fromHour: 8,
        toHour: 0,
        pricePerHour: Money.of(180_000),
      },
      now,
    );
    p.addRule(
      {
        id: 'holiday',
        days: { kind: 'DATE', date: '2026-12-31' },
        fromHour: 0,
        toHour: 0,
        pricePerHour: Money.of(300_000),
      },
      now,
    );
    return p;
  };

  it('falls back to the base price', () => {
    expect(plan().priceAt('2026-11-12', 10).amount).toBe(100_000); // payshanba kunduzi
  });

  it('an overnight rule covers hours after midnight of the same business day', () => {
    expect(plan().priceAt('2026-11-12', 18).amount).toBe(150_000);
    expect(plan().priceAt('2026-11-12', 25).amount).toBe(150_000); // 01:00
    expect(plan().priceAt('2026-11-12', 26).amount).toBe(100_000); // 02:00 — qoida tugadi
  });

  it('priority: exact date > weekday type > every day', () => {
    expect(plan().priceAt('2026-11-14', 19).amount).toBe(180_000); // shanba kechqurun — WEEKEND
    expect(plan().priceAt('2026-12-31', 19).amount).toBe(300_000); // aniq sana
  });

  it('a removed rule no longer applies', () => {
    const p = plan();
    p.removeRule('evening', now);
    expect(p.priceAt('2026-11-12', 19).amount).toBe(100_000);
  });

  it('rejects malformed rules', () => {
    expect(() =>
      plan().addRule(
        {
          id: 'x',
          days: { kind: 'ALL' },
          fromHour: 24,
          toHour: 2,
          pricePerHour: Money.of(100_000),
        },
        now,
      ),
    ).toThrow(InvalidPriceError);
  });
});
