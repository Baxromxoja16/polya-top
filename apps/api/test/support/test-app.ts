import type { Provider } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { Clock } from '@polya/shared-kernel';
import { MongoDBContainer, type StartedMongoDBContainer } from '@testcontainers/mongodb';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import type { Bot } from 'grammy';
import type { BotContext } from '../../src/platform/telegram/bot-context.js';

/** docker-compose.yml bilan bir xil image'lar — testlar produksiya versiyasida o'tadi. */
export const MONGO_IMAGE = 'mongo:8.2';
export const REDIS_IMAGE = 'redis:8.6';

export interface Infra {
  mongo: StartedMongoDBContainer;
  redis: StartedRedisContainer;
  mongoUri: string;
  redisUrl: string;
}

export async function startInfra(): Promise<Infra> {
  const [mongo, redis] = await Promise.all([
    new MongoDBContainer(MONGO_IMAGE).start(),
    new RedisContainer(REDIS_IMAGE).start(),
  ]);
  return {
    mongo,
    redis,
    mongoUri: `${mongo.getConnectionString()}/polya-test?directConnection=true`,
    redisUrl: redis.getConnectionUrl(),
  };
}

export interface TestAppOptions {
  /** Haqiqiy bot o'rniga — Telegram API'ga chiqmaydigan test bot. */
  bot?: Bot<BotContext>;
  /** Vaqtni boshqarish (muddat, yakunlash testlari) */
  clock?: Clock;
  /** Faqat testlar uchun qo'shimcha provider'lar (masalan, test bot feature). */
  providers?: Provider[];
  // biome-ignore lint/suspicious/noExplicitAny: Nest module class
  imports?: any[];
}

/**
 * Ilovani main.ts bilan bir xil sozlamada ko'taradi.
 * ConfigModule env'ni modul import qilingan paytda o'qiydi, shuning uchun AppModule
 * env o'rnatilgandan KEYIN dinamik import qilinadi.
 */
export async function createTestApp(
  env: Record<string, string>,
  options: TestAppOptions = {},
): Promise<NestFastifyApplication> {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    BOOKING_SWEEP_SECONDS: '0',
    MARKETING_TICK_SECONDS: '0',
    NOTIFICATIONS_MODE: 'direct',
    ...env,
  });

  const { AppModule } = await import('../../src/app.module.js');
  const { configureApp, createFastifyAdapter } = await import(
    '../../src/bootstrap/configure-app.js'
  );
  const { BOT } = await import('../../src/platform/telegram/telegram.tokens.js');

  let builder = Test.createTestingModule({
    imports: [AppModule, ...(options.imports ?? [])],
    providers: options.providers ?? [],
  });
  if (options.bot) builder = builder.overrideProvider(BOT).useValue(options.bot);
  if (options.clock) builder = builder.overrideProvider(Clock).useValue(options.clock);

  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(createFastifyAdapter(), {
    bufferLogs: true,
  });
  configureApp(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
