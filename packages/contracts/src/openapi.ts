import { z } from 'zod';
import {
  meSchema,
  refreshRequestSchema,
  telegramAuthRequestSchema,
  tokenPairSchema,
} from './auth.js';
import {
  bookingDtoSchema,
  createBookingResponseSchema,
  createBookingSchema,
  idempotencyKeySchema,
  myBookingsQuerySchema,
  myBookingsResponseSchema,
  pitchSlotsSchema,
  slotDtoSchema,
  slotsQuerySchema,
} from './booking.js';
import {
  cityDtoSchema,
  pitchDtoSchema,
  venueCardSchema,
  venueListItemSchema,
  venueSearchQuerySchema,
  venueSearchResponseSchema,
} from './catalog.js';
import { geoPointSchema, localizedTextSchema, moneySchema } from './common.js';
import { PROBLEM_JSON_CONTENT_TYPE, problemDetailsSchema } from './problem-details.js';

/**
 * TZ 7.7: OpenAPI 3.1 hujjati shu reyestrdan avtomatik quriladi — sxemalar controller'lar
 * tekshiradigan Zod sxemalarining O'ZI. e2e test har bir Nest route'i shu yerda borligini tekshiradi.
 */

type Method = 'get' | 'post';

/** Xato: HTTP status → mumkin bo'lgan barqaror `code`lar */
type Problems = Partial<Record<400 | 401 | 403 | 404 | 409 | 422 | 503, readonly string[]>>;

export interface ApiRoute {
  method: Method;
  /** Prefikssiz, OpenAPI uslubida: `/venues/{idOrSlug}` */
  path: string;
  operationId: string;
  summary: string;
  tag: 'auth' | 'catalog' | 'booking';
  auth?: boolean;
  query?: z.ZodType;
  body?: z.ZodType;
  idempotent?: boolean;
  /** Muvaffaqiyatli javob; `null` — 204 tanasiz */
  response: { status: 200 | 201 | 204; schema: z.ZodType | null };
  problems?: Problems;
}

const AUTH_PROBLEMS = { 401: ['UNAUTHORIZED', 'TOKEN_EXPIRED'], 403: ['ACCOUNT_BLOCKED'] } as const;

