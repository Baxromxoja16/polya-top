/**
 * TZ VC-5d: "🔔 Bo'shasa xabar ber" — band slotga obuna. Holat (ADR-0006): slot bo'shaganini
 * sweeper bandlikdan aniqlaydi, obunachilarga obuna tartibida, birma-bir xabar beradi.
 */
export const MAX_ACTIVE_WATCHES = 5;
/** Birinchi obunachiga xabar — keyingisiga shuncha vaqtdan keyin */
export const WATCH_NOTIFY_GAP_MS = 10 * 60_000;

export type SlotWatchStatus = 'ACTIVE' | 'NOTIFIED' | 'CANCELLED';

export interface SlotWatch {
  id: string;
  userId: string;
  pitchId: string;
  slotStart: Date;
  status: SlotWatchStatus;
  createdAt: Date;
  notifiedAt: Date | null;
}

export type WatchError = 'ALREADY_WATCHING' | 'LIMIT_REACHED' | 'NOT_BOOKED' | 'PAST';

export abstract class SlotWatchStore {
  /** `false` — shu slotga allaqachon faol obuna bor (noyob indeks) */
  abstract add(watch: SlotWatch): Promise<boolean>;
  abstract countActive(userId: string, now: Date): Promise<number>;
  abstract cancel(userId: string, pitchId: string, slotStart: Date): Promise<boolean>;
  /** Kelajakdagi faol obunalar bor slotlar */
  abstract activeSlots(now: Date): Promise<{ pitchId: string; slotStart: Date }[]>;
  /** Slot bo'yicha: ACTIVE'lar obuna tartibida va oxirgi xabar vaqti */
  abstract queueOf(
    pitchId: string,
    slotStart: Date,
  ): Promise<{ active: SlotWatch[]; lastNotifiedAt: Date | null }>;
  /** Atomik ACTIVE → NOTIFIED / CANCELLED (bitta jarayon oladi) */
  abstract transition(id: string, to: 'NOTIFIED' | 'CANCELLED', now: Date): Promise<boolean>;
}
