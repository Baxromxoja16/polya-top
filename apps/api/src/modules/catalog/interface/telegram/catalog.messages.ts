import { defineMessages } from '../../../../platform/telegram/i18n.js';

export const catalogMessages = defineMessages(
  {
    // --- Owner paneli ---
    panelTitle: '🏟 Stadionlarim',
    panelEmpty: "Sizda hali stadion yo'q. Birinchisini qo'shing 👇",
    btnAddVenue: "➕ Stadion qo'shish",
    btnPending: "⏳ So'rovlar",
    btnToday: '📋 Bugungi jadval',
    statusPending: '⏳ tasdiqlanmoqda',
    statusApproved: '🟢 faol',
    statusRejected: '🔴 rad etilgan',
    statusArchived: '🗄 arxivda',
    statusBlocked: '⛔️ bloklangan',

    // --- Onboarding (TZ VC-2) ---
    resumeDraft: (name: string) => `Sizda tugallanmagan stadion bor: «${name}». Davom ettiramizmi?`,
    btnResume: '▶️ Davom ettirish',
    btnRestart: '🆕 Yangidan boshlash',
    askName: '1/4. Polya nomini yozing (masalan: «Olmaliq Arena»):',
    invalidName: "❌ Nom 2–60 belgidan iborat bo'lishi kerak. Qayta yozing:",
    askLandmark:
      "2/4. Orientir — odamlar qanday topadi? (masalan: «5-mikrorayon, 21-maktab orqasida»)\n\nLokatsiyani keyin qo'shishingiz mumkin.",
    invalidLandmark: "❌ Orientir kamida 5 belgidan iborat bo'lishi kerak. Qayta yozing:",
    askHours: "3/4. Ish vaqti (har kuni bir xil, keyin o'zgartirish mumkin):",
    btnOtherHours: '✏️ Boshqa',
    askCustomHours: 'Ish vaqtini yozing, masalan: «08-23» yoki «16:00-02:00»:',
    invalidHours: '❌ Tushunmadim. Butun soatlarda yozing, masalan «08-23» yoki «16-02»:',
    hoursChosen: (hours: string, overnight: boolean) =>
      `🕒 Ish vaqti: ${hours}${overnight ? ' (yarim tundan keyin ertasi kungacha)' : ''}`,
    askPrice: "4/4. 1 soatlik narx (so'mda), masalan: «150000» yoki «150k»:",
    invalidPrice: "❌ Narxni tushunmadim. Masalan: «150000», «150 000 so'm» yoki «150k»:",
    confirmPrice: (price: string) => `${price} so'm demoqchimisiz?`,
    btnYes: '✅ Ha',
    submitted: (name: string) =>
      `✅ «${name}» yuborildi! Admin tasdiqlagach qidiruvda ko'rinadi.\n\n` +
      "📊 Profil: 30% to'ldirilgan.\nKeyingi qadam: rasm qo'shing (+20%) va lokatsiya yuboring (+20%).",
    btnManage: '⚙️ Boshqarish',
    phoneRequired: "Stadion qo'shish uchun telefon raqamingiz kerak.",
    cityRequired: 'Avval sozlamalarda shahringizni tanlang: ⚙️ Sozlamalar → 🏙 Shahar.',

    // --- Admin qarori natijasi ---
    venueApproved: (name: string) => `🎉 «${name}» tasdiqlandi va endi qidiruvda ko'rinadi!`,
    premiumEnding: (name: string, days: number, until: string) =>
      `⏳ «${name}»: PREMIUM ${days === 1 ? 'ertaga' : `${days} kundan keyin`} tugaydi (${until}).\n\n` +
      "Uzaytirish uchun admin bilan bog'laning. Tugagach ma'lumotlar o'chmaydi — faqat FREE limitlari amal qiladi.",
    founderTrial: (until: string) =>
      `🎁 Siz — «Asoschi hamkor»! PREMIUM tarif ${until} gacha bepul: 15 ta rasm, qidiruvda «⭐ Tavsiya etiladi», chegirma e'lonlari.`,
    venueRejected: (name: string, reason: string | null) =>
      `«${name}» rad etildi.${reason ? `\nSabab: ${reason}` : ''}\n\nTahrirlab, qayta yuborishingiz mumkin: 🏟 Stadion egasiman → stadion → 🔁 Qayta yuborish.`,
  },
  {
    panelTitle: '🏟 Мои стадионы',
    panelEmpty: 'У вас пока нет стадионов. Добавьте первый 👇',
    btnAddVenue: '➕ Добавить стадион',
    btnPending: '⏳ Запросы',
    btnToday: '📋 Расписание на сегодня',
    statusPending: '⏳ на проверке',
    statusApproved: '🟢 активен',
    statusRejected: '🔴 отклонён',
    statusArchived: '🗄 в архиве',
    statusBlocked: '⛔️ заблокирован',

    resumeDraft: (name) => `У вас есть незавершённый стадион: «${name}». Продолжим?`,
    btnResume: '▶️ Продолжить',
    btnRestart: '🆕 Начать заново',
    askName: '1/4. Напишите название поля (например: «Olmaliq Arena»):',
    invalidName: '❌ Название должно содержать 2–60 символов. Напишите ещё раз:',
    askLandmark:
      '2/4. Ориентир — как вас найти? (например: «5-микрорайон, за школой №21»)\n\nЛокацию можно добавить позже.',
    invalidLandmark: '❌ Ориентир должен содержать минимум 5 символов. Напишите ещё раз:',
    askHours: '3/4. Время работы (каждый день одинаково, потом можно изменить):',
    btnOtherHours: '✏️ Другое',
    askCustomHours: 'Напишите время работы, например: «08-23» или «16:00-02:00»:',
    invalidHours: '❌ Не понял. Укажите целые часы, например «08-23» или «16-02»:',
    hoursChosen: (hours, overnight) =>
      `🕒 Время работы: ${hours}${overnight ? ' (после полуночи — до следующего дня)' : ''}`,
    askPrice: '4/4. Цена за 1 час (в сумах), например: «150000» или «150k»:',
    invalidPrice: '❌ Не понял цену. Например: «150000», «150 000 сум» или «150k»:',
    confirmPrice: (price) => `Вы имели в виду ${price} сум?`,
    btnYes: '✅ Да',
    submitted: (name) =>
      `✅ «${name}» отправлен! После одобрения администратором он появится в поиске.\n\n` +
      '📊 Профиль заполнен на 30%.\nДальше: добавьте фото (+20%) и локацию (+20%).',
    btnManage: '⚙️ Управление',
    phoneRequired: 'Чтобы добавить стадион, нужен ваш номер телефона.',
    cityRequired: 'Сначала выберите город в настройках: ⚙️ Настройки → 🏙 Город.',

    venueApproved: (name) => `🎉 «${name}» одобрен и теперь виден в поиске!`,
    premiumEnding: (name, days, until) =>
      `⏳ «${name}»: PREMIUM заканчивается ${days === 1 ? 'завтра' : `через ${days} дней`} (${until}).\n\n` +
      'Для продления свяжитесь с админом. Данные не удалятся — будут действовать лимиты FREE.',
    founderTrial: (until) =>
      `🎁 Вы — «Партнёр-основатель»! PREMIUM бесплатно до ${until}: 15 фото, «⭐ Рекомендуем» в поиске, объявления о скидках.`,
    venueRejected: (name, reason) =>
      `«${name}» отклонён.${reason ? `\nПричина: ${reason}` : ''}\n\nИсправьте и отправьте снова: 🏟 Я владелец стадиона → стадион → 🔁 Отправить снова.`,
  },
);

/** "150 000" */
export const formatSum = (amount: number) => amount.toLocaleString('ru-RU').replace(/ /g, ' ');
