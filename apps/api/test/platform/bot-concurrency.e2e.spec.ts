import { getConnectionToken } from '@nestjs/mongoose';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Connection } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ApiCall, createTestBot, TelegramUserSim } from '../support/telegram-sim.js';
import { createTestApp, type Infra, startInfra } from '../support/test-app.js';

const ADMIN = 960_001;
const OWNER = 960_002;

/**
 * Webhook rejimida Telegram bitta foydalanuvchining update'larini ham parallel yuborishi mumkin
 * (max_connections). Ikki marta bosilgan tugma ikki marta bajarilmasligi kerak.
 */
describe('Bot concurrency (e2e): one chat — one update at a time', () => {
  let infra: Infra;
  let app: NestFastifyApplication;
  let db: Connection;
  let owner: TelegramUserSim;
  let calls: ApiCall[];

  beforeAll(async () => {
    infra = await startInfra();
    const test = createTestBot();
    calls = test.calls;
    app = await createTestApp(
      { MONGO_URI: infra.mongoUri, REDIS_URL: infra.redisUrl, ADMIN_TELEGRAM_IDS: String(ADMIN) },
      { bot: test.bot },
    );
    db = app.get<Connection>(getConnectionToken());
    const admin = new TelegramUserSim(test.bot, test.calls, ADMIN);
    owner = new TelegramUserSim(test.bot, test.calls, OWNER);
    await admin.send('/start');
    await admin.send('/addcity Olmaliq | Алмалык');
    await owner.send('/start');
    await owner.shareContact('998901239999');
    await db
      .collection('users')
      .updateOne({ telegramId: OWNER }, { $set: { roles: ['PLAYER', 'OWNER'] } });
  });

  afterAll(async () => {
    await app?.close();
    await Promise.all([infra?.mongo.stop(), infra?.redis.stop()]);
  });

  it('double-tapping the final "Yes" of onboarding creates exactly one venue', async () => {
    await owner.press('cat:new');
    await owner.send('Parallel Arena');
    await owner.send('5-mikrorayon, 21-maktab orqasida');
    await owner.press('cat:onb:h:8:0');
    await owner.send('150');
    const before = calls.length;
    await Promise.all([owner.press('cat:onb:p:150000'), owner.press('cat:onb:p:150000')]);
    // Ikkinchi bosish birinchisidan KEYIN ishlaydi: qoralama yo'q — xatolik ham, ikkinchi stadion ham yo'q
    const sent = calls.slice(before).map((c) => String(c.payload.text ?? ''));
    expect(sent.filter((t) => t.includes('yuborildi'))).toHaveLength(1);
    expect(sent.some((t) => t.includes('Kutilmagan xatolik') || t.includes('🚨'))).toBe(false);
    expect(await db.collection('venues').countDocuments({ name: 'Parallel Arena' })).toBe(1);
  });
});
