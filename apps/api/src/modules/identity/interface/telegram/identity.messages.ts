import { defineMessages } from '../../../../platform/telegram/i18n.js';

export const identityMessages = defineMessages(
  {
    chooseLanguage: 'Tilni tanlang · Выберите язык',
    languageName: "O'zbekcha",
    languageSaved: "✅ Til: O'zbekcha",
    welcomeNew: (name: string) =>
      `Assalomu alaykum, ${name}! 👋\n\n` +
      "Polya.top — shahringizdagi futbol maydonlari bitta joyda: bo'sh vaqtlar, narxlar, " +
      "egasining raqami va o'yinchilar sharhlari.\n\nQuyidagi menyudan boshlang 👇",
    welcomeBack: (name: string) => `Xush kelibsiz, ${name}! Quyidagi menyudan tanlang 👇`,
    fallbackName: (tail: string) => `Foydalanuvchi #${tail}`,

    settings: (name: string, phone: string, language: string, city: string) =>
      `⚙️ Sozlamalar\n\n👤 Ism: ${name}\n📱 Telefon: ${phone}\n🌐 Til: ${language}\n🏙 Shahar: ${city}`,
    btnCity: "🏙 Shaharni o'zgartirish",
    chooseCity: '🏙 Shahringizni tanlang:',
    citySaved: (city: string | null) => `✅ Shahar: ${city ?? ''}`,
    cityUnavailable: 'Bu shahar hozir mavjud emas',
    noCities: "Hozircha shaharlar qo'shilmagan.",
    notSet: 'kiritilmagan',
    btnLanguage: "🌐 Tilni o'zgartirish",
    btnPhone: '📱 Telefon raqam',
    btnName: "✏️ Ismni o'zgartirish",

    askPhone:
      "📱 Bandlash uchun telefon raqamingiz kerak. Raqamingiz faqat siz so'rov yuborgan " +
      "stadion egasiga ko'rsatiladi.\n\nPastdagi «📱 Raqamni yuborish» tugmasini bosing 👇",
    btnSharePhone: '📱 Raqamni yuborish',
    phoneSaved: (phone: string) => `✅ Raqamingiz saqlandi: ${phone}`,
    contactNotOwned:
      "❌ Bu sizning kontaktingiz emas. Faqat «📱 Raqamni yuborish» tugmasi orqali o'z raqamingizni yuboring.",
    invalidPhone: '❌ Bu raqamni qabul qila olmadim. Tugma orqali qayta yuboring.',
    typedPhone: "Xavfsizlik uchun raqamni qo'lda yozmang — pastdagi tugma orqali yuboring 👇",

    askName: '✏️ Yangi ismingizni yozing (2–64 belgi):',
    nameSaved: (name: string) => `✅ Ism saqlandi: ${name}`,
    invalidName:
      "❌ Ism 2–64 belgidan iborat bo'lishi va havola yoki @username bo'lmasligi kerak. Qayta yozing:",
  },
  {
    chooseLanguage: 'Tilni tanlang · Выберите язык',
    languageName: 'Русский',
    languageSaved: '✅ Язык: Русский',
    welcomeNew: (name) =>
      `Здравствуйте, ${name}! 👋\n\n` +
      'Polya.top — все футбольные поля вашего города в одном месте: свободное время, цены, ' +
      'номер владельца и отзывы игроков.\n\nНачните с меню ниже 👇',
    welcomeBack: (name) => `С возвращением, ${name}! Выберите в меню 👇`,
    fallbackName: (tail) => `Пользователь #${tail}`,

    settings: (name, phone, language, city) =>
      `⚙️ Настройки\n\n👤 Имя: ${name}\n📱 Телефон: ${phone}\n🌐 Язык: ${language}\n🏙 Город: ${city}`,
    btnCity: '🏙 Сменить город',
    chooseCity: '🏙 Выберите ваш город:',
    citySaved: (city) => `✅ Город: ${city ?? ''}`,
    cityUnavailable: 'Этот город сейчас недоступен',
    noCities: 'Города пока не добавлены.',
    notSet: 'не указан',
    btnLanguage: '🌐 Сменить язык',
    btnPhone: '📱 Номер телефона',
    btnName: '✏️ Изменить имя',

    askPhone:
      '📱 Для бронирования нужен ваш номер телефона. Его увидит только владелец стадиона, ' +
      'которому вы отправите запрос.\n\nНажмите кнопку «📱 Отправить номер» ниже 👇',
    btnSharePhone: '📱 Отправить номер',
    phoneSaved: (phone) => `✅ Номер сохранён: ${phone}`,
    contactNotOwned:
      '❌ Это не ваш контакт. Отправьте свой номер только кнопкой «📱 Отправить номер».',
    invalidPhone: '❌ Не удалось принять этот номер. Отправьте его ещё раз кнопкой.',
    typedPhone: 'В целях безопасности не вводите номер вручную — отправьте его кнопкой ниже 👇',

    askName: '✏️ Напишите новое имя (2–64 символа):',
    nameSaved: (name) => `✅ Имя сохранено: ${name}`,
    invalidName:
      '❌ Имя должно содержать 2–64 символа и не включать ссылки или @username. Напишите ещё раз:',
  },
);
