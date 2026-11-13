import { getConnectionToken } from '@nestjs/mongoose';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { meSchema, problemDetailsSchema } from '@polya/contracts';
import type { Connection } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type Infra, startInfra } from '../support/test-app.js';
import { bearer, initDataFor, WEB_TEST_BOT_TOKEN, webLogin } from '../support/web-auth.js';

const ALICE = 8_500_001;
const BOB = 8_500_002;

describe('Web auth (e2e): TZ ID-7 initData → JWT', () => {
  let infra: Infra;
  let app: NestFastifyApplication;
  let db: Connection;

  const post = (url: string, payload: unknown, headers: Record<string, string> = {}) =>
    app.inject({ method: 'POST', url: `/api/v1${url}`, payload: payload as object, headers });
  const code = (res: { json: () => unknown }) => problemDetailsSchema.parse(res.json()).code;

  beforeAll(async () => {
    infra = await startInfra();
    app = await createTestApp({
      MONGO_URI: infra.mongoUri,
      REDIS_URL: infra.redisUrl,
      TELEGRAM_BOT_TOKEN: WEB_TEST_BOT_TOKEN,
    });
    db = app.get<Connection>(getConnectionToken());
  });

  afterAll(async () => {
    await app?.close();
    await Promise.all([infra?.mongo.stop(), infra?.redis.stop()]);
  });

  it('signs in with valid initData, registers the user (ID-1) and serves /me', async () => {
    const tokens = await webLogin(app, ALICE);
    expect(tokens).toMatchObject({ tokenType: 'Bearer', expiresIn: 900 });

    const res = await app.inject({ method: 'GET', url: '/api/v1/me', headers: bearer(tokens) });
    expect(res.statusCode).toBe(200);
    expect(meSchema.parse(res.json())).toMatchObject({
      telegramId: ALICE,
      roles: ['PLAYER'],
      language: 'uz',
      phone: null,
    });
    // Bot orqali kelgan foydalanuvchi bilan bir xil yozuv
    expect(await db.collection('users').countDocuments({ telegramId: ALICE })).toBe(1);
  });

  it('rejects forged, foreign-bot and stale initData', async () => {
    const forged = initDataFor(BOB).replace(String(BOB), String(ALICE));
    expect(code(await post('/auth/telegram', { initData: forged }))).toBe('INIT_DATA_INVALID');

    const foreign = initDataFor(BOB, { token: '900000002:OTHER-bot-token-abcdefghijklmnopq' });
    expect(code(await post('/auth/telegram', { initData: foreign }))).toBe('INIT_DATA_INVALID');

    const stale = initDataFor(BOB, { authDate: new Date(Date.now() - 2 * 86_400_000) });
    const res = await post('/auth/telegram', { initData: stale });
    expect(res.statusCode).toBe(401);
    expect(code(res)).toBe('INIT_DATA_EXPIRED');

    expect(code(await post('/auth/telegram', {}))).toBe('VALIDATION_FAILED');
  });

  it('protects endpoints with a bearer token', async () => {
    const none = await app.inject({ method: 'GET', url: '/api/v1/me' });
    expect(none.statusCode).toBe(401);
    expect(code(none)).toBe('UNAUTHORIZED');

    const bad = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { authorization: 'Bearer abc.def.ghi' },
    });
    expect(code(bad)).toBe('UNAUTHORIZED');
  });

  it('rotates refresh tokens and revokes the family on reuse', async () => {
    const first = await webLogin(app, BOB);
    const second = await post('/auth/refresh', { refreshToken: first.refreshToken });
    expect(second.statusCode).toBe(200);
    const rotated = second.json<{ refreshToken: string }>().refreshToken;
    expect(rotated).not.toBe(first.refreshToken);

    // Eski token qayta keldi — o'g'irlik belgisi: butun zanjir bekor
    const reuse = await post('/auth/refresh', { refreshToken: first.refreshToken });
    expect(code(reuse)).toBe('REFRESH_INVALID');
    expect(code(await post('/auth/refresh', { refreshToken: rotated }))).toBe('REFRESH_INVALID');
  });

  it('logout revokes every session of the user', async () => {
    const a = await webLogin(app, ALICE);
    const b = await webLogin(app, ALICE);
    const out = await post('/auth/logout', {}, bearer(a));
    expect(out.statusCode).toBe(204);
    for (const t of [a, b]) {
      expect(code(await post('/auth/refresh', { refreshToken: t.refreshToken }))).toBe(
        'REFRESH_INVALID',
      );
    }
  });

  it('blocked account cannot sign in or refresh (AD-2)', async () => {
    const tokens = await webLogin(app, BOB);
    await db.collection('users').updateOne({ telegramId: BOB }, { $set: { status: 'BLOCKED' } });

    const login = await post('/auth/telegram', { initData: initDataFor(BOB) });
    expect(login.statusCode).toBe(403);
    expect(code(login)).toBe('ACCOUNT_BLOCKED');

    const refresh = await post('/auth/refresh', { refreshToken: tokens.refreshToken });
    expect(refresh.statusCode).toBe(403);
    const me = await app.inject({ method: 'GET', url: '/api/v1/me', headers: bearer(tokens) });
    expect(code(me)).toBe('ACCOUNT_BLOCKED');
  });
});
