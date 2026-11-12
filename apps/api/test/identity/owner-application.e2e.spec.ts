import { getConnectionToken } from '@nestjs/mongoose';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Connection } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type ApiCall,
  buttons,
  createTestBot,
  TelegramUserSim,
  texts,
} from '../support/telegram-sim.js';
import { createTestApp, type Infra, startInfra } from '../support/test-app.js';

const ADMIN_A = 920_001;
const ADMIN_B = 920_002;
const OWNER_LABEL = '🏟 Stadion egasiman';

describe('Owner application (e2e): TZ VC-1', () => {
  let infra: Infra;
  let app: NestFastifyApplication;
  let calls: ApiCall[];
  let sim: (id: number) => TelegramUserSim;
  let users: () => ReturnType<Connection['collection']>;
  const to = (chatId: number, out: ApiCall[]) =>
    out.filter((c) => c.method === 'sendMessage' && c.payload.chat_id === chatId);

  beforeAll(async () => {
    infra = await startInfra();
    const test = createTestBot();
    calls = test.calls;
    app = await createTestApp(
      {
        MONGO_URI: infra.mongoUri,
        REDIS_URL: infra.redisUrl,
        ADMIN_TELEGRAM_IDS: `${ADMIN_A},${ADMIN_B}`,
      },
      { bot: test.bot },
    );
    sim = (id) => new TelegramUserSim(test.bot, calls, id);
    users = () => app.get<Connection>(getConnectionToken()).collection('users');
    await sim(ADMIN_A).send('/start');
    await sim(ADMIN_B).send('/start');
  });

  afterAll(async () => {
    await app?.close();
    await Promise.all([infra?.mongo.stop(), infra?.redis.stop()]);
  });

  let adminButtons: string[] = [];

  it('asks for a phone first, then for a note (PhoneGate)', async () => {
    const u = sim(930_001);
    await u.send('/start');
    const asked = await u.send(OWNER_LABEL);
    expect(texts(asked)[0]).toContain('telefon raqamingiz kerak');

    const out = await u.shareContact('998935551122');
    expect(texts(out).at(-1)).toContain("Stadion egasi bo'lish uchun ariza");
  });

  it('a too short note is rejected and the step is kept', async () => {
    const out = await sim(930_001).send('abc');
    expect(texts(out)).toEqual(["❌ Izoh 5–500 belgidan iborat bo'lishi kerak. Qayta yozing:"]);
  });

  it('submits and notifies every admin with review buttons', async () => {
    const out = await sim(930_001).send('Olmaliq Arena, 5-mikrorayon');
    expect(texts(out)[0]).toContain('✅ Arizangiz qabul qilindi');

    const forA = to(ADMIN_A, out);
    expect(forA).toHaveLength(1);
    expect(forA[0]?.payload.text).toContain('📱 +998 93 555 11 22');
    expect(forA[0]?.payload.text).toContain('Olmaliq Arena, 5-mikrorayon');
    expect(to(ADMIN_B, out)).toHaveLength(1);
    adminButtons = buttons(forA);
    expect(adminButtons[0]).toMatch(/^own:ok:[0-9a-f]{24}$/);
  });

  it('a second application while pending is refused', async () => {
    const out = await sim(930_001).send(OWNER_LABEL);
    expect(texts(out)).toEqual(["⏳ Arizangiz ko'rib chiqilmoqda. Tasdiqlangach xabar beramiz."]);
  });

  it('a non-admin cannot approve', async () => {
    await sim(930_001).press(adminButtons[0] as string);
    expect((await users().findOne({ telegramId: 930_001 }))?.roles).toEqual(['PLAYER']);
  });

  it('admin approves: role OWNER is granted and the applicant is told', async () => {
    const out = await sim(ADMIN_A).press(adminButtons[0] as string);
    expect(out.find((c) => c.method === 'editMessageText')?.payload.text).toContain(
      '✅ Tasdiqlandi',
    );
    expect(to(930_001, out)[0]?.payload.text).toContain('🎉 Tabriklaymiz');
    expect((await users().findOne({ telegramId: 930_001 }))?.roles).toEqual(['PLAYER', 'OWNER']);
  });

  it('the second admin pressing later gets "already reviewed"', async () => {
    const out = await sim(ADMIN_B).press(adminButtons[1] as string);
    expect(out[0]).toMatchObject({
      method: 'answerCallbackQuery',
      payload: { text: "Allaqachon ko'rib chiqilgan", show_alert: true },
    });
    expect((await users().findOne({ telegramId: 930_001 }))?.roles).toEqual(['PLAYER', 'OWNER']);
  });

  it('a rejected applicant can apply again', async () => {
    const u = sim(930_002);
    await u.send('/start');
    await u.shareContact('998935551133');
    await u.send(OWNER_LABEL);
    const submitted = await u.send('Angren Stadium, markaz');
    const reject = buttons(to(ADMIN_A, submitted)).find((b) => b?.startsWith('own:no:')) as string;

    const out = await sim(ADMIN_A).press(reject);
    expect(to(930_002, out)[0]?.payload.text).toContain('rad etildi');
    expect(texts(await u.send(OWNER_LABEL)).at(-1)).toContain("Stadion egasi bo'lish uchun ariza");
  });
});
