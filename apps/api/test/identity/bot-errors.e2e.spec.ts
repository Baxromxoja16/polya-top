import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type ApiCall,
  createTestBot,
  type FakeFailure,
  TelegramUserSim,
} from '../support/telegram-sim.js';
import { createTestApp, type Infra, startInfra } from '../support/test-app.js';

const ADMIN = 9_200_001;
const USER = 9_200_002;

describe('Unhandled bot errors (e2e): TZ 7 monitoring', () => {
  let infra: Infra;
  let app: NestFastifyApplication;
  let calls: ApiCall[];
  let failNext: (chatId: number, f: FakeFailure) => void;
  let user: TelegramUserSim;
  const alerts = () =>
    calls.filter(
      (c) =>
        c.method === 'sendMessage' &&
        c.payload.chat_id === ADMIN &&
        String(c.payload.text).startsWith('🚨'),
    );

  beforeAll(async () => {
    infra = await startInfra();
    const test = createTestBot();
    calls = test.calls;
    failNext = test.failNext;
    app = await createTestApp(
      { MONGO_URI: infra.mongoUri, REDIS_URL: infra.redisUrl, ADMIN_TELEGRAM_IDS: String(ADMIN) },
      { bot: test.bot },
    );
    user = new TelegramUserSim(test.bot, calls, USER);
    await user.send('/start');
  });

  afterAll(async () => {
    await app?.close();
    await Promise.all([infra?.mongo.stop(), infra?.redis.stop()]);
  });

  it('a failing handler alerts admins once per minute and does not crash the bot', async () => {
    failNext(USER, { error_code: 500, description: 'Internal Server Error' });
    await user.send('⚙️ Sozlamalar');
    expect(alerts()).toHaveLength(1);
    expect(String(alerts()[0]?.payload.text)).toContain('Internal Server Error');

    failNext(USER, { error_code: 500, description: 'Internal Server Error' });
    await user.send('⚙️ Sozlamalar');
    expect(alerts()).toHaveLength(1);

    // bot ishlashda davom etadi
    const out = await user.send('⚙️ Sozlamalar');
    expect(out.some((c) => String(c.payload.text).startsWith('⚙️ Sozlamalar'))).toBe(true);
  });
});
