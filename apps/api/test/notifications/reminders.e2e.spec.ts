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
import { BookingSweeper } from '../../src/modules/booking/index.js';
import { RegisterVenueUseCase } from '../../src/modules/catalog/application/register-venue.use-case.js';
import { VenueManagementService } from '../../src/modules/catalog/application/venue-management.service.js';
import type { VenueId } from '../../src/modules/catalog/domain/venue.js';
import { GeographyAdminService } from '../../src/modules/geography/index.js';
import { OpeningHours } from '../../src/modules/scheduling/index.js';
import { type ApiCall, createTestBot, TelegramUserSim } from '../support/telegram-sim.js';
import { createTestApp, type Infra, startInfra } from '../support/test-app.js';

const TZ = 'Asia/Tashkent';
const OWNER = 8_100_001;
const PLAYER = 8_100_002;

describe('Reminders, owner nudges and daily schedule (e2e): TZ 4.6, BK-3f', () => {
  let infra: Infra;
  let app: NestFastifyApplication;
  let calls: ApiCall[];
  let owner: TelegramUserSim;
  let player: TelegramUserSim;
  let sweeper: BookingSweeper;
  let db: Connection;
  let pitchId: string;
  const day = addDays(zonedParts(new Date(), TZ).date, 1);
  const local = (hour: number, minute = 0) => zonedToUtc(day, hour, TZ, minute);
  const clock = new FixedClock(local(10));
  const sec = (hour: number) => Math.floor(local(hour).getTime() / 1000);
  const sentTo = (chatId: number, from: number) =>
    calls
      .slice(from)
      .filter((c) => c.method === 'sendMessage' && c.payload.chat_id === chatId)
      .map((c) => String(c.payload.text));

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
    owner = new TelegramUserSim(test.bot, calls, OWNER);
    player = new TelegramUserSim(test.bot, calls, PLAYER, {
      first_name: 'Ali',
      language_code: 'uz',
    });
    for (const [u, phone] of [
      [owner, '998901120001'],
      [player, '998901120002'],
    ] as const) {
      await u.send('/start');
      await u.shareContact(phone);
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

  it('a confirmed game gets one reminder within 2 hours of its start', async () => {
    await player.press(`bk:ok:${pitchId}:${sec(13)}:1`);
    const pending = await db.collection('bookings').findOne({ status: 'PENDING' });
    await owner.press(`bk:c:${pending?._id}`);

    clock.set(local(10, 30)); // 2.5 soat qoldi — hali emas
    expect((await sweeper.run()).reminders).toBe(0);

    clock.set(local(11, 30));
    const before = calls.length;
    expect((await sweeper.run()).reminders).toBe(1);
    expect(sentTo(PLAYER, before)[0]).toContain("⏰ Eslatma: o'yiningiz yaqinlashdi!");
    expect(sentTo(PLAYER, before)[0]).toContain('📍 Markaz, bozor yonida');

    expect((await sweeper.run()).reminders).toBe(0); // takrorlanmaydi
  });

  it('BK-3f: the owner is nudged 10 minutes before a request expires, once', async () => {
    await player.press(`bk:ok:${pitchId}:${sec(17)}:1`); // 11:30 da yaratildi → 12:30 da muddati tugaydi
    clock.set(local(12, 15));
    expect((await sweeper.run()).nudges).toBe(0);

    clock.set(local(12, 22));
    const before = calls.length;
    expect((await sweeper.run()).nudges).toBe(1);
    const nudge = calls.slice(before).find((c) => c.payload.chat_id === OWNER);
    expect(String(nudge?.payload.text)).toContain("⏳ So'rov 8 daqiqadan keyin bekor bo'ladi!");
    expect(nudge?.payload.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data).toMatch(/^bk:c:/);
    expect((await sweeper.run()).nudges).toBe(0);
  });

  it("TZ 4.6: after 21:00 the owner gets tomorrow's schedule once", async () => {
    clock.set(local(12, 23));
    const nextDaySec = Math.floor(zonedToUtc(addDays(day, 1), 19, TZ).getTime() / 1000);
    await player.press(`bk:ok:${pitchId}:${nextDaySec}:1`);
    // Tasdiqlanmasa 1 soatda muddati o'tib ketadi (BK-3f) va jadvalga tushmaydi
    const req = await db
      .collection('bookings')
      .findOne({ status: 'PENDING', start: new Date(nextDaySec * 1000) });
    await owner.press(`bk:c:${req?._id}`);

    clock.set(local(20, 50));
    expect((await sweeper.run()).daily).toBe(0);

    clock.set(local(21, 5));
    const before = calls.length;
    expect((await sweeper.run()).daily).toBe(1);
    const text = sentTo(OWNER, before).find((t) => t.startsWith('🗓 Ertangi jadval')) as string;
    expect(text).toContain(`(${addDays(day, 1)})`);
    expect(text).toContain('🟢 19:00–20:00 · 1-maydon · Ali · +998 90 112 00 02');
    expect((await sweeper.run()).daily).toBe(0);
  });
});
