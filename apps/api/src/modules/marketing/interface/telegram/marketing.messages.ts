import { defineMessages } from '../../../../platform/telegram/i18n.js';

export const formatSum = (amount: number) => amount.toLocaleString('ru-RU').replace(/\s/g, ' ');

export interface VenueLine {
  name: string;
  landmark: string;
  price: string | null;
}

export const marketingMessages = defineMessages(
  {
    newVenue: (v: VenueLine) =>
      `🆕 Shahringizda yangi polya ochildi!\n\n🏟 ${v.name}\n📍 ${v.landmark}` +
      `${v.price ? `\n💰 ${v.price} so'm/soat dan` : ''}\n\nBo'sh vaqtlarni ko'ring va bandlang 👇`,
    newVenues: (lines: VenueLine[]) =>
      `🆕 Shahringizda ${lines.length} ta yangi polya ochildi!\n\n` +
      lines
        .map(
          (v, i) =>
            `${i + 1}. 🏟 ${v.name}\n   📍 ${v.landmark}${v.price ? ` · 💰 ${v.price} so'm dan` : ''}`,
        )
        .join('\n') +
      "\n\nBo'sh vaqtlarni ko'ring va bandlang 👇",
    btnOpen: (name: string) => `🏟 ${name}`,
    btnOptOut: "🔕 Bunday xabarlarni o'chirish",
  },
  {
    newVenue: (v) =>
      `🆕 В вашем городе открылось новое поле!\n\n🏟 ${v.name}\n📍 ${v.landmark}` +
      `${v.price ? `\n💰 от ${v.price} сум/час` : ''}\n\nСмотрите свободное время и бронируйте 👇`,
    newVenues: (lines) =>
      `🆕 В вашем городе открылось ${lines.length} новых полей!\n\n` +
      lines
        .map(
          (v, i) =>
            `${i + 1}. 🏟 ${v.name}\n   📍 ${v.landmark}${v.price ? ` · 💰 от ${v.price} сум` : ''}`,
        )
        .join('\n') +
      '\n\nСмотрите свободное время и бронируйте 👇',
    btnOpen: (name) => `🏟 ${name}`,
    btnOptOut: '🔕 Отключить такие сообщения',
  },
);

/** MK-7: Admin'ga (ichki — faqat o'zbekcha) */
export const blockAlert = (p: { id: string; blocked: number; delivered: number }) =>
  `⚠️ Kampaniya ${p.id}: botni bloklaganlar ulushi yuqori — ${p.blocked} / ${p.blocked + p.delivered}. ` +
  "Xabar matni va chastotasini ko'rib chiqing.";
