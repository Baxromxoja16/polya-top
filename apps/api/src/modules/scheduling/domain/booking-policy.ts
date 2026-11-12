/**
 * Bandlash siyosati (TZ SP-6, SP-7, EC-B16). Hozircha platforma bo'yicha standart;
 * stadion darajasidagi sozlamalar keyin (venue.settings) shu tipni to'ldiradi.
 */
export interface BookingPolicy {
  /** Necha kun oldindan bandlash mumkin (biznes kuni bo'yicha, EC-S9) */
  horizonDays: number;
  /** O'yin boshlanishidan kamida necha daqiqa oldin (SP-7, EC-S8) */
  minLeadMinutes: number;
  /** Bot orqali maksimal davomiylik, soatda (EC-B16) */
  maxDurationHours: number;
}

export const DEFAULT_BOOKING_POLICY: BookingPolicy = {
  horizonDays: 14,
  minLeadMinutes: 30,
  maxDurationHours: 4,
};
