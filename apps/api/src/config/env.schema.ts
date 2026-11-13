import { z } from 'zod';

/**
 * Muhit o'zgaruvchilari sxemasi. Noto'g'ri yoki yetishmayotgan qiymat bilan ilova
 * ishga TUSHMAYDI (fail fast) — produksiyada yarim sozlangan servis bo'lmaydi.
 */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    MONGO_URI: z.url({ protocol: /^mongodb(\+srv)?$/ }),
    REDIS_URL: z.url({ protocol: /^rediss?$/ }),

    /**
     * TZ 5.4: produksiyada webhook, lokalda long polling.
     * `off` — bot Telegram'ga ulanmaydi (testlar, faqat API ishlatiladigan holat).
     */
    TELEGRAM_MODE: z.enum(['off', 'polling', 'webhook']).default('off'),
    TELEGRAM_BOT_TOKEN: z
      .string()
      .regex(/^\d+:[\w-]{30,}$/, 'Must look like a BotFather token: 123456:ABC...')
      .optional(),
    /** Telegram webhook so'rovlarini tasdiqlovchi secret (X-Telegram-Bot-Api-Secret-Token). */
    TELEGRAM_WEBHOOK_SECRET: z
      .string()
      .regex(/^[A-Za-z0-9_-]{32,256}$/, 'Must be 32-256 chars of A-Z a-z 0-9 _ -')
      .optional(),
    /** Tashqi HTTPS manzil, masalan https://api.polya.top — webhook shu yerga o'rnatiladi. */
    PUBLIC_URL: z.url({ protocol: /^https$/ }).optional(),

    /** TZ ID-7: access token (JWT HS256) imzo kaliti. Produksiyada majburiy; lokalda berilmasa — har ishga tushishda tasodifiy. */
    JWT_SECRET: z.string().min(32, 'At least 32 characters').optional(),

    /** TZ 4.6: `queue` — BullMQ navbati (rate limit, retry); `direct` — darhol (testlar, lokal). */
    NOTIFICATIONS_MODE: z.enum(['queue', 'direct']).default('queue'),

    /** TZ BK-3f, BK-9: muddati o'tgan so'rovlar/tugagan o'yinlar tekshiruvi oralig'i. 0 — o'chiq. */
    BOOKING_SWEEP_SECONDS: z.coerce.number().int().min(0).max(3600).default(60),

    /** TZ 4.6.1: marketing kampaniyalari tekshiruvi oralig'i. 0 — o'chiq. */
    MARKETING_TICK_SECONDS: z.coerce.number().int().min(0).max(3600).default(60),

    /** TZ EC-D4: foydalanuvchiga daqiqasiga update'lar limiti. 0 — o'chiq. */
    BOT_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(0).max(1000).default(30),

    /** TZ EC-R5: sharh filtri uchun qo'shimcha so'z o'zaklari, vergul bilan (asosiy ro'yxatga qo'shiladi) */
    PROFANITY_EXTRA: z
      .string()
      .default('')
      .transform((raw) =>
        raw
          .split(',')
          .map((w) => w.trim())
          .filter(Boolean),
      ),

    /** Platforma adminlari: vergul bilan ajratilgan Telegram ID'lar (TZ 3, 4.7). */
    ADMIN_TELEGRAM_IDS: z
      .string()
      .default('')
      .transform((raw) =>
        raw
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean),
      )
      .pipe(
        z.array(
          z
            .string()
            .regex(/^[1-9]\d{0,15}$/, 'Must be a Telegram user id')
            .transform(Number),
        ),
      )
      .transform((ids) => [...new Set(ids)]),
  })
  .superRefine((env, ctx) => {
    if (env.TELEGRAM_MODE !== 'off' && !env.TELEGRAM_BOT_TOKEN) {
      ctx.addIssue({
        code: 'custom',
        path: ['TELEGRAM_BOT_TOKEN'],
        message: `Required when TELEGRAM_MODE=${env.TELEGRAM_MODE}`,
      });
    }
    if (env.NODE_ENV === 'production' && !env.JWT_SECRET) {
      ctx.addIssue({ code: 'custom', path: ['JWT_SECRET'], message: 'Required in production' });
    }
    if (env.TELEGRAM_MODE === 'webhook') {
      for (const key of ['TELEGRAM_WEBHOOK_SECRET', 'PUBLIC_URL'] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'Required when TELEGRAM_MODE=webhook',
          });
        }
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export class InvalidEnvironmentError extends Error {
  override readonly name = 'InvalidEnvironmentError';
}

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    throw new InvalidEnvironmentError(
      `Invalid environment configuration:\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}
