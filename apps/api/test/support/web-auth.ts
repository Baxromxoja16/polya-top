import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { type TokenPair, tokenPairSchema } from '@polya/contracts';
import { signInitData } from '../../src/platform/http/auth/telegram-init-data.js';

/** e2e uchun soxta, lekin to'g'ri formatdagi BotFather token (Telegram'ga hech qachon chiqmaydi) */
export const WEB_TEST_BOT_TOKEN = '900000001:TEST-web-auth-token-abcdefghijklmnop';

export function initDataFor(
  telegramId: number,
  opts: { firstName?: string; authDate?: Date; token?: string; languageCode?: string } = {},
): string {
  return signInitData(
    {
      auth_date: String(Math.floor((opts.authDate ?? new Date()).getTime() / 1000)),
      user: JSON.stringify({
        id: telegramId,
        first_name: opts.firstName ?? `Web ${telegramId}`,
        language_code: opts.languageCode ?? 'uz',
      }),
    },
    opts.token ?? WEB_TEST_BOT_TOKEN,
  );
}

/** Mini App'dagidek kirish: initData → token juftligi */
export async function webLogin(
  app: NestFastifyApplication,
  telegramId: number,
  authDate?: Date,
): Promise<TokenPair> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/telegram',
    payload: { initData: initDataFor(telegramId, authDate ? { authDate } : {}) },
  });
  if (res.statusCode !== 200) throw new Error(`login failed: ${res.statusCode} ${res.body}`);
  return tokenPairSchema.parse(res.json());
}

export const bearer = (tokens: TokenPair) => ({ authorization: `Bearer ${tokens.accessToken}` });
