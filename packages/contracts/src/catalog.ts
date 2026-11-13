import { z } from 'zod';
import {
  geoPointSchema,
  localizedTextSchema,
  moneySchema,
  objectIdSchema,
  pageOf,
  pageQuerySchema,
} from './common.js';

export const PITCH_FORMATS = ['5x5', '6x6', '7x7', '8x8', '11x11'] as const;
export const SURFACES = ['ARTIFICIAL', 'NATURAL', 'PARQUET', 'RUBBER'] as const;
export const AMENITIES = ['PARKING', 'SHOWER', 'LOCKER_ROOM', 'CAFE', 'STANDS', 'WIFI'] as const;

/** GET /cities — faqat faol shaharlar va hududlar */
export const cityDtoSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: localizedTextSchema,
  timezone: z.string(),
  districts: z.array(z.object({ id: z.string(), name: localizedTextSchema })),
});
export type CityDto = z.infer<typeof cityDtoSchema>;

const ratingSchema = z.object({ avg: z.number(), count: z.number().int() });

export const venueListItemSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  landmarkText: z.string(),
  districtId: z.string().nullable(),
  location: geoPointSchema.nullable(),
  rating: ratingSchema,
  minPricePerHour: moneySchema.nullable(),
  distanceMeters: z.number().nullable(),
  /** TZ VC-5a: PREMIUM — "⭐ Tavsiya etiladi" */
  recommended: z.boolean(),
});
export type VenueListItemDto = z.infer<typeof venueListItemSchema>;

/** GET /venues — TZ VC-4: matn/orientir, hudud, yaqinlik */
export const venueSearchQuerySchema = pageQuerySchema.extend({
  cityId: objectIdSchema,
  q: z.string().trim().max(100).optional(),
  districtId: objectIdSchema.optional(),
  /** EC-O7: bir nechta orientirdan tanlangani */
  landmarkId: objectIdSchema.optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});
export type VenueSearchQuery = z.infer<typeof venueSearchQuerySchema>;

const landmarkRefSchema = z.object({ id: z.string(), name: localizedTextSchema });

export const venueSearchResponseSchema = pageOf(venueListItemSchema).extend({
  landmarkChoices: z.array(landmarkRefSchema),
  usedLandmark: landmarkRefSchema.nullable(),
});
export type VenueSearchResponse = z.infer<typeof venueSearchResponseSchema>;

export const pitchDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  format: z.enum(PITCH_FORMATS).nullable(),
  surface: z.enum(SURFACES).nullable(),
  indoor: z.boolean().nullable(),
  lighting: z.boolean().nullable(),
  size: z.string().nullable(),
  /** ACTIVE — bandlash mumkin; MAINTENANCE — vaqtincha yopiq */
  bookable: z.boolean(),
  basePricePerHour: moneySchema.nullable(),
});
export type PitchDto = z.infer<typeof pitchDtoSchema>;

/** GET /venues/:idOrSlug */
export const venueCardSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  cityId: z.string(),
  landmarkText: z.string(),
  districtName: localizedTextSchema.nullable(),
  description: z.string().nullable(),
  location: geoPointSchema.nullable(),
  amenities: z.array(z.enum(AMENITIES)),
  photoCount: z.number().int(),
  rating: ratingSchema,
  minPricePerHour: moneySchema.nullable(),
  pitches: z.array(pitchDtoSchema),
});
export type VenueCardDto = z.infer<typeof venueCardSchema>;
