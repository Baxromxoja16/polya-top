# Bounded context modullari

Har bir kontekst (TZ 7.2) alohida papka. Tuzilma:

```
<context>/
├── domain/          # Toza TS: aggregate, value object, event, repository INTERFEYSI
├── application/     # Use case'lar (command/query handler), portlar, policy'lar
├── infrastructure/  # Mongoose sxema, repository implementatsiyasi, tashqi adapterlar
├── interface/
│   ├── http/        # REST controller'lar
│   └── telegram/    # Bot handler'lar
├── <context>.module.ts
└── index.ts         # Ochiq API — boshqa kontekstlar FAQAT shu fayldan import qiladi
```

Qoidalarni `pnpm arch` (dependency-cruiser) tekshiradi:

- `domain` → faqat `@polya/shared-kernel` va o'z `domain` fayllari. NestJS, Mongoose, grammY va boshqa framework'lar taqiqlangan.
- `application` → `infrastructure`/`interface`ga va Mongoose/grammY/Fastify/ioredis/BullMQ'ga bog'lanmaydi.
- Bir kontekst boshqasining ichki fayllarini import qilmaydi, faqat uning `index.ts` faylini.
