import { describe, expect, it } from 'vitest';
import { signJwt, verifyJwt } from './jwt.js';

const SECRET = 'x'.repeat(32);
const NOW = new Date('2026-11-13T10:00:00Z');

describe('jwt', () => {
  const token = signJwt({ sub: 'u1', tid: 42 }, SECRET, NOW, 900);

  it('round-trips claims', () => {
    const result = verifyJwt(token, SECRET, new Date(NOW.getTime() + 60_000));
    expect(result).toMatchObject({ ok: true, claims: { sub: 'u1', tid: 42 } });
  });

  it('expires after ttl', () => {
    expect(verifyJwt(token, SECRET, new Date(NOW.getTime() + 900_000))).toEqual({
      ok: false,
      error: 'EXPIRED',
    });
  });

  it('rejects another secret and tampered payload', () => {
    expect(verifyJwt(token, `${SECRET}y`, NOW)).toEqual({ ok: false, error: 'BAD_SIGNATURE' });
    const [h, , s] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ sub: 'admin', tid: 1, iat: 0, exp: 9e9 })).toString(
      'base64url',
    );
    expect(verifyJwt(`${h}.${forged}.${s}`, SECRET, NOW)).toEqual({
      ok: false,
      error: 'BAD_SIGNATURE',
    });
  });

  it('rejects other algorithms in header', () => {
    const none = Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url');
    const [, p] = token.split('.');
    expect(verifyJwt(`${none}.${p}.`, SECRET, NOW)).toEqual({ ok: false, error: 'MALFORMED' });
    expect(verifyJwt('garbage', SECRET, NOW)).toEqual({ ok: false, error: 'MALFORMED' });
  });
});
