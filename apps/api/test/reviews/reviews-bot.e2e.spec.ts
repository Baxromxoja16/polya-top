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
import { BookingService } from '../../src/modules/booking/index.js';
import { RegisterVenueUseCase } from '../../src/modules/catalog/application/register-venue.use-case.js';
import { VenueManagementService } from '../../src/modules/catalog/application/venue-management.service.js';
import type { VenueId } from '../../src/modules/catalog/domain/venue.js';
import { GeographyAdminService } from '../../src/modules/geography/index.js';
import { ReviewInviter } from '../../src/modules/reviews/index.js';
import { OpeningHours } from '../../src/modules/scheduling/index.js';
import {
  type ApiCall,
  buttons,
  createTestBot,
  TelegramUserSim,
  texts,
} from '../support/telegram-sim.js';
import { createTestApp, type Infra, startInfra } from '../support/test-app.js';

const TZ = 'Asia/Tashkent';
const OWNER = 8_200_001;
const PLAYER = 8_200_002;
const ADMIN = 8_200_003;

describe('Reviews via bot (e2e): TZ RV-1…RV-6, AD-3, 4.6', () => {
  let infra: Infra;
  let app: NestFastifyApplication;
  let calls: ApiCall[];
  let owner: TelegramUserSim;
  let player: TelegramUserSim;
  let admin: TelegramUserSim;
  let db: Connection;
  let venueId: string;
  let bookingId: string;
  const day = addDays(zonedParts(new Date(), TZ).date, 1);
  const clock = new FixedClock(zonedToUtc(day, 9, TZ));
  const to = (chatId: number, out: ApiCall[]) =>
    out.filter((c) => c.method === 'sendMessage' && c.payload.chat_id === chatId);

  beforeAll(async () => {
    infra = await startInfra();
    const test = createTestBot();
    calls = test.calls;
    app = await createTestApp(
      { MONGO_URI: infra.mongoUri, REDIS_URL: infra.redisUrl, ADMIN_TELEGRAM_IDS: String(ADMIN) },
      { bot: test.bot, clock },
    );
    db = app.get<Connection>(getConnectionToken());
    const city = await app
      .get(GeographyAdminService)
      .createCity({ name: localizedText({ uz: 'Olmaliq', ru: 'Алмалык' }) });
    owner = new TelegramUserSim(test.bot, calls, OWNER);
    player = new TelegramUserSim(test.bot, calls, PLAYER, {
      first_name: 'Ali',
      language_code: 'uz',
    });
    admin = new TelegramUserSim(test.bot, calls, ADMIN);
    for (const [u, phone] of [
      [owner, '998901130001'],
      [player, '998901130002'],
      [admin, '998901130003'],
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
    venueId = r.value.venue.id;
    await app
      .get(VenueManagementService)
      .approve({ userId: 'x', roles: ['ADMIN'], phone: null, cityId: null }, venueId as VenueId);

    await player.press(
      `bk:ok:${r.value.pitch.id}:${Math.floor(zonedToUtc(day, 12, TZ).getTime() / 1000)}:1`,
    );
    const pending = await db.collection('bookings').findOne({ status: 'PENDING' });
    bookingId = String(pending?._id);
    await owner.press(`bk:c:${bookingId}`);
    clock.set(zonedToUtc(day, 13, TZ));
    await app.get(BookingService).sweep(); // → COMPLETED
  });

  afterAll(async () => {
    await app?.close();
    await Promise.all([infra?.mongo.stop(), infra?.redis.stop()]);
  });

  it('RV-3: no invite right after the game; one invite 2 hours later', async () => {
    const inviter = app.get(ReviewInviter);
    expect(await inviter.run()).toBe(0);
    clock.set(zonedToUtc(day, 15, TZ));
    const before = calls.length;
    expect(await inviter.run()).toBe(1);
    const invite = to(PLAYER, calls.slice(before))[0];
    expect(invite?.payload.text).toBe("⭐ «Arena»da o'yin qanday o'tdi? Baholang:");
    expect(buttons([invite as ApiCall])).toEqual(
      [1, 2, 3, 4, 5].map((n) => `rv:r:${bookingId}:${n}`),
    );
    expect(await inviter.run()).toBe(0);
  });

  it('rating → owner is notified with a reply button; optional text is saved', async () => {
    const out = await player.press(`rv:r:${bookingId}:4`);
    expect(texts(out)[0]).toContain('⭐⭐⭐⭐☆');
    const ownerMsg = to(OWNER, out)[0];
    expect(ownerMsg?.payload.text).toContain('💬 Yangi sharh — Arena');
    expect(buttons([ownerMsg as ApiCall])[0]).toMatch(/^rv:rp:/);
    expect(texts(await player.send('Maysa yaxshi, dush issiq'))).toEqual([
      '✅ Sharhingiz saqlandi. Rahmat!',
    ]);
  });

  it('a second rating for the same game is refused', async () => {
    const out = await player.press(`rv:r:${bookingId}:1`);
    expect(out[0]?.payload).toMatchObject({
      text: "Bu o'yinga sharh allaqachon yozilgan.",
      show_alert: true,
    });
  });

  it('RV-5: the owner replies; RV-7: card shows the rating; the list shows text and reply', async () => {
    const review = await db.collection('reviews').findOne();
    await owner.press(`rv:rp:${review?._id}`);
    await owner.send('Rahmat, yana keling!');

    const card = await player.send('/start v_arena');
    expect(texts(card)[0]).toContain('🏟 Arena · ⭐ 4.0 (1)');
    const list = await player.press(`rv:list:${venueId}:0`);
    expect(texts(list)[0]).toContain('⭐⭐⭐⭐☆ · Ali');
    expect(texts(list)[0]).toContain('Maysa yaxshi, dush issiq');
    expect(texts(list)[0]).toContain('↳ Egasi: Rahmat, yana keling!');
  });

  it('RV-6 + AD-3: reports hide the review; the admin restores it', async () => {
    const review = await db.collection('reviews').findOne();
    for (const id of [8_200_010, 8_200_011, 8_200_012]) {
      const u = new TelegramUserSim(player.bot, calls, id);
      await u.send('/start');
      await u.press(`rv:rep:${review?._id}`);
    }
    expect((await db.collection('reviews').findOne())?.status).toBe('HIDDEN');
    expect((await db.collection('venues').findOne())?.ratingCount).toBe(0);

    const queue = await admin.send('/reviews');
    expect(buttons(queue)).toContain(`rv:mod:${review?._id}:SHOW`);
    await admin.press(`rv:mod:${review?._id}:SHOW`);
    expect((await db.collection('reviews').findOne())?.status).toBe('VISIBLE');
    expect((await db.collection('venues').findOne())?.ratingCount).toBe(1);
  });

  it('RV-8: a player who played today posts a pitch condition; it shows in the reviews header', async () => {
    await player.press(`rv:cond:${venueId}`);
    expect(texts(await player.send("maysa ho'l"))).toEqual([
      "✅ Rahmat! 48 soat davomida ko'rinadi.",
    ]);
    const list = await player.press(`rv:list:${venueId}:0`);
    expect(texts(list)[0]).toContain("🌦 So'nggi holat (");
    expect(texts(list)[0]).toContain("maysa ho'l");
  });

  it('RV-8: someone who did not play here cannot post a condition', async () => {
    const stranger = new TelegramUserSim(player.bot, calls, 8_200_020);
    await stranger.send('/start');
    const out = await stranger.press(`rv:cond:${venueId}`);
    expect(texts(out)[0]).toContain("Holatni faqat so'nggi 24 soatda");
  });
});
