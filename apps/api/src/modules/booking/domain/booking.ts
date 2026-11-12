import {
  AggregateRoot,
  type Brand,
  createDomainEvent,
  DomainError,
  type LocalDate,
  type Money,
  type PhoneNumber,
  type TimeRange,
} from '@polya/shared-kernel';

export type BookingId = Brand<string, 'BookingId'>;

export type BookingStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'CANCELLED_BY_PLAYER'
  | 'CANCELLED_BY_OWNER'
  | 'COMPLETED'
  | 'NO_SHOW';

/** OWNER — egasi rad etdi; SLOT_TAKEN — vaqt boshqa so'rovga/qo'lda bandlovga/blokka berildi (BK-3c) */
export type RejectReason = 'OWNER' | 'SLOT_TAKEN';
export type BookingSource = 'BOT' | 'MANUAL';

export class BookingTransitionError extends DomainError {
  readonly code = 'BOOKING_TRANSITION';
}
export class InvalidBookingError extends DomainError {
  readonly code = 'INVALID_BOOKING';
}

export const BookingEvents = {
  Requested: 'booking.requested',
  Confirmed: 'booking.confirmed',
  Rejected: 'booking.rejected',
  Expired: 'booking.expired',
  Cancelled: 'booking.cancelled',
  Completed: 'booking.completed',
  NoShow: 'booking.no_show',
} as const;

export interface BookingHistoryEntry {
  at: Date;
  from: BookingStatus | null;
  to: BookingStatus;
  by: string | null;
  note: string | null;
}

export interface Guest {
  name: string;
  phone: PhoneNumber | null;
}

export interface BookingProps {
  code: string;
  pitchId: string;
  venueId: string;
  /** Denormalizatsiya: ruxsat va xabarnoma uchun */
  ownerId: string;
  playerId: string | null;
  /** Qo'lda bandlov (BK-7): telefon orqali qo'ng'iroq qilgan mijoz */
  guest: Guest | null;
  source: BookingSource;
  range: TimeRange;
  businessDate: LocalDate;
  /** Narx bandlov yaratilganda qotiriladi (SP-5) */
  price: Money;
  status: BookingStatus;
  rejectReason: RejectReason | null;
  /** Rad etish/bekor qilish izohi (BK-4, BK-6) */
  note: string | null;
  /** PENDING muddati (BK-3f, EC-B7) */
  expiresAt: Date | null;
  confirmedBy: string | null;
  /** BK-5: o'yinga oz qolganda bekor qilindi — reputatsiyaga ta'sir qiladi */
  lateCancel: boolean;
  history: BookingHistoryEntry[];
  createdAt: Date;
  updatedAt: Date;
}

/** BK-3f: Owner javob berish muddati */
export const PENDING_TTL_MINUTES = 60;
/** BK-5: shundan kam qolganda bekor qilish "kech" hisoblanadi */
export const FREE_CANCEL_HOURS = 3;
/** BK-9: o'yindan keyin NO_SHOW belgilash oynasi */
export const NO_SHOW_WINDOW_HOURS = 24;

const ACTIVE: readonly BookingStatus[] = ['PENDING', 'CONFIRMED'];

export class Booking extends AggregateRoot<BookingId> {
  #p: BookingProps;

  private constructor(id: BookingId, props: BookingProps, version: number) {
    super(id, version);
    this.#p = props;
  }

  /** TZ BK-1…BK-3: Player so'rovi. Slotni egallamaydi (BK-3a), navbatga turadi. */
  static request(params: {
    id: BookingId;
    code: string;
    pitchId: string;
    venueId: string;
    ownerId: string;
    playerId: string;
    range: TimeRange;
    businessDate: LocalDate;
    price: Money;
    now: Date;
    ttlMinutes?: number;
  }): Booking {
    if (params.range.start.getTime() <= params.now.getTime()) {
      throw new InvalidBookingError('Booking must start in the future');
    }
    const ttl = (params.ttlMinutes ?? PENDING_TTL_MINUTES) * 60_000;
    // EC-B7: PENDING hech qachon o'yin boshlanishidan o'tib ketmaydi
    const expiresAt = new Date(Math.min(params.now.getTime() + ttl, params.range.start.getTime()));
    const booking = new Booking(
      params.id,
      {
        ...base(params),
        playerId: params.playerId,
        guest: null,
        source: 'BOT',
        status: 'PENDING',
        expiresAt,
        confirmedBy: null,
        history: [{ at: params.now, from: null, to: 'PENDING', by: params.playerId, note: null }],
      },
      0,
    );
    booking.emit(BookingEvents.Requested, params.now);
    return booking;
  }

