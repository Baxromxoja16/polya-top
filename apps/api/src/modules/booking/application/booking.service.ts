import { Injectable } from '@nestjs/common';
import {
  Clock,
  ConcurrencyConflictError,
  err,
  IdGenerator,
  ok,
  PhoneNumber,
  type Result,
} from '@polya/shared-kernel';
import { CatalogQueries, type PitchContext } from '../../catalog/index.js';
import {
  AvailabilityService,
  type BookingPolicy,
  type Quote,
  type QuoteError,
} from '../../scheduling/index.js';
import { Block, type BlockId } from '../domain/block.js';
import { Booking, type BookingId, BookingTransitionError } from '../domain/booking.js';
import {
  BookingStore,
  DuplicateActiveRequestError,
  SlotTakenError,
} from '../domain/booking-store.js';
import { isRestricted, REPUTATION_WINDOW_DAYS, type Reputation } from '../domain/reputation.js';

export interface BookingActor {
  userId: string;
  roles: readonly string[];
  phone: string | null;
}

/** BK-3e: bitta slotdagi navbat */
export const MAX_QUEUE = 3;
/** BK-11: bir o'yinchining bir vaqtdagi faol so'rovlari */
export const MAX_PLAYER_PENDING = 3;

/** Owner qo'lda kiritganda: lead time yo'q, uzoqroq ufq va davomiylik (BK-7, EC-B16) */
const REMIND_BEFORE_MS = 2 * 3_600_000;
const NUDGE_BEFORE_MS = 10 * 60_000;

const OWNER_POLICY: BookingPolicy = { horizonDays: 60, minLeadMinutes: 0, maxDurationHours: 12 };

export type RequestError =
  | 'PHONE_REQUIRED'
  | 'NOT_AVAILABLE'
  | 'PLAYER_OVERLAP'
  | 'TOO_MANY_PENDING'
  | 'QUEUE_FULL'
  | 'DUPLICATE'
  | 'RESTRICTED'
  | QuoteError;

export interface RequestOutcome {
  booking: Booking;
  context: PitchContext;
  /** BK-3b: shu vaqtga avval kelgan, hali tasdiqlanmagan so'rovlar */
  queueAhead: Booking[];
}

export type DecisionError =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'ALREADY_HANDLED'
  | 'EXPIRED'
  | 'SLOT_TAKEN';

export interface ConfirmOutcome {
  booking: Booking;
  /** BK-3c: avtomatik rad etilgan so'rovlar — egalariga xabar boradi */
  rejected: Booking[];
  context: PitchContext;
}

