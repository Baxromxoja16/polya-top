import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type CityView, GeographyQueries } from '../../src/modules/geography/index.js';
import { buttons, createTestBot, TelegramUserSim, texts } from '../support/telegram-sim.js';
import { createTestApp, type Infra, startInfra } from '../support/test-app.js';

const ADMIN_ID = 900_001;

describe('Geography admin bot (e2e): TZ CT-1…CT-3, VC-4b', () => {
  let infra: Infra;
  let app: NestFastifyApplication;
  let admin: TelegramUserSim;
  let player: TelegramUserSim;
  let queries: GeographyQueries;
  const olmaliq = async () => (await queries.getCityBySlug('olmaliq')) as CityView;

  beforeAll(async () => {
    infra = await startInfra();
    const { bot, calls } = createTestBot();
    app = await createTestApp(
      {
        MONGO_URI: infra.mongoUri,
        REDIS_URL: infra.redisUrl,
        ADMIN_TELEGRAM_IDS: String(ADMIN_ID),
      },
      { bot },
    );
    queries = app.get(GeographyQueries);
    admin = new TelegramUserSim(bot, calls, ADMIN_ID);
    player = new TelegramUserSim(bot, calls, 900_002);
    await admin.send('/start');
    await player.send('/start');
  });

  afterAll(async () => {
    await app?.close();
    await Promise.all([infra?.mongo.stop(), infra?.redis.stop()]);
  });

  it('CT-1: a non-admin cannot use admin commands (sees the regular fallback)', async () => {
    const out = await player.send('/addcity Hack | Хак');
    expect(texts(out)).toEqual(["Menyudan kerakli bo'limni tanlang 👇"]);
    expect(await queries.listCities()).toEqual([]);
  });

  it('CT-1: admin creates a city with a slug from the Uzbek name', async () => {
    const out = await admin.send('/addcity Olmaliq | Алмалык');
    expect(texts(out)[0]).toContain("✅ Shahar qo'shildi");
    expect(await olmaliq()).toMatchObject({
      slug: 'olmaliq',
      name: { uz: 'Olmaliq', ru: 'Алмалык' },
      timezone: 'Asia/Tashkent',
      isActive: true,
    });
  });

  it('EC-C6: the same city cannot be added twice', async () => {
    const out = await admin.send('/addcity olmaliq | Алмалык');
    expect(texts(out)[0]).toContain('CITY_SLUG_TAKEN');
    expect(await queries.listCities()).toHaveLength(1);
  });

  it('missing translation is rejected with a hint', async () => {
    const out = await admin.send('/addcity Angren');
    expect(texts(out)[0]).toContain('INVALID_LOCALIZED_TEXT');
  });

  it('CT-3: admin adds districts; duplicates are rejected', async () => {
    await admin.send('/adddistrict olmaliq 5-mikrorayon | 5-микрорайон');
    const dup = await admin.send('/adddistrict olmaliq 5 MIKRORAYON | x');
    expect(texts(dup)[0]).toContain('DUPLICATE_DISTRICT');
    expect((await olmaliq()).districts.map((d) => d.name.uz)).toEqual(['5-mikrorayon']);
  });

  it('unknown city slug gives a readable error', async () => {
    const out = await admin.send('/adddistrict angren Markaz | Центр');
    expect(texts(out)[0]).toContain('Shahar topilmadi: «angren»');
  });

  it('admin sets the city center via a location message', async () => {
    await admin.send('/setcenter olmaliq');
    const out = await admin.sendLocation(40.8447, 69.5983);
    expect(texts(out)).toEqual(['✅ Olmaliq markazi saqlandi.']);
    expect((await olmaliq()).center).toMatchObject({ lat: 40.8447, lng: 69.5983 });
  });

  it('VC-4b: admin adds a landmark with synonyms and location', async () => {
    await admin.send('/addlandmark olmaliq Markaziy bozor | Центральный рынок | bozor, rynok');
    const out = await admin.sendLocation(40.85, 69.6);
    expect(texts(out)[0]).toContain("✅ Orientir qo'shildi: Markaziy bozor");
    const [landmark] = await queries.listLandmarks((await olmaliq()).id);
    expect(landmark?.searchTerms).toEqual([
      'markaziy bozor',
      'tsentralniy rinok',
      'bozor',
      'rynok',
    ]);
    expect(landmark?.location).toMatchObject({ lat: 40.85, lng: 69.6 });
  });

  it('admin toggles a city off and on', async () => {
    const list = await admin.send('/cities');
    const toggle = buttons(list).find((b) => b?.startsWith('geo:toggle:')) as string;
    await admin.press(toggle);
    expect((await olmaliq()).isActive).toBe(false);
    expect(await queries.listCities({ activeOnly: true })).toEqual([]);
    await admin.press(toggle);
    expect((await olmaliq()).isActive).toBe(true);
  });
});
