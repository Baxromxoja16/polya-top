import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { problemDetailsSchema } from '@polya/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type Infra, startInfra } from './support/test-app.js';
import { bearer, WEB_TEST_BOT_TOKEN, webLogin } from './support/web-auth.js';

/** Daqiqa chegarasida hisoblagich nolga tushadi — test daqiqa boshida boshlanadi */
async function freshWindow(): Promise<void> {
  const sec = new Date().getSeconds();
  if (sec > 45) await new Promise((r) => setTimeout(r, (61 - sec) * 1000));
}

describe('HTTP rate limit (e2e): TZ 6, EC-D4', () => {
  let infra: Infra;
  let app: NestFastifyApplication;

  beforeAll(async () => {
    infra = await startInfra();
    app = await createTestApp({
      MONGO_URI: infra.mongoUri,
      REDIS_URL: infra.redisUrl,
      TELEGRAM_BOT_TOKEN: WEB_TEST_BOT_TOKEN,
      HTTP_RATE_LIMIT_PER_MINUTE: '3',
    });
  });

  afterAll(async () => {
    await app?.close();
    await Promise.all([infra?.mongo.stop(), infra?.redis.stop()]);
  });

  it('limits a signed-in user, then answers 429 with Retry-After; health is exempt', async () => {
    await freshWindow();
    const tokens = await webLogin(app, 8_700_001); // anonim (IP) hisobidan 1 ta
    const me = () => app.inject({ method: 'GET', url: '/api/v1/me', headers: bearer(tokens) });
    for (let i = 0; i < 3; i++) expect((await me()).statusCode).toBe(200);
    const limited = await me();
    expect(limited.statusCode).toBe(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(problemDetailsSchema.parse(limited.json()).code).toBe('RATE_LIMITED');

    expect((await app.inject({ method: 'GET', url: '/health/live' })).statusCode).toBe(200);
  });

  it('anonymous requests are counted per IP with a higher limit; a bogus token does not reset it', async () => {
    await freshWindow();
    const from = (ip: string, headers: Record<string, string> = {}) =>
      app.inject({ method: 'GET', url: '/api/v1/cities', remoteAddress: ip, headers });
    for (let i = 0; i < 15; i++) expect((await from('10.0.0.7')).statusCode).toBe(200);
    expect((await from('10.0.0.7')).statusCode).toBe(429);
    expect((await from('10.0.0.7', { authorization: 'Bearer forged.token.x' })).statusCode).toBe(
      429,
    );
    expect((await from('10.0.0.8')).statusCode).toBe(200);
  });
});
