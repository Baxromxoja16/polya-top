/**
 * O'yinchi reputatsiyasi (TZ 4.8). Saqlanmaydi — bandlovlar tarixidan hisoblanadi, shuning uchun
 * hech qachon nosinxron bo'lmaydi.
 */
export interface Reputation {
  completed: number;
  noShow: number;
  lateCancel: number;
  /** Oxirgi NO_SHOW vaqti (cheklov muddatini hisoblash uchun) */
  lastNoShowAt: Date | null;
}

export const REPUTATION_WINDOW_DAYS = 90;
/** Shundan ko'p NO_SHOW — Owner'ga "⚠️ Ishonchsiz o'yinchi" */
export const UNRELIABLE_NO_SHOWS = 3;
/** Shundan ko'p NO_SHOW — bandlash 30 kunga to'xtatiladi */
export const RESTRICT_NO_SHOWS = 5;
export const RESTRICT_DAYS = 30;

export function isUnreliable(r: Reputation): boolean {
  return r.noShow >= UNRELIABLE_NO_SHOWS;
}

export function isRestricted(r: Reputation, now: Date): boolean {
  if (r.noShow < RESTRICT_NO_SHOWS || !r.lastNoShowAt) return false;
  return now.getTime() - r.lastNoShowAt.getTime() < RESTRICT_DAYS * 86_400_000;
}
