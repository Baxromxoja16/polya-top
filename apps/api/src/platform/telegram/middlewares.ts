import { languageFromLocale } from '@polya/shared-kernel';
import type { MiddlewareFn } from 'grammy';
import type { Redis } from 'ioredis';
import type { BotContext } from './bot-context.js';

const DEDUP_TTL_SECONDS = 24 * 60 * 60;

/**
 * TZ EC-T5: Telegram webhook bitta update'ni qayta yuborishi mumkin (timeout, 5xx).
 * `update_id` Redis'da SET NX bilan belgilanadi — ikkinchi nusxa jimgina tashlanadi.
 */
export function dedupUpdates(redis: Redis): MiddlewareFn<BotContext> {
  return async (ctx, next) => {
    const fresh = await redis.set(
      `tg:update:${ctx.update.update_id}`,
      '1',
      'EX',
      DEDUP_TTL_SECONDS,
      'NX',
    );
    if (fresh !== 'OK') return;
    await next();
  };
}

/** Foydalanuvchi hali yuklanmagan bo'lsa ham til bor: Telegram lokalidan. Identity keyin aniqlaydi. */
export const defaultLanguage: MiddlewareFn<BotContext> = async (ctx, next) => {
  ctx.lang = languageFromLocale(ctx.from?.language_code);
  await next();
};
