import { LANGUAGES, type Language } from '@polya/shared-kernel';
import { Keyboard } from 'grammy';

/** TZ 5.1 — asosiy menyu. Har bir modul o'z bandini `menuLabels(item)` orqali tutadi. */
export const MAIN_MENU = {
  find: { uz: "⚽ Bo'sh maydon topish", ru: '⚽ Найти свободное поле' },
  nearby: { uz: '📍 Yaqin atrofdagi stadionlar', ru: '📍 Стадионы рядом' },
  bookings: { uz: '📅 Mening bandlovlarim', ru: '📅 Мои брони' },
  favorites: { uz: '⭐ Sevimlilar', ru: '⭐ Избранное' },
  settings: { uz: '⚙️ Sozlamalar', ru: '⚙️ Настройки' },
  owner: { uz: '🏟 Stadion egasiman', ru: '🏟 Я владелец стадиона' },
} as const satisfies Record<string, Record<Language, string>>;

export type MainMenuItem = keyof typeof MAIN_MENU;

/** Barcha tillardagi yozuvlar: foydalanuvchi tilni almashtirgan bo'lsa ham eski klaviatura ishlaydi. */
export function menuLabels(item: MainMenuItem): string[] {
  return LANGUAGES.map((lang) => MAIN_MENU[item][lang]);
}

const ALL_LABELS = new Set(
  (Object.keys(MAIN_MENU) as MainMenuItem[]).flatMap((item) => menuLabels(item)),
);

export function isMainMenuLabel(text: string | undefined): boolean {
  return text !== undefined && ALL_LABELS.has(text);
}

export function mainMenuKeyboard(lang: Language): Keyboard {
  const l = (item: MainMenuItem) => MAIN_MENU[item][lang];
  return new Keyboard()
    .text(l('find'))
    .row()
    .text(l('nearby'))
    .text(l('bookings'))
    .row()
    .text(l('favorites'))
    .text(l('settings'))
    .row()
    .text(l('owner'))
    .resized()
    .persistent();
}
