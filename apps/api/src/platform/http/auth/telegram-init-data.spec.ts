import { describe, expect, it } from 'vitest';
import { signInitData, verifyInitData } from './telegram-init-data.js';

const TOKEN = '123456:TEST-token-abcdefghijklmnopqrstuvwxyz';
const NOW = new Date('2026-11-13T10:00:00Z');
const authDate = String(NOW.getTime() / 1000 - 60);
const user = JSON.stringify({ id: 42, first_name: 'Ali', username: 'ali', language_code: 'uz' });

describe('verifyInitData', () => {
  it('accepts correctly signed data and parses the user', () => {
    const raw = signInitData({ auth_date: authDate, query_id: 'AAH', user }, TOKEN);
    const result = verifyInitData(raw, TOKEN, NOW);
    expect(result).toEqual({
      ok: true,
      authDate: new Date(Number(authDate) * 1000),
      user: { id: 42, firstName: 'Ali', lastName: null, username: 'ali', languageCode: 'uz' },
    });
  });

  it('rejects data signed with another bot token', () => {
    const raw = signInitData({ auth_date: authDate, user }, `${TOKEN}x`);
    expect(verifyInitData(raw, TOKEN, NOW)).toEqual({ ok: false, error: 'BAD_SIGNATURE' });
  });

  it('rejects tampered fields', () => {
    const raw = signInitData({ auth_date: authDate, user }, TOKEN).replace('42', '43');
    expect(verifyInitData(raw, TOKEN, NOW)).toEqual({ ok: false, error: 'BAD_SIGNATURE' });
  });

  it('rejects stale data (replay)', () => {
    const old = String(NOW.getTime() / 1000 - 25 * 3600);
    const raw = signInitData({ auth_date: old, user }, TOKEN);
    expect(verifyInitData(raw, TOKEN, NOW)).toEqual({ ok: false, error: 'EXPIRED' });
  });

  it.each([
    ['empty', ''],
    ['no hash', 'auth_date=1&user=%7B%7D'],
    ['bad hash', 'auth_date=1&hash=zz'],
  ])('rejects malformed input: %s', (_c, raw) => {
    expect(verifyInitData(raw, TOKEN, NOW)).toEqual({ ok: false, error: 'MALFORMED' });
  });

  it('rejects signed data without a valid user', () => {
    const raw = signInitData({ auth_date: authDate, user: '{"id":"x"}' }, TOKEN);
    expect(verifyInitData(raw, TOKEN, NOW)).toEqual({ ok: false, error: 'MALFORMED' });
  });
});
