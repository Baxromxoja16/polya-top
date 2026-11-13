import { defineMessages } from '../../../../platform/telegram/i18n.js';

/** Bloklash natijasida jabrlanuvchilarga (o'yinchi/Owner tilida) */
export const affectedMessages = defineMessages(
  {
    playerBlockedToOwner: (p: { venue: string; when: string }) =>
      `ℹ️ «${p.venue}», ${p.when}: o'yinchi akkaunti bloklangani sababli bandlov bekor qilindi. Vaqt yana bo'sh.`,
    venueBlockedToPlayer: (p: { venue: string; when: string; reason: string }) =>
      `❌ «${p.venue}», ${p.when}: bandlovingiz bekor qilindi — stadion vaqtincha ishlamayapti.\nSabab: ${p.reason}\n\nBoshqa maydon topish: 🔍 Bo'sh maydon topish`,
    becameOwner: (venue: string) =>
      `🏟 Admin «${venue}» stadionini sizning akkauntingizga o'tkazdi. Boshqaruv: 🏟 Stadion egasiman.`,
    lostOwnership: (venue: string) =>
      `ℹ️ «${venue}» stadioni admin tomonidan boshqa akkauntga o'tkazildi.`,
  },
  {
    playerBlockedToOwner: (p) =>
      `ℹ️ «${p.venue}», ${p.when}: бронь отменена — аккаунт игрока заблокирован. Время снова свободно.`,
    venueBlockedToPlayer: (p) =>
      `❌ «${p.venue}», ${p.when}: ваша бронь отменена — стадион временно не работает.\nПричина: ${p.reason}\n\nНайти другое поле: 🔍 Найти свободное поле`,
    becameOwner: (venue) =>
      `🏟 Админ передал стадион «${venue}» вашему аккаунту. Управление: 🏟 Я владелец стадиона.`,
    lostOwnership: (venue) => `ℹ️ Стадион «${venue}» передан админом другому аккаунту.`,
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
  usageTransfer: 'Foydalanish: /transfervenue <slug> | <yangi egasi: telegram ID yoki +998…>',
  userNotFound: "Yangi egasi topilmadi (u avval botga /start yozgan bo'lishi kerak).",
  transferred: (name: string, who: string) => `✅ «${name}» egaligi ${who} ga o'tkazildi.`,
};