export const API_ROUTES: readonly ApiRoute[] = [
  {
    method: 'post',
    path: '/auth/telegram',
    operationId: 'signInWithTelegram',
    summary: 'Telegram WebApp initData bilan kirish (ID-7)',
    tag: 'auth',
    body: telegramAuthRequestSchema,
    response: { status: 200, schema: tokenPairSchema },
    problems: {
      400: ['VALIDATION_FAILED'],
      401: ['INIT_DATA_INVALID', 'INIT_DATA_EXPIRED'],
      403: ['ACCOUNT_BLOCKED'],
      503: ['AUTH_UNAVAILABLE'],
    },
  },
  {
    method: 'post',
    path: '/auth/refresh',
    operationId: 'refreshTokens',
    summary: 'Refresh token rotatsiyasi',
    tag: 'auth',
    body: refreshRequestSchema,
    response: { status: 200, schema: tokenPairSchema },
    problems: { 400: ['VALIDATION_FAILED'], 401: ['REFRESH_INVALID'], 403: ['ACCOUNT_BLOCKED'] },
  },
  {
    method: 'post',
    path: '/auth/logout',
    operationId: 'logout',
    summary: 'Barcha qurilmalardan chiqish',
    tag: 'auth',
    auth: true,
    response: { status: 204, schema: null },
    problems: { 401: AUTH_PROBLEMS[401] },
  },
  {
    method: 'get',
    path: '/me',
    operationId: 'getMe',
    summary: 'Joriy foydalanuvchi',
    tag: 'auth',
    auth: true,
    response: { status: 200, schema: meSchema },
    problems: AUTH_PROBLEMS,
  },
  {
    method: 'get',
    path: '/cities',
    operationId: 'listCities',
    summary: 'Faol shaharlar va hududlar',
    tag: 'catalog',
    response: { status: 200, schema: z.array(cityDtoSchema) },
  },
  {
    method: 'get',
    path: '/venues',
    operationId: 'searchVenues',
    summary: 'Stadion qidirish: matn/orientir, hudud, yaqinlik (VC-4)',
    tag: 'catalog',
    query: venueSearchQuerySchema,
    response: { status: 200, schema: venueSearchResponseSchema },
    problems: { 400: ['VALIDATION_FAILED', 'CURSOR_INVALID'] },
  },
  {
    method: 'get',
    path: '/venues/{idOrSlug}',
    operationId: 'getVenue',
    summary: 'Stadion kartochkasi',
    tag: 'catalog',
    response: { status: 200, schema: venueCardSchema },
    problems: { 404: ['VENUE_NOT_FOUND'] },
  },
  {
    method: 'get',
    path: '/pitches/{pitchId}/slots',
    operationId: 'getPitchSlots',
    summary: "Maydonning bir kunlik vaqt to'ri (SP-8)",
    tag: 'catalog',
    query: slotsQuerySchema,
    response: { status: 200, schema: pitchSlotsSchema },
    problems: {
      400: ['VALIDATION_FAILED'],
      404: ['PITCH_NOT_FOUND'],
      422: ['INVALID_LOCAL_DATE'],
    },
  },
  {
    method: 'post',
    path: '/bookings',
    operationId: 'createBooking',
    summary: "Bandlov so'rovi (BK-1). Bir xil Idempotency-Key — bir xil natija",
    tag: 'booking',
    auth: true,
    idempotent: true,
    body: createBookingSchema,
    response: { status: 201, schema: createBookingResponseSchema },
    problems: {
      400: ['VALIDATION_FAILED', 'IDEMPOTENCY_KEY_REQUIRED'],
      401: AUTH_PROBLEMS[401],
      403: ['ACCOUNT_BLOCKED', 'PHONE_REQUIRED', 'RESTRICTED'],
      404: ['NOT_AVAILABLE'],
      409: [
        'SLOT_TAKEN',
        'QUEUE_FULL',
        'DUPLICATE',
        'PLAYER_OVERLAP',
        'TOO_MANY_PENDING',
        'IDEMPOTENCY_IN_PROGRESS',
      ],
      422: [
        'NO_SCHEDULE',
        'OUTSIDE_HOURS',
        'TOO_SOON',
        'BEYOND_HORIZON',
        'TOO_LONG',
        'IDEMPOTENCY_KEY_REUSED',
      ],
    },
  },
  {
    method: 'get',
    path: '/bookings',
    operationId: 'listMyBookings',
    summary: 'Mening bandlovlarim (BK-12)',
    tag: 'booking',
    auth: true,
    query: myBookingsQuerySchema,
    response: { status: 200, schema: myBookingsResponseSchema },
    problems: { 400: ['VALIDATION_FAILED'], ...AUTH_PROBLEMS },
  },
  {
    method: 'get',
    path: '/bookings/{id}',
    operationId: 'getMyBooking',
    summary: 'Bitta bandlov (faqat o‘zimniki)',
    tag: 'booking',
    auth: true,
    response: { status: 200, schema: bookingDtoSchema },
    problems: { ...AUTH_PROBLEMS, 404: ['BOOKING_NOT_FOUND'] },
  },
  {
    method: 'post',
    path: '/bookings/{id}/cancel',
    operationId: 'cancelMyBooking',
    summary: 'Bandlovni bekor qilish (BK-5)',
    tag: 'booking',
    auth: true,
    response: { status: 200, schema: bookingDtoSchema },
    problems: { ...AUTH_PROBLEMS, 404: ['BOOKING_NOT_FOUND'], 409: ['BOOKING_ALREADY_HANDLED'] },
  },
];

/** `components.schemas` ga chiqadigan nomli sxemalar (qolganlari joyida yoziladi) */
const COMPONENTS: Record<string, z.ZodType> = {
  Money: moneySchema,
  LocalizedText: localizedTextSchema,
  GeoPoint: geoPointSchema,
  ProblemDetails: problemDetailsSchema,
  TokenPair: tokenPairSchema,
  Me: meSchema,
  City: cityDtoSchema,
  VenueListItem: venueListItemSchema,
  VenueSearchResponse: venueSearchResponseSchema,
  Pitch: pitchDtoSchema,
  VenueCard: venueCardSchema,
  Slot: slotDtoSchema,
  PitchSlots: pitchSlotsSchema,
  CreateBookingRequest: createBookingSchema,
  CreateBookingResponse: createBookingResponseSchema,
  Booking: bookingDtoSchema,
  MyBookingsResponse: myBookingsResponseSchema,
};

