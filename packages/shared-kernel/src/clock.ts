/**
 * Vaqt porti (TZ EC-S7). Domain va application `new Date()` ni to'g'ridan-to'g'ri chaqirmaydi,
 * shunda testlarda vaqtni boshqarish mumkin.
 * Abstract class — DI token sifatida ham ishlaydi, framework importisiz.
 */
export abstract class Clock {
  abstract now(): Date;
}

export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}

export class FixedClock extends Clock {
  #current: number;

  constructor(initial: Date) {
    super();
    this.#current = initial.getTime();
  }

  now(): Date {
    return new Date(this.#current);
  }

  set(instant: Date): void {
    this.#current = instant.getTime();
  }

  advanceBy(ms: number): void {
    this.#current += ms;
  }
}
