import { languageFromLocale } from '@polya/shared-kernel';
import type { MiddlewareFn } from 'grammy';
import type { Redis } from 'ioredis';
import type { BotContext } from './bot-context.js';
import { coreMessages } from './core.messages.js';

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

/**
 * TZ 6 (Xavfsizlik), EC-D4: foydalanuvchiga daqiqasiga `perMinute` ta update (qat'iy oyna).
 * Limitdan oshganda bir marta ogohlantiriladi, qolgani jimgina tashlanadi.
 * Xizmat update'lari (`my_chat_member`) hisoblanmaydi — bloklash holati yo'qolmasligi kerak.
 */
export function rateLimit(redis: Redis, perMinute: number): MiddlewareFn<BotContext> {
  return async (ctx, next) => {
    const userId = ctx.from?.id;
    if (perMinute <= 0 || !userId || ctx.myChatMember) return next();
    const key = `tg:rate:${userId}:${Math.floor(Date.now() / 60_000)}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 70);
    if (count <= perMinute) return next();
    if (count === perMinute + 1) {
      const text = coreMessages[ctx.lang].tooFast;
      if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text, show_alert: true });
      else await ctx.reply(text);
    } else if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery();
    }
  };
}

/** Foydalanuvchi hali yuklanmagan bo'lsa ham til bor: Telegram lokalidan. Identity keyin aniqlaydi. */
export const defaultLanguage: MiddlewareFn<BotContext> = async (ctx, next) => {
  ctx.lang = languageFromLocale(ctx.from?.language_code);
  await next();
};

/**
 * Bitta foydalanuvchining update'lari NAVBAT bilan qayta ishlanadi. Webhook rejimida Telegram
 * update'larni parallel yuboradi: ikki marta bosilgan tugma ikki marta bajarilar va Redis sessiyasi
 * "oxirgi yozgan yutadi" bo'lib qolar edi. Jarayon ichida (bitta API instansi webhook'ni oladi);
 * gorizontal kengaytirilsa — Redis lock bilan almashtiriladi.
 */
export function sequentialize(): MiddlewareFn<BotContext> {
  const tails = new Map<string, Promise<void>>();
  return async (ctx, next) => {
    const key = ctx.from?.id?.toString() ?? ctx.chat?.id?.toString();
    if (!key) return next();
    const previous = tails.get(key) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const done = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => done);
    tails.set(key, tail);
    await previous;
    try {
      await next();
    } finally {
      release();
      if (tails.get(key) === tail) tails.delete(key);
    }
  };
}
