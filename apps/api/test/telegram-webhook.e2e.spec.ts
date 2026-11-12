import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ApiCall, createTestBot, nextUpdateId, texts } from './support/telegram-sim.js';
import { createTestApp, type Infra, startInfra } from './support/test-app.js';

const SECRET = 'test_secret_0123456789_abcdefghijklmnop';
const URL = '/api/v1/telegram/webhook';

const startUpdate = (telegramId: number) => ({
  update_id: nextUpdateId(),
  message: {
    message_id: 1,
    date: Math.floor(Date.now() / 1000),
    chat: { id: telegramId, type: 'private', first_name: 'Ali' },
    from: { id: telegramId, is_bot: false, first_name: 'Ali', language_code: 'uz' },
    text: '/start',
    entities: [{ type: 'bot_command', offset: 0, length: 6 }],
  },
});

describe('Telegram webhook (e2e, TELEGRAM_MODE=webhook)', () => {
  let infra: Infra;
  let app: NestFastifyApplication;
  let calls: ApiCall[];

  beforeAll(async () => {
    infra = await startInfra();
    const test = createTestBot();
    calls = test.calls;
    app = await createTestApp(
      {
        MONGO_URI: infra.mongoUri,
        REDIS_URL: infra.redisUrl,
        TELEGRAM_MODE: 'webhook',
        TELEGRAM_BOT_TOKEN: '42:TEST-TOKEN-0000000000000000000000000000',
        TELEGRAM_WEBHOOK_SECRET: SECRET,
        PUBLIC_URL: 'https://api.polya.test',
      },
      { bot: test.bot },
    );
  });

  afterAll(async () => {
    await app?.close();
    await Promise.all([infra?.mongo.stop(), infra?.redis.stop()]);
  });

  it('registers the webhook with secret and allowed updates on startup', () => {
    const setWebhook = calls.find((c) => c.method === 'setWebhook');
    expect(setWebhook?.payload).toMatchObject({
      url: 'https://api.polya.test/api/v1/telegram/webhook',
      secret_token: SECRET,
      allowed_updates: ['message', 'callback_query', 'my_chat_member'],
    });
    expect(calls.filter((c) => c.method === 'setMyCommands')).toHaveLength(2);
  });

  it('rejects requests without or with a wrong secret', async () => {
    const missing = await app.inject({ method: 'POST', url: URL, payload: startUpdate(1) });
    expect(missing.statusCode).toBe(401);
    const wrong = await app.inject({
      method: 'POST',
      url: URL,
      headers: { 'x-telegram-bot-api-secret-token': `${SECRET}x` },
      payload: startUpdate(1),
    });
    expect(wrong.statusCode).toBe(401);
  });

  it('rejects a malformed body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: URL,
      headers: { 'x-telegram-bot-api-secret-token': SECRET },
      payload: { hello: 'world' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('processes a valid update and answers 200', async () => {
    const before = calls.length;
    const res = await app.inject({
      method: 'POST',
      url: URL,
      headers: { 'x-telegram-bot-api-secret-token': SECRET },
      payload: startUpdate(7001),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(texts(calls.slice(before))).toEqual(['Tilni tanlang · Выберите язык']);
  });
});
