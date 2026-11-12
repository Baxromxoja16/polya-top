import { describe, expect, it } from 'vitest';
import { InvalidMoneyError, Money } from './money.js';

describe('Money', () => {
  it("creates integer so'm amounts", () => {
    expect(Money.of(150_000).toJSON()).toEqual({ amount: 150_000, currency: 'UZS' });
  });

  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'rejects non safe-integer amount %s',
    (amount) => {
      expect(() => Money.of(amount)).toThrow(InvalidMoneyError);
    },
  );

  it('rejects negative amounts', () => {
    expect(() => Money.of(-1)).toThrow(InvalidMoneyError);
  });

  it('adds, subtracts and multiplies without mutating', () => {
    const price = Money.of(100_000);
    expect(price.add(Money.of(50_000)).amount).toBe(150_000);
    expect(price.subtract(Money.of(40_000)).amount).toBe(60_000);
    expect(price.multiply(3).amount).toBe(300_000);
    expect(price.amount).toBe(100_000);
  });

  it('does not allow subtraction below zero', () => {
    expect(() => Money.of(10).subtract(Money.of(11))).toThrow(InvalidMoneyError);
  });

  it('rejects fractional multipliers', () => {
    expect(() => Money.of(10).multiply(1.5)).toThrow(InvalidMoneyError);
  });

  it("applies discount and rounds to whole so'm", () => {
    expect(Money.of(150_000).applyDiscountPercent(20).amount).toBe(120_000);
    expect(Money.of(333).applyDiscountPercent(50).amount).toBe(167);
    expect(Money.of(100).applyDiscountPercent(0).amount).toBe(100);
    expect(Money.of(100).applyDiscountPercent(100).amount).toBe(0);
  });

  it.each([-1, 101, 12.5])('rejects discount percent %s', (percent) => {
    expect(() => Money.of(100).applyDiscountPercent(percent)).toThrow(InvalidMoneyError);
  });

  it('compares by value', () => {
    expect(Money.of(5).equals(Money.of(5))).toBe(true);
    expect(Money.of(5).compareTo(Money.of(7))).toBe(-1);
    expect(Money.of(7).compareTo(Money.of(5))).toBe(1);
    expect(Money.zero().isZero()).toBe(true);
  });
});
