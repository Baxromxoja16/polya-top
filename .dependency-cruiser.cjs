// Arxitektura qoidalari (TZ 7.4). `pnpm arch` bilan ishga tushadi, CI'da majburiy.
// Har bir qoida buzilsa — build yiqiladi.

const MODULES = '^apps/[^/]+/src/modules/([^/]+)/';
// pnpm yo'li: node_modules/.pnpm/<pkg>@<ver>/node_modules/<pkg>/... — ankersiz moslik yetarli
// (dependency-cruiser "xavfli" deb hisoblaydigan ichma-ich kvantifikatorlarsiz).
const NPM = (names) => `node_modules/(${names.join('|')})/`;

const FRAMEWORKS = NPM([
  '@nestjs',
  'mongoose',
  'mongodb',
  'grammy',
  '@grammyjs',
  'ioredis',
  'bullmq',
  'fastify',
  '@fastify',
  'nestjs-pino',
  'pino',
  'zod',
]);

const INFRA_LIBS = NPM([
  'mongoose',
  'mongodb',
  'grammy',
  '@grammyjs',
  'ioredis',
  'bullmq',
  'fastify',
  '@fastify',
  '@nestjs/mongoose',
  '@nestjs/bullmq',
  '@nestjs/platform-fastify',
]);

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: "Aylanma bog'liqliklar modullarni ajratib bo'lmaydigan qiladi.",
      from: {},
      to: { circular: true },
    },
    {
      name: 'domain-is-pure',
      severity: 'error',
      comment:
        'Domain qatlami framework, ORM, bot kutubxonasi va validatsiya kutubxonasidan mustaqil (ADR-0001).',
      from: { path: `${MODULES}domain/` },
      to: { path: FRAMEWORKS },
    },
    {
      name: 'domain-depends-on-nothing-outer',
      severity: 'error',
      comment: "Domain faqat o'z domain fayllari va @polya/shared-kernel'ga bog'lanadi.",
      from: { path: `${MODULES}domain/` },
      to: {
        path: [
          `${MODULES}(application|infrastructure|interface)/`,
          '^apps/[^/]+/src/(platform|config|bootstrap|health)/',
          '^packages/contracts/',
        ],
      },
    },
    {
      name: 'application-is-infrastructure-free',
      severity: 'error',
      comment:
        "Use case'lar portlar (interfeyslar) orqali ishlaydi; Mongoose/grammY/Redis to'g'ridan-to'g'ri emas.",
      // Testlar test double'larni (in-memory repository) ulay oladi; produksiya kodi — yo'q
      from: { path: `${MODULES}application/`, pathNot: '\\.spec\\.ts$' },
      to: {
        path: [INFRA_LIBS, `${MODULES}(infrastructure|interface)/`, '^apps/[^/]+/src/platform/'],
      },
    },
    {
      name: 'module-boundaries',
      severity: 'error',
      comment:
        "Bounded context'lar bir-birining ichki fayllariga kirmaydi — faqat ochiq API (index.ts) orqali.",
      from: { path: MODULES },
      to: {
        path: '^apps/[^/]+/src/modules/[^/]+/',
        pathNot: ['^apps/[^/]+/src/modules/$1/', '^apps/[^/]+/src/modules/[^/]+/index\\.ts$'],
      },
    },
    {
      name: 'shared-kernel-is-pure',
      severity: 'error',
      comment: "Shared kernel hech qanday npm paketga bog'lanmaydi (faqat Node built-in).",
      from: { path: '^packages/shared-kernel/' },
      to: { dependencyTypes: ['npm', 'npm-dev', 'npm-optional', 'npm-peer', 'npm-no-pkg'] },
    },
    {
      name: 'packages-do-not-import-apps',
      severity: 'error',
      from: { path: '^packages/' },
      to: { path: '^apps/' },
    },
    {
      name: 'no-dev-deps-in-production-code',
      severity: 'error',
      comment: "Produksiya kodi devDependency'ga bog'lanmasligi kerak (Docker image'da bo'lmaydi).",
      from: { path: '^(apps|packages)/[^/]+/src/', pathNot: '\\.spec\\.ts$' },
      to: { dependencyTypes: ['npm-dev'], dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|coverage|\\.turbo)/' },
    tsPreCompilationDeps: true,
    combinedDependencies: false,
    tsConfig: { fileName: 'tsconfig.base.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
  },
};
