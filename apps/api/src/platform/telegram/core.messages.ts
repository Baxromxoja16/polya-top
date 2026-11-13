import { defineMessages } from './i18n.js';

export const coreMessages = defineMessages(
  {
    mainMenu: 'Asosiy menyu 👇',
    comingSoon: "🚧 Bu bo'lim tez orada ishga tushadi.",
    unknown: "Menyudan kerakli bo'limni tanlang 👇",
    staleButton: 'Bu tugma eskirgan. Menyu yangilandi.',
    privateOnly: (username: string) =>
      `Men faqat shaxsiy chatda ishlayman. Menga to'g'ridan-to'g'ri yozing: @${username}`,
    error: "Kutilmagan xatolik yuz berdi. Birozdan keyin qayta urinib ko'ring.",
    cancel: '❌ Bekor qilish',
    cancelled: 'Bekor qilindi.',
    tooFast: '⏳ Juda tez yozyapsiz. Bir daqiqadan keyin davom eting.',
  },
  {
    mainMenu: 'Главное меню 👇',
    comingSoon: '🚧 Этот раздел скоро заработает.',
    unknown: 'Выберите нужный раздел в меню 👇',
    staleButton: 'Эта кнопка устарела. Меню обновлено.',
    privateOnly: (username) =>
      `Я работаю только в личном чате. Напишите мне напрямую: @${username}`,
    error: 'Произошла непредвиденная ошибка. Попробуйте немного позже.',
    cancel: '❌ Отмена',
    cancelled: 'Отменено.',
    tooFast: '⏳ Слишком много запросов. Продолжите через минуту.',
  },
);

export const CANCEL_LABELS = [coreMessages.uz.cancel, coreMessages.ru.cancel];
