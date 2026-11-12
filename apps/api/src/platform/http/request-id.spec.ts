import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';
import { genReqId } from './request-id.js';

const raw = (header?: string) =>
  ({ headers: header === undefined ? {} : { 'x-request-id': header } }) as IncomingMessage;

describe('genReqId', () => {
  it('reuses a safe incoming id and stores it on the raw request', () => {
    const req = raw('trace-abc_1.2:3');
    expect(genReqId(req)).toBe('trace-abc_1.2:3');
    expect((req as IncomingMessage & { id?: string }).id).toBe('trace-abc_1.2:3');
  });

  it.each([
    ['too long', 'x'.repeat(129)],
    ['log injection', 'abc\n{"level":"fatal"}'],
    ['spaces', 'a b'],
    ['empty', ''],
  ])('generates a fresh uuid for %s input', (_case, header) => {
    expect(genReqId(raw(header))).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('generates a uuid when header is absent', () => {
    expect(genReqId(raw())).toMatch(/^[0-9a-f-]{36}$/);
  });
});
