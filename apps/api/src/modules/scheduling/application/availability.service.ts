import { Injectable } from '@nestjs/common';
import { addDays, Clock, type LocalDate, Money, TimeRange, zonedParts } from '@polya/shared-kernel';
import { type BookingPolicy, DEFAULT_BOOKING_POLICY } from '../domain/booking-policy.js';
import {
  type PitchSchedule,
  PitchScheduleRepository,
  type PricingPlan,
  PricingPlanRepository,
} from '../domain/pitch-schedule.js';
import { type Slot, slotsOf } from '../domain/slots.js';
import { EMPTY_OCCUPANCY, OccupancyRegistry, type PitchOccupancy } from './occupancy.js';

export type SlotStatus = 'FREE' | 'REQUESTED' | 'BOOKED' | 'PAST';

export interface SlotView extends Slot {
  status: SlotStatus;
  pendingRequests: number;
  price: Money;
}

export interface Quote {
  pitchId: string;
  range: TimeRange;
  businessDate: LocalDate;
  total: Money;
  /** TZ EC-S5: har bir soat narxi alohida */
  breakdown: { start: Date; price: Money }[];
  /** Ichida 🟡 so'rov bor slotlar soni (BK-3d navbat haqida ogohlantirish) */
  pendingRequests: number;
}

export type QuoteError =
  | 'NO_SCHEDULE'
  | 'OUTSIDE_HOURS'
  | 'TOO_SOON'
  | 'BEYOND_HORIZON'
  | 'TOO_LONG'
  | 'BOOKED';

/**
 * TZ SP-8: bo'sh slotlar saqlanmaydi, hisoblanadi.
 * Availability = Jadval − Istisnolar − Band (tasdiqlangan bandlov / blok). So'rovlar slotni egallamaydi (BK-3a).
 */
@Injectable()
export class AvailabilityService {
  constructor(
    private readonly schedules: PitchScheduleRepository,
    private readonly pricing: PricingPlanRepository,
    private readonly occupancy: OccupancyRegistry,
    private readonly clock: Clock,
  ) {}

  /** Bandlash mumkin bo'lgan biznes kunlari: bugun (va ehtimol kecha, agar uning tungi slotlari qolgan bo'lsa) … ufq. */
  bookableDates(timeZone: string, policy: BookingPolicy = DEFAULT_BOOKING_POLICY): LocalDate[] {
    const today = zonedParts(this.clock.now(), timeZone).date;
    return Array.from({ length: policy.horizonDays }, (_, i) => addDays(today, i));
  }

  async dayView(
    pitchId: string,
    date: LocalDate,
    timeZone: string,
    policy = DEFAULT_BOOKING_POLICY,
  ): Promise<SlotView[]> {
    const [schedule, plan] = await Promise.all([
      this.schedules.findByPitch(pitchId),
      this.pricing.findByPitch(pitchId),
    ]);
    if (!schedule || !plan) return [];
    const slots = slotsOf(schedule, date, timeZone);
    if (slots.length === 0) return [];
    const occ =
      (
        await this.occupancy.load([pitchId], slots[0]?.start as Date, slots.at(-1)?.end as Date)
      ).get(pitchId) ?? EMPTY_OCCUPANCY;
    const earliest = this.earliestStart(policy);
    return slots.map((slot) => this.view(slot, plan, occ, earliest));
  }

