import { getConnectionToken } from '@nestjs/mongoose';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  bookingDtoSchema,
  createBookingResponseSchema,
  myBookingsResponseSchema,
  pitchSlotsSchema,
  problemDetailsSchema,
  type TokenPair,
} from '@polya/contracts';
import { addDays, localizedText, Money, zonedParts, zonedToUtc } from '@polya/shared-kernel';
import type { Connection } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RegisterVenueUseCase } from '../../src/modules/catalog/application/register-venue.use-case.js';
import { VenueManagementService } from '../../src/modules/catalog/application/venue-management.service.js';
import type { VenueId } from '../../src/modules/catalog/domain/venue.js';
import { GeographyAdminService } from '../../src/modules/geography/index.js';
import { OpeningHours } from '../../src/modules/scheduling/index.js';
import { type ApiCall, createTestBot, TelegramUserSim } from '../support/telegram-sim.js';
import { createTestApp, type Infra, startInfra } from '../support/test-app.js';
import { bearer, WEB_TEST_BOT_TOKEN, webLogin } from '../support/web-auth.js';

const TZ = 'Asia/Tashkent';
const OWNER = 8_600_001;
const ALI = 8_600_002;
const VALI = 8_600_003;
const NOPHONE = 8_600_004;

describe('Booking REST (e2e): TZ BK-1, BK-5, BK-12, 7.7 Idempotency-Key', () => {
  let infra: Infra;
  let app: NestFastifyApplication;
  let calls: ApiCall[];
  let db: Connection;
  let pitchId: string;
  let ali: TokenPair;
  let vali: TokenPair;
  const day = addDays(zonedParts(new Date(), TZ).date, 2);
  const at = (hour: number) => zonedToUtc(day, hour, TZ).toISOString();
  let keySeq = 0;
  const newKey = () => `test-key-${Date.now()}-${++keySeq}`;

  const book = (tokens: TokenPair, body: object, key: string | null = newKey()) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/bookings',
      payload: body,
      headers: { ...bearer(tokens), ...(key ? { 'idempotency-key': key } : {}) },
    });
  const get = (url: string, tokens?: TokenPair) =>
    app.inject({ method: 'GET', url: `/api/v1${url}`, headers: tokens ? bearer(tokens) : {} });
  const code = (res: { json: () => unknown }) => problemDetailsSchema.parse(res.json()).code;
  const ownerMessages = () =>
    calls.filter((c) => c.method === 'sendMessage' && c.payload.chat_id === OWNER);
  const bookingsCount = () => db.collection('bookings').countDocuments();

  beforeAll(async () => {
    infra = await startInfra();
    const test = createTestBot();
    calls = test.calls;
    app = await createTestApp(
      {
        MONGO_URI: infra.mongoUri,
        REDIS_URL: infra.redisUrl,
        TELEGRAM_BOT_TOKEN: WEB_TEST_BOT_TOKEN,
      },
      { bot: test.bot },
    );
    db = app.get<Connection>(getConnectionToken());
    const city = await app
      .get(GeographyAdminService)
      .createCity({ name: localizedText({ uz: 'Olmaliq', ru: 'Алмалык' }) });
    // Kontaktni bot orqali ulashadi (ID-3), keyin Mini App'dan kiradi — bitta akkaunt
    for (const [id, phone] of [
      [OWNER, '998901120001'],
      [ALI, '998901120002'],
      [VALI, '998901120003'],
    ] as const) {
      const sim = new TelegramUserSim(test.bot, calls, id);
      await sim.send('/start');
      await sim.shareContact(phone);
    }
    await db
      .collection('users')
      .updateOne({ telegramId: OWNER }, { $set: { roles: ['PLAYER', 'OWNER'] } });
    const ownerDoc = await db.collection('users').findOne({ telegramId: OWNER });
    const r = await app.get(RegisterVenueUseCase).execute({
      actor: {
        userId: String(ownerDoc?._id),
        roles: ['OWNER'],
        phone: ownerDoc?.phone,
        cityId: city.id,
      },
      name: 'Web Arena',
      landmarkText: '7-maktab yonida',
      hours: OpeningHours.of(8, 0),
      pricePerHour: Money.of(150_000),
    });
    if (!r.ok) throw new Error(r.error);
    await app
      .get(VenueManagementService)
      .approve(
        { userId: 'a'.repeat(24), roles: ['ADMIN'], phone: null, cityId: null },
        r.value.venue.id as VenueId,
      );
    pitchId = r.value.pitch.id;
    ali = await webLogin(app, ALI);
    vali = await webLogin(app, VALI);
  });

  afterAll(async () => {
    await app?.close();
    await Promise.all([infra?.mongo.stop(), infra?.redis.stop()]);
  });

  it('GET /pitches/:id/slots shows the day grid with prices (SP-8)', async () => {
    const res = await get(`/pitches/${pitchId}/slots?date=${day}`);
    expect(res.statusCode).toBe(200);
    const grid = pitchSlotsSchema.parse(res.json());
    expect(grid.timeZone).toBe(TZ);
    expect(grid.slots).toHaveLength(16); // 08:00–00:00
    expect(grid.slots[0]).toMatchObject({
      start: at(8),
      status: 'FREE',
      price: { amount: 150_000, currency: 'UZS' },
    });

    expect((await get(`/pitches/${'f'.repeat(24)}/slots?date=${day}`)).statusCode).toBe(404);
    expect(code(await get(`/pitches/${pitchId}/slots?date=2026-02-30`))).toBe('INVALID_LOCAL_DATE');
    // SP-6: ufqdan tashqari kunlar "FREE" deb ko'rsatilmaydi
    for (const far of [addDays(day, 30), '9999-12-31']) {
      const res = await get(`/pitches/${pitchId}/slots?date=${far}`);
      expect(res.statusCode).toBe(422);
      expect(code(res)).toBe('BEYOND_HORIZON');
    }
    const last = addDays(zonedParts(new Date(), TZ).date, 13);
    expect((await get(`/pitches/${pitchId}/slots?date=${last}`)).statusCode).toBe(200);
  });

  it('requires a bearer token and an Idempotency-Key', async () => {
    const anon = await app.inject({
      method: 'POST',
      url: '/api/v1/bookings',
      payload: { pitchId, start: at(18), hours: 1 },
    });
    expect(anon.statusCode).toBe(401);

    const noKey = await book(ali, { pitchId, start: at(18), hours: 1 }, null);
    expect(noKey.statusCode).toBe(400);
    expect(code(noKey)).toBe('IDEMPOTENCY_KEY_REQUIRED');
    expect(await bookingsCount()).toBe(0);
  });

  it('creates a request, notifies the owner and replays it for the same key (BK-1, BK-3)', async () => {
    const key = newKey();
    const body = { pitchId, start: at(18), hours: 2 };
    const before = ownerMessages().length;

    const first = await book(ali, body, key);
    expect(first.statusCode).toBe(201);
    const created = createBookingResponseSchema.parse(first.json());
    expect(created).toMatchObject({
      queueAhead: 0,
      booking: {
        status: 'PENDING',
        start: at(18),
        end: at(20),
        price: { amount: 300_000 },
        venue: { name: 'Web Arena', phones: ['+998 90 112 00 01'] },
      },
    });
    expect(created.booking.expiresAt).not.toBeNull();
    expect(ownerMessages().length).toBe(before + 1);

    const again = await book(ali, body, key);
    expect(again.statusCode).toBe(201);
    expect(again.headers['idempotent-replayed']).toBe('true');
    expect(createBookingResponseSchema.parse(again.json()).booking.id).toBe(created.booking.id);
    expect(await bookingsCount()).toBe(1);
    expect(ownerMessages().length).toBe(before + 1);

    const reused = await book(ali, { ...body, hours: 1 }, key);
    expect(reused.statusCode).toBe(422);
    expect(code(reused)).toBe('IDEMPOTENCY_KEY_REUSED');

    // Kalit foydalanuvchiga bog'langan: boshqa o'yinchining bir xil kaliti — alohida so'rov
    const other = await book(vali, body, key);
    expect(other.statusCode).toBe(201);
    expect(createBookingResponseSchema.parse(other.json()).queueAhead).toBe(1);

    const grid = pitchSlotsSchema.parse(
      (await get(`/pitches/${pitchId}/slots?date=${day}`)).json(),
    );
    expect(grid.slots.find((s) => s.start === at(18))).toMatchObject({
      status: 'REQUESTED',
      pendingRequests: 2,
    });
  });

  it('parallel retries with one key create exactly one booking', async () => {
    const key = newKey();
    const before = await bookingsCount();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => book(ali, { pitchId, start: at(10), hours: 1 }, key)),
    );
    const statuses = results.map((r) => r.statusCode);
    expect(statuses.every((s) => s === 201 || s === 409)).toBe(true);
    const ids = new Set(
      results
        .filter((r) => r.statusCode === 201)
        .map((r) => createBookingResponseSchema.parse(r.json()).booking.id),
    );
    expect(ids.size).toBe(1);
    for (const r of results.filter((x) => x.statusCode === 409)) {
      expect(code(r)).toBe('IDEMPOTENCY_IN_PROGRESS');
    }
    expect(await bookingsCount()).toBe(before + 1);
  });

  it('business errors keep the bot codes and are replayed too', async () => {
    const key = newKey();
    const outside = await book(ali, { pitchId, start: at(5), hours: 1 }, key);
    expect(outside.statusCode).toBe(422);
    expect(code(outside)).toBe('OUTSIDE_HOURS');
    const replay = await book(ali, { pitchId, start: at(5), hours: 1 }, key);
    expect(code(replay)).toBe('OUTSIDE_HOURS');

    const overlap = await book(ali, { pitchId, start: at(19), hours: 1 });
    expect(overlap.statusCode).toBe(409);
    expect(code(overlap)).toBe('PLAYER_OVERLAP');

    const noPhone = await webLogin(app, NOPHONE);
    const phone = await book(noPhone, { pitchId, start: at(14), hours: 1 });
    expect(phone.statusCode).toBe(403);
    expect(code(phone)).toBe('PHONE_REQUIRED');
  });

  it('lists own bookings and hides others (BK-12, EC-D1)', async () => {
    const mine = myBookingsResponseSchema.parse((await get('/bookings', ali)).json());
    expect(mine.items.map((b) => b.start).sort()).toEqual([at(10), at(18)]);
    const target = mine.items.find((b) => b.start === at(18));
    if (!target) throw new Error('missing');

    expect(bookingDtoSchema.parse((await get(`/bookings/${target.id}`, ali)).json()).id).toBe(
      target.id,
    );
    const foreign = await get(`/bookings/${target.id}`, vali);
    expect(foreign.statusCode).toBe(404);
    expect(code(foreign)).toBe('BOOKING_NOT_FOUND');

    const history = myBookingsResponseSchema.parse(
      (await get('/bookings?scope=history', ali)).json(),
    );
    expect(history.items).toEqual([]);
  });

  it('cancels own booking, tells the owner and hides contacts afterwards (BK-5)', async () => {
    const mine = myBookingsResponseSchema.parse((await get('/bookings', ali)).json());
    const target = mine.items.find((b) => b.start === at(18));
    if (!target) throw new Error('missing');
    const before = ownerMessages().length;
    const cancel = () =>
      app.inject({
        method: 'POST',
        url: `/api/v1/bookings/${target.id}/cancel`,
        headers: bearer(ali),
      });

    const foreign = await app.inject({
      method: 'POST',
      url: `/api/v1/bookings/${target.id}/cancel`,
      headers: bearer(vali),
    });
    expect(foreign.statusCode).toBe(404);

    const res = await cancel();
    expect(res.statusCode).toBe(200);
    expect(bookingDtoSchema.parse(res.json())).toMatchObject({
      status: 'CANCELLED_BY_PLAYER',
      venue: { phones: [] },
    });
    expect(ownerMessages().length).toBe(before + 1);

    const twice = await cancel();
    expect(twice.statusCode).toBe(409);
    expect(code(twice)).toBe('BOOKING_ALREADY_HANDLED');
  });

  it('a blocked account cannot use a still-valid access token (AD-2)', async () => {
    await db.collection('users').updateOne({ telegramId: VALI }, { $set: { status: 'BLOCKED' } });
    const res = await get('/bookings', vali);
    expect(res.statusCode).toBe(403);
    expect(code(res)).toBe('ACCOUNT_BLOCKED');
  });
});
