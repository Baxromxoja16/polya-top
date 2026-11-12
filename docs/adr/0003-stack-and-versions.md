# ADR-0003: Texnologiyalar steki va versiyalar

- **Holat:** Qabul qilingan
- **Sana:** 2026-11-11
- **Bog'liq:** TZ 8

## Qaror
Versiyalar 2026-11-11 kuni npm registry'dan tekshirildi va **aniq** belgilandi (`^` yo'q). Umumiy versiyalar `pnpm-workspace.yaml` dagi `catalog:` ichida turadi.

| Soha | Tanlov | Versiya |
|---|---|---|
| Runtime | Node.js (Active LTS) | 26.x (`.nvmrc`), Docker: `node:26-alpine` |
| Paket menejer | pnpm workspaces + Turborepo | 12.18.0 / 2.11.10 |
| Til | TypeScript | **6.0.3** (7 emas — quyida) |
| Framework | NestJS (ESM) + Fastify | 12.4.2 / Fastify 5.12.8 |
| DB | MongoDB (replica set) + Mongoose | 8.2 / 9.12.1 |
| Cache, navbat | Redis + ioredis | 8.6 / 6.0.0 |
| Validatsiya | Zod | 4.6.7 |
| Log | nestjs-pino + pino | 5.3.1 / 10.4.0 |
| Health | @nestjs/terminus | 12.1.0 |
| Test | Vitest + unplugin-swc + Testcontainers | 5.1.0 / 2.0.0 / 12.2.1 |
| Lint/format | Biome | 2.6.6 |
| Arxitektura | dependency-cruiser | 18.7.2 |

### Asoslangan istisnolar
1. **TypeScript 7 emas, 6.0.** TS 7 (native kompilyator) chiqqan, lekin `@nestjs/cli@12` `typescript ~6.0.2`ga bog'langan, NestJS DI esa `emitDecoratorMetadata`ga tayanadi. Nest ekotizimi TS 7'ni rasman qo'llab-quvvatlagach yangilanadi.
2. **`nestjs-zod` ishlatilmaydi.** Uning so'nggi versiyasi (5.6.0) `@nestjs/common ^10 || ^11` talab qiladi. O'rniga o'zimizning kichik `ZodValidationPipe`imiz bor (`apps/api/src/platform/http`), u testlar bilan qoplangan.
3. **MongoDB 9.0 emas, 8.2.** 9.0 image mavjud, lekin TZ 8.x ni belgilagan va Mongoose 9 bilan mosligi produksiyada hali sinovdan o'tmagan. Yangilash alohida ADR bilan qilinadi.
4. **ESM.** NestJS 12 `"type": "module"`. Barcha paketlar ESM, importlar `.js` kengaytmasi bilan yoziladi (`moduleResolution: NodeNext`).
5. **Vitest + SWC.** Vitest'ning standart transformeri (esbuild/rolldown) decorator metadata chiqarmaydi, shuning uchun NestJS DI testlarda ishlashi uchun `unplugin-swc` ulangan.

### Ma'lum muammolar
- `nestjs-pino@5.3.1` `pino-http`ni bitta options obyekti bilan ikki marta chaqiradi, shuning uchun `autoLogging.ignore` yo'qoladi. Buni `customLogLevel` → `'silent'` bilan aylanib o'tamiz (`logger.module.ts`).
- pnpm 12 build skriptlarini standart bo'yicha bloklaydi. Ruxsatlar `pnpm-workspace.yaml` → `allowBuilds` ichida (faqat `@swc/core`).
- Biome Markdown'ni ham formatlaydi; `*.md` fayllar Biome'dan chiqarilgan (hujjatlar diff'i toza qolishi uchun).