  /**
   * Narx va tekshiruv (bandlash oldidan): to'r, ish vaqti, lead time, ufq, davomiylik, bandlik.
   * `start` — maydon vaqt zonasida biror slot boshi bo'lishi shart.
   */
  async quote(params: {
    pitchId: string;
    start: Date;
    hours: number;
    timeZone: string;
    policy?: BookingPolicy;
  }): Promise<{ ok: true; quote: Quote } | { ok: false; error: QuoteError }> {
    const policy = params.policy ?? DEFAULT_BOOKING_POLICY;
    if (
      !Number.isInteger(params.hours) ||
      params.hours < 1 ||
      params.hours > policy.maxDurationHours
    ) {
      return { ok: false, error: 'TOO_LONG' };
    }
    const [schedule, plan] = await Promise.all([
      this.schedules.findByPitch(params.pitchId),
      this.pricing.findByPitch(params.pitchId),
    ]);
    if (!schedule || !plan) return { ok: false, error: 'NO_SCHEDULE' };

    const located = locate(schedule, params.start, params.timeZone);
    if (!located) return { ok: false, error: 'OUTSIDE_HOURS' };
    const { slots, index } = located;
    const wanted = slots.slice(index, index + params.hours);
    // TZ EC-S12: ish vaqti oxiridan chiqib ketmaydi
    if (wanted.length < params.hours) return { ok: false, error: 'OUTSIDE_HOURS' };

    if (params.start.getTime() < this.earliestStart(policy).getTime())
      return { ok: false, error: 'TOO_SOON' };
    const today = zonedParts(this.clock.now(), params.timeZone).date;
    if (located.businessDate > addDays(today, policy.horizonDays - 1))
      return { ok: false, error: 'BEYOND_HORIZON' };

    const range = TimeRange.of(wanted[0]?.start as Date, wanted.at(-1)?.end as Date);
    const occ =
      (await this.occupancy.load([params.pitchId], range.start, range.end)).get(params.pitchId) ??
      EMPTY_OCCUPANCY;
    if (wanted.some((s) => occ.booked.has(s.start.getTime())))
      return { ok: false, error: 'BOOKED' };

    const breakdown = wanted.map((s) => ({
      start: s.start,
      price: plan.priceAt(s.businessDate, s.hour),
    }));
    return {
      ok: true,
      quote: {
        pitchId: params.pitchId,
        range,
        businessDate: located.businessDate,
        total: breakdown.reduce((sum, b) => sum.add(b.price), Money.zero()),
        breakdown,
        pendingRequests: Math.max(
          0,
          ...wanted.map((s) => occ.requested.get(s.start.getTime()) ?? 0),
        ),
      },
    };
  }

  /** "Bo'sh maydon topish" (TZ 5.2): berilgan vaqtda `hours` soat bo'sh bo'lgan maydonlar. */
  async findFree(params: {
    pitchIds: readonly string[];
    start: Date;
    hours: number;
    timeZoneOf: (pitchId: string) => string;
  }): Promise<Map<string, Quote>> {
    const result = new Map<string, Quote>();
    await Promise.all(
      params.pitchIds.map(async (pitchId) => {
        const q = await this.quote({
          pitchId,
          start: params.start,
          hours: params.hours,
          timeZone: params.timeZoneOf(pitchId),
        });
        if (q.ok) result.set(pitchId, q.quote);
      }),
    );
    return result;
  }

  private view(slot: Slot, plan: PricingPlan, occ: PitchOccupancy, earliest: Date): SlotView {
    const key = slot.start.getTime();
    const pendingRequests = occ.requested.get(key) ?? 0;
    const status: SlotStatus =
      key < earliest.getTime()
        ? 'PAST'
        : occ.booked.has(key)
          ? 'BOOKED'
          : pendingRequests > 0
            ? 'REQUESTED'
            : 'FREE';
    return { ...slot, status, pendingRequests, price: plan.priceAt(slot.businessDate, slot.hour) };
  }

  /** TZ SP-7, EC-S8: boshlangan slot va lead time ichidagi slot bandlanmaydi. */
  private earliestStart(policy: BookingPolicy): Date {
    return new Date(this.clock.now().getTime() + policy.minLeadMinutes * 60_000);
  }
}

/** Instant qaysi biznes kunining qaysi slotiga to'g'ri keladi (tungi slotlar oldingi kunda, EC-S1). */
function locate(
  schedule: PitchSchedule,
  start: Date,
  timeZone: string,
): { businessDate: LocalDate; slots: Slot[]; index: number } | null {
  const local = zonedParts(start, timeZone).date;
  for (const date of [local, addDays(local, -1)]) {
    const slots = slotsOf(schedule, date, timeZone);
    const index = slots.findIndex((s) => s.start.getTime() === start.getTime());
    if (index !== -1) return { businessDate: date, slots, index };
  }
  return null;
}
