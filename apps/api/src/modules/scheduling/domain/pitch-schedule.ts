import {
  AggregateRoot,
  DomainError,
  type LocalDate,
  type Money,
  parseLocalDate,
  weekdayOf,
} from '@polya/shared-kernel';
import type { OpeningHours } from './opening-hours.js';

/** ISO hafta kuni: 1 = dushanba … 7 = yakshanba */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export const WEEKDAYS: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 7];

const MAX_EXCEPTIONS = 120;

/**
 * Maydonning ish jadvali (TZ SP-1, SP-2). Aggregate ID = pitchId (har maydonda bitta jadval).
 * Haftalik jadval + aniq sanalar uchun istisnolar (bayram, ta'mir). `null` — o'sha kun yopiq.
 * Sana — biznes kuni: 16:00–02:00 jadvalda 01:00 slot oldingi kunga tegishli (TZ EC-S1).
 */
export class PitchSchedule extends AggregateRoot<string> {
  #weekly: Map<Weekday, OpeningHours | null>;
  #exceptions: Map<LocalDate, OpeningHours | null>;
  #updatedAt: Date;

  private constructor(
    pitchId: string,
    weekly: Map<Weekday, OpeningHours | null>,
    exceptions: Map<LocalDate, OpeningHours | null>,
    updatedAt: Date,
    version: number,
  ) {
    super(pitchId, version);
    this.#weekly = weekly;
    this.#exceptions = exceptions;
    this.#updatedAt = updatedAt;
  }

  /** Onboarding (TZ VC-2): "har kuni bir xil". */
  static uniform(pitchId: string, hours: OpeningHours, now: Date): PitchSchedule {
    return new PitchSchedule(pitchId, new Map(WEEKDAYS.map((d) => [d, hours])), new Map(), now, 0);
  }

  static reconstitute(
    pitchId: string,
    weekly: Map<Weekday, OpeningHours | null>,
    exceptions: Map<LocalDate, OpeningHours | null>,
    updatedAt: Date,
    version: number,
  ): PitchSchedule {
    return new PitchSchedule(pitchId, new Map(weekly), new Map(exceptions), updatedAt, version);
  }

  get pitchId(): string {
    return this.id;
  }
  get updatedAt(): Date {
    return this.#updatedAt;
  }
  get weekly(): ReadonlyMap<Weekday, OpeningHours | null> {
    return this.#weekly;
  }
  get exceptions(): ReadonlyMap<LocalDate, OpeningHours | null> {
    return this.#exceptions;
  }

  hoursOn(day: Weekday): OpeningHours | null {
    return this.#weekly.get(day) ?? null;
  }

