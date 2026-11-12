import { Injectable } from '@nestjs/common';
import { Clock, err, IdGenerator, ok, type Result, TimeRange } from '@polya/shared-kernel';
import { SLOT_MINUTES } from '../../scheduling/index.js';
import { BookingStore } from '../domain/booking-store.js';
import {
  MAX_ACTIVE_WATCHES,
  type SlotWatch,
  SlotWatchStore,
  WATCH_NOTIFY_GAP_MS,
  type WatchError,
} from '../domain/slot-watch.js';

/**
 * TZ VC-5d, EC-M6, EC-M7. Xabarlar tranzaksion (foydalanuvchi o'zi so'ragan) — MK-1 bo'yicha
 * marketing limitlari qo'llanmaydi.
 */
@Injectable()
export class SlotWatchService {
  constructor(
    private readonly watches: SlotWatchStore,
    private readonly bookings: BookingStore,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async watch(userId: string, pitchId: string, slotStart: Date): Promise<Result<void, WatchError>> {
    const now = this.clock.now();
    if (slotStart.getTime() <= now.getTime()) return err('PAST');
    if ((await this.watches.countActive(userId, now)) >= MAX_ACTIVE_WATCHES)
      return err('LIMIT_REACHED');
    if (!(await this.isBooked(pitchId, slotStart))) return err('NOT_BOOKED');
    const added = await this.watches.add({
      id: this.ids.next(),
      userId,
      pitchId,
      slotStart,
      status: 'ACTIVE',
      createdAt: now,
      notifiedAt: null,
    });
    return added ? ok(undefined) : err('ALREADY_WATCHING');
  }

  unwatch(userId: string, pitchId: string, slotStart: Date): Promise<boolean> {
    return this.watches.cancel(userId, pitchId, slotStart);
  }

  /**
   * Bo'shagan slotlar bo'yicha navbatdagi obunachi (har slotga bittadan, oraliq 10 daqiqa).
   * EC-M7: obunachi shu vaqtga boshqa joyda bandlov qilgan bo'lsa — obunasi o'chiriladi.
   */
  async dueNotifications(): Promise<SlotWatch[]> {
    const now = this.clock.now();
    const due: SlotWatch[] = [];
    for (const slot of await this.watches.activeSlots(now)) {
      if (await this.isBooked(slot.pitchId, slot.slotStart)) continue;
      const { active, lastNotifiedAt } = await this.watches.queueOf(slot.pitchId, slot.slotStart);
      if (lastNotifiedAt && now.getTime() - lastNotifiedAt.getTime() < WATCH_NOTIFY_GAP_MS)
        continue;
      const range = TimeRange.ofDuration(slot.slotStart, SLOT_MINUTES);
      for (const w of active) {
        const elsewhere = await this.bookings.findPlayerActiveOverlapping(w.userId, range);
        if (elsewhere.length > 0) {
          await this.watches.transition(w.id, 'CANCELLED', now);
          continue;
        }
        if (await this.watches.transition(w.id, 'NOTIFIED', now)) due.push(w);
        break;
      }
    }
    return due;
  }

  private async isBooked(pitchId: string, slotStart: Date): Promise<boolean> {
    const end = new Date(slotStart.getTime() + SLOT_MINUTES * 60_000);
    const occ = (await this.bookings.occupancy([pitchId], slotStart, end)).get(pitchId);
    return occ?.booked.has(slotStart.getTime()) ?? false;
  }
}
