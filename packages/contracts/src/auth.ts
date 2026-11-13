import { z } from 'zod';

/** POST /auth/telegram — Telegram WebApp `initData` (TZ ID-7) */
export const telegramAuthRequestSchema = z.object({
  initData: z.string().min(1).max(8192),
});
export type TelegramAuthRequest = z.infer<typeof telegramAuthRequestSchema>;

/** POST /auth/refresh — refresh token rotatsiyasi */
export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(16).max(256),
});
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

/** Access 15 daqiqa, refresh 30 kun (TZ ID-7) */
export const tokenPairSchema = z.object({
  accessToken: z.string(),
  /** Soniyalarda */
  expiresIn: z.number().int().positive(),
  refreshToken: z.string(),
  tokenType: z.literal('Bearer'),
});
export type TokenPair = z.infer<typeof tokenPairSchema>;

export const roleSchema = z.enum(['PLAYER', 'OWNER', 'STAFF', 'MODERATOR', 'ADMIN']);
export const languageSchema = z.enum(['uz', 'ru']);

/** GET /me */
export const meSchema = z.object({
  id: z.string(),
  telegramId: z.number().int(),
  displayName: z.string().nullable(),
  phone: z.string().nullable(),
  language: languageSchema,
  roles: z.array(roleSchema),
  cityId: z.string().nullable(),
});
export type Me = z.infer<typeof meSchema>;
