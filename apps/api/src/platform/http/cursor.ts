import { BadRequestException } from '@nestjs/common';

/**
 * TZ 7.7: cursor-based pagination. Hozircha cursor ichida faqat offset bor (qidiruv natijasi
 * bir nechta manbadan birlashtiriladi, barqaror "keyset" yo'q). Mijoz uchun cursor shaffof
 * emas — keyinchalik ichki formatni API'ni buzmasdan almashtirish mumkin.
 */
const PREFIX = 'o:';
/** Qidiruv har sahifada `offset + limit` hujjat o'qiydi — chuqur sahifalash bilan bazani yuklamaslik uchun */
export const MAX_OFFSET = 1_000;

export function encodeOffsetCursor(offset: number): string {
  return Buffer.from(`${PREFIX}${offset}`, 'utf8').toString('base64url');
}

export function decodeOffsetCursor(cursor: string | undefined): number {
  if (cursor === undefined) return 0;
  const raw = Buffer.from(cursor, 'base64url').toString('utf8');
  const offset = raw.startsWith(PREFIX) ? Number(raw.slice(PREFIX.length)) : Number.NaN;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > MAX_OFFSET) {
    throw new BadRequestException({ code: 'CURSOR_INVALID', message: 'Cursor is invalid' });
  }
  return offset;
}

/** To'liq sahifa qaytgan bo'lsa — keyingisi bo'lishi mumkin (oxirgi sahifa bo'sh bo'lishi mumkin) */
export function nextOffsetCursor(offset: number, limit: number, returned: number): string | null {
  return returned >= limit && offset + limit <= MAX_OFFSET
    ? encodeOffsetCursor(offset + limit)
    : null;
}
