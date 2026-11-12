import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buttons, createTestBot, TelegramUserSim, texts } from '../support/telegram-sim.js';
import { createTestApp, type Infra, startInfra } from '../support/test-app.js';

const ADMIN_ID = 900_001;

describe('Player city selection (e2e): TZ CT-4, EC-C1', () => {
  let infra: Infra;
  let app: NestFastifyApplication;
  let sim: (id: number) => TelegramUserSim;
  let admin: TelegramUserSim;

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
    sim = (id) => new TelegramUserSim(bot, calls, id);
    admin = sim(ADMIN_ID);
    await admin.send('/start');
  });

  afterAll(async () => {
    await app?.close();
    await Promise.all([infra?.mongo.stop(), infra?.redis.stop()]);
  });

  it('EC-C1: with a single active city onboarding does not ask for it', async () => {
    await admin.send('/addcity Olmaliq | Алмалык');
    const u = sim(910_001);
    await u.send('/start');
    const out = await u.press('id:lang:uz:new');
    expect(texts(out).at(-1)).toContain('Assalomu alaykum');
    expect(texts(await u.send('⚙️ Sozlamalar'))[0]).toContain('🏙 Shahar: Olmaliq');
  });

  it('CT-4: with several cities the new user picks one from the list', async () => {
    await admin.send('/addcity Angren | Ангрен');
    const u = sim(910_002);
    await u.send('/start');
    const picker = await u.press('id:lang:ru:new');
    expect(texts(picker).at(-1)).toBe('🏙 Выберите ваш город:');
    const cityButtons = buttons(picker).filter((b) => b?.startsWith('id:city:'));
    expect(cityButtons).toHaveLength(2);

    const out = await u.press(cityButtons[1] as string);
    expect(texts(out)[0]).toMatch(/^✅ Город: /);
    expect(texts(out).at(-1)).toContain('Здравствуйте');
  });

  it('settings lets the user switch the city', async () => {
    const u = sim(910_001);
    const picker = await u.press('id:city');
    const angren = buttons(picker).find((b) => b?.startsWith('id:city:')) as string;
    const out = await u.press(angren);
    expect(texts(out)[0]).toMatch(/^✅ Shahar: /);
  });
});
