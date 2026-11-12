import { DomainError } from './domain-error.js';

export class InvalidTimeRangeError extends DomainError {
  readonly code = 'INVALID_TIME_RANGE';
}

const MS_PER_MINUTE = 60_000;

/**
 * Yarim ochiq vaqt oralig'i [start, end) — UTC instantlar.
 * 19:00–20:00 va 20:00–21:00 kesishmaydi (chegaradagi nuqta ikkinchisiga tegishli).
 * Ichkarida raqam saqlanadi: Date mutable, tashqariga har safar yangi nusxa beriladi.
 */
export class TimeRange {
  readonly #start: number;
  readonly #end: number;

  private constructor(start: number, end: number) {
    this.#start = start;
    this.#end = end;
  }

  static of(start: Date, end: Date): TimeRange {
    const s = start.getTime();
    const e = end.getTime();
    if (Number.isNaN(s) || Number.isNaN(e)) {
      throw new InvalidTimeRangeError('Time range bounds must be valid dates');
    }
    if (e <= s) {
      throw new InvalidTimeRangeError('Time range end must be after start', {
        start: start.toISOString(),
        end: end.toISOString(),
      });
    }
    return new TimeRange(s, e);
  }

  static ofDuration(start: Date, minutes: number): TimeRange {
    return TimeRange.of(start, new Date(start.getTime() + minutes * MS_PER_MINUTE));
  }

  get start(): Date {
    return new Date(this.#start);
  }

  get end(): Date {
    return new Date(this.#end);
  }

  get durationMinutes(): number {
    return (this.#end - this.#start) / MS_PER_MINUTE;
  }

  overlaps(other: TimeRange): boolean {
    return this.#start < other.#end && other.#start < this.#end;
  }

  contains(instant: Date): boolean {
    const t = instant.getTime();
    return this.#start <= t && t < this.#end;
  }

  encloses(other: TimeRange): boolean {
    return this.#start <= other.#start && other.#end <= this.#end;
  }

  /**
   * Oraliqni teng bo'laklarga bo'ladi (slot-lock'lar uchun, TZ 7.5).
   * Oraliq qadamga karrali bo'lmasa — xato: noto'g'ri to'r jim yutib yuborilmaydi.
   */
  split(stepMinutes: number): TimeRange[] {
    if (!Number.isInteger(stepMinutes) || stepMinutes <= 0) {
      throw new InvalidTimeRangeError('Step must be a positive integer of minutes', {
        stepMinutes,
      });
    }
    const stepMs = stepMinutes * MS_PER_MINUTE;
    if ((this.#end - this.#start) % stepMs !== 0) {
      throw new InvalidTimeRangeError('Time range is not a multiple of the step', {
        durationMinutes: this.durationMinutes,
        stepMinutes,
      });
    }
    const parts: TimeRange[] = [];
    for (let t = this.#start; t < this.#end; t += stepMs) {
      parts.push(new TimeRange(t, t + stepMs));
    }
    return parts;
  }

  equals(other: TimeRange): boolean {
    return this.#start === other.#start && this.#end === other.#end;
  }

  toJSON(): { start: string; end: string } {
    return { start: this.start.toISOString(), end: this.end.toISOString() };
  }
}
