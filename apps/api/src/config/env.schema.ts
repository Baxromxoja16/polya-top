import { z } from 'zod';

/**
 * Muhit o'zgaruvchilari sxemasi. Noto'g'ri yoki yetishmayotgan qiymat bilan ilova
 * ishga TUSHMAYDI (fail fast) — produksiyada yarim sozlangan servis bo'lmaydi.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  MONGO_URI: z.url({ protocol: /^mongodb(\+srv)?$/ }),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),
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
