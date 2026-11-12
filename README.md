# Polya.top

Futbol maydonlarini Telegram bot orqali topish va bandlash platformasi.
To'liq texnik topshiriq: [docs/TZ.md](docs/TZ.md) · Arxitektura qarorlari: [docs/adr/](docs/adr/)

## Talablar
- Node.js 26 (`.nvmrc`)
- pnpm 12 (`npm i -g pnpm@12.18.0`)
- Docker (Mongo replica set, Redis, e2e testlar uchun)

## Tez boshlash

```bash
pnpm install
pnpm infra:up                         # mongo (replica set) + redis
cp apps/api/.env.example apps/api/.env
pnpm dev                              # http://localhost:3000/health
```

Yoki hammasini konteynerda ishga tushirish:

```bash
docker compose up -d --build          # http://localhost:3000/health
```

## Buyruqlar

| Buyruq | Nima qiladi |
|---|---|
| `pnpm lint` / `pnpm lint:fix` | Biome: lint + format |
| `pnpm typecheck` | TypeScript tekshiruvi (barcha paketlar) |
| `pnpm arch` | Arxitektura qoidalari (dependency-cruiser) |
| `pnpm test` | Unit testlar |
| `pnpm test:e2e` | E2E testlar (Testcontainers: haqiqiy Mongo RS + Redis) |
| `pnpm build` | Barcha paketlarni build qilish |
| `pnpm verify` | Hammasi ketma-ket — CI bilan bir xil |

## Tuzilma

```
apps/api/                 NestJS ilova (REST + keyinchalik bot webhook)
  src/modules/            Bounded context'lar (DDD) — qoidalar: src/modules/README.md
  src/platform/           Umumiy infratuzilma: DB, Redis, log, HTTP xatolari
  test/                   E2E testlar
packages/shared-kernel/   Frameworkdan toza DDD bloklari (Money, TimeRange, AggregateRoot...)
packages/contracts/       API sxemalari (Zod) — backend va React uchun umumiy
docs/                     TZ va ADR'lar
```

## Endpointlar (0-bosqich)
- `GET /health/live` — liveness (process tirikmi)
- `GET /health` — readiness (Mongo + Redis)
- Biznes API: `/api/v1/*`. Xatolar RFC 9457 `application/problem+json` formatida, har bir javobda `x-request-id` bor.
