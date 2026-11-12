import { getConnectionToken } from '@nestjs/mongoose';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FixedClock, localizedText, Money } from '@polya/shared-kernel';
import { type Connection, Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RegisterVenueUseCase } from '../../src/modules/catalog/application/register-venue.use-case.js';
import { VenueManagementService } from '../../src/modules/catalog/application/venue-management.service.js';
import type { VenueId } from '../../src/modules/catalog/domain/venue.js';
import { GeographyAdminService } from '../../src/modules/geography/index.js';
import { MarketingDispatcher, PromotionService } from '../../src/modules/marketing/index.js';
import { AvailabilityService, OpeningHours } from '../../src/modules/scheduling/index.js';
import {
  type ApiCall,
  buttons,
  createTestBot,
  TelegramUserSim,
  texts,
} from '../support/telegram-sim.js';
import { createTestApp, type Infra, startInfra } from '../support/test-app.js';

const OWNER = 1_200_001;
const PLAYER = 1_200_010;
const TZ = 'Asia/Tashkent';
/** Toshkent vaqti = UTC+5 */
const local = (day: number, hour: number) => new Date(Date.UTC(2026, 10, day, hour - 5));
const sec = (d: Date) => d.getTime() / 1000;

describe('Premium discount promotions (e2e): TZ 4.9, EC-M8, SP-5', () => {
  let infra: Infra;
  let app: NestFastifyApplication;
  let calls: ApiCall[];
  let db: Connection;
  let owner: TelegramUserSim;
  let venueId: VenueId;
  let pitchId: string;
  let ownerUserId: string;
  const clock = new FixedClock(local(12, 11));

  const inbox = (chatId: number) =>
    calls.filter((c) => c.method === 'sendMessage' && c.payload.chat_id === chatId);

  beforeAll(async () => {
    infra = await startInfra();
    const test = createTestBot();
    calls = test.calls;
    app = await createTestApp(
      { MONGO_URI: infra.mongoUri, REDIS_URL: infra.redisUrl },
      { bot: test.bot, clock },
    );
    db = app.get<Connection>(getConnectionToken());
    const city = await app
      .get(GeographyAdminService)
      .createCity({ name: localizedText({ uz: 'Olmaliq', ru: 'Алмалык' }) });
    owner = new TelegramUserSim(test.bot, calls, OWNER);
    await owner.send('/start');
    await new TelegramUserSim(test.bot, calls, PLAYER).send('/start');
    await db.collection('users').updateMany({}, { $set: { cityId: city.id } });
    await db
      .collection('users')
      .updateOne({ telegramId: OWNER }, { $set: { roles: ['PLAYER', 'OWNER'] } });
    ownerUserId = String((await db.collection('users').findOne({ telegramId: OWNER }))?._id);
    const r = await app.get(RegisterVenueUseCase).execute({
      actor: { userId: ownerUserId, roles: ['OWNER'], phone: '+998901112233', cityId: city.id },
      name: 'Olmaliq Arena',
      landmarkText: '5-mikrorayon, 21-maktab orqasida',
      hours: OpeningHours.of(8, 0),
      pricePerHour: Money.of(150_000),
    });
    if (!r.ok) throw new Error(r.error);
    venueId = r.value.venue.id as VenueId;
    pitchId = String((await db.collection('pitches').findOne())?._id);
    await app
      .get(VenueManagementService)
      .approve({ userId: 'a'.repeat(24), roles: ['ADMIN'], phone: null, cityId: null }, venueId);
    // "Yangi polya" e'lonini chetga olamiz — bu test faqat chegirma haqida
    await db.collection('venue_announcements').insertOne({
      _id: venueId as unknown as Types.ObjectId,
      cityId: city.id,
      status: 'CLAIMED',
      campaignId: null,
      createdAt: clock.now(),
    });
  });

  afterAll(async () => {
    await app?.close();
    await Promise.all([infra?.mongo.stop(), infra?.redis.stop()]);
  });

  it('owner screen shows the plan and the promotion button for a public venue', async () => {
    const out = await owner.press(`cat:v:${venueId}`);
    expect(texts(out).join('\n')).toMatch(/⭐ Tarif: PREMIUM — \d\d\.\d\d\.\d{4} gacha/);
    expect(buttons(out)).toContain(`mk:p:v:${venueId}`);
  });

  it('4.9: the owner picks start, hours and percent, then publishes', async () => {
    const intro = await owner.press(`mk:p:v:${venueId}`);
    expect(texts(intro)[0]).toContain("Bu oy yana 4 ta e'lon qilish mumkin.");
    const starts = buttons(intro).filter((b) => b?.startsWith('mk:p:s:'));
    // 11:00 da: lead time (30 daqiqa) — birinchi slot 12:00; ertangi 10:00 gacha (24 soat)
    expect(starts[0]).toBe(`mk:p:s:${pitchId}:${sec(local(12, 12))}`);
    expect(starts.at(-1)).toBe(`mk:p:s:${pitchId}:${sec(local(13, 10))}`);

    const hours = await owner.press(`mk:p:s:${pitchId}:${sec(local(12, 14))}`);
    expect(buttons(hours)).toContain(`mk:p:h:${pitchId}:${sec(local(12, 14))}:2`);
    await owner.press(`mk:p:h:${pitchId}:${sec(local(12, 14))}:2`);
    const preview = await owner.press(`mk:p:d:${pitchId}:${sec(local(12, 14))}:2:20`);
    expect(texts(preview)[0]).toContain('🕒 Bugun 14:00–16:00');
    expect(texts(preview)[0]).toContain("💰 150 000 → 120 000 so'm/soat (−20%)");
    const done = await owner.press(`mk:p:ok:${pitchId}:${sec(local(12, 14))}:2:20`);
    expect(texts(done)[0]).toContain("✅ Chegirma e'lon qilindi!");
    expect(await db.collection('promotions').countDocuments()).toBe(1);
  });

  it('SP-5: the discounted price goes into quotes (and therefore booking snapshots)', async () => {
    const q = await app
      .get(AvailabilityService)
      .quote({ pitchId, start: local(12, 15), hours: 2, timeZone: TZ });
    expect(q.ok && q.quote.breakdown.map((b) => b.price.amount)).toEqual([120_000, 150_000]);
  });

  it('MK-1…MK-7: the promotion is announced to the city with the opt-out button', async () => {
    calls.length = 0;
    await app.get(MarketingDispatcher).run();
    const [msg] = inbox(PLAYER);
    expect(msg?.payload.text).toContain('🔥 Chegirma −20%!');
    expect(msg?.payload.text).toContain('🕒 Bugun 14:00–16:00');
    expect(msg?.payload.text).toContain("💰 150 000 → 120 000 so'm/soat");
    expect(JSON.stringify(msg?.payload.reply_markup)).toContain('id:mkt:off');
  });

  it('an overlapping promotion is refused', async () => {
    const r = await app.get(PromotionService).create({
      actorUserId: ownerUserId,
      pitchId,
      start: local(12, 15),
      hours: 1,
      percent: 30,
    });
    expect(r.ok ? 'ok' : r.error).toBe('OVERLAP');
  });

  it('EC-M8 / 24h: invalid percent or a slot beyond 24 hours is refused', async () => {
    const create = (start: Date, percent: number) =>
      app
        .get(PromotionService)
        .create({ actorUserId: ownerUserId, pitchId, start, hours: 1, percent });
    const tooMuch = await create(local(12, 18), 90);
    expect(tooMuch.ok ? 'ok' : tooMuch.error).toBe('INVALID');
    const far = await create(local(13, 12), 20);
    expect(far.ok ? 'ok' : far.error).toBe('INVALID');
  });

  it('only the owner can create a promotion', async () => {
    const r = await app.get(PromotionService).create({
      actorUserId: 'c'.repeat(24),
      pitchId,
      start: local(12, 18),
      hours: 1,
      percent: 20,
    });
    expect(r.ok ? 'ok' : r.error).toBe('FORBIDDEN');
  });

  it('MK-3 exception: a promotion that went stale before sending is cancelled', async () => {
    const r = await app.get(PromotionService).create({
      actorUserId: ownerUserId,
      pitchId,
      start: local(12, 19),
      hours: 1,
      percent: 20,
    });
    expect(r.ok).toBe(true);
    clock.set(local(12, 19));
    calls.length = 0;
    await app.get(MarketingDispatcher).run();
    expect(inbox(PLAYER)).toHaveLength(0);
    const c = await db.collection('campaigns').findOne({ promotionId: r.ok ? r.value.id : '' });
    expect(c?.status).toBe('CANCELLED');
  });

  it('4.9: the monthly limit (4) is enforced', async () => {
    const out = await owner.press(`mk:p:v:${venueId}`);
    expect(texts(out)[0]).toContain("Bu oy yana 2 ta e'lon qilish mumkin.");
    await db.collection('promotions').insertMany(
      [1, 2].map(() => ({
        _id: new Types.ObjectId(),
        venueId,
        pitchId,
        cityId: 'x',
        start: local(1, 10),
        end: local(1, 11),
        percent: 20,
        basePrice: 150_000,
        createdBy: ownerUserId,
        createdAt: clock.now(),
      })),
    );
    expect(texts(await owner.press(`mk:p:v:${venueId}`))[0]).toContain('limiti tugadi');
  });

  it('4.9: a FREE venue cannot announce promotions', async () => {
    await db.collection('subscriptions').deleteMany({});
    expect(texts(await owner.press(`mk:p:v:${venueId}`))[0]).toContain('⭐ PREMIUM imkoniyat');
    const r = await app.get(PromotionService).create({
      actorUserId: ownerUserId,
      pitchId,
      start: local(12, 21),
      hours: 1,
      percent: 20,
    });
    expect(r.ok ? 'ok' : r.error).toBe('PREMIUM_REQUIRED');
  });
});
