import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { problemDetailsSchema } from '@polya/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type Infra, startInfra } from './support/test-app.js';

describe('Platform (e2e): health, errors, correlation id', () => {
  let infra: Infra;
  let app: NestFastifyApplication;

  beforeAll(async () => {
    infra = await startInfra();
    app = await createTestApp({ MONGO_URI: infra.mongoUri, REDIS_URL: infra.redisUrl });
  });

  afterAll(async () => {
    await app?.close();
    await Promise.all([infra?.mongo.stop(), infra?.redis.stop()]);
  });

  it('GET /health/live → 200 without touching dependencies', async () => {
    const res = await app.inject({ method: 'GET', url: '/health/live' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok' });
  });

  it('GET /health/ping → 200 keep-alive target outside the API prefix', async () => {
    const res = await app.inject({ method: 'GET', url: '/health/ping' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', uptimeSeconds: expect.any(Number) });
  });

  it('GET /health → 200 when Mongo and Redis are up', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      status: 'ok',
      info: { mongo: { status: 'up' }, redis: { status: 'up' } },
    });
  });

  it('health is not under the API prefix, business routes are', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.statusCode).toBe(404);
  });

  it('unknown route → RFC 9457 problem+json with request id', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/does-not-exist' });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toContain('application/problem+json');

    const body = problemDetailsSchema.parse(res.json());
    expect(body).toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
      instance: '/api/v1/does-not-exist',
    });
    expect(body.requestId).toBeTruthy();
    expect(res.headers['x-request-id']).toBe(body.requestId);
  });

  it('reuses an incoming x-request-id (correlation across services)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/nope',
      headers: { 'x-request-id': 'trace-abc-123' },
    });
    expect(res.headers['x-request-id']).toBe('trace-abc-123');
    expect(res.json()).toMatchObject({ requestId: 'trace-abc-123' });
  });

  it('ignores an oversized incoming x-request-id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/nope',
      headers: { 'x-request-id': 'x'.repeat(500) },
    });
    expect(res.headers['x-request-id']).not.toBe('x'.repeat(500));
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  // Oxirgi test: Redis'ni to'xtatadi
  it('GET /health → 503 problem+json when Redis is down', async () => {
    await infra.redis.stop();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(503);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.json()).toMatchObject({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      details: { mongo: { status: 'up' }, redis: { status: 'down' } },
    });
  });
});
