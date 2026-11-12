/**
 * TZ 4.9: tariflar va ularning imkoniyatlari — konfiguratsiya, kodda `if (premium)` sochilmaydi.
 * Yangi tarif yoki limit qo'shish faqat shu jadvalni o'zgartiradi.
 */
export type Plan = 'FREE' | 'PREMIUM';

export type Feature =
  /** VC-2e: rasmlar soni */
  | 'PHOTOS'
  /** 4.9: bo'sh soatga chegirma e'loni (oyiga) */
  | 'PROMOTIONS_PER_MONTH'
  /** VC-5a: qidiruvda "⭐ Tavsiya etiladi" */
  | 'RECOMMENDED'
  /** 4.9: to'liq statistika */
  | 'FULL_STATS'
  /** 4.9: xodimlar soni */
  | 'STAFF';

/** `true/false` — yoqilgan/o'chiq; raqam — limit */
export const PLAN_FEATURES: Record<Plan, Record<Feature, boolean | number>> = {
  FREE: { PHOTOS: 5, PROMOTIONS_PER_MONTH: 0, RECOMMENDED: false, FULL_STATS: false, STAFF: 1 },
  PREMIUM: { PHOTOS: 15, PROMOTIONS_PER_MONTH: 4, RECOMMENDED: true, FULL_STATS: true, STAFF: 100 },
};

/** TZ Q16: ishga tushirishda barcha Owner'larga 3 oy PREMIUM ("Asoschi hamkor") */
export const FOUNDER_TRIAL_DAYS = 90;
