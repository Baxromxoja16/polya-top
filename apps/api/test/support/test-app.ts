import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { MongoDBContainer, type StartedMongoDBContainer } from '@testcontainers/mongodb';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';

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

/**
 * Ilovani main.ts bilan bir xil sozlamada ko'taradi.
 * ConfigModule env'ni modul import qilingan paytda o'qiydi, shuning uchun AppModule
 * env o'rnatilgandan KEYIN dinamik import qilinadi.
 */
export async function createTestApp(env: {
  MONGO_URI: string;
  REDIS_URL: string;
}): Promise<NestFastifyApplication> {
  Object.assign(process.env, { NODE_ENV: 'test', LOG_LEVEL: 'silent', ...env });

  const { AppModule } = await import('../../src/app.module.js');
  const { configureApp, createFastifyAdapter } = await import(
    '../../src/bootstrap/configure-app.js'
  );

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(createFastifyAdapter(), {
    bufferLogs: true,
  });
  configureApp(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
