import { DomainError } from '@polya/shared-kernel';

export class InvalidPhoneNumberError extends DomainError {
  readonly code = 'INVALID_PHONE_NUMBER';
}

const E164 = /^\+[1-9]\d{7,14}$/;
const UZ_PREFIX = '+998';
const UZ_LENGTH = 13; // +998 XX XXX XX XX

/**
 * Telefon raqami, E.164 formatida (TZ 7.3). Telegram kontaktni "998901234567" yoki
 * "+998 90 123-45-67" ko'rinishida yuborishi mumkin, shuning uchun hammasi bitta shaklga keltiriladi.
 */
export class PhoneNumber {
  private constructor(readonly value: string) {}

  static parse(raw: string): PhoneNumber {
    const compact = raw.trim().replace(/[\s()-]/g, '');
    const normalized = compact.startsWith('+') ? compact : `+${compact}`;
    if (!E164.test(normalized)) {
      throw new InvalidPhoneNumberError('Phone number is not a valid E.164 number', { raw });
    }
    if (normalized.startsWith(UZ_PREFIX) && normalized.length !== UZ_LENGTH) {
      throw new InvalidPhoneNumberError('Uzbekistan numbers must have 9 digits after +998', {
        raw,
      });
    }
    return new PhoneNumber(normalized);
  }

  get isUzbek(): boolean {
    return this.value.startsWith(UZ_PREFIX);
  }

  /** O'qish uchun: +998 90 123 45 67 */
  format(): string {
    if (!this.isUzbek) return this.value;
    const d = this.value.slice(4);
    return `+998 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 7)} ${d.slice(7, 9)}`;
  }

  equals(other: PhoneNumber | null | undefined): boolean {
    return other?.value === this.value;
  }

  toString(): string {
    return this.value;
  }
}
