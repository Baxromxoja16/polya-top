import { getConnectionToken } from '@nestjs/mongoose';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Money } from '@polya/shared-kernel';
import type { Connection } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RegisterVenueUseCase } from '../../src/modules/catalog/application/register-venue.use-case.js';
import { VenueManagementService } from '../../src/modules/catalog/application/venue-management.service.js';
import type { VenueId } from '../../src/modules/catalog/domain/venue.js';
import { GeographyQueries } from '../../src/modules/geography/index.js';
import { OpeningHours } from '../../src/modules/scheduling/index.js';
import {
  type ApiCall,
  buttons,
  createTestBot,
  TelegramUserSim,
  texts,
} from '../support/telegram-sim.js';
import { createTestApp, type Infra, startInfra } from '../support/test-app.js';

const ADMIN = 950_001;
const OWNER = 950_002;
const STRANGER = 950_003;

describe('Owner venue management via bot (e2e): TZ VC-2b, VC-2c, EC-O5, EC-D1', () => {
  let infra: Infra;
  let app: NestFastifyApplication;
  let calls: ApiCall[];
  let owner: TelegramUserSim;
  let stranger: TelegramUserSim;
  let db: Connection;
  let venueId: string;
  const venue = () => db.collection('venues').findOne();

  beforeAll(async () => {
    infra = await startInfra();
    const test = createTestBot();
    calls = test.calls;
    app = await createTestApp(
      { MONGO_URI: infra.mongoUri, REDIS_URL: infra.redisUrl, ADMIN_TELEGRAM_IDS: String(ADMIN) },
      { bot: test.bot },
    );
    db = app.get<Connection>(getConnectionToken());
    const admin = new TelegramUserSim(test.bot, calls, ADMIN);
    owner = new TelegramUserSim(test.bot, calls, OWNER);
    stranger = new TelegramUserSim(test.bot, calls, STRANGER);
    await admin.send('/start');
    await admin.send('/addcity Olmaliq | Алмалык');
    await admin.send('/adddistrict olmaliq 5-mikrorayon | 5-микрорайон');
    for (const u of [owner, stranger]) {
      await u.send('/start');
      await u.shareContact(`99890${String(u.id).padStart(7, '0').slice(-7)}`);
    }
    await db
      .collection('users')
      .updateMany(
        { telegramId: { $in: [OWNER, STRANGER] } },
        { $set: { roles: ['PLAYER', 'OWNER'] } },
      );

    const ownerDoc = await db.collection('users').findOne({ telegramId: OWNER });
    const [city] = await app.get(GeographyQueries).listCities();
    const result = await app.get(RegisterVenueUseCase).execute({
      actor: {
        userId: String(ownerDoc?._id),
        roles: ['OWNER'],
        phone: ownerDoc?.phone,
        cityId: city?.id ?? null,
      },
      name: 'Olmaliq Arena',
      landmarkText: '5-mikrorayon, 21-maktab orqasida',
      hours: OpeningHours.of(8, 0),
      pricePerHour: Money.of(150_000),
    });
    if (!result.ok) throw new Error(result.error);
    venueId = result.value.venue.id;
    await app
      .get(VenueManagementService)
      .approve({ userId: 'x', roles: ['ADMIN'], phone: null, cityId: null }, venueId as VenueId);
  });

  afterAll(async () => {
    await app?.close();
    await Promise.all([infra?.mongo.stop(), infra?.redis.stop()]);
  });

  it('shows the venue with 30% and next-step hints', async () => {
    const out = await owner.press(`cat:v:${venueId}`);
    const text = texts(out)[0] as string;
    expect(text).toContain('📊 Profil: 30%');
    expect(text).toContain("💡 Rasm qo'shing (+20%)");
    expect(text).toContain("⚽ 1-maydon · 🕒 08:00–00:00 · 💰 150 000 so'm/soat");
  });

  it('EC-D1: another owner cannot open or edit it', async () => {
    const out = await stranger.press(`cat:v:${venueId}`);
    expect(out[0]).toMatchObject({ method: 'answerCallbackQuery', payload: { show_alert: true } });
    await stranger.press(`cat:am:${venueId}:PARKING`);
    expect((await venue())?.amenities).toEqual([]);
  });

  it('photos: several photos, then done → +20%', async () => {
    await owner.press(`cat:e:photos:${venueId}`);
    expect(texts(await owner.sendPhoto('ph-1'))[0]).toBe("✅ Rasm qo'shildi (1).");
    await owner.sendPhoto('ph-2');
    await owner.press(`cat:done:${venueId}`);
    expect(await venue()).toMatchObject({ photos: ['ph-1', 'ph-2'], completeness: 50 });
  });

  it('location → +20%', async () => {
    await owner.press(`cat:e:location:${venueId}`);
    await owner.sendLocation(40.8447, 69.5983);
    expect(await venue()).toMatchObject({
      location: { type: 'Point', coordinates: [69.5983, 40.8447] },
      completeness: 70,
    });
  });

  it('amenities toggle → +10%', async () => {
    await owner.press(`cat:am:${venueId}:PARKING`);
    await owner.press(`cat:am:${venueId}:SHOWER`);
    await owner.press(`cat:am:${venueId}:SHOWER`);
    expect(await venue()).toMatchObject({ amenities: ['PARKING'], completeness: 80 });
  });

  it('pitch details (format + surface) → +10%', async () => {
    const pitch = await db.collection('pitches').findOne();
    await owner.press(`cat:pf:${pitch?._id}:6x6`);
    await owner.press(`cat:ps:${pitch?._id}:ARTIFICIAL`);
    expect(await db.collection('pitches').findOne()).toMatchObject({
      format: '6x6',
      surface: 'ARTIFICIAL',
    });
    expect((await venue())?.completeness).toBe(90);
  });

  it('description → 100%', async () => {
    await owner.press(`cat:e:description:${venueId}`);
    await owner.send('Yopiq zal, kechqurun chiroq bor');
    expect((await venue())?.completeness).toBe(100);
  });

  it('district picker lists city districts', async () => {
    const out = await owner.press(`cat:ds:${venueId}`);
    const pick = buttons(out).find(
      (b) => b?.startsWith(`cat:ds:${venueId}:`) && !b.endsWith(':none'),
    ) as string;
    await owner.press(pick);
    expect((await venue())?.districtId).not.toBeNull();
  });

  it('EC-O5: renaming an approved venue notifies admins', async () => {
    await owner.press(`cat:e:name:${venueId}`);
    const out = await owner.send('Olmaliq Arena Pro');
    const toAdmin = out.filter((c) => c.method === 'sendMessage' && c.payload.chat_id === ADMIN);
    expect(toAdmin[0]?.payload.text).toContain("✏️ Stadion ma'lumoti o'zgardi: «Olmaliq Arena Pro»");
    expect((await venue())?.status).toBe('APPROVED');
  });

  it('invalid phone list is rejected and the step is kept', async () => {
    await owner.press(`cat:e:phones:${venueId}`);
    expect(texts(await owner.send('abc'))[0]).toContain("Qiymat noto'g'ri");
    await owner.send('+998901112233, 998935554433');
    expect((await venue())?.phones).toEqual(['+998901112233', '+998935554433']);
  });

  it('price and hours of a pitch can be changed', async () => {
    const pitch = await db.collection('pitches').findOne();
    await owner.press(`cat:pe:price:${pitch?._id}`);
    await owner.send('200k');
    await owner.press(`cat:pe:hours:${pitch?._id}`);
    const out = await owner.send('16-02');
    expect(texts(out).at(-1)).toContain("🕒 16:00–02:00 · 💰 200 000 so'm/soat");
  });

  it('VC-2a: a new pitch inherits hours and price', async () => {
    await owner.press(`cat:e:pitchName:${venueId}`);
    const out = await owner.send('2-maydon');
    expect(texts(out).at(-1)).toContain("⚽ 2-maydon · 🕒 16:00–02:00 · 💰 200 000 so'm/soat");
    expect(await db.collection('pitches').countDocuments()).toBe(2);
  });

  it('archive hides the venue; restore brings it back approved', async () => {
    await owner.press(`cat:st:archive:${venueId}`);
    expect((await venue())?.status).toBe('ARCHIVED');
    await owner.press(`cat:st:restore:${venueId}`);
    expect((await venue())?.status).toBe('APPROVED');
  });
});
