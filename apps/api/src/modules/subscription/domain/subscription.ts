import { AggregateRoot, DomainError } from '@polya/shared-kernel';
import type { Plan } from './plans.js';

export type SubscriptionSource = 'FOUNDER_TRIAL' | 'MANUAL_PAYMENT';

export class InvalidSubscriptionError extends DomainError {
  readonly code = 'INVALID_SUBSCRIPTION';
}

export interface SubscriptionPeriod {
  plan: Plan;
  startsAt: Date;
  endsAt: Date;
  source: SubscriptionSource;
  activatedBy: string | null;
}

/**
 * Stadion obunasi (TZ 4.9). Aggregate ID = venueId. Muddati o'tgan PREMIUM avtomatik FREE hisoblanadi —
 * hech narsa o'chirilmaydi (EC-M4, EC-M5), faqat imkoniyatlar FREE limitlariga tushadi.
 */
export class Subscription extends AggregateRoot<string> {
  #history: SubscriptionPeriod[];

  private constructor(venueId: string, history: SubscriptionPeriod[], version: number) {
    super(venueId, version);
    this.#history = history;
  }

  static empty(venueId: string): Subscription {
    return new Subscription(venueId, [], 0);
  }

  static reconstitute(
    venueId: string,
    history: SubscriptionPeriod[],
    version: number,
  ): Subscription {
    return new Subscription(venueId, [...history], version);
  }

  get venueId(): string {
    return this.id;
  }
  get history(): readonly SubscriptionPeriod[] {
    return this.#history;
  }

  planAt(now: Date): Plan {
    return this.#history.some((p) => p.plan === 'PREMIUM' && p.startsAt <= now && now < p.endsAt)
      ? 'PREMIUM'
      : 'FREE';
  }

  premiumEndsAt(now: Date): Date | null {
    const active = this.#history.filter((p) => p.plan === 'PREMIUM' && p.endsAt > now);
    return active.length ? new Date(Math.max(...active.map((p) => p.endsAt.getTime()))) : null;
  }

  get hadFounderTrial(): boolean {
    return this.#history.some((p) => p.source === 'FOUNDER_TRIAL');
  }

  /** Q16: bir marta */
  startFounderTrial(days: number, now: Date): boolean {
    if (this.hadFounderTrial) return false;
    this.extend(days, 'FOUNDER_TRIAL', null, now);
    return true;
  }

  /** TZ 4.9: MVP'da to'lov qo'lda — Admin uzaytiradi. Faol muddat bo'lsa, oxiridan davom etadi. */
  extend(days: number, source: SubscriptionSource, activatedBy: string | null, now: Date): void {
    if (!Number.isInteger(days) || days < 1 || days > 366) {
      throw new InvalidSubscriptionError('Days must be 1..366', { days });
    }
    const from = this.premiumEndsAt(now) ?? now;
    this.#history = [
      ...this.#history,
      {
        plan: 'PREMIUM',
        startsAt: from,
        endsAt: new Date(from.getTime() + days * 86_400_000),
        source,
        activatedBy,
      },
    ];
  }
}

export abstract class SubscriptionStore {
  abstract find(venueId: string): Promise<Subscription | null>;
  abstract findMany(venueIds: readonly string[]): Promise<Subscription[]>;
  abstract save(subscription: Subscription): Promise<void>;
}
