import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { localizedText } from '@polya/shared-kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GeographyAdminService } from '../../src/modules/geography/index.js';
import { ADMIN_MENU } from '../../src/platform/telegram/main-menu.js';
import {
  type ApiCall,
  createTestBot,
  keyboardLabels,
  TelegramUserSim,
  texts,
} from '../support/telegram-sim.js';
import { createTestApp, type Infra, startInfra } from '../support/test-app.js';

const ADMIN = 8_500_001;
const PLAYER = 8_500_002;
const FIND = "⚽ Bo'sh maydon topish";

describe("Admin menyusi (e2e): TZ 4.7 — admin tugmalari, o'yinchi rejimiga o'tish", () => {
  let infra: Infra;
  let app: NestFastifyApplication;
  let calls: ApiCall[];
  let admin: TelegramUserSim;
  let player: TelegramUserSim;

  beforeAll(async () => {
    infra = await startInfra();
    const test = createTestBot();
    calls = test.calls;
    app = await createTestApp(
      { MONGO_URI: infra.mongoUri, REDIS_URL: infra.redisUrl, ADMIN_TELEGRAM_IDS: String(ADMIN) },
      { bot: test.bot },
    );
    await app
      .get(GeographyAdminService)
      .createCity({ name: localizedText({ uz: 'Olmaliq', ru: 'Алмалык' }) });
    admin = new TelegramUserSim(test.bot, calls, ADMIN);
    player = new TelegramUserSim(test.bot, calls, PLAYER);
    for (const [sim, phone] of [
      [admin, '998901160001'],
      [player, '998901160002'],
    ] as const) {
      await sim.send('/start');
      await sim.shareContact(phone);
    }
  });

  afterAll(async () => {
    await app?.close();
    await Promise.all([infra?.mongo.stop(), infra?.redis.stop()]);
  });

  it("admin /menu — admin menyusi, o'yinchi tugmalarisiz", async () => {
    const labels = keyboardLabels(await admin.send('/menu'));
    expect(labels).toEqual(
      expect.arrayContaining(Object.values(ADMIN_MENU).filter((l) => l !== ADMIN_MENU.adminMode)),
    );
    expect(labels).not.toContain(FIND);
  });

  it("admin tugmasi buyruqning o'zini ishga tushiradi", async () => {
    expect(texts(await admin.send(ADMIN_MENU.stats)).join('\n')).toMatch(/\d/);
    expect(texts(await admin.send(ADMIN_MENU.pending))).toContain(
      "Ko'rib chiqiladigan stadion yo'q.",
    );
    expect(texts(await admin.send(ADMIN_MENU.help)).join('\n')).toContain('/blockuser');
    expect(texts(await admin.send(ADMIN_MENU.cities)).join('\n')).toContain('olmaliq');
  });

  it('"⚽ Band qilish" — o\'yinchi menyusi + "🛠 Admin panel"; rejim /menu dan keyin ham saqlanadi', async () => {
    const labels = keyboardLabels(await admin.send(ADMIN_MENU.playerMode));
    expect(labels).toContain(FIND);
    expect(labels).toContain(ADMIN_MENU.adminMode);
    expect(labels).not.toContain(ADMIN_MENU.stats);
    expect(keyboardLabels(await admin.send('/menu'))).toContain(FIND);

    const back = keyboardLabels(await admin.send(ADMIN_MENU.adminMode));
    expect(back).toContain(ADMIN_MENU.stats);
    expect(back).not.toContain(FIND);
  });

  it("oddiy foydalanuvchiga admin tugmalari ko'rinmaydi va ishlamaydi", async () => {
    const labels = keyboardLabels(await player.send('/menu'));
    expect(labels).toContain(FIND);
    for (const label of Object.values(ADMIN_MENU)) expect(labels).not.toContain(label);

    const reply = await player.send(ADMIN_MENU.stats);
    expect(keyboardLabels(reply)).not.toContain(ADMIN_MENU.stats);
    expect(texts(reply).join('\n')).not.toMatch(/Statistika|Foydalanuvchilar/);
  });
});
