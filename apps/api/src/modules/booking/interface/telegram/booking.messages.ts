import { defineMessages } from '../../../../platform/telegram/i18n.js';

export const bookingMessages = defineMessages(
  {
    chooseDuration: (when: string) => `⏱ ${when} — necha soatga?`,
    hours: (h: number) => `${h} soat`,
    noDurations: "Bu vaqtdan boshlab bo'sh soat qolmagan. Boshqa vaqtni tanlang.",
    summary: (p: { venue: string; pitch: string; when: string; total: string; landmark: string }) =>
      `📝 Bandlov so'rovi\n\n🏟 ${p.venue} · ${p.pitch}\n📍 ${p.landmark}\n🕒 ${p.when}\n💰 ${p.total} so'm (joyida to'lanadi)`,
    breakdown: (lines: string) => `\n💡 Narx soatlar bo'yicha: ${lines}`,
    queueWarning: (n: number) =>
      `\n\n🟡 Bu vaqtga allaqachon ${n} ta so'rov bor. Siz navbatda ${n + 1}-chi bo'lasiz — egasi avval oldingi o'yinchi bilan gaplashadi.`,
    consent:
      '\n\n📱 Raqamingiz stadion egasiga yuboriladi. Egasi tasdiqlagach bandlov kuchga kiradi.',
    btnConfirm: '✅ Bandlash',
    btnBack: '⬅️ Boshqa vaqt',

    requested: (p: { code: string; phones: string; ttl: string }) =>
      `✅ So'rov yuborildi (${p.code}).\n\n📞 Stadion: ${p.phones}\nEgasi siz bilan bog'lanadi yoki o'zingiz qo'ng'iroq qiling.\n\n⏳ Egasi ${p.ttl} gacha javob bermasa, so'rov bekor bo'ladi.`,
    requestedInQueue: (n: number) => `\n🟡 Siz navbatda ${n}-chisiz.`,

    confirmedToPlayer: (p: { code: string; venue: string; when: string }) =>
      `🎉 Bandlov tasdiqlandi! (${p.code})\n🏟 ${p.venue}\n🕒 ${p.when}\n\nO'yindan oldin eslatamiz.`,
    rejectedToPlayer: (p: { venue: string; when: string; note: string | null }) =>
      `❌ ${p.venue}, ${p.when} — so'rov rad etildi.${p.note ? `\nSabab: ${p.note}` : ''}\nBoshqa vaqt yoki stadionni tanlang.`,
    takenToPlayer: (p: { venue: string; when: string }) =>
      `😕 ${p.venue}, ${p.when} — bu vaqt boshqa o'yinchiga berildi. Boshqa vaqtni tanlang: ⚽ Bo'sh maydon topish.`,
    reminderToPlayer: (p: { venue: string; when: string; landmark: string; phones: string }) =>
      `⏰ Eslatma: o'yiningiz yaqinlashdi!
🏟 ${p.venue}
🕒 ${p.when}
📍 ${p.landmark}
📞 ${p.phones}`,
    expiredToPlayer: (p: { venue: string; when: string }) =>
      `⌛️ ${p.venue}, ${p.when} — egasi o'z vaqtida javob bermadi, so'rov bekor bo'ldi.`,
  },
  {
    chooseDuration: (when) => `⏱ ${when} — на сколько часов?`,
    hours: (h) => `${h} ч`,
    noDurations: 'С этого времени свободных часов нет. Выберите другое время.',
    summary: (p) =>
      `📝 Запрос на бронь\n\n🏟 ${p.venue} · ${p.pitch}\n📍 ${p.landmark}\n🕒 ${p.when}\n💰 ${p.total} сум (оплата на месте)`,
    breakdown: (lines) => `\n💡 Цена по часам: ${lines}`,
    queueWarning: (n) =>
      `\n\n🟡 На это время уже ${n} запрос(а). Вы будете ${n + 1}-м в очереди — владелец сначала свяжется с предыдущим игроком.`,
    consent:
      '\n\n📱 Ваш номер будет отправлен владельцу стадиона. Бронь действует после его подтверждения.',
    btnConfirm: '✅ Забронировать',
    btnBack: '⬅️ Другое время',

    requested: (p) =>
      `✅ Запрос отправлен (${p.code}).\n\n📞 Стадион: ${p.phones}\nВладелец свяжется с вами, или позвоните сами.\n\n⏳ Если владелец не ответит до ${p.ttl}, запрос отменится.`,
    requestedInQueue: (n) => `\n🟡 Вы ${n}-й в очереди.`,

    confirmedToPlayer: (p) =>
      `🎉 Бронь подтверждена! (${p.code})\n🏟 ${p.venue}\n🕒 ${p.when}\n\nНапомним перед игрой.`,
    rejectedToPlayer: (p) =>
      `❌ ${p.venue}, ${p.when} — запрос отклонён.${p.note ? `\nПричина: ${p.note}` : ''}\nВыберите другое время или стадион.`,
    takenToPlayer: (p) =>
      `😕 ${p.venue}, ${p.when} — это время отдали другому игроку. Выберите другое: ⚽ Найти свободное поле.`,
    reminderToPlayer: (p) =>
      `⏰ Напоминание: скоро игра!
🏟 ${p.venue}
🕒 ${p.when}
📍 ${p.landmark}
📞 ${p.phones}`,
    expiredToPlayer: (p) =>
      `⌛️ ${p.venue}, ${p.when} — владелец не ответил вовремя, запрос отменён.`,
  },
);

