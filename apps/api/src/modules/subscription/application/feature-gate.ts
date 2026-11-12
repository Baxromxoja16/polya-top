import { Injectable } from '@nestjs/common';
import { Clock, ConcurrencyConflictError } from '@polya/shared-kernel';
import { type Feature, FOUNDER_TRIAL_DAYS, PLAN_FEATURES, type Plan } from '../domain/plans.js';
import { Subscription, SubscriptionStore } from '../domain/subscription.js';

/**
 * TZ 4.9: `FeatureGate.can(venueId, feature)` — premium imkoniyat tekshiruvining yagona joyi.
 * Obuna ma'lumoti alohida kontekstda; boshqa kontekstlar faqat shu facade'ni biladi.
 */
@Injectable()
export class FeatureGate {
  constructor(
    private readonly store: SubscriptionStore,
    private readonly clock: Clock,
  ) {}

  async planOf(venueId: string): Promise<Plan> {
    return (await this.store.find(venueId))?.planAt(this.clock.now()) ?? 'FREE';
  }

  async can(venueId: string, feature: Feature): Promise<boolean> {
    return Boolean(PLAN_FEATURES[await this.planOf(venueId)][feature]);
  }

  async limit(venueId: string, feature: Feature): Promise<number> {
    const value = PLAN_FEATURES[await this.planOf(venueId)][feature];
    return typeof value === 'number' ? value : value ? Number.POSITIVE_INFINITY : 0;
  }

  /** Bir nechta stadion uchun bir so'rovda (qidiruv saralashi, VC-5a) */
  async premiumAmong(venueIds: readonly string[]): Promise<Set<string>> {
    const now = this.clock.now();
    const subs = await this.store.findMany(venueIds);
    return new Set(subs.filter((s) => s.planAt(now) === 'PREMIUM').map((s) => s.venueId));
  }

  async premiumEndsAt(venueId: string): Promise<Date | null> {
    return (await this.store.find(venueId))?.premiumEndsAt(this.clock.now()) ?? null;
  }

  /** Q16: stadion tasdiqlanganda — "Asoschi hamkor" 3 oylik PREMIUM (bir marta) */
  async startFounderTrial(venueId: string): Promise<boolean> {
    return this.mutate(venueId, (s, now) => s.startFounderTrial(FOUNDER_TRIAL_DAYS, now));
  }

  /** TZ 4.9: to'lov qo'lda — Admin uzaytiradi */
  async extend(venueId: string, days: number, adminId: string): Promise<Date | null> {
    await this.mutate(venueId, (s, now) => {
      s.extend(days, 'MANUAL_PAYMENT', adminId, now);
      return true;
    });
    return this.premiumEndsAt(venueId);
  }

  private async mutate(
    venueId: string,
    change: (s: Subscription, now: Date) => boolean,
  ): Promise<boolean> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const sub = (await this.store.find(venueId)) ?? Subscription.empty(venueId);
      if (!change(sub, this.clock.now())) return false;
      try {
        await this.store.save(sub);
        return true;
      } catch (error) {
        if (!(error instanceof ConcurrencyConflictError)) throw error;
      }
    }
    return false;
  }
}
