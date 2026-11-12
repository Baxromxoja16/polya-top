# ADR-0005: Telegram bot arxitekturasi

- **Holat:** Qabul qilingan
- **Sana:** 2026-11-12
- **Bog'liq:** TZ 5, ADR-0001

## Kontekst
Bot — birinchi interfeys, lekin yagona emas: keyin REST va React Mini App qo'shiladi. Har bir bounded context (Identity, Catalog, Booking...) botga o'z handler'larini qo'shadi. Ular bir-birini bilmasligi va middleware tartibi aniq bo'lishi kerak.

## Qaror
1. **grammY** (TS-first, faol, webhook va polling bitta API bilan).
2. **Platforma** (`src/platform/telegram`) faqat texnik ishni bajaradi: `Bot` instansi, webhook/polling, Redis sessiyasi, update deduplikatsiyasi (EC-T5), guruh filtri (EC-T8), asosiy menyu tuzilmasi va tipli i18n. U hech bir modulga bog'lanmaydi.
3. **Modullar** `@TelegramFeature(order)` dekoratorli klass orqali handler qo'shadi. Platforma ularni `DiscoveryService` bilan topib, `order` bo'yicha ulaydi:
   `CONTEXT (0)` → `CORE_EARLY (50)` → `MODULE (100)` → `FALLBACK (1000)`.
4. Identity `CONTEXT` bosqichida `ctx.currentUser` va `ctx.lang`ni to'ldiradi. Boshqa modullar foydalanuvchini shu yerdan oladi.
5. **Matnlar tipli lug'atda** (`defineMessages(uz, ru)`). Kalit yoki parametr yetishmasa kompilyatsiya xatosi beradi. Fluent/.ftl ishlatilmaydi: 2 til uchun tip xavfsizligi muhimroq.
6. **Use case'lar oddiy `@Injectable` klasslar**, `@nestjs/cqrs` CommandBus emas. Sababi: natija tipi aniq (`Result<User, 'CONTACT_NOT_OWNED'>`), ortiqcha dispatch qatlami yo'q, testda `new UseCase(fakeRepo, clock)`. Domain event'lar uchun EventBus/Outbox 5-bosqichda qo'shiladi.
7. **`PhoneGate`**: telefon talab qiladigan amal oldidan `require(ctx, step)` chaqiriladi. Raqam kelgach `onVerified(kind)` orqali amal davom etadi (TZ 5.2, 6-qadam).
8. **Webhook** — Nest controller (`POST /api/v1/telegram/webhook`). Secret header `timingSafeEqual` bilan tekshiriladi. Handler xatosida ham 200 qaytadi (Telegram qayta yubormasligi uchun), xato log'ga yoziladi.

## Oqibatlari
- ➕ Yangi modul botga faqat bitta feature klass bilan qo'shiladi, platforma o'zgarmaydi.
- ➕ Bot e2e testlari haqiqiy ilova, Mongo va Redis bilan ishlaydi, faqat Telegram API soxta (`test/support/telegram-sim.ts`).
- ➖ Webhook rejimida bitta foydalanuvchining parallel update'lari sessiyada poyga hosil qilishi mumkin. Agar amalda shunday holat uchrasa, `@grammyjs/runner` `sequentialize` qo'shiladi (7-bosqich, hardening).
