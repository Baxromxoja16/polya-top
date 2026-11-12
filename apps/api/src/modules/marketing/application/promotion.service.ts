import { Injectable } from '@nestjs/common';
import { Clock, err, IdGenerator, Money, ok, type Result } from '@polya/shared-kernel';
import { CatalogQueries } from '../../catalog/index.js';
import {
  AvailabilityService,
  type DiscountSource,
  type PitchDiscounts,
} from '../../scheduling/index.js';
import { FeatureGate } from '../../subscription/index.js';
import { Campaign } from '../domain/campaign.js';
import { CampaignStore } from '../domain/marketing-ports.js';
import {
  InvalidPromotionError,
  PROMOTION_HORIZON_MS,
  PROMOTION_PERIOD_MS,
  Promotion,
  PromotionStore,
  promotionRange,
} from '../domain/promotion.js';

export type PromotionError =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  /** 4.9: FREE tarifda yo'q */
  | 'PREMIUM_REQUIRED'
  /** 4.9: oyiga 4 ta */
  | 'LIMIT_REACHED'
  /** EC-M8, 24 soat, 1–6 soat */
  | 'INVALID'
  /** Faqat bo'sh slotlarga */
  | 'NOT_FREE'
  /** Shu vaqtga allaqachon chegirma bor */
  | 'OVERLAP';

export interface PromotionDraft {
  actorUserId: string;
  pitchId: string;
  start: Date;
  hours: number;
  percent: number;
}

/**
 * Chegirma e'loni (TZ 4.9): FeatureGate (PREMIUM, oyiga 4 ta) → bo'sh slot tekshiruvi → e'lon
 * va shahar bo'yicha kampaniya (MK-1…MK-7 qoidalari bilan). Chegirma narxga `DiscountSource` orqali.
 */
@Injectable()
export class PromotionService implements DiscountSource {
  constructor(
    private readonly promotions: PromotionStore,
    private readonly campaigns: CampaignStore,
    private readonly catalog: CatalogQueries,
    private readonly availability: AvailabilityService,
    private readonly features: FeatureGate,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  /** 4.9: qolgan limit (FREE — 0) */
  async remaining(venueId: string): Promise<number> {
    const limit = await this.features.limit(venueId, 'PROMOTIONS_PER_MONTH');
    if (limit === 0) return 0;
    const since = new Date(this.clock.now().getTime() - PROMOTION_PERIOD_MS);
    return Math.max(0, limit - (await this.promotions.countSince(venueId, since)));
  }

  async create(draft: PromotionDraft): Promise<Result<Promotion, PromotionError>> {
    const ctx = await this.catalog.pitchContext(draft.pitchId);
    if (!ctx || !ctx.venue.isPublic) return err('NOT_FOUND');
    if (ctx.venue.ownerId !== draft.actorUserId) return err('FORBIDDEN');
    if (!(await this.features.can(ctx.venue.id, 'PROMOTIONS_PER_MONTH')))
      return err('PREMIUM_REQUIRED');
    if ((await this.remaining(ctx.venue.id)) === 0) return err('LIMIT_REACHED');

    const now = this.clock.now();
    if (draft.start.getTime() + draft.hours * 3_600_000 > now.getTime() + PROMOTION_HORIZON_MS)
      return err('INVALID');
    const quote = await this.availability.quote({
      pitchId: draft.pitchId,
      start: draft.start,
      hours: draft.hours,
      timeZone: ctx.timeZone,
    });
    if (!quote.ok) return err('NOT_FREE');
    const range = promotionRange(draft.start, draft.hours);
    if ((await this.promotions.overlapping([draft.pitchId], range.start, range.end)).length)
      return err('OVERLAP');

    let promotion: Promotion;
    try {
      promotion = Promotion.create(
        this.ids.next(),
        {
          venueId: ctx.venue.id,
          pitchId: draft.pitchId,
          cityId: ctx.venue.cityId,
          range,
          percent: draft.percent,
          basePrice: quote.quote.breakdown.reduce(
            (min, b) => (b.price.amount < min.amount ? b.price : min),
            quote.quote.breakdown[0]?.price ?? Money.zero(),
          ),
          createdBy: draft.actorUserId,
          createdAt: now,
        },
        now,
      );
    } catch (error) {
      if (error instanceof InvalidPromotionError) return err('INVALID');
      throw error;
    }
    await this.promotions.add(promotion);
    // MK-1…MK-7 chegirmaga ham: shahar bo'yicha kampaniya, oyna, haftalik limit, opt-out
    await this.campaigns.save(
      Campaign.start({
        id: this.ids.next(),
        kind: 'PROMOTION',
        cityId: ctx.venue.cityId,
        venueIds: [ctx.venue.id],
        promotionId: promotion.id,
        now,
      }),
    );
    return ok(promotion);
  }

  find(id: string): Promise<Promotion | null> {
    return this.promotions.find(id);
  }

  /** `DiscountSource` (Scheduling): faol chegirmalar soat bo'yicha */
  async load(
    pitchIds: readonly string[],
    from: Date,
    to: Date,
  ): Promise<Map<string, PitchDiscounts>> {
    const result = new Map<string, Map<number, number>>();
    for (const p of await this.promotions.overlapping(pitchIds, from, to)) {
      const byPitch = result.get(p.props.pitchId) ?? new Map<number, number>();
      for (const t of p.slotStarts())
        byPitch.set(t, Math.max(byPitch.get(t) ?? 0, p.props.percent));
      result.set(p.props.pitchId, byPitch);
    }
    return result;
  }
}
