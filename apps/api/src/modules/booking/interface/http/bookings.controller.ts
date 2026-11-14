import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  type BookingDto,
  type CreateBookingRequest,
  type CreateBookingResponse,
  createBookingSchema,
  IDEMPOTENCY_KEY_HEADER,
  idempotencyKeySchema,
  type MyBookingsQuery,
  type MyBookingsResponse,
  myBookingsQuerySchema,
} from '@polya/contracts';
import type { FastifyReply } from 'fastify';
import { Auth, AuthGuard, type AuthPrincipal } from '../../../../platform/http/auth/auth.guard.js';
import {
  IdempotencyStore,
  type StoredOutcome,
} from '../../../../platform/http/idempotency.store.js';
import { ZodValidationPipe } from '../../../../platform/http/zod-validation.pipe.js';
import { CatalogQueries, type PitchContext } from '../../../catalog/index.js';
import { IdentityQueries } from '../../../identity/index.js';
import { BookingQueries } from '../../application/booking.queries.js';
import {
  type BookingActor,
  BookingService,
  type RequestError,
} from '../../application/booking.service.js';
import type { Booking } from '../../domain/booking.js';
import { BookingFlowBotFeature } from '../telegram/booking-flow.bot.js';
import { MyBookingsBotFeature } from '../telegram/my-bookings.bot.js';

/** Biznes xatosi → HTTP status. `code` doim bot bilan bir xil (frontend matnni shundan tanlaydi). */
const REQUEST_ERROR_STATUS: Record<RequestError, number> = {
  PHONE_REQUIRED: HttpStatus.FORBIDDEN,
  RESTRICTED: HttpStatus.FORBIDDEN,
  NOT_AVAILABLE: HttpStatus.NOT_FOUND,
  BOOKED: HttpStatus.CONFLICT,
  QUEUE_FULL: HttpStatus.CONFLICT,
  DUPLICATE: HttpStatus.CONFLICT,
  PLAYER_OVERLAP: HttpStatus.CONFLICT,
  TOO_MANY_PENDING: HttpStatus.CONFLICT,
  NO_SCHEDULE: HttpStatus.UNPROCESSABLE_ENTITY,
  OUTSIDE_HOURS: HttpStatus.UNPROCESSABLE_ENTITY,
  TOO_SOON: HttpStatus.UNPROCESSABLE_ENTITY,
  BEYOND_HORIZON: HttpStatus.UNPROCESSABLE_ENTITY,
  TOO_LONG: HttpStatus.UNPROCESSABLE_ENTITY,
};

const ACTIVE = new Set(['PENDING', 'CONFIRMED']);

/**
 * TZ BK-1…BK-5, BK-12, 7.7: o'yinchining bandlovlari (web-app). Bot bilan bir xil use case'lar
 * va bir xil Owner xabarnomalari ishlatiladi.
 */
@Controller('bookings')
@UseGuards(AuthGuard)
export class BookingsController {
  constructor(
    private readonly bookings: BookingService,
    private readonly queries: BookingQueries,
    private readonly catalog: CatalogQueries,
    private readonly identity: IdentityQueries,
    private readonly idempotency: IdempotencyStore,
    private readonly flow: BookingFlowBotFeature,
    private readonly myBookings: MyBookingsBotFeature,
  ) {}

