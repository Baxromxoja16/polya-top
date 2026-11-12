import { getConnectionToken } from '@nestjs/mongoose';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Connection } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { TelegramMessenger } from '../../src/platform/telegram/telegram-messenger.js';
import {
  type ApiCall,
  createTestBot,
  type FakeFailure,
  TelegramUserSim,
} from '../support/telegram-sim.js';
import { createTestApp, type Infra, startInfra } from '../support/test-app.js';

const sends = (calls: ApiCall[], chatId: number) =>
  calls.filter((c) => c.method === 'sendMessage' && c.payload.chat_id === chatId);

describe('TelegramMessenger in queue mode (e2e): TZ 4.6, EC-T1, EC-T2', () => {
  let infra: Infra;
  let app: NestFastifyApplication;
  let calls: ApiCall[];
  let failNext: (chatId: number, f: FakeFailure) => void;
  let messenger: TelegramMessenger;
  let db: Connection;

  beforeAll(async () => {
    infra = await startInfra();
    const test = createTestBot();
    calls = test.calls;
    failNext = test.failNext;
    app = await createTestApp(
      { MONGO_URI: infra.mongoUri, REDIS_URL: infra.redisUrl, NOTIFICATIONS_MODE: 'queue' },
      { bot: test.bot },
    );
    messenger = app.get(TelegramMessenger);
    db = app.get<Connection>(getConnectionToken());
    await new TelegramUserSim(test.bot, calls, 7_000_001).send('/start');
  });

  afterAll(async () => {
    await app?.close();
    await Promise.all([infra?.mongo.stop(), infra?.redis.stop()]);
  });

  it('delivers through the queue asynchronously', async () => {
    expect(await messenger.send(7_000_010, 'salom')).toBe(true);
    await vi.waitFor(() => expect(sends(calls, 7_000_010)).toHaveLength(1), { timeout: 10_000 });
  });

  it('EC-T1: 403 is not retried and marks the user as having blocked the bot', async () => {
    failNext(7_000_001, { error_code: 403, description: 'Forbidden: bot was blocked by the user' });
    await messenger.send(7_000_001, 'eslatma');
    await vi.waitFor(
      async () =>
        expect((await db.collection('users').findOne({ telegramId: 7_000_001 }))?.botBlocked).toBe(
          true,
        ),
      { timeout: 10_000 },
    );
    await new Promise((r) => setTimeout(r, 2_500));
    expect(sends(calls, 7_000_001).filter((c) => c.payload.text === 'eslatma')).toHaveLength(1);
  });

  it('MK-7: tagged messages report delivered / blocked outcomes', async () => {
    const outcomes: string[] = [];
    messenger.onOutcome(async (tag, chatId, outcome) => {
      outcomes.push(`${tag}:${chatId}:${outcome}`);
    });
    failNext(7_000_041, { error_code: 403, description: 'Forbidden: bot was blocked by the user' });
    await messenger.send(7_000_040, 'aksiya', undefined, { tag: 'c1' });
    await messenger.send(7_000_041, 'aksiya', undefined, { tag: 'c1' });
    await messenger.send(7_000_042, 'tegsiz');
    await vi.waitFor(
      () => expect(outcomes.sort()).toEqual(['c1:7000040:delivered', 'c1:7000041:blocked']),
      { timeout: 10_000 },
    );
  });

  it('EC-T2: 429 waits retry_after and then delivers', async () => {
    failNext(7_000_020, {
      error_code: 429,
      description: 'Too Many Requests',
      parameters: { retry_after: 1 },
    });
    await messenger.send(7_000_020, 'keyinroq');
    await vi.waitFor(() => expect(sends(calls, 7_000_020)).toHaveLength(2), { timeout: 15_000 });
  });

  it('per-chat pacing: a burst to one chat is spread at ~1 message per second', async () => {
    const chat = 7_000_030;
    for (const i of [1, 2, 3]) await messenger.send(chat, `xabar ${i}`);
    await vi.waitFor(() => expect(sends(calls, chat)).toHaveLength(3), { timeout: 20_000 });
  });
});
