# ADR-0001: Modulli monolit + DDD + Hexagonal arxitektura

- **Holat:** Qabul qilingan
- **Sana:** 2026-11-11
- **Bog'liq:** TZ 7.1–7.4

## Kontekst
MVP bitta shahar (Olmaliq) uchun, jamoa kichik. Lekin loyiha kengayadi: yangi shaharlar, React web-app, to'lovlar, premium funksiyalar qo'shiladi. Biznes qoidalari murakkab (navbat, double booking, state machine), shuning uchun ular framework va bazadan ajratilgan bo'lishi kerak.

## Qaror
1. **Bitta deploy qilinadigan ilova** (`apps/api`), ichida bounded context'lar alohida modullar (`src/modules/<context>`). Mikroservislar yo'q.
2. Har bir modulda qatlamlar bor: `domain` → `application` → `infrastructure` / `interface`.
3. **Domain toza TypeScript**: NestJS, Mongoose, grammY va Zod importi yo'q. Portlar (`Clock`, `IdGenerator`, repository'lar) abstract class shaklida yoziladi, shuning uchun ular DI token sifatida ham ishlaydi va framework'ga bog'lanmaydi.
4. Kontekstlar bir-biriga faqat `index.ts` (ochiq API) va domain event'lar orqali murojaat qiladi.
5. Umumiy qurilish bloklari `packages/shared-kernel` paketida turadi (npm bog'liqliklarsiz).
6. Qoidalarni **dependency-cruiser** (`pnpm arch`) CI'da avtomatik tekshiradi. Bu "kelishuv" emas, majburiy cheklov.
7. Xatolar: invariant buzilishi uchun `DomainError` (throw) ishlatiladi, kutilgan biznes natijalari ("slot band", "navbat to'la") uchun `Result`.

## Oqibatlari
- ➕ Biznes logikasini Mongo'siz va Nest'siz, millisekundlarda unit-test qilish mumkin.
- ➕ Bot va REST bitta application qatlamini ishlatadi, shuning uchun web-app qo'shish arzon.
- ➕ Kerak bo'lsa kontekstni alohida servisga ajratish mumkin (chegaralar allaqachon bor).
- ➖ Mapper'lar (domain ↔ persistence) uchun qo'shimcha kod yoziladi.
- ➖ Yangi dasturchi qatlam qoidalarini o'rganishi kerak (`src/modules/README.md`).