  /** Aniq biznes kuni uchun ish vaqti: istisno → haftalik jadval. */
  hoursFor(date: LocalDate): OpeningHours | null {
    if (this.#exceptions.has(date)) return this.#exceptions.get(date) ?? null;
    return this.#weekly.get(weekdayOf(date) as Weekday) ?? null;
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

  /** TZ SP-2: aniq sana — yopiq (`null`) yoki boshqa ish vaqti. O'tgan sanalar avtomatik tozalanadi. */
  setException(date: LocalDate, hours: OpeningHours | null, today: LocalDate, now: Date): void {
    parseLocalDate(date);
    if (date < today) throw new InvalidScheduleError('Exception date is in the past', { date });
    for (const d of this.#exceptions.keys()) if (d < today) this.#exceptions.delete(d);
    if (!this.#exceptions.has(date) && this.#exceptions.size >= MAX_EXCEPTIONS) {
      throw new InvalidScheduleError('Too many exceptions', { max: MAX_EXCEPTIONS });
    }
    this.#exceptions.set(date, hours);
    this.#updatedAt = now;
  }

  removeException(date: LocalDate, now: Date): void {
    this.#exceptions.delete(date);
    this.#updatedAt = now;
  }
}

export class InvalidScheduleError extends DomainError {
  readonly code = 'INVALID_SCHEDULE';
}
export class InvalidPriceError extends DomainError {
  readonly code = 'INVALID_PRICE';
}

export const MIN_PRICE_PER_HOUR = 1_000;
export const MAX_PRICE_PER_HOUR = 5_000_000;
const MAX_RULES = 30;

/** Qaysi kunlarga qo'llanadi (TZ SP-4: aniq sana > hafta kuni turi > har kuni). */
export type DaySelector =
  | { kind: 'ALL' }
  | { kind: 'WEEKDAYS' }
  | { kind: 'WEEKEND' }
  | { kind: 'DATE'; date: LocalDate };

export interface PricingRule {
  id: string;
  days: DaySelector;
  /** Soat oralig'i [from, to); to <= from — yarim tundan o'tadi (18→02) */
  fromHour: number;
  toHour: number;
  pricePerHour: Money;
}

const PRIORITY: Record<DaySelector['kind'], number> = { DATE: 3, WEEKDAYS: 2, WEEKEND: 2, ALL: 1 };

/**
 * Maydon narxi (TZ SP-4, SP-5): bazaviy soatlik narx + kun/soat qoidalari.
 * Bazaviy narx har doim bor — shuning uchun ish vaqtining narxsiz qolgan daqiqasi bo'lmaydi (EC-S11).
 */
export class PricingPlan extends AggregateRoot<string> {
  #basePerHour: Money;
  #rules: PricingRule[];
  #updatedAt: Date;

  private constructor(
    pitchId: string,
    base: Money,
    rules: PricingRule[],
    updatedAt: Date,
    version: number,
  ) {
    super(pitchId, version);
    this.#basePerHour = base;
    this.#rules = rules;
    this.#updatedAt = updatedAt;
  }

  static create(pitchId: string, basePerHour: Money, now: Date): PricingPlan {
    assertPrice(basePerHour);
    return new PricingPlan(pitchId, basePerHour, [], now, 0);
  }

  static reconstitute(
    pitchId: string,
    basePerHour: Money,
    rules: PricingRule[],
    updatedAt: Date,
    version: number,
  ): PricingPlan {
    return new PricingPlan(pitchId, basePerHour, [...rules], updatedAt, version);
  }

  get basePerHour(): Money {
    return this.#basePerHour;
  }
  get rules(): readonly PricingRule[] {
    return this.#rules;
  }
  get updatedAt(): Date {
    return this.#updatedAt;
  }

  setBasePrice(price: Money, now: Date): void {
    assertPrice(price);
    this.#basePerHour = price;
    this.#updatedAt = now;
  }

  addRule(rule: PricingRule, now: Date): void {
    assertPrice(rule.pricePerHour);
    if (!Number.isInteger(rule.fromHour) || rule.fromHour < 0 || rule.fromHour > 23) {
      throw new InvalidPriceError('Rule start hour must be 0..23', { fromHour: rule.fromHour });
    }
    if (!Number.isInteger(rule.toHour) || rule.toHour < 0 || rule.toHour > 24) {
      throw new InvalidPriceError('Rule end hour must be 0..24', { toHour: rule.toHour });
    }
    if (rule.days.kind === 'DATE') parseLocalDate(rule.days.date);
    if (this.#rules.length >= MAX_RULES)
      throw new InvalidPriceError('Too many rules', { max: MAX_RULES });
    this.#rules = [...this.#rules, rule];
    this.#updatedAt = now;
  }

  removeRule(ruleId: string, now: Date): void {
    this.#rules = this.#rules.filter((r) => r.id !== ruleId);
    this.#updatedAt = now;
  }

  /**
   * Bitta slot narxi. `hour` — biznes kunidagi soat (0..47; 25 = ertasi kun 01:00, EC-S1).
   * Bir xil ustuvorlikda keyin qo'shilgan qoida yutadi.
   */
  priceAt(businessDate: LocalDate, hour: number): Money {
    let best: { priority: number; index: number; price: Money } | null = null;
    this.#rules.forEach((rule, index) => {
      if (!matchesDay(rule.days, businessDate) || !matchesHour(rule, hour)) return;
      const priority = PRIORITY[rule.days.kind];
      if (!best || priority > best.priority || (priority === best.priority && index > best.index)) {
        best = { priority, index, price: rule.pricePerHour };
      }
    });
    return (best as { price: Money } | null)?.price ?? this.#basePerHour;
  }
}

function matchesDay(days: DaySelector, date: LocalDate): boolean {
  switch (days.kind) {
    case 'ALL':
      return true;
    case 'DATE':
      return days.date === date;
    case 'WEEKDAYS':
      return weekdayOf(date) <= 5;
    case 'WEEKEND':
      return weekdayOf(date) >= 6;
  }
}

function matchesHour(rule: PricingRule, hour: number): boolean {
  const to = rule.toHour === 0 ? 24 : rule.toHour;
  const end = to <= rule.fromHour ? to + 24 : to;
  const inRange = (h: number) => rule.fromHour <= h && h < end;
  return inRange(hour) || (hour >= 24 && inRange(hour - 24));
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