@Injectable()
export class BookingService {
  constructor(
    private readonly store: BookingStore,
    private readonly catalog: CatalogQueries,
    private readonly availability: AvailabilityService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  /** TZ BK-1…BK-3, BK-11, BK-3e, EC-B2, EC-B6 */
  async request(
    actor: BookingActor,
    input: { pitchId: string; start: Date; hours: number },
  ): Promise<Result<RequestOutcome, RequestError>> {
    if (!actor.phone) return err('PHONE_REQUIRED');
    // TZ 4.8: ko'p marta kelmagan o'yinchi vaqtincha bandlay olmaydi
    if (isRestricted(await this.reputationOf(actor.userId), this.clock.now()))
      return err('RESTRICTED');
    const context = await this.catalog.pitchContext(input.pitchId);
    if (!context?.venue.isPublic || !context.isBookable) return err('NOT_AVAILABLE');

    const q = await this.availability.quote({
      pitchId: input.pitchId,
      start: input.start,
      hours: input.hours,
      timeZone: context.timeZone,
    });
    if (!q.ok) return err(q.error);
    const quote = q.quote;

    if ((await this.store.findPlayerActiveOverlapping(actor.userId, quote.range)).length > 0)
      return err('PLAYER_OVERLAP');
    if ((await this.store.countPlayerPending(actor.userId)) >= MAX_PLAYER_PENDING)
      return err('TOO_MANY_PENDING');
    if (quote.pendingRequests >= MAX_QUEUE) return err('QUEUE_FULL');

    const booking = Booking.request({
      id: this.ids.next() as BookingId,
      code: this.code(),
      pitchId: context.pitchId,
      venueId: context.venue.id,
      ownerId: context.venue.ownerId,
      playerId: actor.userId,
      range: quote.range,
      businessDate: quote.businessDate,
      price: quote.total,
      now: this.clock.now(),
    });
    try {
      await this.store.insertRequest(booking);
    } catch (error) {
      if (error instanceof DuplicateActiveRequestError) return err('DUPLICATE');
      throw error;
    }
    const queueAhead = (
      await this.store.findActiveOverlapping(context.pitchId, quote.range)
    ).filter(
      (b) => b.id !== booking.id && b.status === 'PENDING' && b.createdAt <= booking.createdAt,
    );
    return ok({ booking, context, queueAhead });
  }

  /** TZ BK-2, BK-3b, BK-3c; EC-B1a, EC-B3, EC-B4 */
  async confirm(
    actor: BookingActor,
    bookingId: string,
  ): Promise<Result<ConfirmOutcome, DecisionError>> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const loaded = await this.loadForOwner(actor, bookingId);
      if (!loaded.ok) return loaded;
      const { booking, context } = loaded.value;
      const now = this.clock.now();
      if (booking.status !== 'PENDING') return err('ALREADY_HANDLED');
      if (booking.isExpiredAt(now)) {
        booking.expire(now);
        await this.store.save(booking).catch(() => undefined);
        return err('EXPIRED');
      }

      const rejected = (
        await this.store.findActiveOverlapping(booking.pitchId, booking.range)
      ).filter((b) => b.id !== booking.id && b.status === 'PENDING');
      booking.confirm(actor.userId, now);
      for (const r of rejected) r.rejectAsTaken(now);
      try {
        await this.store.commitOccupy(booking, rejected);
        return ok({ booking, rejected, context });
      } catch (error) {
        if (error instanceof SlotTakenError) {
          await this.markTaken(bookingId);
          return err('SLOT_TAKEN');
        }
        // Boshqa jarayon shu so'rovni yoki navbatdagilardan birini o'zgartirgan — qayta o'qib urinamiz
        if (error instanceof ConcurrencyConflictError) continue;
        throw error;
      }
    }
    return err('ALREADY_HANDLED');
  }

  /** TZ BK-4 */
  async reject(
    actor: BookingActor,
    bookingId: string,
    note: string | null,
  ): Promise<Result<Booking, DecisionError>> {
    return this.ownerTransition(actor, bookingId, (b, now) => b.reject(actor.userId, note, now));
  }

  /** TZ BK-6 */
  async cancelByOwner(
    actor: BookingActor,
    bookingId: string,
    note: string,
  ): Promise<Result<Booking, DecisionError>> {
    return this.ownerTransition(
      actor,
      bookingId,
      (b, now) => b.cancelByOwner(actor.userId, note, now),
      true,
    );
  }

  /** TZ BK-9 */
  async markNoShow(
    actor: BookingActor,
    bookingId: string,
  ): Promise<Result<Booking, DecisionError>> {
    return this.ownerTransition(actor, bookingId, (b, now) => b.markNoShow(actor.userId, now));
  }

  /** TZ BK-5, EC-B1f, EC-B5 */
  async cancelByPlayer(
    actor: BookingActor,
    bookingId: string,
  ): Promise<Result<Booking, 'NOT_FOUND' | 'ALREADY_HANDLED'>> {
    const booking = await this.store.findById(bookingId as BookingId);
    if (!booking || booking.playerId !== actor.userId) return err('NOT_FOUND');
    const wasConfirmed = booking.occupiesSlots;
    try {
      booking.cancelByPlayer(actor.userId, this.clock.now());
      if (wasConfirmed) await this.store.commitRelease(booking);
      else await this.store.save(booking);
    } catch (error) {
      if (error instanceof BookingTransitionError || error instanceof ConcurrencyConflictError)
        return err('ALREADY_HANDLED');
      throw error;
    }
    return ok(booking);
  }

  /** TZ BK-7: qo'lda bandlov — darhol CONFIRMED, kesishgan so'rovlar rad etiladi */
  async createManual(
    actor: BookingActor,
    input: {
      pitchId: string;
      start: Date;
      hours: number;
      guestName: string;
      guestPhone: string | null;
    },
  ): Promise<
    Result<ConfirmOutcome, 'FORBIDDEN' | 'NOT_FOUND' | 'SLOT_TAKEN' | 'INVALID_PHONE' | QuoteError>
  > {
    const prepared = await this.prepareOwnerOccupation(actor, input);
    if (!prepared.ok) return prepared;
    const { context, quote } = prepared.value;
    let phone: PhoneNumber | null = null;
    if (input.guestPhone) {
      try {
        phone = PhoneNumber.parse(input.guestPhone);
      } catch {
        return err('INVALID_PHONE');
      }
    }
    const now = this.clock.now();
    const booking = Booking.manual({
      id: this.ids.next() as BookingId,
      code: this.code(),
      pitchId: context.pitchId,
      venueId: context.venue.id,
      ownerId: context.venue.ownerId,
      createdBy: actor.userId,
      guest: { name: input.guestName, phone },
      range: quote.range,
      businessDate: quote.businessDate,
      price: quote.total,
      now,
    });
    const rejected = await this.rejectOverlappingPending(context.pitchId, quote, now);
    try {
      await this.store.commitOccupy(booking, rejected);
    } catch (error) {
      if (error instanceof SlotTakenError || error instanceof ConcurrencyConflictError)
        return err('SLOT_TAKEN');
      throw error;
    }
    return ok({ booking, rejected, context });
  }

  /** TZ BK-8, EC-B13 */
  async createBlock(
    actor: BookingActor,
    input: { pitchId: string; start: Date; hours: number; reason: string | null },
  ): Promise<
    Result<
      { block: Block; rejected: Booking[] },
      'FORBIDDEN' | 'NOT_FOUND' | 'SLOT_TAKEN' | QuoteError
    >
  > {
    const prepared = await this.prepareOwnerOccupation(actor, input);
    if (!prepared.ok) return prepared;
    const { context, quote } = prepared.value;
    const now = this.clock.now();
    const block = Block.create({
      id: this.ids.next() as BlockId,
      pitchId: context.pitchId,
      venueId: context.venue.id,
      range: quote.range,
      reason: input.reason,
      createdBy: actor.userId,
      now,
    });
    const rejected = await this.rejectOverlappingPending(context.pitchId, quote, now);
    try {
      await this.store.commitBlock(block, rejected);
    } catch (error) {
      if (error instanceof SlotTakenError || error instanceof ConcurrencyConflictError)
        return err('SLOT_TAKEN');
      throw error;
    }
    return ok({ block, rejected });
  }

  async removeBlock(
    actor: BookingActor,
    blockId: string,
  ): Promise<Result<Block, 'NOT_FOUND' | 'FORBIDDEN'>> {
    const block = await this.store.findBlock(blockId as BlockId);
    if (!block?.isActive) return err('NOT_FOUND');
    const context = await this.catalog.pitchContext(block.pitchId);
    if (!context || !canManage(actor, context)) return err('FORBIDDEN');
    block.remove(this.clock.now());
    await this.store.commitUnblock(block);
    return ok(block);
  }

  /**
   * Fon jarayoni (BK-3f, BK-9): muddati o'tgan so'rovlar → EXPIRED, tugagan o'yinlar → COMPLETED.
   * Idempotent va ko'p nusxada xavfsiz: har bir yozuv optimistic versiya bilan.
   */
  async sweep(limit = 200): Promise<{ expired: Booking[]; completed: Booking[] }> {
    const now = this.clock.now();
    const expired: Booking[] = [];
    const completed: Booking[] = [];
    for (const b of await this.store.findDueForExpiry(now, limit)) {
      try {
        b.expire(now);
        await this.store.save(b);
        expired.push(b);
      } catch (error) {
        if (!(error instanceof ConcurrencyConflictError || error instanceof BookingTransitionError))
          throw error;
      }
    }
    for (const b of await this.store.findDueForCompletion(now, limit)) {
      try {
        b.complete(now);
        await this.store.save(b);
        completed.push(b);
      } catch (error) {
        if (!(error instanceof ConcurrencyConflictError || error instanceof BookingTransitionError))
          throw error;
      }
    }
    return { expired, completed };
  }

  /** TZ 4.8 */
  reputationOf(playerId: string): Promise<Reputation> {
    const since = new Date(this.clock.now().getTime() - REPUTATION_WINDOW_DAYS * 86_400_000);
    return this.store.reputation(playerId, since);
  }

  /** TZ 4.6: o'yindan 2 soat oldin eslatma (faqat bot orqali bandlovlar) */
  dueReminders(limit = 200): Promise<Booking[]> {
    const now = this.clock.now();
    return this.store.claimForNotification(
      'remindedAt',
      {
        status: 'CONFIRMED',
        source: 'BOT',
        startBetween: [now, new Date(now.getTime() + REMIND_BEFORE_MS)],
      },
      now,
      limit,
    );
  }

  /** TZ BK-3f: so'rov muddati tugashiga 10 daqiqa qolganda Owner'ga qayta eslatma */
  dueOwnerNudges(limit = 200): Promise<Booking[]> {
    const now = this.clock.now();
    return this.store.claimForNotification(
      'ownerNudgedAt',
      { status: 'PENDING', expiresBetween: [now, new Date(now.getTime() + NUDGE_BEFORE_MS)] },
      now,
      limit,
    );
  }

  /** TZ 4.6: Owner'ning ertangi jadvali uchun */
  upcomingBookings(hours: number): Promise<Booking[]> {
    const now = this.clock.now();
    return this.store.listInRange(now, new Date(now.getTime() + hours * 3_600_000), [
      'PENDING',
      'CONFIRMED',
    ]);
  }

  // --- yordamchilar ---

  private async prepareOwnerOccupation(
    actor: BookingActor,
    input: { pitchId: string; start: Date; hours: number },
  ): Promise<
    Result<
      { context: PitchContext; quote: Quote },
      'FORBIDDEN' | 'NOT_FOUND' | 'SLOT_TAKEN' | QuoteError
    >
  > {
    const context = await this.catalog.pitchContext(input.pitchId);
    if (!context) return err('NOT_FOUND');
    if (!canManage(actor, context)) return err('FORBIDDEN');
    const q = await this.availability.quote({
      pitchId: input.pitchId,
      start: input.start,
      hours: input.hours,
      timeZone: context.timeZone,
      policy: OWNER_POLICY,
    });
    if (!q.ok) return err(q.error === 'BOOKED' ? 'SLOT_TAKEN' : q.error);
    return ok({ context, quote: q.quote });
  }

  private async rejectOverlappingPending(
    pitchId: string,
    quote: Quote,
    now: Date,
  ): Promise<Booking[]> {
    const pending = (await this.store.findActiveOverlapping(pitchId, quote.range)).filter(
      (b) => b.status === 'PENDING',
    );
    for (const p of pending) p.rejectAsTaken(now);
    return pending;
  }

  private async ownerTransition(
    actor: BookingActor,
    bookingId: string,
    apply: (b: Booking, now: Date) => void,
    releases = false,
  ): Promise<Result<Booking, DecisionError>> {
    const loaded = await this.loadForOwner(actor, bookingId);
    if (!loaded.ok) return loaded;
    const { booking } = loaded.value;
    try {
      apply(booking, this.clock.now());
      if (releases) await this.store.commitRelease(booking);
      else await this.store.save(booking);
    } catch (error) {
      if (error instanceof BookingTransitionError || error instanceof ConcurrencyConflictError)
        return err('ALREADY_HANDLED');
      throw error;
    }
    return ok(booking);
  }

  private async loadForOwner(
    actor: BookingActor,
    bookingId: string,
  ): Promise<Result<{ booking: Booking; context: PitchContext }, 'NOT_FOUND' | 'FORBIDDEN'>> {
    const booking = await this.store.findById(bookingId as BookingId);
    if (!booking) return err('NOT_FOUND');
    const context = await this.catalog.pitchContext(booking.pitchId);
    if (!context) return err('NOT_FOUND');
    // TZ EC-D1: callback'dagi ID'ga ishonilmaydi — har safar egalik tekshiriladi
    if (!canManage(actor, context)) return err('FORBIDDEN');
    return ok({ booking, context });
  }

  private async markTaken(bookingId: string): Promise<void> {
    const fresh = await this.store.findById(bookingId as BookingId);
    if (fresh?.status !== 'PENDING') return;
    fresh.rejectAsTaken(this.clock.now());
    await this.store.save(fresh).catch(() => undefined);
  }

  /** Odam o'qiy oladigan bandlov kodi: PT-XXXXXX (ObjectId'ning noyob qismidan) */
  private code(): string {
    const id = this.ids.next();
    return `PT-${BigInt(`0x${id.slice(-10)}`)
      .toString(36)
      .toUpperCase()
      .padStart(7, '0')
      .slice(-7)}`;
  }
}

/** TZ 3: Owner (va keyin Staff) faqat o'z stadionini boshqaradi; Admin — hammasini */
export function canManage(actor: BookingActor, context: PitchContext): boolean {
  return context.venue.ownerId === actor.userId || actor.roles.includes('ADMIN');
}
