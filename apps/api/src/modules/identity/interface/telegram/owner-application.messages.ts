import { defineMessages } from '../../../../platform/telegram/i18n.js';

export const ownerApplicationMessages = defineMessages(
  {
    askNote:
      "🏟 Stadion egasi bo'lish uchun ariza.\n\n" +
      'Stadioningiz nomi va qayerdaligini qisqacha yozing (masalan: «Olmaliq Arena, 5-mikrorayon, 21-maktab orqasida»).\n\n' +
      "Admin arizani ko'rib chiqib, siz bilan bog'lanadi.",
    invalidNote: "❌ Izoh 5–500 belgidan iborat bo'lishi kerak. Qayta yozing:",
    submitted:
      "✅ Arizangiz qabul qilindi. Admin tasdiqlagach, stadion qo'shishingiz mumkin bo'ladi.",
    alreadyPending: "⏳ Arizangiz ko'rib chiqilmoqda. Tasdiqlangach xabar beramiz.",
    approved:
      "🎉 Tabriklaymiz! Siz stadion egasi sifatida tasdiqlandingiz.\n\n«🏟 Stadion egasiman» tugmasi orqali stadioningizni qo'shing.",
    rejected: (reason: string | null) =>
      `Afsuski, arizangiz rad etildi.${reason ? `\nSabab: ${reason}` : ''}\n\nSavollar bo'lsa, admin bilan bog'laning.`,
  },
  {
    askNote:
      '🏟 Заявка на роль владельца стадиона.\n\n' +
      'Коротко напишите название и расположение стадиона (например: «Olmaliq Arena, 5-микрорайон, за школой №21»).\n\n' +
      'Администратор рассмотрит заявку и свяжется с вами.',
    invalidNote: '❌ Описание должно содержать 5–500 символов. Напишите ещё раз:',
    submitted: '✅ Заявка принята. После одобрения вы сможете добавить стадион.',
    alreadyPending: '⏳ Ваша заявка на рассмотрении. Сообщим, когда её одобрят.',
    approved:
      '🎉 Поздравляем! Вы подтверждены как владелец стадиона.\n\nДобавьте стадион через кнопку «🏟 Я владелец стадиона».',
    rejected: (reason) =>
      `К сожалению, заявка отклонена.${reason ? `\nПричина: ${reason}` : ''}\n\nЕсли есть вопросы, свяжитесь с администратором.`,
  },
);

/** Adminlar uchun — bitta tilda (o'zbekcha), ular ichki xodimlar. */
export const adminApplicationText = (p: {
  name: string;
  phone: string;
  username: string | null;
  note: string;
}) =>
  [
    '🆕 Stadion egasi arizasi',
    '',
    `👤 ${p.name}${p.username ? ` (@${p.username})` : ''}`,
    `📱 ${p.phone}`,
    `📝 ${p.note}`,
  ].join('\n');
