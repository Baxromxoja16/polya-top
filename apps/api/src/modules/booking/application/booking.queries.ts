import { Injectable } from '@nestjs/common';
import { Clock } from '@polya/shared-kernel';
import type { Booking, BookingId } from '../domain/booking.js';
import { BookingStore } from '../domain/booking-store.js';

const DAY_MS = 86_400_000;

/** O'qish uchun: "Mening bandlovlarim" (BK-12), Owner'ning kutilayotgan so'rovlari va kunlik jadvali (BK-13). */
@Injectable()
export class BookingQueries {
  constructor(
    private readonly store: BookingStore,
    private readonly clock: Clock,
  ) {}

  byId(id: string): Promise<Booking | null> {
    return this.store.findById(id as BookingId);
  }

  /** Kelgusi (hali tugamagan) faol bandlovlar */
  playerUpcoming(playerId: string): Promise<Booking[]> {
    return this.store.listByPlayer(playerId, {
      endAfter: this.clock.now(),
      statuses: ['PENDING', 'CONFIRMED'],
      limit: 20,
    });
  }

  /** `since` dan keyin tugagan yoki hozir davom etayotgan o'yinlar (RV-8) */
  playerRecent(playerId: string, since: Date): Promise<Booking[]> {
    return this.store.listByPlayer(playerId, {
      endAfter: since,
      statuses: ['CONFIRMED', 'COMPLETED'],
      limit: 20,
    });
  }

  /** Oxirgi o'tgan yoki yakunlangan bandlovlar */
  playerHistory(playerId: string): Promise<Booking[]> {
    return this.store.listByPlayer(playerId, {
      endBefore: new Date(this.clock.now().getTime() + 30 * DAY_MS),
      statuses: [
        'COMPLETED',
        'NO_SHOW',
        'CANCELLED_BY_PLAYER',
        'CANCELLED_BY_OWNER',
        'REJECTED',
        'EXPIRED',
      ],
      limit: 10,
    });
  }

  pendingForVenues(venueIds: readonly string[]): Promise<Booking[]> {
    return this.store.listPendingByVenues(venueIds);
  }

  /** BK-13: berilgan oraliqdagi barcha faol bandlovlar */
  venueSchedule(venueIds: readonly string[], from: Date, to: Date): Promise<Booking[]> {
    return this.store.listByVenues(venueIds, {
      from,
      to,
      statuses: ['PENDING', 'CONFIRMED', 'COMPLETED'],
    });
  }

  /** Tugagan, NO_SHOW belgilash mumkin bo'lgan bandlovlar (oxirgi 24 soat) */
  recentlyCompleted(venueIds: readonly string[]): Promise<Booking[]> {
    const now = this.clock.now();
    return this.store.listByVenues(venueIds, {
      from: new Date(now.getTime() - DAY_MS),
      to: now,
      statuses: ['COMPLETED'],
    });
  }

  blocks(pitchIds: readonly string[], from: Date, to: Date) {
    return this.store.listActiveBlocks(pitchIds, from, to);
  }
}
