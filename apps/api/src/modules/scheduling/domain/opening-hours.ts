import { DomainError } from '@polya/shared-kernel';

export class InvalidOpeningHoursError extends DomainError {
  readonly code = 'INVALID_OPENING_HOURS';
}

/**
 * Bir kunlik ish vaqti, butun soatlarda (TZ Q2: 1 soatlik to'r; EC-S6: chegaralar butun soatda).
 * `close <= open` — yarim tundan o'tadi (EC-S1): 16→02 = 16:00 dan ertasi 02:00 gacha.
 * `close = 0` — yarim tun (24:00). open = close — 24 soat.
 */
export class OpeningHours {
  private constructor(
    readonly openHour: number,
    /** 1..48: 24 dan katta bo'lsa — ertasi kun (biznes kuni davomida). */
    readonly closeHourExtended: number,
  ) {}

  static of(openHour: number, closeHour: number): OpeningHours {
    if (!Number.isInteger(openHour) || openHour < 0 || openHour > 23) {
      throw new InvalidOpeningHoursError('Opening hour must be an integer 0..23', { openHour });
    }
    if (!Number.isInteger(closeHour) || closeHour < 0 || closeHour > 24) {
      throw new InvalidOpeningHoursError('Closing hour must be an integer 0..24', { closeHour });
    }
    const close = closeHour === 0 ? 24 : closeHour;
    const extended = close <= openHour ? close + 24 : close;
    if (extended - openHour > 24) {
      throw new InvalidOpeningHoursError('A business day cannot exceed 24 hours', {
        openHour,
        closeHour,
      });
    }
    return new OpeningHours(openHour, extended);
  }

  get closeHour(): number {
    return this.closeHourExtended % 24;
  }

  get crossesMidnight(): boolean {
    return this.closeHourExtended > 24;
  }

  get durationHours(): number {
    return this.closeHourExtended - this.openHour;
  }

  /** "08:00–02:00" */
  format(): string {
    const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
    return `${hh(this.openHour)}–${hh(this.closeHour)}`;
  }

  equals(other: OpeningHours): boolean {
    return this.openHour === other.openHour && this.closeHourExtended === other.closeHourExtended;
  }

  /**
   * Foydalanuvchi kiritgan matn: "8-23", "08:00-02:00", "16 - 2", "08.00–00.00".
   * Daqiqalar faqat :00 bo'lishi mumkin (to'r 1 soat).
   */
  static parse(input: string): OpeningHours {
    const match = input
      .trim()
      .match(/^(\d{1,2})(?:[:.](\d{2}))?\s*[-–—]\s*(\d{1,2})(?:[:.](\d{2}))?$/);
    if (!match) throw new InvalidOpeningHoursError('Unrecognized opening hours format', { input });
    const [, oh, om = '00', ch, cm = '00'] = match;
    if (om !== '00' || cm !== '00') {
      throw new InvalidOpeningHoursError('Opening hours must start and end on a full hour', {
        input,
      });
    }
    return OpeningHours.of(Number(oh), Number(ch));
  }
}
