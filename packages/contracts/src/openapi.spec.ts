import { describe, expect, it } from 'vitest';
import { API_ROUTES, buildOpenApiDocument } from './openapi.js';

type Doc = {
  openapi: string;
  paths: Record<string, Record<string, Record<string, unknown>>>;
  components: { schemas: Record<string, unknown> };
};

describe('OpenAPI document (TZ 7.7)', () => {
  const doc = buildOpenApiDocument({ serverUrl: '/api/v1', version: 'test' }) as Doc;
  const json = JSON.stringify(doc);

  it('is OpenAPI 3.1 with one operation per route and unique operationIds', () => {
    expect(doc.openapi).toMatch(/^3\.1\./);
    const ops = Object.values(doc.paths).flatMap((p) => Object.values(p));
    expect(ops).toHaveLength(API_ROUTES.length);
    const ids = ops.map((o) => o.operationId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('resolves every $ref to a component', () => {
    const refs = [...json.matchAll(/"\$ref":"#\/components\/schemas\/(\w+)"/g)].map((m) => m[1]);
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) expect(doc.components.schemas).toHaveProperty(ref as string);
    expect(json).not.toContain('$defs');
  });

  it('documents query, path and Idempotency-Key parameters', () => {
    const search = doc.paths['/venues']?.get as {
      parameters: { name: string; required: boolean }[];
    };
    expect(search.parameters).toContainEqual(
      expect.objectContaining({ name: 'cityId', required: true }),
    );
    expect(search.parameters).toContainEqual(
      expect.objectContaining({ name: 'limit', required: false }),
    );

    const create = doc.paths['/bookings']?.post as {
      parameters: { name: string; in: string }[];
      security: unknown[];
      responses: Record<string, { 'x-problem-codes'?: string[] }>;
    };
    expect(create.parameters).toContainEqual(
      expect.objectContaining({ name: 'Idempotency-Key', in: 'header' }),
    );
    expect(create.security).toEqual([{ bearer: [] }]);
    expect(create.responses['409']?.['x-problem-codes']).toContain('SLOT_TAKEN');

    const card = doc.paths['/venues/{idOrSlug}']?.get as { parameters: { in: string }[] };
    expect(card.parameters).toEqual([expect.objectContaining({ name: 'idOrSlug', in: 'path' })]);
  });
});
