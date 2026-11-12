import { DomainError, type Money, TimeRange } from '@polya/shared-kernel';

/** EC-M8: chegirma 10–50% */
export const MIN_DISCOUNT_PERCENT = 10;
export const MAX_DISCOUNT_PERCENT = 50;
/** TZ 4.9: faqat kelgusi 24 soat ichidagi bo'sh slotlarga */
export const PROMOTION_HORIZON_MS = 24 * 3_600_000;
/** Bitta e'londa ko'pi bilan */
export const PROMOTION_MAX_HOURS = 6;
/** TZ 4.9: PREMIUM — oyiga 4 ta (limit `FeatureGate`da); "oy" — sirpanuvchi 30 kun */
export const PROMOTION_PERIOD_MS = 30 * 86_400_000;

export class InvalidPromotionError extends DomainError {
  readonly code = 'INVALID_PROMOTION';
}

export interface PromotionProps {
  venueId: string;
  pitchId: string;
  cityId: string;
  range: TimeRange;
  percent: number;
  /** E'londa ko'rsatish uchun: chegirmagacha bo'lgan eng past soatlik narx */
  basePrice: Money;
  createdBy: string;
  createdAt: Date;
}

/**
 * "Bo'sh soatga chegirma" (TZ 4.9). O'zgarmas: yaratiladi va muddati tugaguncha amal qiladi.
 * Chegirma narxga Scheduling orqali qo'shiladi (`DiscountRegistry`), shuning uchun so'rov narx
 * snapshot'iga ham tushadi (SP-5).
 */
export class Promotion {
  private constructor(
    readonly id: string,
    readonly props: Readonly<PromotionProps>,
  ) {}

  static create(id: string, props: PromotionProps, now: Date): Promotion {
    const { percent, range } = props;
    if (
      !Number.isInteger(percent) ||
      percent < MIN_DISCOUNT_PERCENT ||
      percent > MAX_DISCOUNT_PERCENT
    )
      throw new InvalidPromotionError('Discount must be 10..50%', { percent });
    const hours = range.durationMinutes / 60;
    if (!Number.isInteger(hours) || hours < 1 || hours > PROMOTION_MAX_HOURS)
      throw new InvalidPromotionError('Promotion must cover 1..6 whole hours', { hours });
    if (
      range.start.getTime() < now.getTime() ||
      range.end.getTime() > now.getTime() + PROMOTION_HORIZON_MS
    )
      throw new InvalidPromotionError('Promotion must be within the next 24 hours', {
        start: range.start.toISOString(),
      });
    return new Promotion(id, { ...props });
  }

  static reconstitute(id: string, props: PromotionProps): Promotion {
    return new Promotion(id, { ...props });
  }

  get range(): TimeRange {
    return this.props.range;
  }

  get discountedPrice(): Money {
    return this.props.basePrice.applyDiscountPercent(this.props.percent);
  }

  /** MK-3 istisnosi: oxirgi soat boshlangach e'lon ma'nosiz — yuborilmaganlari bekor qilinadi */
  isStale(now: Date): boolean {
    return now.getTime() >= this.range.end.getTime() - 3_600_000;
  }

  /** Har bir soat boshi (epoch ms) → foiz */
  slotStarts(): number[] {
    const out: number[] = [];
    for (let t = this.range.start.getTime(); t < this.range.end.getTime(); t += 3_600_000)
      out.push(t);
    return out;
  }
}

export function promotionRange(start: Date, hours: number): TimeRange {
  return TimeRange.of(start, new Date(start.getTime() + hours * 3_600_000));
}

export abstract class PromotionStore {
  abstract add(promotion: Promotion): Promise<void>;
  abstract find(id: string): Promise<Promotion | null>;
  abstract countSince(venueId: string, since: Date): Promise<number>;
  /** `[from, to)` bilan kesishadigan e'lonlar */
  abstract overlapping(pitchIds: readonly string[], from: Date, to: Date): Promise<Promotion[]>;
}