  /** BK-1: so'rov. Bir xil `Idempotency-Key` bilan qayta yuborish yangi bandlov yaratmaydi. */
  @Post()
  async create(
    @Auth() auth: AuthPrincipal,
    @Headers(IDEMPOTENCY_KEY_HEADER) rawKey: string | undefined,
    @Body(new ZodValidationPipe(createBookingSchema)) body: CreateBookingRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<CreateBookingResponse> {
    const key = idempotencyKeySchema.safeParse(rawKey);
    if (!key.success) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency-Key header (8–128 chars: letters, digits, _ and -) is required',
      });
    }
    const scope = `booking:${auth.userId}`;
    const fp = IdempotencyStore.fingerprint(body);
    const begun = await this.idempotency.begin(scope, key.data, fp);
    if (begun.state === 'mismatch') {
      throw new HttpException(
        { code: 'IDEMPOTENCY_KEY_REUSED', message: 'Idempotency-Key was used with another body' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    if (begun.state === 'in-progress') {
      throw new ConflictException({
        code: 'IDEMPOTENCY_IN_PROGRESS',
        message: 'The same request is still being processed',
      });
    }
    if (begun.state === 'replay') {
      reply.header('idempotent-replayed', 'true');
      return this.replay(begun.outcome, reply);
    }

    let outcome: StoredOutcome;
    try {
      outcome = await this.request(auth, body);
    } catch (error) {
      await this.idempotency.abort(scope, key.data);
      throw error;
    }
    await this.idempotency.complete(scope, key.data, fp, outcome);
    return this.replay(outcome, reply);
  }

  @Get()
  async mine(
    @Auth() auth: AuthPrincipal,
    @Query(new ZodValidationPipe(myBookingsQuerySchema)) query: MyBookingsQuery,
  ): Promise<MyBookingsResponse> {
    await this.actor(auth);
    const list =
      query.scope === 'upcoming'
        ? await this.queries.playerUpcoming(auth.userId)
        : await this.queries.playerHistory(auth.userId);
    const contexts = await this.catalog.pitchContexts(list.map((b) => b.pitchId));
    const items = list.flatMap((b) => {
      const ctx = contexts.get(b.pitchId);
      return ctx ? [toDto(b, ctx)] : [];
    });
    return { items, nextCursor: null };
  }

  @Get(':id')
  async one(@Auth() auth: AuthPrincipal, @Param('id') id: string): Promise<BookingDto> {
    await this.actor(auth);
    const found = await this.own(auth.userId, id);
    return toDto(found.booking, found.context);
  }

  /** BK-5: o'yinchi bekor qiladi (kech bekor qilish — reputatsiyaga ta'sir qiladi, EC-B5) */
  @Post(':id/cancel')
  @HttpCode(200)
  async cancel(@Auth() auth: AuthPrincipal, @Param('id') id: string): Promise<BookingDto> {
    const actor = await this.actor(auth);
    const { context } = await this.own(auth.userId, id);
    const result = await this.bookings.cancelByPlayer(actor, id);
    if (!result.ok) {
      if (result.error === 'NOT_FOUND') throw notFound();
      throw new ConflictException({
        code: 'BOOKING_ALREADY_HANDLED',
        message: 'Booking can no longer be cancelled',
      });
    }
    await this.myBookings.notifyOwner(result.value);
    return toDto(result.value, context);
  }

  private async request(auth: AuthPrincipal, body: CreateBookingRequest): Promise<StoredOutcome> {
    const actor = await this.actor(auth);
    const result = await this.bookings.request(actor, {
      pitchId: body.pitchId,
      start: new Date(body.start),
      hours: body.hours,
    });
    if (!result.ok) {
      const code = result.error === 'BOOKED' ? 'SLOT_TAKEN' : result.error;
      return {
        kind: 'error',
        status: REQUEST_ERROR_STATUS[result.error],
        code,
        message: `Booking request rejected: ${code}`,
      };
    }
    const { booking, context, queueAhead } = result.value;
    await this.flow.notifyOwner(booking, [...queueAhead, booking], context);
    return {
      kind: 'ok',
      status: HttpStatus.CREATED,
      body: { booking: toDto(booking, context), queueAhead: queueAhead.length },
    };
  }

  private replay(outcome: StoredOutcome, reply: FastifyReply): CreateBookingResponse {
    if (outcome.kind === 'error') {
      throw new HttpException({ code: outcome.code, message: outcome.message }, outcome.status);
    }
    reply.status(outcome.status);
    return outcome.body as CreateBookingResponse;
  }

  /** Token to'g'ri, lekin akkaunt bloklangan/o'chirilgan bo'lishi mumkin (TZ AD-2) */
  private async actor(auth: AuthPrincipal): Promise<BookingActor> {
    const account = await this.identity.accountOf(auth.userId);
    if (!account) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'User no longer exists' });
    }
    if (account.blocked) {
      throw new ForbiddenException({ code: 'ACCOUNT_BLOCKED', message: 'Account is blocked' });
    }
    return { userId: account.id, roles: account.roles, phone: account.phone };
  }

  /** EC-D1: faqat o'z bandlovi; begonasi — 404 (mavjudligi ham oshkor qilinmaydi) */
  private async own(
    userId: string,
    id: string,
  ): Promise<{ booking: Booking; context: PitchContext }> {
    const booking = /^[0-9a-f]{24}$/.test(id) ? await this.queries.byId(id) : null;
    if (!booking || booking.playerId !== userId) throw notFound();
    const context = await this.catalog.pitchContext(booking.pitchId);
    if (!context) throw notFound();
    return { booking, context };
  }
}

const notFound = () =>
  new NotFoundException({ code: 'BOOKING_NOT_FOUND', message: 'Booking not found' });

function toDto(b: Booking, ctx: PitchContext): BookingDto {
  return {
    id: b.id,
    code: b.code,
    status: b.status,
    start: b.range.start.toISOString(),
    end: b.range.end.toISOString(),
    businessDate: b.businessDate,
    price: { amount: b.price.amount, currency: 'UZS' },
    expiresAt: b.status === 'PENDING' ? (b.expiresAt?.toISOString() ?? null) : null,
    lateCancel: b.lateCancel,
    note: b.note,
    createdAt: b.createdAt.toISOString(),
    venue: {
      id: ctx.venue.id,
      name: ctx.venue.name,
      landmarkText: ctx.venue.landmarkText,
      phones: ACTIVE.has(b.status) ? ctx.venue.phones.map((p) => p.format()) : [],
    },
    pitch: { id: ctx.pitchId, name: ctx.pitchName },
    timeZone: ctx.timeZone,
  };
}
