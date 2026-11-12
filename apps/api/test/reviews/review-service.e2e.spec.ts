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
import { type BookingActor, BookingService } from '../../src/modules/booking/index.js';
import { RegisterVenueUseCase } from '../../src/modules/catalog/application/register-venue.use-case.js';
import { VenueManagementService } from '../../src/modules/catalog/application/venue-management.service.js';
import type { VenueId } from '../../src/modules/catalog/domain/venue.js';
import { CatalogQueries } from '../../src/modules/catalog/index.js';
import { GeographyAdminService } from '../../src/modules/geography/index.js';
import { ReviewService } from '../../src/modules/reviews/index.js';
import { OpeningHours } from '../../src/modules/scheduling/index.js';
import { createTestApp, type Infra, startInfra } from '../support/test-app.js';

const TZ = 'Asia/Tashkent';
const hex = (n: number) => n.toString(16).padStart(24, '0');
const actor = (n: number, roles = ['PLAYER']): BookingActor => ({
  userId: hex(n),
  roles,
  phone: `+99890100${String(n).padStart(4, '0')}`,
});

describe('ReviewService (e2e): TZ 4.5, RV-1…RV-7, EC-R1, EC-R3, EC-R6', () => {
  let infra: Infra;
  let app: NestFastifyApplication;
  let reviews: ReviewService;
  let bookings: BookingService;
  let catalog: CatalogQueries;
  const clock = new FixedClock(new Date());
  const day = addDays(zonedParts(clock.now(), TZ).date, 1);
  const owner = actor(1, ['OWNER']);
  let pitchId: string;
  let venueId: string;
  const completed: Record<number, string> = {};

  const play = async (who: BookingActor, hour: number) => {
    const r = await bookings.request(who, { pitchId, start: zonedToUtc(day, hour, TZ), hours: 1 });
    if (!r.ok) throw new Error(r.error);
    await bookings.confirm(owner, r.value.booking.id);
    return r.value.booking.id;
  };

  beforeAll(async () => {
    infra = await startInfra();
    app = await createTestApp({ MONGO_URI: infra.mongoUri, REDIS_URL: infra.redisUrl }, { clock });
    reviews = app.get(ReviewService);
    bookings = app.get(BookingService);
    catalog = app.get(CatalogQueries);
    const city = await app
      .get(GeographyAdminService)
      .createCity({ name: localizedText({ uz: 'Olmaliq', ru: 'Алмалык' }) });
    const r = await app.get(RegisterVenueUseCase).execute({
      actor: { ...owner, cityId: city.id },
      name: 'Arena',
      landmarkText: 'Markaz, bozor yonida',
      hours: OpeningHours.of(8, 0),
      pricePerHour: Money.of(150_000),
    });
    if (!r.ok) throw new Error(r.error);
    pitchId = r.value.pitch.id;
    venueId = r.value.venue.id;
    await app
      .get(VenueManagementService)
      .approve({ userId: 'x', roles: ['ADMIN'], phone: null, cityId: null }, venueId as VenueId);

    for (const [n, hour] of [
      [10, 10],
      [11, 11],
      [12, 12],
      [13, 13],
    ] as const)
      completed[n] = await play(actor(n), hour);
    const ownBooking = await play(owner, 14); // EC-R1: Owner o'z stadionida o'ynadi
    completed[1] = ownBooking;
    clock.set(zonedToUtc(day, 16, TZ));
    await bookings.sweep();
    await bookings.markNoShow(owner, completed[13] as string);
  });

  afterAll(async () => {
    await app?.close();
    await Promise.all([infra?.mongo.stop(), infra?.redis.stop()]);
  });

  it('RV-1: a player reviews their completed game; venue rating updates (RV-7)', async () => {
    const r = await reviews.create(actor(10), {
      bookingId: completed[10] as string,
      rating: 5,
      text: "Zo'r maydon",
    });
    expect(r.ok && r.value.review.isVisible).toBe(true);
    expect((await catalog.venueCard(venueId))?.venue.rating).toEqual({ avg: 5, count: 1 });
  });

  it('RV-1: one review per booking; others cannot review it', async () => {
    expect(
      await reviews.create(actor(10), { bookingId: completed[10] as string, rating: 4 }),
    ).toEqual({ ok: false, error: 'ALREADY_REVIEWED' });
    expect(
      await reviews.create(actor(11), { bookingId: completed[10] as string, rating: 1 }),
    ).toEqual({ ok: false, error: 'NOT_ELIGIBLE' });
  });

  it('EC-R3: a no-show booking cannot be reviewed; EC-R1: the owner cannot review own venue', async () => {
    expect(
      await reviews.create(actor(13), { bookingId: completed[13] as string, rating: 1 }),
    ).toEqual({ ok: false, error: 'NOT_ELIGIBLE' });
    expect(await reviews.create(owner, { bookingId: completed[1] as string, rating: 5 })).toEqual({
      ok: false,
      error: 'OWN_VENUE',
    });
  });

  it('EC-R5: a review with a phone number is hidden and not counted', async () => {
    const r = await reviews.create(actor(11), {
      bookingId: completed[11] as string,
      rating: 1,
      text: 'Menga yozing +998 90 123 45 67',
    });
    expect(r.ok && r.value.review.status).toBe('HIDDEN');
    expect((await catalog.venueCard(venueId))?.venue.rating).toEqual({ avg: 5, count: 1 });
  });

  it('RV-6 + EC-R6: three reports hide a review and the rating is recalculated', async () => {
    const r = await reviews.create(actor(12), { bookingId: completed[12] as string, rating: 2 });
    if (!r.ok) throw new Error(r.error);
    expect((await catalog.venueCard(venueId))?.venue.rating).toEqual({ avg: 3.5, count: 2 });
    for (const n of [20, 21, 22]) await reviews.report(actor(n), r.value.review.id);
    expect((await reviews.byId(r.value.review.id))?.status).toBe('HIDDEN');
    expect((await catalog.venueCard(venueId))?.venue.rating).toEqual({ avg: 5, count: 1 });
  });

  it('AD-3: a moderator restores a hidden review; a player cannot moderate', async () => {
    const [hidden] = await reviews.listForModeration();
    expect(await reviews.moderate(actor(30), hidden?.id as string, 'SHOW')).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
    expect((await reviews.moderate(actor(31, ['ADMIN']), hidden?.id as string, 'SHOW')).ok).toBe(
      true,
    );
  });

  it('RV-5: only the venue owner replies, once', async () => {
    const review = await reviews.byBooking(completed[10] as string);
    expect(await reviews.reply(actor(10), review?.id as string, 'Men egaman')).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
    expect((await reviews.reply(owner, review?.id as string, 'Rahmat!')).ok).toBe(true);
    expect(await reviews.reply(owner, review?.id as string, 'Yana')).toEqual({
      ok: false,
      error: 'NOT_ALLOWED',
    });
  });

  it('RV-4: editing after 7 days is refused; deleting is allowed', async () => {
    const review = await reviews.byBooking(completed[10] as string);
    clock.advanceBy(8 * 86_400_000);
    expect(await reviews.edit(actor(10), review?.id as string, { rating: 1 })).toEqual({
      ok: false,
      error: 'NOT_ALLOWED',
    });
    expect((await reviews.remove(actor(10), review?.id as string)).ok).toBe(true);
  });
});