/** BookingService xato kodlari → foydalanuvchi matni */
export const bookingErrors = defineMessages(
  {
    PHONE_REQUIRED: 'Avval telefon raqamingizni yuboring.',
    NOT_AVAILABLE: 'Bu maydon hozir bandlov qabul qilmaydi.',
    PLAYER_OVERLAP:
      "Sizda shu vaqtga boshqa faol bandlov bor (bir vaqtda ikki joyga bandlab bo'lmaydi).",
    TOO_MANY_PENDING: "Sizda 3 ta javob kutayotgan so'rov bor. Avval ular hal bo'lsin.",
    QUEUE_FULL: "Bu vaqtga so'rovlar ko'p (3 ta). Boshqa vaqtni tanlang.",
    DUPLICATE: "Bu vaqtga so'rovingiz allaqachon yuborilgan.",
    NO_SCHEDULE: 'Bu maydonning jadvali kiritilmagan.',
    OUTSIDE_HOURS: 'Bu vaqt ish vaqtidan tashqarida.',
    TOO_SOON: "O'yin boshlanishiga juda oz qoldi — egasiga qo'ng'iroq qiling.",
    BEYOND_HORIZON: "14 kundan uzoq muddatga bandlab bo'lmaydi.",
    TOO_LONG: "Bunday davomiylikka bandlab bo'lmaydi.",
    BOOKED: 'Bu vaqt hozirgina band qilindi. Boshqa vaqtni tanlang.',
  },
  {
    PHONE_REQUIRED: 'Сначала отправьте номер телефона.',
    NOT_AVAILABLE: 'Это поле сейчас не принимает брони.',
    PLAYER_OVERLAP: 'У вас уже есть бронь на это время (нельзя бронировать два места сразу).',
    TOO_MANY_PENDING: 'У вас 3 запроса ждут ответа. Дождитесь решения по ним.',
    QUEUE_FULL: 'На это время слишком много запросов (3). Выберите другое время.',
    DUPLICATE: 'Ваш запрос на это время уже отправлен.',
    NO_SCHEDULE: 'Для этого поля не задано расписание.',
    OUTSIDE_HOURS: 'Это время вне часов работы.',
    TOO_SOON: 'До начала слишком мало времени — позвоните владельцу.',
    BEYOND_HORIZON: 'Бронировать можно не более чем на 14 дней вперёд.',
    TOO_LONG: 'На такую длительность бронировать нельзя.',
    BOOKED: 'Это время только что заняли. Выберите другое.',
  },
);

/** Owner/Staff uchun — o'zbekcha (ular bilan muloqot tili keyin sozlanadi) */
export const ownerText = {
  newRequest: (p: { venue: string; pitch: string; when: string; total: string }) =>
    `🆕 Yangi so'rov\n🏟 ${p.venue} · ${p.pitch}\n🕒 ${p.when}\n💰 ${p.total} so'm`,
  queueHeader: (n: number) =>
    `\n\n🟡 Bu vaqtga ${n} ta so'rov bor. Avval birinchisi bilan bog'laning; u bandlamasa — keyingisini tasdiqlang:`,
  queueLine: (i: number, name: string, phone: string, at: string) =>
    `${i}. 👤 ${name} · 📱 ${phone} · ${at} da`,
  single: (name: string, phone: string) =>
    `\n\n👤 ${name}\n📱 ${phone}\nQo'ng'iroq qilib kelishing, keyin tasdiqlang.`,
  confirmed: (name: string, by: string) => `\n\n✅ Tasdiqlandi: ${name} — ${by}`,
  rejected: (by: string) => `\n\n❌ Rad etildi — ${by}`,
  alreadyHandled: "Bu so'rov allaqachon hal qilingan",
  expired: "So'rov muddati o'tib bo'lgan",
  slotTaken: 'Bu vaqt allaqachon boshqaga berilgan',
  forbidden: "Bu so'rov sizga tegishli emas",
  nudge: (p: { venue: string; when: string; name: string; phone: string; minutes: number }) =>
    `⏳ So'rov ${p.minutes} daqiqadan keyin bekor bo'ladi!
🏟 ${p.venue}
🕒 ${p.when}
👤 ${p.name} · 📱 ${p.phone}`,
  dailyTitle: (date: string) => `🗓 Ertangi jadval (${date}):`,
  dailyLine: (p: { icon: string; time: string; pitch: string; name: string; phone: string }) =>
    `${p.icon} ${p.time} · ${p.pitch} · ${p.name} · ${p.phone}`,
};

export const formatSum = (amount: number) => amount.toLocaleString('ru-RU').replace(/ /g, ' ');
