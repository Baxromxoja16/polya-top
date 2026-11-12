import { Injectable } from '@nestjs/common';

/** Maydon bo'yicha: slot boshi (epoch ms) → chegirma foizi */
export type PitchDiscounts = ReadonlyMap<number, number>;

/**
 * Vaqtinchalik chegirmalar porti (TZ 4.9 "chegirma e'loni", SP-5).
 * Scheduling narxni hisoblaydi, chegirmalarni esa Marketing beradi: u ishga tushganda o'zini shu
 * registrga yozadi — Scheduling Marketing'ni bilmaydi (`OccupancyRegistry` bilan bir xil naqsh).
 */
export interface DiscountSource {
  load(pitchIds: readonly string[], from: Date, to: Date): Promise<Map<string, PitchDiscounts>>;
}

@Injectable()
export class DiscountRegistry {
  #source: DiscountSource | null = null;

  use(source: DiscountSource): void {
    this.#source = source;
  }

  async load(
    pitchIds: readonly string[],
    from: Date,
    to: Date,
  ): Promise<Map<string, PitchDiscounts>> {
    return this.#source ? this.#source.load(pitchIds, from, to) : new Map();
  }
}
