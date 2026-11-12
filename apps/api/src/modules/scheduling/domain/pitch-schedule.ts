import { AggregateRoot, DomainError, Money } from '@polya/shared-kernel';
import type { OpeningHours } from './opening-hours.js';

/** ISO hafta kuni: 1 = dushanba … 7 = yakshanba */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export const WEEKDAYS: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 7];

/**
 * Maydonning haftalik ish jadvali (TZ SP-1). Aggregate ID = pitchId (har maydonda bitta jadval).
 * `null` — o'sha kun yopiq. Istisnolar (SP-2) va bo'sh slotlar hisobi 3-bosqichda qo'shiladi.
 */
export class PitchSchedule extends AggregateRoot<string> {
  #weekly: Map<Weekday, OpeningHours | null>;
  #updatedAt: Date;

  private constructor(
    pitchId: string,
    weekly: Map<Weekday, OpeningHours | null>,
    updatedAt: Date,
    version: number,
  ) {
    super(pitchId, version);
    this.#weekly = weekly;
    this.#updatedAt = updatedAt;
  }

  /** Onboarding (TZ VC-2): "har kuni bir xil". */
  static uniform(pitchId: string, hours: OpeningHours, now: Date): PitchSchedule {
    return new PitchSchedule(pitchId, new Map(WEEKDAYS.map((d) => [d, hours])), now, 0);
  }

  static reconstitute(
    pitchId: string,
    weekly: Map<Weekday, OpeningHours | null>,
    updatedAt: Date,
    version: number,
  ): PitchSchedule {
    return new PitchSchedule(pitchId, new Map(weekly), updatedAt, version);
  }

  get pitchId(): string {
    return this.id;
  }
  get updatedAt(): Date {
    return this.#updatedAt;
  }

  hoursOn(day: Weekday): OpeningHours | null {
    return this.#weekly.get(day) ?? null;
  }

  get weekly(): ReadonlyMap<Weekday, OpeningHours | null> {
    return this.#weekly;
  }

  /** Barcha kunlar bir xil bo'lsa — o'sha vaqt (kartochkada qisqa ko'rsatish uchun). */
  get uniformHours(): OpeningHours | null | undefined {
    const values = [...this.#weekly.values()];
    const first = values[0] ?? null;
    const same = values.every((h) =>
      h === null ? first === null : first !== null && h.equals(first),
    );
    return same ? first : undefined;
  }

  setUniform(hours: OpeningHours, now: Date): void {
    this.#weekly = new Map(WEEKDAYS.map((d) => [d, hours]));
    this.#updatedAt = now;
  }

  setDay(day: Weekday, hours: OpeningHours | null, now: Date): void {
    this.#weekly.set(day, hours);
    this.#updatedAt = now;
  }
}

export class InvalidPriceError extends DomainError {
  readonly code = 'INVALID_PRICE';
}

export const MIN_PRICE_PER_HOUR = 1_000;
export const MAX_PRICE_PER_HOUR = 5_000_000;

/**
 * Maydon narxi (TZ SP-4). MVP onboarding'da bitta soatlik narx; kun/soat qoidalari 3-bosqichda.
 */
export class PricingPlan extends AggregateRoot<string> {
  #basePerHour: Money;
  #updatedAt: Date;

  private constructor(pitchId: string, basePerHour: Money, updatedAt: Date, version: number) {
    super(pitchId, version);
    this.#basePerHour = basePerHour;
    this.#updatedAt = updatedAt;
  }

  static create(pitchId: string, basePerHour: Money, now: Date): PricingPlan {
    assertPrice(basePerHour);
    return new PricingPlan(pitchId, basePerHour, now, 0);
  }

  static reconstitute(
    pitchId: string,
    basePerHour: Money,
    updatedAt: Date,
    version: number,
  ): PricingPlan {
    return new PricingPlan(pitchId, basePerHour, updatedAt, version);
  }

  get basePerHour(): Money {
    return this.#basePerHour;
  }
  get updatedAt(): Date {
    return this.#updatedAt;
  }

  setBasePrice(price: Money, now: Date): void {
    assertPrice(price);
    this.#basePerHour = price;
    this.#updatedAt = now;
  }
}

function assertPrice(price: Money): void {
  if (price.amount < MIN_PRICE_PER_HOUR || price.amount > MAX_PRICE_PER_HOUR) {
    throw new InvalidPriceError('Hourly price is out of range', {
      amount: price.amount,
      min: MIN_PRICE_PER_HOUR,
      max: MAX_PRICE_PER_HOUR,
    });
  }
}

export abstract class PitchScheduleRepository {
  abstract findByPitch(pitchId: string): Promise<PitchSchedule | null>;
  abstract findByPitches(pitchIds: readonly string[]): Promise<PitchSchedule[]>;
  abstract save(schedule: PitchSchedule): Promise<void>;
}

export abstract class PricingPlanRepository {
  abstract findByPitch(pitchId: string): Promise<PricingPlan | null>;
  abstract findByPitches(pitchIds: readonly string[]): Promise<PricingPlan[]>;
  abstract save(plan: PricingPlan): Promise<void>;
}
