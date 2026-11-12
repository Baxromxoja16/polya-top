/** TZ 4.6.1: marketing xabarlari qoidalari — bitta joyda */

/** MK-2: bitta foydalanuvchiga 7 kun ichida ko'pi bilan */
export const WEEKLY_LIMIT = 2;
export const WEEK_MS = 7 * 86_400_000;

/** MK-3: faqat shahar vaqti bilan [10:00, 21:00) */
export const WINDOW_START_HOUR = 10;
export const WINDOW_END_HOUR = 21;

export function isWithinSendingWindow(localHour: number): boolean {
  return localHour >= WINDOW_START_HOUR && localHour < WINDOW_END_HOUR;
}

/** MK-2: sirpanuvchi 7 kunlik oyna. Limit to'lsa — xabar tashlab yuboriladi (keyinga qoldirilmaydi). */
export function hasQuota(previousSends: readonly Date[], now: Date): boolean {
  const since = now.getTime() - WEEK_MS;
  return previousSends.filter((d) => d.getTime() > since).length < WEEKLY_LIMIT;
}

/** MK-7: bloklash ulushi shundan oshsa — Admin'ga ogohlantirish */
export const BLOCK_ALERT_RATIO = 0.02;
