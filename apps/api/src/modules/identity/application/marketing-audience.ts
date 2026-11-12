import type { Language } from '@polya/shared-kernel';

/** Marketing xabari oluvchisi (TZ 4.6.1) */
export interface AudienceMember {
  userId: string;
  telegramId: number;
  language: Language;
}

/**
 * TZ MK-4, MK-6: shahar foydalanuvchilari — botni bloklamagan va marketingdan voz kechmagan.
 * Kursor (`afterUserId`) bo'yicha bo'laklab o'qiladi: kampaniya to'xtab qolsa, joyidan davom etadi.
 */
export abstract class MarketingAudience {
  abstract page(
    cityId: string,
    afterUserId: string | null,
    limit: number,
  ): Promise<AudienceMember[]>;
}
