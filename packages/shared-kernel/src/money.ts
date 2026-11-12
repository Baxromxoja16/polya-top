import { DomainError } from './domain-error.js';

export type Currency = 'UZS';

export class InvalidMoneyError extends DomainError {
  readonly code = 'INVALID_MONEY';
}

/**
 * Pul — butun son, so'mda (TZ 6: float ishlatilmaydi). Manfiy qiymat yo'q.
 * Immutable: har bir amal yangi obyekt qaytaradi.
 */
export class Money {
  private constructor(
    readonly amount: number,
    readonly currency: Currency,
  ) {}

  static of(amount: number, currency: Currency = 'UZS'): Money {
    if (!Number.isSafeInteger(amount)) {
      throw new InvalidMoneyError('Money amount must be a safe integer', { amount });
    }
    if (amount < 0) {
      throw new InvalidMoneyError('Money amount must not be negative', { amount });
    }
    return new Money(amount, currency);
  }

  static zero(currency: Currency = 'UZS'): Money {
    return new Money(0, currency);
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.of(this.amount + other.amount, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.of(this.amount - other.amount, this.currency);
  }

  multiply(factor: number): Money {
    if (!Number.isSafeInteger(factor) || factor < 0) {
      throw new InvalidMoneyError('Multiplier must be a non-negative integer', { factor });
    }
    return Money.of(this.amount * factor, this.currency);
  }

  /** Chegirma (TZ 4.9). Natija butun so'mgacha yaxlitlanadi (0.5 yuqoriga). */
  applyDiscountPercent(percent: number): Money {
    if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
      throw new InvalidMoneyError('Discount percent must be an integer in [0, 100]', { percent });
    }
    return Money.of(Math.round((this.amount * (100 - percent)) / 100), this.currency);
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.amount === other.amount;
  }

  compareTo(other: Money): -1 | 0 | 1 {
    this.assertSameCurrency(other);
    return this.amount === other.amount ? 0 : this.amount < other.amount ? -1 : 1;
  }

  isZero(): boolean {
    return this.amount === 0;
  }

  toJSON(): { amount: number; currency: Currency } {
    return { amount: this.amount, currency: this.currency };
  }

  private assertSameCurrency(other: Money): void {
    if (other.currency !== this.currency) {
      throw new InvalidMoneyError('Currency mismatch', {
        left: this.currency,
        right: other.currency,
      });
    }
  }
}
