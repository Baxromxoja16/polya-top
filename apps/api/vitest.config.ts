import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC — NestJS DI uchun decorator metadata emit qiladi (esbuild buni qilmaydi).
const plugins = [swc.vite({ module: { type: 'es6' } })];

export default defineConfig({
  test: {
    projects: [
      {
        plugins,
        test: {
          name: 'unit',
          include: ['src/**/*.spec.ts'],
          environment: 'node',
        },
      },
      {
        plugins,
        test: {
          name: 'e2e',
          include: ['test/**/*.e2e.spec.ts'],
          environment: 'node',
          // Testcontainers image yuklab olishi va konteyner ko'tarishi uchun vaqt
          hookTimeout: 180_000,
          testTimeout: 60_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
