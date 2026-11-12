import { Money } from '@polya/shared-kernel';
import { describe, expect, it } from 'vitest';
import { OpeningHours } from './opening-hours.js';
import { InvalidPriceError, PitchSchedule, PricingPlan } from './pitch-schedule.js';
import { parsePriceInput } from './price-input.js';

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
