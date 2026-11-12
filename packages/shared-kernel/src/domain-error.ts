/**
 * Barcha domain xatolarining bazasi. `code` — mashina o'qiydigan barqaror kod
 * (HTTP Problem Details va bot matnlari shu kod bo'yicha tanlanadi, domain'da matn yo'q).
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(
    message: string,
    readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvariantViolationError extends DomainError {
  readonly code = 'INVARIANT_VIOLATION';
}

/**
 * Optimistic concurrency: aggregate o'qilgandan keyin uni boshqa jarayon o'zgartirgan (TZ EC-B3, EC-B4).
 * Chaqiruvchi qayta o'qib, haqiqiy holatni foydalanuvchiga ko'rsatadi.
 */
export class ConcurrencyConflictError extends DomainError {
  readonly code = 'CONCURRENCY_CONFLICT';
}
