import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { ModulesContainer } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { API_ROUTES } from '@polya/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type Infra, startInfra } from './support/test-app.js';

/** Hujjatlanmaydigan ichki route'lar: Telegram webhook, health, hujjatning o'zi */
const INTERNAL = [/^\/telegram\//, /^\/health/, /^\/openapi\.json$/];

/** Nest metadata'sidan barcha controller route'lari: `GET /venues/{idOrSlug}` */
function nestRoutes(app: NestFastifyApplication): string[] {
  const routes: string[] = [];
  for (const module of app.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      const type = wrapper.metatype as (new (...args: never[]) => unknown) | null;
      if (!type) continue;
      const base = String(Reflect.getMetadata(PATH_METADATA, type) ?? '');
      for (const name of Object.getOwnPropertyNames(type.prototype)) {
        const handler = (type.prototype as Record<string, unknown>)[name];
        if (typeof handler !== 'function' || name === 'constructor') continue;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
        const path = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
        if (method === undefined || path === undefined) continue;
        const full = `/${[base, path].filter((p) => p && p !== '/').join('/')}`
          .replace(/\/+/g, '/')
          .replace(/:(\w+)/g, '{$1}');
        routes.push(`${RequestMethod[method]} ${full}`);
      }
    }
  }
  return routes.filter((r) => !INTERNAL.some((re) => re.test(r.split(' ')[1] ?? '')));
}

describe('OpenAPI (e2e): TZ 7.7 — document matches the real routes', () => {
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

  it('serves the OpenAPI 3.1 document', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/openapi.json' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    const doc = res.json() as { openapi: string; servers: { url: string }[] };
    expect(doc.openapi).toMatch(/^3\.1\./);
    expect(doc.servers).toEqual([{ url: '/api/v1' }]);
  });

  it('every public route is documented and every documented route exists', () => {
    const actual = nestRoutes(app).sort();
    const documented = API_ROUTES.map((r) => `${r.method.toUpperCase()} ${r.path}`).sort();
    expect(actual).toEqual(documented);
  });
});
