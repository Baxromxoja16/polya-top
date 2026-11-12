import { Injectable } from '@nestjs/common';

export interface PitchOccupancy {
  /** Band (tasdiqlangan bandlov yoki blok) slot boshlanishlari, epoch ms */
  booked: ReadonlySet<number>;
  /** Kutilayotgan so'rovlar soni slot bo'yicha (TZ BK-3a: 🟡, slotni egallamaydi) */
  requested: ReadonlyMap<number, number>;
}

export const EMPTY_OCCUPANCY: PitchOccupancy = { booked: new Set(), requested: new Map() };

/**
 * Maydonlar bandligi porti. Implementatsiyani Booking konteksti beradi (4-bosqich).
 * Scheduling Booking'ga bog'lanmaydi: Booking ishga tushganda o'zini `OccupancyRegistry`ga yozadi.
 */
export interface OccupancySource {
  load(pitchIds: readonly string[], from: Date, to: Date): Promise<Map<string, PitchOccupancy>>;
}

@Injectable()
export class OccupancyRegistry {
  #source: OccupancySource | null = null;

  use(source: OccupancySource): void {
    this.#source = source;
  }

  async load(
    pitchIds: readonly string[],
    from: Date,
    to: Date,
  ): Promise<Map<string, PitchOccupancy>> {
    return this.#source ? this.#source.load(pitchIds, from, to) : new Map();
  }
}
