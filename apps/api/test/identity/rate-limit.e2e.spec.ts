import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ApiCall, createTestBot, TelegramUserSim, texts } from '../support/telegram-sim.js';
import { createTestApp, type Infra, startInfra } from '../support/test-app.js';

describe('Per-user rate limit (e2e): EC-D4', () => {
  let infra: Infra;
  let app: NestFastifyApplication;
  let calls: ApiCall[];
  let sim: (id: number) => TelegramUserSim;

  beforeAll(async () => {
    infra = await startInfra();
    const test = createTestBot();
    calls = test.calls;
    app = await createTestApp(
      { MONGO_URI: infra.mongoUri, REDIS_URL: infra.redisUrl, BOT_RATE_LIMIT_PER_MINUTE: '3' },
      { bot: test.bot },
    );
    sim = (id) => new TelegramUserSim(test.bot, calls, id);
  });

  afterAll(async () => {
    await app?.close();
    await Promise.all([infra?.mongo.stop(), infra?.redis.stop()]);
  });

  it('over the limit: warns once, then silently drops; other users are unaffected', async () => {
    const flooder = sim(9_100_001);
    for (let i = 0; i < 3; i++)
      expect(texts(await flooder.send('/start')).length).toBeGreaterThan(0);
    expect(texts(await flooder.send('/start'))).toEqual([
      '⏳ Juda tez yozyapsiz. Bir daqiqadan keyin davom eting.',
    ]);
    expect(texts(await flooder.send('/start'))).toEqual([]);
    expect(texts(await sim(9_100_002).send('/start')).length).toBeGreaterThan(0);
  });

  it('a pressed button over the limit gets a silent answer (no spinning button)', async () => {
    const out = await sim(9_100_001).press('id:lang');
    expect(out.map((c) => c.method)).toEqual(['answerCallbackQuery']);
  });
});
