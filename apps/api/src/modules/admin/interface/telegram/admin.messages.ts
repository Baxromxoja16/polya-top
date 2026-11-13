import { defineMessages } from '../../../../platform/telegram/i18n.js';

/** Bloklash natijasida jabrlanuvchilarga (o'yinchi/Owner tilida) */
export const affectedMessages = defineMessages(
  {
    playerBlockedToOwner: (p: { venue: string; when: string }) =>
      `ℹ️ «${p.venue}», ${p.when}: o'yinchi akkaunti bloklangani sababli bandlov bekor qilindi. Vaqt yana bo'sh.`,
    venueBlockedToPlayer: (p: { venue: string; when: string; reason: string }) =>
      `❌ «${p.venue}», ${p.when}: bandlovingiz bekor qilindi — stadion vaqtincha ishlamayapti.\nSabab: ${p.reason}\n\nBoshqa maydon topish: 🔍 Bo'sh maydon topish`,
  },
  {
    playerBlockedToOwner: (p) =>
      `ℹ️ «${p.venue}», ${p.when}: бронь отменена — аккаунт игрока заблокирован. Время снова свободно.`,
    venueBlockedToPlayer: (p) =>
      `❌ «${p.venue}», ${p.when}: ваша бронь отменена — стадион временно не работает.\nПричина: ${p.reason}\n\nНайти другое поле: 🔍 Найти свободное поле`,
  },
);

/** Admin'ga (ichki — o'zbekcha) */
export const adminText = {
  usageBlockUser: 'Foydalanish: /blockuser <telegram ID yoki +998…> | sabab',
  usageUnblockUser: 'Foydalanish: /unblockuser <telegram ID yoki +998…>',
  usageBlockVenue: 'Foydalanish: /blockvenue <slug> | sabab',
  usageUnblockVenue: 'Foydalanish: /unblockvenue <slug>',
  notFound: 'Topilmadi.',
  isAdmin: "Adminni bloklab bo'lmaydi.",
  noChange: "Holat o'zgarmadi (allaqachon shunday).",
  userBlocked: (cancelled: number) =>
    `⛔ Foydalanuvchi bloklandi. Bekor qilingan bandlovlar: ${cancelled} (Owner'larga xabar yuborildi).`,
  userUnblocked: '✅ Foydalanuvchi blokdan chiqarildi.',
  confirmVenue: (p: { name: string; future: number; reason: string }) =>
    `⚠️ «${p.name}» bloklanadi.\nSabab: ${p.reason}\n\nKelajakdagi ${p.future} ta bandlov/so'rov bekor qilinadi va o'yinchilarga xabar boradi. Tasdiqlaysizmi?`,
  btnConfirmBlock: '⛔ Ha, bloklash',
  venueBlocked: (name: string, cancelled: number) =>
    `⛔ «${name}» bloklandi. Bekor qilingan bandlovlar: ${cancelled}.`,
  venueUnblocked: (name: string) => `✅ «${name}» blokdan chiqarildi.`,
  alreadyHandled: "Allaqachon bajarilgan yoki stadion holati o'zgargan.",
  defaultReason: 'Platforma qoidalari buzilgan',
};
