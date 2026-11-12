# ADR-0004: Hosting O'zbekistonda, self-hosted infratuzilma

- **Holat:** Qabul qilingan
- **Sana:** 2026-11-11
- **Bog'liq:** TZ 6 (Q10)

## Kontekst
O'zR "Shaxsga doir ma'lumotlar to'g'risida"gi qonuniga ko'ra fuqarolarning shaxsiy ma'lumotlari (telefon, ism) O'zbekiston hududidagi serverlarda saqlanishi kerak.

## Qaror
- Ilova, MongoDB va Redis O'zbekistondagi VPS/cloud'da Docker konteynerlarida ishlaydi.
- **MongoDB Atlas va boshqa xorijiy managed DB ishlatilmaydi.** Produksiyada MongoDB 3 node'li replica set bo'ladi, lokalda 1 node'li.
- Backup o'zimizda: kunlik, 14 kun saqlanadi, har chorakda tiklash sinab ko'riladi.
- Xatolar monitoringi self-hosted (GlitchTip/Sentry) yoki tashqi SaaS'ga **PII'siz** yuboriladi.
- Qidiruv uchun Atlas Search yo'q, shuning uchun `VenueSearchPort` → Mongo adapteri, kerak bo'lsa self-hosted Meilisearch (TZ VC-4c).

## Oqibatlari
- ➕ Qonunga muvofiqlik.
- ➖ Operatsion yuk bizda: replica set, yangilanishlar, backup, monitoring.
- ➖ Telegram'ning o'zi xorijiy servis. Bunga ta'sir qila olmaymiz, lekin bizning ma'lumotlar bazamiz mahalliy.