type Json = Record<string, unknown>;

const REF = (id: string) => `#/components/schemas/${id}`;

export function buildOpenApiDocument(opts: { serverUrl: string; version: string }): Json {
  const registry = z.registry<{ id: string }>();
  for (const [id, schema] of Object.entries(COMPONENTS)) registry.add(schema, { id });
  const ids = new Map(Object.entries(COMPONENTS).map(([id, s]) => [s as z.ZodType, id]));

  const toSchema = (schema: z.ZodType, io: 'input' | 'output'): Json => {
    const known = ids.get(schema);
    if (known) return { $ref: REF(known) };
    const {
      $schema: _,
      $defs: __,
      ...rest
    } = z.toJSONSchema(schema, {
      io,
      metadata: registry,
      unrepresentable: 'any',
    }) as Json;
    // Nomli ichki sxemalar `$defs`da emas, components'da turadi
    return JSON.parse(
      JSON.stringify(rest).replaceAll('"#/$defs/', '"#/components/schemas/'),
    ) as Json;
  };

  const components = z.toJSONSchema(registry, {
    io: 'output',
    uri: REF,
    unrepresentable: 'any',
  }).schemas as Record<string, Json>;
  for (const s of Object.values(components)) {
    delete s.$schema;
    delete s.$id;
  }

  const paths: Record<string, Record<string, Json>> = {};
  for (const route of API_ROUTES) {
    const parameters: Json[] = [];
    for (const [, name] of route.path.matchAll(/\{(\w+)\}/g)) {
      parameters.push({ name, in: 'path', required: true, schema: { type: 'string' } });
    }
    if (route.query) {
      const q = toSchema(route.query, 'input') as {
        properties?: Record<string, Json>;
        required?: string[];
      };
      for (const [name, schema] of Object.entries(q.properties ?? {})) {
        parameters.push({
          name,
          in: 'query',
          required: q.required?.includes(name) ?? false,
          schema,
        });
      }
    }
    if (route.idempotent) {
      parameters.push({
        name: 'Idempotency-Key',
        in: 'header',
        required: true,
        description:
          '24 soat ichida bir xil kalit + bir xil tana — bir xil javob (Idempotent-Replayed: true)',
        schema: toSchema(idempotencyKeySchema, 'input'),
      });
    }

    const responses: Json = {};
    responses[String(route.response.status)] = route.response.schema
      ? {
          description: 'OK',
          content: { 'application/json': { schema: toSchema(route.response.schema, 'output') } },
        }
      : { description: 'No Content' };
    for (const [status, codes] of Object.entries(route.problems ?? {})) {
      responses[status] = {
        description: `Problem: ${codes.join(', ')}`,
        content: { [PROBLEM_JSON_CONTENT_TYPE]: { schema: { $ref: REF('ProblemDetails') } } },
        'x-problem-codes': codes,
      };
    }

    const operation: Json = {
      operationId: route.operationId,
      summary: route.summary,
      tags: [route.tag],
      ...(parameters.length > 0 ? { parameters } : {}),
      ...(route.body
        ? {
            requestBody: {
              required: true,
              content: { 'application/json': { schema: toSchema(route.body, 'input') } },
            },
          }
        : {}),
      responses,
      ...(route.auth ? { security: [{ bearer: [] }] } : {}),
    };
    paths[route.path] ??= {};
    (paths[route.path] as Record<string, Json>)[route.method] = operation;
  }

  return {
    openapi: '3.1.1',
    info: {
      title: 'Polya.top API',
      version: opts.version,
      description:
        'TZ 7.7: web-app (Telegram Mini App) uchun REST. Xatolar — RFC 9457 Problem Details; ' +
        "`code` maydoni barqaror, matn frontendda tanlanadi. Pagination — shaffof bo'lmagan cursor.",
    },
    jsonSchemaDialect: 'https://json-schema.org/draft/2020-12/schema',
    servers: [{ url: opts.serverUrl }],
    tags: [
      { name: 'auth', description: 'Kirish va sessiya (ID-7)' },
      { name: 'catalog', description: 'Shaharlar, stadionlar, bo‘sh vaqtlar' },
      { name: 'booking', description: 'O‘yinchi bandlovlari' },
    ],
    paths,
    components: {
      schemas: components,
      securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    },
  };
}
