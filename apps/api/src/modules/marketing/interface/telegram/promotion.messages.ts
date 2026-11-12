import type { Language } from '@polya/shared-kernel';
import { defineMessages } from '../../../../platform/telegram/i18n.js';
import type { PromotionError } from '../../application/promotion.service.js';

export const promotionMessages = defineMessages(
  {
    intro: (left: number) =>
      "🔥 Chegirma e'loni\n\nKelgusi 24 soatdagi bo'sh vaqtingizga chegirma qo'ying — " +
      `shahringizdagi o'yinchilarga xabar boradi.\nBu oy yana ${left} ta e'lon qilish mumkin.`,
    premiumOnly:
      "🔥 Chegirma e'loni — ⭐ PREMIUM imkoniyat.\n\nPREMIUM ulash uchun admin bilan bog'laning.",
    limitReached: "Bu oy uchun chegirma e'lonlari limiti tugadi (oyiga 4 ta).",
    choosePitch: 'Qaysi maydon?',
    chooseStart: 'Boshlanish vaqtini tanlang (↪ — ertaga):',
    noFreeSlots: "Kelgusi 24 soatda bo'sh vaqt yo'q.",
    chooseHours: 'Necha soat?',
    hours: (h: number) => `${h} soat`,
    choosePercent: 'Chegirma necha foiz?',
    preview: (p: { pitch: string; when: string; percent: number; old: string; price: string }) =>
      `Tekshiring:\n\n⚽ ${p.pitch}\n🕒 ${p.when}\n💰 ${p.old} → ${p.price} so'm/soat (−${p.percent}%)\n\n` +
      "E'lon shahringizdagi o'yinchilarga yuboriladi (10:00–21:00 oralig'ida).",
    btnPublish: "✅ E'lon qilish",
    published: "✅ Chegirma e'lon qilindi! Narx bandlashda avtomatik qo'llanadi.",
    today: 'Bugun',
    tomorrow: 'Ertaga',
  },
  {
    intro: (left) =>
      '🔥 Объявление о скидке\n\nПоставьте скидку на свободное время в ближайшие 24 часа — ' +
      `игроки вашего города получат сообщение.\nВ этом месяце осталось: ${left}.`,
    premiumOnly: '🔥 Объявление о скидке — ⭐ PREMIUM.\n\nДля подключения свяжитесь с админом.',
    limitReached: 'Лимит объявлений о скидках на этот месяц исчерпан (4 в месяц).',
    choosePitch: 'Какое поле?',
    chooseStart: 'Выберите время начала (↪ — завтра):',
    noFreeSlots: 'В ближайшие 24 часа нет свободного времени.',
    chooseHours: 'Сколько часов?',
    hours: (h) => `${h} ч`,
    choosePercent: 'Какая скидка?',
    preview: (p) =>
      `Проверьте:\n\n⚽ ${p.pitch}\n🕒 ${p.when}\n💰 ${p.old} → ${p.price} сум/час (−${p.percent}%)\n\n` +
      'Объявление получат игроки вашего города (с 10:00 до 21:00).',
    btnPublish: '✅ Опубликовать',
    published: '✅ Скидка объявлена! Цена применяется при бронировании автоматически.',
    today: 'Сегодня',
    tomorrow: 'Завтра',
  },
);

export const promotionErrors: Record<Language, Record<PromotionError, string>> = {
  uz: {
    NOT_FOUND: 'Maydon topilmadi.',
    FORBIDDEN: "Bu stadionni boshqarish huquqingiz yo'q.",
    PREMIUM_REQUIRED: '⭐ PREMIUM kerak.',
    LIMIT_REACHED: 'Bu oy uchun limit tugadi.',
    INVALID: "Chegirma 10–50% va kelgusi 24 soat ichida bo'lishi kerak.",
    NOT_FREE: "Bu vaqt endi bo'sh emas. Boshqa vaqtni tanlang.",
    OVERLAP: "Bu vaqtga allaqachon chegirma qo'yilgan.",
  },
  ru: {
    NOT_FOUND: 'Поле не найдено.',
    FORBIDDEN: 'Нет прав на управление этим стадионом.',
    PREMIUM_REQUIRED: '⭐ Нужен PREMIUM.',
    LIMIT_REACHED: 'Лимит на этот месяц исчерпан.',
    INVALID: 'Скидка 10–50% и только в ближайшие 24 часа.',
    NOT_FREE: 'Это время уже занято. Выберите другое.',
    OVERLAP: 'На это время уже есть скидка.',
  },
};
