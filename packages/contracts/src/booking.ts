import { z } from 'zod';
import { localDateSchema, moneySchema, objectIdSchema, pageOf } from './common.js';

/** ISO 8601 UTC vaqt (`2026-11-14T15:00:00.000Z`) */
const instantSchema = z.iso.datetime();

/** GET /pitches/:pitchId/slots?date=YYYY-MM-DD — TZ SP-8, Q2 (1 soatlik to'r) */
export const slotsQuerySchema = z.object({ date: localDateSchema });
export type SlotsQuery = z.infer<typeof slotsQuerySchema>;

export const SLOT_STATUSES = ['FREE', 'REQUESTED', 'BOOKED', 'PAST'] as const;

export const slotDtoSchema = z.object({
  start: instantSchema,
  end: instantSchema,
  /** Biznes kunidagi soat: 0..47 (25 — ertasi kun 01:00, EC-S1) */
  hour: z.number().int(),
  status: z.enum(SLOT_STATUSES),
  /** BK-3b: shu soatga kutilayotgan so'rovlar */
  pendingRequests: z.number().int(),
  /** Chegirma qo'llangan narx (4.9) */
  price: moneySchema,
  discountPercent: z.number().int(),
});
export type SlotDto = z.infer<typeof slotDtoSchema>;

export const pitchSlotsSchema = z.object({
  pitchId: z.string(),
  date: localDateSchema,
  timeZone: z.string(),
  slots: z.array(slotDtoSchema),
});
export type PitchSlotsDto = z.infer<typeof pitchSlotsSchema>;

/** POST /bookings — `Idempotency-Key` header majburiy (TZ 7.7) */
export const createBookingSchema = z.object({
  pitchId: objectIdSchema,
  start: instantSchema,
  /** TZ SP-7: maks. 4 soat */
  hours: z.number().int().min(1).max(4),
});
export type CreateBookingRequest = z.infer<typeof createBookingSchema>;

export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
export const idempotencyKeySchema = z.string().regex(/^[\w-]{8,128}$/);

export const BOOKING_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED_BY_PLAYER',
  'CANCELLED_BY_OWNER',
  'COMPLETED',
  'NO_SHOW',
] as const;

export const bookingDtoSchema = z.object({
  id: z.string(),
  /** O'yinchi va Owner uchun qisqa kod */
  code: z.string(),
  status: z.enum(BOOKING_STATUSES),
  start: instantSchema,
  end: instantSchema,
  businessDate: localDateSchema,
  price: moneySchema,
  /** PENDING — Owner javob berishi kerak bo'lgan muddat (BK-4) */
  expiresAt: instantSchema.nullable(),
  lateCancel: z.boolean(),
  note: z.string().nullable(),
  createdAt: instantSchema,
  venue: z.object({
    id: z.string(),
    name: z.string(),
    landmarkText: z.string(),
    /** BK-3: kontakt almashinuvi — faqat faol (PENDING/CONFIRMED) bandlovda */
    phones: z.array(z.string()),
  }),
  pitch: z.object({ id: z.string(), name: z.string() }),
  timeZone: z.string(),
});
export type BookingDto = z.infer<typeof bookingDtoSchema>;

export const createBookingResponseSchema = z.object({
  booking: bookingDtoSchema,
  /** BK-3b: shu vaqtga oldinroq kelgan, hali tasdiqlanmagan so'rovlar soni */
  queueAhead: z.number().int(),
});
export type CreateBookingResponse = z.infer<typeof createBookingResponseSchema>;

/** GET /bookings?scope=upcoming|history — TZ BK-12 */
export const myBookingsQuerySchema = z.object({
  scope: z.enum(['upcoming', 'history']).default('upcoming'),
});
export type MyBookingsQuery = z.infer<typeof myBookingsQuerySchema>;

export const myBookingsResponseSchema = pageOf(bookingDtoSchema);
export type MyBookingsResponse = z.infer<typeof myBookingsResponseSchema>;
