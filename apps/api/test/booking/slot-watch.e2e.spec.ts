import { getConnectionToken } from '@nestjs/mongoose';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  addDays,
  FixedClock,
  localizedText,
  Money,
  zonedParts,
  zonedToUtc,
} from '@polya/shared-kernel';
import type { Connection } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BookingService, BookingSweeper } from '../../src/modules/booking/index.js';
import { RegisterVenueUseCase } from '../../src/modules/catalog/application/register-venue.use-case.js';
import { VenueManagementService } from '../../src/modules/catalog/application/venue-management.service.js';
import type { VenueId } from '../../src/modules/catalog/domain/venue.js';
import { GeographyAdminService } from '../../src/modules/geography/index.js';
import { OpeningHours } from '../../src/modules/scheduling/index.js';
import { type ApiCall, buttons, createTestBot, TelegramUserSim } from '../support/telegram-sim.js';
import { createTestApp, type Infra, startInfra } from '../support/test-app.js';

const TZ = 'Asia/Tashkent';
const OWNER = 8_300_001;
const BOOKER = 8_300_002;
const W1 = 8_300_003;
const W2 = 8_300_004;

describe('SlotWatch — "notify me when free" (e2e): TZ VC-5d, EC-M6, EC-M7', () => {
  let infra: Infra;
  let app: NestFastifyApplication;
  let calls: ApiCall[];
  let db: Connection;
  let sweeper: BookingSweeper;
  let pitchId: string;
  let ownerUserId: string;
  const sims = new Map<number, TelegramUserSim>();
  const day = addDays(zonedParts(new Date(), TZ).date, 1);
  const local = (hour: number, minute = 0) => zonedToUtc(day, hour, TZ, minute);
  const clock = new FixedClock(local(10));
  const sec = (hour: number) => Math.floor(local(hour).getTime() / 1000);
  const u = (id: number) => sims.get(id) as TelegramUserSim;
  const inbox = (chatId: number) =>
    calls
      .filter((c) => c.method === 'sendMessage' && c.payload.chat_id === chatId)
      .map((c) => String(c.payload.text));

  /** BOOKER `hour`ni bandlaydi va Owner tasdiqlaydi */
  const bookConfirmed = async (who: number, hour: number) => {
    await u(who).press(`bk:ok:${pitchId}:${sec(hour)}:1`);
    // eng oxirgi so'rov (boshqa testlarda qolgan PENDING'lar bo'lishi mumkin)
    const [pending] = await db
      .collection('bookings')
      .find({ status: 'PENDING' })
      .sort({ _id: -1 })
      .limit(1)
      .toArray();
    await u(OWNER).press(`bk:c:${pending?._id}`);
    return String(pending?._id);
  };

  beforeAll(async () => {
    infra = await startInfra();
    const test = createTestBot();
    calls = test.calls;
    app = await createTestApp(
      { MONGO_URI: infra.mongoUri, REDIS_URL: infra.redisUrl },
      { bot: test.bot, clock },
    );
    db = app.get<Connection>(getConnectionToken());
    sweeper = app.get(BookingSweeper);
    const city = await app
      .get(GeographyAdminService)
      .createCity({ name: localizedText({ uz: 'Olmaliq', ru: 'Алмалык' }) });
    for (const [id, phone] of [
      [OWNER, '998901130001'],
      [BOOKER, '998901130002'],
      [W1, '998901130003'],
      [W2, '998901130004'],
    ] as const) {
      const sim = new TelegramUserSim(test.bot, calls, id, {
        first_name: 'U',
        language_code: 'uz',
      });
      sims.set(id, sim);
      await sim.send('/start');
      await sim.shareContact(phone);
    }
    await db
      .collection('users')
      .updateOne({ telegramId: OWNER }, { $set: { roles: ['PLAYER', 'OWNER'] } });
    const ownerDoc = await db.collection('users').findOne({ telegramId: OWNER });
    ownerUserId = String(ownerDoc?._id);
    const r = await app.get(RegisterVenueUseCase).execute({
      actor: { userId: ownerUserId, roles: ['OWNER'], phone: ownerDoc?.phone, cityId: city.id },
      name: 'Arena',
      landmarkText: 'Markaz, bozor yonida',
      hours: OpeningHours.of(8, 0),
      pricePerHour: Money.of(150_000),
    });
    if (!r.ok) throw new Error(r.error);
    pitchId = r.value.pitch.id;
    await app
      .get(VenueManagementService)
      .approve(
        { userId: 'x', roles: ['ADMIN'], phone: null, cityId: null },
        r.value.venue.id as VenueId,
      );
  });

  afterAll(async () => {
    await app?.close();
    await Promise.all([infra?.mongo.stop(), infra?.redis.stop()]);
  });

  let bookingId: string;

  it('a red slot offers to watch; two players subscribe in order', async () => {
    bookingId = await bookConfirmed(BOOKER, 20);
    const ask = await u(W1).press(`bk:w:${pitchId}:${sec(20)}`);
    expect(buttons(ask)).toEqual([`bk:wy:${pitchId}:${sec(20)}`]);
    const ok = await u(W1).press(`bk:wy:${pitchId}:${sec(20)}`);
    expect(buttons(ok)).toEqual([`bk:wn:${pitchId}:${sec(20)}`]);
    clock.set(local(10, 1));
    await u(W2).press(`bk:wy:${pitchId}:${sec(20)}`);
    expect(await db.collection('slot_watches').countDocuments({ status: 'ACTIVE' })).toBe(2);
  });

  it('watching twice, or a free slot, is refused', async () => {
    const again = await u(W1).press(`bk:wy:${pitchId}:${sec(20)}`);
    expect(again[0]?.payload.text).toContain('allaqachon kuzatyapsiz');
    const free = await u(W1).press(`bk:wy:${pitchId}:${sec(18)}`);
    expect(free[0]?.payload.text).toContain("hozir bo'sh");
  });

  it('nothing is sent while the slot is still booked', async () => {
    expect((await sweeper.run()).watches).toBe(0);
  });

  it('VC-5d: when freed, only the first subscriber is told; the next one 10 minutes later', async () => {
    const owner = await db.collection('users').findOne({ telegramId: OWNER });
    const r = await app
      .get(BookingService)
      .cancelByOwner(
        { userId: ownerUserId, roles: ['OWNER'], phone: owner?.phone },
        bookingId,
        'Remont',
      );
    expect(r.ok).toBe(true);
    clock.set(local(10, 5));
    expect((await sweeper.run()).watches).toBe(1);
    expect(inbox(W1).at(-1)).toContain("🔔 Siz kutgan vaqt bo'shadi!");
    expect(inbox(W2).filter((t) => t.includes('🔔 Siz kutgan'))).toHaveLength(0);

    clock.set(local(10, 10));
    expect((await sweeper.run()).watches).toBe(0);
    clock.set(local(10, 16));
    expect((await sweeper.run()).watches).toBe(1);
    expect(inbox(W2).at(-1)).toContain("🔔 Siz kutgan vaqt bo'shadi!");
  });

  it('EC-M7: a subscriber who booked the same time elsewhere is dropped silently', async () => {
    const id21 = await bookConfirmed(BOOKER, 21);
    await u(W1).press(`bk:wy:${pitchId}:${sec(21)}`);
    // W1 shu vaqtga boshqa stadionda so'rov qoldiradi
    const ownerDoc = await db.collection('users').findOne({ telegramId: OWNER });
    const other = await app.get(RegisterVenueUseCase).execute({
      actor: {
        userId: ownerUserId,
        roles: ['OWNER'],
        phone: ownerDoc?.phone,
        cityId: ownerDoc?.cityId,
      },
      name: 'Boshqa Arena',
      landmarkText: 'Shimol, maktab yonida',
      hours: OpeningHours.of(8, 0),
      pricePerHour: Money.of(100_000),
    });
    if (!other.ok) throw new Error(other.error);
    await app
      .get(VenueManagementService)
      .approve(
        { userId: 'x', roles: ['ADMIN'], phone: null, cityId: null },
        other.value.venue.id as VenueId,
      );
    await u(W1).press(`bk:ok:${other.value.pitch.id}:${sec(21)}:1`);
    const r = await app
      .get(BookingService)
      .cancelByOwner(
        { userId: ownerUserId, roles: ['OWNER'], phone: ownerDoc?.phone },
        id21,
        'Remont',
      );
    expect(r.ok).toBe(true);
    const before = inbox(W1).length;
    clock.set(local(10, 40));
    await sweeper.run();
    expect(
      inbox(W1)
        .slice(before)
        .some((t) => t.includes('🔔 Siz kutgan')),
    ).toBe(false);
    expect((await db.collection('slot_watches').findOne({ slotStart: local(21) }))?.status).toBe(
      'CANCELLED',
    );
  });

  it('at most 5 active watches per user', async () => {
    for (const h of [12, 13, 14, 15, 16]) await bookConfirmed(BOOKER, h);
    for (const h of [12, 13, 14, 15, 16]) await u(W2).press(`bk:wy:${pitchId}:${sec(h)}`);
    const sixth = await u(W2).press(`bk:wy:${pitchId}:${sec(17)}`);
    expect(sixth[0]?.payload.text).toContain("ko'pi bilan 5 ta");
  });
});
