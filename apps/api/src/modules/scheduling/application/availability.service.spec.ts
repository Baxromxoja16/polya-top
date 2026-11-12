import { FixedClock, Money } from '@polya/shared-kernel';
import { beforeEach, describe, expect, it } from 'vitest';
import { OpeningHours } from '../domain/opening-hours.js';
import {
  PitchSchedule,
  PitchScheduleRepository,
  PricingPlan,
  PricingPlanRepository,
} from '../domain/pitch-schedule.js';
import { AvailabilityService } from './availability.service.js';
import { DiscountRegistry } from './discounts.js';
import { OccupancyRegistry } from './occupancy.js';

class Schedules extends PitchScheduleRepository {
  constructor(private readonly items: PitchSchedule[]) {
    super();
  }
  async findByPitch(id: string) {
    return this.items.find((s) => s.pitchId === id) ?? null;
  }
  async findByPitches(ids: readonly string[]) {
    return this.items.filter((s) => ids.includes(s.pitchId));
  }
  async save() {}
}

class Plans extends PricingPlanRepository {
  constructor(private readonly items: PricingPlan[]) {
    super();
  }
  async findByPitch(id: string) {
    return this.items.find((p) => p.id === id) ?? null;
  }
  async findByPitches(ids: readonly string[]) {
    return this.items.filter((p) => ids.includes(p.id));
  }
  async save() {}
}

const TZ = 'Asia/Tashkent';
const at = (iso: string) => new Date(iso);
const occupancyOf = (booked: string[], requested: [string, number][] = []) => ({
  load: async () =>
    new Map([
      [
        'p1',
        {
          booked: new Set(booked.map((iso) => at(iso).getTime())),
          requested: new Map(requested.map(([iso, n]) => [at(iso).getTime(), n])),
        },
      ],
    ]),
});

describe('AvailabilityService (SP-8, EC-S1, EC-S5, EC-S8, EC-S9, EC-S12)', () => {
  let clock: FixedClock;
  let occupancy: OccupancyRegistry;
  let discounts: DiscountRegistry;
  let service: AvailabilityService;

  beforeEach(() => {
    clock = new FixedClock(at('2026-11-12T12:40:00Z')); // Toshkent 17:40
    occupancy = new OccupancyRegistry();
    discounts = new DiscountRegistry();
    const now = clock.now();
    const plan = PricingPlan.create('p1', Money.of(100_000), now);
    plan.addRule(
      { id: 'ev', days: { kind: 'ALL' }, fromHour: 18, toHour: 0, pricePerHour: Money.of(150_000) },
      now,
    );
    service = new AvailabilityService(
      new Schedules([PitchSchedule.uniform('p1', OpeningHours.of(8, 2), now)]),
      new Plans([plan]),
      occupancy,
      clock,
      discounts,
    );
  });

  const quote = (iso: string, hours = 1) =>
    service.quote({ pitchId: 'p1', start: at(iso), hours, timeZone: TZ });

  it('EC-S8: started slots and slots inside the lead time are PAST', async () => {
    const byHour = new Map(
      (await service.dayView('p1', '2026-11-12', TZ)).map((s) => [s.hour, s.status]),
    );
    expect(byHour.get(17)).toBe('PAST');
    expect(byHour.get(18)).toBe('PAST'); // 20 daqiqa qoldi < 30 daqiqalik lead
    expect(byHour.get(19)).toBe('FREE');
    expect(byHour.get(25)).toBe('FREE'); // 01:00 — shu biznes kuni
  });

  it('marks booked and requested slots from the occupancy source', async () => {
    occupancy.use(occupancyOf(['2026-11-12T15:00:00Z'], [['2026-11-12T16:00:00Z', 2]]));
    const day = await service.dayView('p1', '2026-11-12', TZ);
    expect(day.find((s) => s.hour === 20)?.status).toBe('BOOKED');
    expect(day.find((s) => s.hour === 21)).toMatchObject({
      status: 'REQUESTED',
      pendingRequests: 2,
    });
  });

  it('EC-S5: a quote sums per-hour prices across a price boundary', async () => {
    clock.set(at('2026-11-12T05:00:00Z')); // 10:00
    const q = await quote('2026-11-12T12:00:00Z', 2); // 17:00–19:00
    expect(q.ok && q.quote.total.amount).toBe(250_000);
    expect(q.ok && q.quote.breakdown.map((b) => b.price.amount)).toEqual([100_000, 150_000]);
  });

  it('4.9 / SP-5: a promotion discount is applied per slot to the quote and the day view', async () => {
    clock.set(at('2026-11-12T05:00:00Z')); // 10:00
    discounts.use({
      load: async () => new Map([['p1', new Map([[at('2026-11-12T13:00:00Z').getTime(), 20]])]]),
    });
    const q = await quote('2026-11-12T12:00:00Z', 2); // 17:00 (100k) + 18:00 (150k −20%)
    expect(q.ok && q.quote.breakdown.map((b) => [b.price.amount, b.discountPercent])).toEqual([
      [100_000, 0],
      [120_000, 20],
    ]);
    expect(q.ok && q.quote.total.amount).toBe(220_000);
    const view = await service.dayView('p1', '2026-11-12', TZ);
    expect(view.find((s) => s.hour === 18)).toMatchObject({ discountPercent: 20 });
  });

  it('EC-S1: an overnight start belongs to the previous business day', async () => {
    const q = await quote('2026-11-12T20:00:00Z'); // 13-noyabr 01:00
    expect(q.ok && q.quote.businessDate).toBe('2026-11-12');
  });

  it('EC-S12: a duration running past closing time is rejected', async () => {
    expect(await quote('2026-11-12T20:00:00Z', 2)).toEqual({ ok: false, error: 'OUTSIDE_HOURS' });
  });

  it('rejects off-grid, too soon, beyond horizon, too long and booked', async () => {
    expect(await quote('2026-11-12T14:30:00Z')).toEqual({ ok: false, error: 'OUTSIDE_HOURS' });
    expect(await quote('2026-11-12T13:00:00Z')).toEqual({ ok: false, error: 'TOO_SOON' });
    expect(await quote('2026-11-27T05:00:00Z')).toEqual({ ok: false, error: 'BEYOND_HORIZON' });
    expect(await quote('2026-11-13T05:00:00Z', 5)).toEqual({ ok: false, error: 'TOO_LONG' });
    occupancy.use(occupancyOf(['2026-11-13T06:00:00Z']));
    expect(await quote('2026-11-13T05:00:00Z', 2)).toEqual({ ok: false, error: 'BOOKED' });
  });

  it('BK-3a: requested slots stay bookable and the queue size is reported', async () => {
    occupancy.use(occupancyOf([], [['2026-11-13T05:00:00Z', 1]]));
    const q = await quote('2026-11-13T05:00:00Z');
    expect(q.ok && q.quote.pendingRequests).toBe(1);
  });

  it('lists horizon dates starting today', () => {
    const dates = service.bookableDates(TZ);
    expect(dates[0]).toBe('2026-11-12');
    expect(dates).toHaveLength(14);
  });
});
