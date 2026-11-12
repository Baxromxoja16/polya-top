import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, MONGO_IMAGE, REDIS_IMAGE } from './support/test-app.js';

/**
 * ADR-0002: tranzaksiyalarsiz double booking kafolati yo'q.
 * Standalone (replica set'siz) Mongo bilan ilova ishga TUSHMASLIGI kerak.
 */
describe('ReplicaSetGuard (e2e)', () => {
  let standalone: StartedTestContainer;
  let redis: StartedRedisContainer;

  beforeAll(async () => {
    [standalone, redis] = await Promise.all([
      new GenericContainer(MONGO_IMAGE)
        .withExposedPorts(27017)
        .withWaitStrategy(Wait.forLogMessage(/Waiting for connections/))
        .start(),
      new RedisContainer(REDIS_IMAGE).start(),
    ]);
  });

  afterAll(async () => {
    await Promise.all([standalone?.stop(), redis?.stop()]);
  });

  it('refuses to start against a standalone MongoDB', async () => {
    const uri = `mongodb://${standalone.getHost()}:${standalone.getMappedPort(27017)}/polya-test`;
    await expect(
      createTestApp({ MONGO_URI: uri, REDIS_URL: redis.getConnectionUrl() }),
    ).rejects.toThrow(/replica set/);
  });
});
