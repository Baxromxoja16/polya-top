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