  /** TZ BK-7: Owner qo'lda kiritgan bandlov — darhol CONFIRMED. */
  static manual(params: {
    id: BookingId;
    code: string;
    pitchId: string;
    venueId: string;
    ownerId: string;
    createdBy: string;
    guest: Guest;
    range: TimeRange;
    businessDate: LocalDate;
    price: Money;
    now: Date;
  }): Booking {
    const name = params.guest.name.trim();
    if ([...name].length < 1 || [...name].length > 60) {
      throw new InvalidBookingError('Guest name must be 1..60 characters');
    }
    const booking = new Booking(
      params.id,
      {
        ...base(params),
        playerId: null,
        guest: { name, phone: params.guest.phone },
        source: 'MANUAL',
        status: 'CONFIRMED',
        expiresAt: null,
        confirmedBy: params.createdBy,
        history: [
          { at: params.now, from: null, to: 'CONFIRMED', by: params.createdBy, note: 'manual' },
        ],
      },
      0,
    );
    booking.emit(BookingEvents.Confirmed, params.now);
    return booking;
  }

  static reconstitute(id: BookingId, props: BookingProps, version: number): Booking {
    return new Booking(id, { ...props, history: [...props.history] }, version);
  }

  get code(): string {
    return this.#p.code;
  }
  get pitchId(): string {
    return this.#p.pitchId;
  }
  get venueId(): string {
    return this.#p.venueId;
  }
  get ownerId(): string {
    return this.#p.ownerId;
  }
  get playerId(): string | null {
    return this.#p.playerId;
  }
  get guest(): Guest | null {
    return this.#p.guest;
  }
  get source(): BookingSource {
    return this.#p.source;
  }
  get range(): TimeRange {
    return this.#p.range;
  }
  get businessDate(): LocalDate {
    return this.#p.businessDate;
  }
  get price(): Money {
    return this.#p.price;
  }
  get status(): BookingStatus {
    return this.#p.status;
  }
  get rejectReason(): RejectReason | null {
    return this.#p.rejectReason;
  }
  get note(): string | null {
    return this.#p.note;
  }
  get expiresAt(): Date | null {
    return this.#p.expiresAt;
  }
  get confirmedBy(): string | null {
    return this.#p.confirmedBy;
  }
  get lateCancel(): boolean {
    return this.#p.lateCancel;
  }
  get history(): readonly BookingHistoryEntry[] {
    return this.#p.history;
  }
  get createdAt(): Date {
    return this.#p.createdAt;
  }
  get updatedAt(): Date {
    return this.#p.updatedAt;
  }

