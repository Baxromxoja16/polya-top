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
