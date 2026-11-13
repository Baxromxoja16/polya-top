import { DomainError, type TimeRange } from '@polya/shared-kernel';
import type { Block, BlockId } from './block.js';
import type { Booking, BookingId, BookingStatus } from './booking.js';
import type { Reputation } from './reputation.js';

/** Slot allaqachon band (boshqa tasdiqlangan bandlov yoki blok) — slot-lock unique index (ADR-0002). */
export class SlotTakenError extends DomainError {
  readonly code = 'SLOT_TAKEN';
}

/** EC-B2: shu o'yinchining shu maydon va vaqtga faol so'rovi bor (ikki marta bosish). */
export class DuplicateActiveRequestError extends DomainError {
  readonly code = 'DUPLICATE_ACTIVE_REQUEST';
}

export interface PitchOccupancyView {
  booked: Set<number>;
  requested: Map<number, number>;
}

/**
 * Bandlovlar ombori. `commit*` metodlari BITTA Mongo tranzaksiyasida bajariladi:
 * holat + slot-lock'lar + kesishgan so'rovlarni rad etish — yoki hammasi, yoki hech biri (TZ 7.5).
 */
export abstract class BookingStore {
  abstract findById(id: BookingId): Promise<Booking | null>;
  /** TZ AD-4: shu vaqtdan keyin yaratilganlar, holat bo'yicha */
  abstract countByStatusSince(since: Date): Promise<Partial<Record<string, number>>>;
  abstract findByCode(code: string): Promise<Booking | null>;
  /** PENDING + CONFIRMED, vaqti kesishadigan */
  abstract findActiveOverlapping(pitchId: string, range: TimeRange): Promise<Booking[]>;
  /** EC-B6: o'yinchining boshqa joydagi kesishgan faol bandlovlari */
  abstract findPlayerActiveOverlapping(playerId: string, range: TimeRange): Promise<Booking[]>;
  /** TZ 4.8: `since` dan beri hisoblagichlar */
  abstract reputation(playerId: string, since: Date): Promise<Reputation>;
  /** BK-11 */
  abstract countPlayerPending(playerId: string): Promise<number>;
  abstract listByPlayer(
    playerId: string,
    filter: { endAfter?: Date; endBefore?: Date; statuses?: BookingStatus[]; limit: number },
  ): Promise<Booking[]>;
  abstract listByVenues(
    venueIds: readonly string[],
    filter: { from: Date; to: Date; statuses?: BookingStatus[] },
  ): Promise<Booking[]>;
  abstract listPendingByVenues(venueIds: readonly string[]): Promise<Booking[]>;
  abstract findDueForExpiry(now: Date, limit: number): Promise<Booking[]>;
  abstract findDueForCompletion(now: Date, limit: number): Promise<Booking[]>;
  /**
   * Xabarnoma uchun bandlovlarni atomik "band qilish": `flag` hali qo'yilmagan va filtrga mos yozuvlarga
   * flag qo'yiladi; faqat shu chaqiruv qo'ygan yozuvlar qaytariladi. Ko'p nusxada ham bir marta yuboriladi.
   */
  abstract claimForNotification(
    flag: 'remindedAt' | 'ownerNudgedAt' | 'reviewInvitedAt',
    filter: {
      status: BookingStatus;
      startBetween?: [Date, Date];
      expiresBetween?: [Date, Date];
      endBetween?: [Date, Date];
      source?: 'BOT';
    },
    now: Date,
    limit: number,
  ): Promise<Booking[]>;
  abstract listInRange(from: Date, to: Date, statuses: BookingStatus[]): Promise<Booking[]>;
  abstract occupancy(
    pitchIds: readonly string[],
    from: Date,
    to: Date,
  ): Promise<Map<string, PitchOccupancyView>>;

  /** Yangi PENDING so'rov (slot egallamaydi). */
  abstract insertRequest(booking: Booking): Promise<void>;
  /** Slotlarga ta'sir qilmaydigan holat o'zgarishi (rad etish, muddat, yakunlash, PENDING'ni bekor qilish). */
  abstract save(booking: Booking): Promise<void>;
  /** Tasdiqlash yoki qo'lda bandlov: holat + slot-lock'lar + `rejected` so'rovlar — atomik. */
  abstract commitOccupy(booking: Booking, rejected: readonly Booking[]): Promise<void>;
  /** Tasdiqlangan bandlovni bekor qilish: holat + slot-lock'larni o'chirish — atomik. */
  abstract commitRelease(booking: Booking): Promise<void>;

  abstract findBlock(id: BlockId): Promise<Block | null>;
  abstract listActiveBlocks(pitchIds: readonly string[], from: Date, to: Date): Promise<Block[]>;
  abstract commitBlock(block: Block, rejected: readonly Booking[]): Promise<void>;
  abstract commitUnblock(block: Block): Promise<void>;
}