  /** PENDING yoki CONFIRMED */
  get isActive(): boolean {
    return ACTIVE.includes(this.#p.status);
  }

  /** TZ 4.4.1: slotni faqat CONFIRMED egallaydi */
  get occupiesSlots(): boolean {
    return this.#p.status === 'CONFIRMED';
  }

  isExpiredAt(now: Date): boolean {
    return this.#p.status === 'PENDING' && this.#p.expiresAt !== null && now >= this.#p.expiresAt;
  }

  confirm(by: string, now: Date): void {
    if (this.isExpiredAt(now)) {
      throw new BookingTransitionError('Pending request has expired', {
        expiresAt: this.#p.expiresAt?.toISOString(),
      });
    }
    this.move(['PENDING'], 'CONFIRMED', by, null, now);
    this.#p.confirmedBy = by;
    this.#p.expiresAt = null;
    this.emit(BookingEvents.Confirmed, now);
  }

  /** BK-4 */
  reject(by: string, note: string | null, now: Date): void {
    this.move(['PENDING'], 'REJECTED', by, note, now);
    this.#p.rejectReason = 'OWNER';
    this.#p.note = cleanNote(note);
    this.emit(BookingEvents.Rejected, now);
  }

  /** BK-3c: vaqt boshqaga berildi */
  rejectAsTaken(now: Date): void {
    this.move(['PENDING'], 'REJECTED', null, 'slot taken', now);
    this.#p.rejectReason = 'SLOT_TAKEN';
    this.emit(BookingEvents.Rejected, now);
  }

  /** BK-3f */
  expire(now: Date): void {
    if (!this.isExpiredAt(now)) {
      throw new BookingTransitionError('Request has not expired yet', {
        expiresAt: this.#p.expiresAt?.toISOString(),
      });
    }
    this.move(['PENDING'], 'EXPIRED', null, null, now);
    this.emit(BookingEvents.Expired, now);
  }

  /** BK-5: o'yin boshlanguncha; CONFIRMED'da oz qolganda — "kech" */
  cancelByPlayer(by: string, now: Date): void {
    if (now >= this.#p.range.start) throw new BookingTransitionError('Game has already started');
    const wasConfirmed = this.#p.status === 'CONFIRMED';
    this.move(['PENDING', 'CONFIRMED'], 'CANCELLED_BY_PLAYER', by, null, now);
    this.#p.lateCancel =
      wasConfirmed && this.#p.range.start.getTime() - now.getTime() < FREE_CANCEL_HOURS * 3_600_000;
    this.emit(BookingEvents.Cancelled, now);
  }

  /** BK-6: faqat sabab bilan */
  cancelByOwner(by: string, note: string, now: Date): void {
    const reason = cleanNote(note);
    if (!reason) throw new InvalidBookingError('Owner must give a reason to cancel');
    this.move(['CONFIRMED'], 'CANCELLED_BY_OWNER', by, reason, now);
    this.#p.note = reason;
    this.emit(BookingEvents.Cancelled, now);
  }

  /** BK-9: o'yin tugagach */
  complete(now: Date): void {
    if (now < this.#p.range.end) throw new BookingTransitionError('Game has not finished yet');
    this.move(['CONFIRMED'], 'COMPLETED', null, null, now);
    this.emit(BookingEvents.Completed, now);
  }

  /** BK-9: o'yindan keyin 24 soat ichida */
  markNoShow(by: string, now: Date): void {
    if (this.#p.source !== 'BOT')
      throw new BookingTransitionError('No-show applies to player bookings only');
    const deadline = this.#p.range.end.getTime() + NO_SHOW_WINDOW_HOURS * 3_600_000;
    if (now.getTime() > deadline) throw new BookingTransitionError('No-show window has passed');
    this.move(['COMPLETED'], 'NO_SHOW', by, null, now);
    this.emit(BookingEvents.NoShow, now);
  }

  private move(
    from: BookingStatus[],
    to: BookingStatus,
    by: string | null,
    note: string | null,
    now: Date,
  ): void {
    const current = this.#p.status;
    if (!from.includes(current)) {
      throw new BookingTransitionError('Illegal booking status transition', { from: current, to });
    }
    this.#p.status = to;
    this.#p.updatedAt = now;
    this.#p.history = [
      ...this.#p.history,
      { at: now, from: current, to, by, note: cleanNote(note) },
    ];
  }

  private emit(type: string, now: Date): void {
    this.raise(
      createDomainEvent({
        type,
        aggregateId: this.id,
        occurredAt: now,
        payload: {
          status: this.#p.status,
          pitchId: this.#p.pitchId,
          venueId: this.#p.venueId,
          playerId: this.#p.playerId,
        },
      }),
    );
  }
}

function base(p: {
  code: string;
  pitchId: string;
  venueId: string;
  ownerId: string;
  range: TimeRange;
  businessDate: LocalDate;
  price: Money;
  now: Date;
}) {
  return {
    code: p.code,
    pitchId: p.pitchId,
    venueId: p.venueId,
    ownerId: p.ownerId,
    range: p.range,
    businessDate: p.businessDate,
    price: p.price,
    rejectReason: null,
    note: null,
    lateCancel: false,
    createdAt: p.now,
    updatedAt: p.now,
  };
}

function cleanNote(note: string | null): string | null {
  return note?.trim().slice(0, 300) || null;
}
