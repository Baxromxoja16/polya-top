import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  addDays,
  FixedClock,
  localizedText,
  Money,
  zonedParts,
  zonedToUtc,
} from '@polya/shared-kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type BookingActor,
  BookingQueries,
  BookingService,
} from '../../src/modules/booking/index.js';
import type { Actor } from '../../src/modules/catalog/application/actor.js';
import { RegisterVenueUseCase } from '../../src/modules/catalog/application/register-venue.use-case.js';
import { VenueManagementService } from '../../src/modules/catalog/application/venue-management.service.js';
import type { VenueId } from '../../src/modules/catalog/domain/venue.js';
import { GeographyAdminService } from '../../src/modules/geography/index.js';
import { AvailabilityService, OpeningHours } from '../../src/modules/scheduling/index.js';
import { createTestApp, type Infra, startInfra } from '../support/test-app.js';

const TZ = 'Asia/Tashkent';
const hex = (n: number) => n.toString(16).padStart(24, '0');
const player = (n: number): BookingActor => ({
  userId: hex(1000 + n),
  roles: ['PLAYER'],
  phone: `+99890000${String(n).padStart(4, '0')}`,
});

describe('BookingService (e2e): TZ 4.4, Q1, EC-B*', () => {
  let infra: Infra;
  let app: NestFastifyApplication;
  let service: BookingService;
  let availability: AvailabilityService;
  const clock = new FixedClock(new Date());
  const day = addDays(zonedParts(clock.now(), TZ).date, 2);
  const at = (hour: number) => zonedToUtc(day, hour, TZ);
  const owner: BookingActor & Actor = {
    userId: hex(1),
    roles: ['OWNER'],
    phone: '+998901112233',
    cityId: null,
  };
  const stranger: BookingActor = { userId: hex(2), roles: ['OWNER'], phone: '+998901112244' };
  let pitchA: string;
  let pitchB: string;
  /** 20:00 ga tushgan so'rovlar (19–21 ham shu yerda) */
  const queued: string[] = [];
  let queries: BookingQueries;

  beforeAll(async () => {
    infra = await startInfra();
    app = await createTestApp({ MONGO_URI: infra.mongoUri, REDIS_URL: infra.redisUrl }, { clock });
    service = app.get(BookingService);
    availability = app.get(AvailabilityService);
    queries = app.get(BookingQueries);
    const city = await app
      .get(GeographyAdminService)
      .createCity({ name: localizedText({ uz: 'Olmaliq', ru: 'Алмалык' }) });
    owner.cityId = city.id;
    const register = app.get(RegisterVenueUseCase);
    const manage = app.get(VenueManagementService);
    for (const name of ['Arena A', 'Arena B']) {
      const r = await register.execute({
        actor: owner,
        name,
        landmarkText: `${name}, markaz`,
        hours: OpeningHours.of(8, 2),
        pricePerHour: Money.of(150_000),
      });
      if (!r.ok) throw new Error(r.error);
      await manage.approve(
        { userId: 'x', roles: ['ADMIN'], phone: null, cityId: null },
        r.value.venue.id as VenueId,
      );
      if (name === 'Arena A') pitchA = r.value.pitch.id;
      else pitchB = r.value.pitch.id;
    }
  });

  afterAll(async () => {
    await app?.close();
    await Promise.all([infra?.mongo.stop(), infra?.redis.stop()]);
  });

  const request = (who: BookingActor, hour: number, hours = 1, pitchId = pitchA) =>
    service.request(who, { pitchId, start: at(hour), hours });

  it('BK-1: a request is PENDING and the price is snapshotted', async () => {
    const r = await request(player(1), 19, 2);
    expect(r.ok && r.value.booking.status).toBe('PENDING');
    expect(r.ok && r.value.booking.price.amount).toBe(300_000);
    expect(r.ok && r.value.queueAhead).toEqual([]);
    expect(r.ok && r.value.booking.code).toMatch(/^PT-[0-9A-Z]{7}$/);
    if (r.ok) queued.push(r.value.booking.id);
  });

  it('BK-3a/BK-3b: a second request on the same time joins the queue (slot stays bookable)', async () => {
    const r = await request(player(2), 20);
    expect(r.ok && r.value.queueAhead.map((b) => b.playerId)).toEqual([player(1).userId]);
    if (r.ok) queued.push(r.value.booking.id);
    const view = await availability.dayView(pitchA, day, TZ);
    expect(view.find((s) => s.hour === 20)).toMatchObject({
      status: 'REQUESTED',
      pendingRequests: 2,
    });
  });

  it('BK-3e: at most 3 requests per slot', async () => {
    const third = await request(player(3), 20);
    expect(third.ok).toBe(true);
    if (third.ok) queued.push(third.value.booking.id);
    expect(await request(player(4), 20)).toEqual({ ok: false, error: 'QUEUE_FULL' });
  });

  it('EC-B6: the same player cannot hold overlapping requests at another venue', async () => {
    expect(await request(player(1), 20, 1, pitchB)).toEqual({ ok: false, error: 'PLAYER_OVERLAP' });
  });

  it('BK-11: at most 3 pending requests per player', async () => {
    const p = player(9);
    for (const h of [10, 11, 12]) expect((await request(p, h)).ok).toBe(true);
    expect(await request(p, 13)).toEqual({ ok: false, error: 'TOO_MANY_PENDING' });
  });

  it('PHONE_REQUIRED and quote errors are surfaced', async () => {
    expect(
      await service.request(
        { ...player(5), phone: null },
        { pitchId: pitchA, start: at(15), hours: 1 },
      ),
    ).toEqual({ ok: false, error: 'PHONE_REQUIRED' });
    // 04:00 — yopiq (01:00 esa oldingi biznes kunining tungi sloti, EC-S1)
    expect(await request(player(5), 4, 1)).toEqual({ ok: false, error: 'OUTSIDE_HOURS' });
  });

  it('EC-D1: a stranger cannot confirm', async () => {
    const r = await request(player(6), 16);
    if (!r.ok) throw new Error(r.error);
    expect(await service.confirm(stranger, r.value.booking.id)).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
  });

  it('BK-3c + DoD: owner and admin confirm different queued requests in parallel → exactly one wins', async () => {
    expect(queued).toHaveLength(3);
    const admin: BookingActor = { userId: hex(3), roles: ['ADMIN'], phone: null };
    const results = await Promise.all(
      queued.map((id, i) => service.confirm(i % 2 ? admin : owner, id)),
    );
    const winners = results.filter((r) => r.ok);
    expect(winners).toHaveLength(1);
    const winner = winners[0] as Extract<(typeof results)[number], { ok: true }>;
    // 19–21 dagi so'rov (player 1) ham 20:00 bilan kesishadi — SLOT_TAKEN bo'lishi kerak
    for (const id of queued.filter((q) => q !== winner.value.booking.id)) {
      const fresh = await queries.byId(id);
      expect(fresh?.status).toBe('REJECTED');
      expect(fresh?.rejectReason).toBe('SLOT_TAKEN');
    }
    expect((await availability.dayView(pitchA, day, TZ)).find((s) => s.hour === 20)?.status).toBe(
      'BOOKED',
    );
  });

  it('EC-B1d: requesting a booked slot is refused', async () => {
    expect(await request(player(7), 20)).toEqual({ ok: false, error: 'BOOKED' });
  });

  it('EC-B4: a second decision on the same request gets ALREADY_HANDLED', async () => {
    const r = await request(player(7), 17);
    if (!r.ok) throw new Error(r.error);
    expect((await service.confirm(owner, r.value.booking.id)).ok).toBe(true);
    expect(await service.reject(owner, r.value.booking.id, null)).toEqual({
      ok: false,
      error: 'ALREADY_HANDLED',
    });
  });

  it('BK-7: a manual booking rejects overlapping requests; EC-B13: a block cannot cover it', async () => {
    const r = await request(player(8), 14);
    if (!r.ok) throw new Error(r.error);
    const manual = await service.createManual(owner, {
      pitchId: pitchA,
      start: at(14),
      hours: 1,
      guestName: 'Sardor',
      guestPhone: '998935550000',
    });
    expect(manual.ok && manual.value.rejected.map((b) => b.id)).toEqual([r.value.booking.id]);
    expect(
      await service.createBlock(owner, {
        pitchId: pitchA,
        start: at(14),
        hours: 1,
        reason: "ta'mir",
      }),
    ).toEqual({ ok: false, error: 'SLOT_TAKEN' });
  });

  it('BK-8: a block occupies free slots and can be removed', async () => {
    const b = await service.createBlock(owner, {
      pitchId: pitchB,
      start: at(9),
      hours: 2,
      reason: "ta'mir",
    });
    expect(b.ok).toBe(true);
    expect((await availability.dayView(pitchB, day, TZ)).find((s) => s.hour === 10)?.status).toBe(
      'BOOKED',
    );
    if (b.ok) await service.removeBlock(owner, b.value.block.id);
    expect((await availability.dayView(pitchB, day, TZ)).find((s) => s.hour === 10)?.status).toBe(
      'FREE',
    );
  });

  it('BK-5: a player cancelling a confirmed booking frees the slot', async () => {
    const r = await request(player(10), 18, 1, pitchB);
    if (!r.ok) throw new Error(r.error);
    await service.confirm(owner, r.value.booking.id);
    expect((await service.cancelByPlayer(player(10), r.value.booking.id)).ok).toBe(true);
    expect((await availability.dayView(pitchB, day, TZ)).find((s) => s.hour === 18)?.status).toBe(
      'FREE',
    );
  });

  it('BK-3f: an unanswered request expires after 60 minutes (sweeper); confirming it is refused', async () => {
    const r = await request(player(11), 12, 1, pitchB);
    if (!r.ok) throw new Error(r.error);
    clock.advanceBy(61 * 60_000);
    const { expired } = await service.sweep();
    expect(expired.map((b) => b.id)).toContain(r.value.booking.id);
    expect(await service.confirm(owner, r.value.booking.id)).toEqual({
      ok: false,
      error: 'ALREADY_HANDLED',
    });
  });

  it('BK-9: confirmed games complete after their end; no-show within 24h', async () => {
    const r = await request(player(12), 15, 1, pitchB);
    if (!r.ok) throw new Error(r.error);
    await service.confirm(owner, r.value.booking.id);
    clock.set(new Date(at(16).getTime() + 60_000));
    const { completed } = await service.sweep();
    expect(completed.map((b) => b.id)).toContain(r.value.booking.id);
    expect((await service.markNoShow(owner, r.value.booking.id)).ok).toBe(true);
  });
});
