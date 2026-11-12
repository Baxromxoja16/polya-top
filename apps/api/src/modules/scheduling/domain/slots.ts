import { type LocalDate, zonedToUtc } from '@polya/shared-kernel';
import type { PitchSchedule } from './pitch-schedule.js';

/** TZ Q2: vaqt to'ri — 1 soat. */
export const SLOT_MINUTES = 60;

export interface Slot {
  start: Date;
  end: Date;
  /** Biznes kuni (EC-S1): 16:00–02:00 jadvalda 01:00 slot — oldingi kun */
  businessDate: LocalDate;
  /** Biznes kunidagi soat: 0..47 (25 = ertasi kun 01:00) */
  hour: number;
}

/** Bir biznes kunining barcha slotlari (ish vaqti bo'yicha, bandlovlarsiz). */
export function slotsOf(schedule: PitchSchedule, date: LocalDate, timeZone: string): Slot[] {
  const hours = schedule.hoursFor(date);
  if (!hours) return [];
  const slots: Slot[] = [];
  for (let h = hours.openHour; h < hours.closeHourExtended; h++) {
    slots.push({
      start: zonedToUtc(date, h, timeZone),
      end: zonedToUtc(date, h + 1, timeZone),
      businessDate: date,
      hour: h,
    });
  }
  return slots;
}
