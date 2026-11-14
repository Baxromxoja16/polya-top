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

/**
 * Admin menyusi (TZ 4.7, AD-1…AD-4). Admin — ichki xodim, matnlar faqat o'zbekcha (`adminText` kabi).
 * Har bir tugma mavjud slash-buyruqning o'zini ishga tushiradi; buyruqlar ham ishlashda qoladi.
 */
export const ADMIN_MENU = {
  stats: '📊 Statistika',
  pending: '⏳ Tasdiq kutayotganlar',
  reviews: '🚩 Shikoyatlar',
  cities: '🏙 Shaharlar',
  premium: '💎 Premium',
  block: '⛔ Bloklash',
  transfer: "🔁 Egalikni o'tkazish",
  help: '🛠 Barcha buyruqlar',
  /** Admin menyusidan o'yinchi menyusiga o'tish */
  playerMode: '⚽ Band qilish',
  /** O'yinchi menyusidan (faqat admin'ga ko'rinadi) admin menyusiga qaytish */
  adminMode: '🛠 Admin panel',
} as const;

export type AdminMenuItem = keyof typeof ADMIN_MENU;

const ALL_LABELS = new Set([
  ...(Object.keys(MAIN_MENU) as MainMenuItem[]).flatMap((item) => menuLabels(item)),
  ...Object.values(ADMIN_MENU),
]);

const ADMIN_LABELS = new Set<string>(Object.values(ADMIN_MENU));

/** Oddiy foydalanuvchi bu matnni yozsa — "noma'lum" (admin menyusi borligi oshkor qilinmaydi). */
export function isAdminMenuLabel(text: string | undefined): boolean {
  return text !== undefined && ADMIN_LABELS.has(text);
}

export function isMainMenuLabel(text: string | undefined): boolean {
  return text !== undefined && ALL_LABELS.has(text);
}

/** `withAdminPanel` — admin o'yinchi rejimida: admin menyusiga qaytish tugmasi qo'shiladi. */
export function mainMenuKeyboard(lang: Language, withAdminPanel = false): Keyboard {
  const l = (item: MainMenuItem) => MAIN_MENU[item][lang];
  const kb = new Keyboard()
    .text(l('find'))
    .row()
    .text(l('nearby'))
    .text(l('bookings'))
    .row()
    .text(l('favorites'))
    .text(l('settings'))
    .row()
    .text(l('owner'));
  if (withAdminPanel) kb.row().text(ADMIN_MENU.adminMode);
  return kb.resized().persistent();
}

export function adminMenuKeyboard(): Keyboard {
  const a = ADMIN_MENU;
  return new Keyboard()
    .text(a.stats)
    .text(a.pending)
    .row()
    .text(a.reviews)
    .text(a.cities)
    .row()
    .text(a.premium)
    .text(a.block)
    .row()
    .text(a.transfer)
    .text(a.help)
    .row()
    .text(a.playerMode)
    .resized()
    .persistent();
}
