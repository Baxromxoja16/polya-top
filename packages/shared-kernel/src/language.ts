/** Qo'llab-quvvatlanadigan tillar (TZ ID-4, Q8). Domain'da matn yo'q — til faqat foydalanuvchi sozlamasi. */
export const LANGUAGES = ['uz', 'ru'] as const;

export type Language = (typeof LANGUAGES)[number];

export const DEFAULT_LANGUAGE: Language = 'uz';

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

/** Qurilma lokalidan (masalan, "ru-RU", "uz", "en") boshlang'ich tilni tanlaydi. */
export function languageFromLocale(locale: string | undefined | null): Language {
  const code = locale?.trim().toLowerCase().slice(0, 2);
  return isLanguage(code) ? code : DEFAULT_LANGUAGE;
}
