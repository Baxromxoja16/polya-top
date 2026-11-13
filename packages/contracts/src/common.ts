import { z } from 'zod';

/** Pul — eng kichik birlikda emas, so'mda butun son (domain Money bilan bir xil) */
export const moneySchema = z.object({
  amount: z.number().int().nonnegative(),
  currency: z.literal('UZS'),
});
export type MoneyDto = z.infer<typeof moneySchema>;

export const localizedTextSchema = z.object({ uz: z.string(), ru: z.string() });
export type LocalizedTextDto = z.infer<typeof localizedTextSchema>;

export const geoPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type GeoPointDto = z.infer<typeof geoPointSchema>;

export const objectIdSchema = z.string().regex(/^[0-9a-f]{24}$/, 'Must be an id');

/** `YYYY-MM-DD` — stadion vaqt zonasidagi biznes kuni */
export const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD');

/** TZ 7.7: cursor-based pagination. Cursor — shaffof bo'lmagan satr, mijoz uni o'zgartirmaydi */
export const pageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z
    .string()
    .regex(/^[\w-]{1,64}$/)
    .optional(),
});

export const pageOf = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() });
