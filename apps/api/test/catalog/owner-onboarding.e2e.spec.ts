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

const ADMIN = 940_001;
const OWNER = 940_002;
const OWNER_LABEL = '🏟 Stadion egasiman';

describe('Owner onboarding via bot (e2e): TZ VC-1, VC-2, EC-O1…O3', () => {
  let infra: Infra;
  let app: NestFastifyApplication;
  let calls: ApiCall[];
  let admin: TelegramUserSim;
  let owner: TelegramUserSim;
  let db: Connection;

  beforeAll(async () => {
    infra = await startInfra();
    const test = createTestBot();
    calls = test.calls;
    app = await createTestApp(
      { MONGO_URI: infra.mongoUri, REDIS_URL: infra.redisUrl, ADMIN_TELEGRAM_IDS: String(ADMIN) },
      { bot: test.bot },
    );
    db = app.get<Connection>(getConnectionToken());
    admin = new TelegramUserSim(test.bot, calls, ADMIN);
    owner = new TelegramUserSim(test.bot, calls, OWNER);
    await admin.send('/start');
    await admin.send('/addcity Olmaliq | Алмалык');
    await owner.send('/start');
    await owner.shareContact('998901234567');
    await db
      .collection('users')
      .updateOne({ telegramId: OWNER }, { $set: { roles: ['PLAYER', 'OWNER'] } });
  });

  afterAll(async () => {
    await app?.close();
    await Promise.all([infra?.mongo.stop(), infra?.redis.stop()]);
  });

  it('owner panel is empty and offers to add a venue', async () => {
    const out = await owner.send(OWNER_LABEL);
    expect(texts(out)[0]).toContain("Sizda hali stadion yo'q");
    expect(buttons(out)).toEqual(['cat:new']);
  });

  it('EC-O1: an abandoned draft can be resumed', async () => {
    await owner.press('cat:new');
    await owner.send('Olmaliq Arena');
    await owner.send('⚙️ Sozlamalar'); // menyuga chiqib ketdi
    const out = await owner.press('cat:new');
    expect(texts(out)[0]).toContain('tugallanmagan stadion bor: «Olmaliq Arena»');
    const resumed = await owner.press('cat:onb:resume');
    expect(texts(resumed)[0]).toMatch(/^2\/4\. Orientir/);
  });

  it('validates landmark (EC-O4)', async () => {
    expect(texts(await owner.send('bor'))[0]).toContain('kamida 5 belgi');
  });

  it('offers hour presets and shows overnight hours explicitly (EC-O3)', async () => {
    const asked = await owner.send('5-mikrorayon, 21-maktab orqasida');
    expect(buttons(asked)).toEqual([
      'cat:onb:h:8:0',
      'cat:onb:h:16:2',
      'cat:onb:h:7:23',
      'cat:onb:h:other',
    ]);
    const out = await owner.press('cat:onb:h:16:2');
    expect(texts(out)[0]).toBe('🕒 Ish vaqti: 16:00–02:00 (yarim tundan keyin ertasi kungacha)');
    expect(texts(out)[1]).toMatch(/^4\/4\./);
  });

  it('EC-O2: "150" asks for confirmation as 150 000', async () => {
    const out = await owner.send('150');
    expect(texts(out)).toEqual(["150 000 so'm demoqchimisiz?"]);
    expect(buttons(out)).toEqual(['cat:onb:p:150000']);
  });

  let reviewButtons: string[] = [];

  it('VC-2: confirming submits the venue for review and notifies admins', async () => {
    const out = await owner.press('cat:onb:p:150000');
    expect(texts(out)[0]).toContain('✅ «Olmaliq Arena» yuborildi');
    expect(texts(out)[0]).toContain('30%');

    const toAdmin = out.filter((c) => c.method === 'sendMessage' && c.payload.chat_id === ADMIN);
    expect(toAdmin).toHaveLength(1);
    expect(toAdmin[0]?.payload.text).toContain('🕒 16:00–02:00');
    expect(toAdmin[0]?.payload.text).toContain("💰 150 000 so'm/soat");
    expect(toAdmin[0]?.payload.text).toContain('📱 +998 90 123 45 67');
    reviewButtons = buttons(toAdmin);

    const venues = await db.collection('venues').find().toArray();
    expect(venues).toHaveLength(1);
    expect(venues[0]).toMatchObject({
      name: 'Olmaliq Arena',
      status: 'PENDING_REVIEW',
      completeness: 30,
    });
    expect(await db.collection('pitches').countDocuments({ venueId: venues[0]?._id })).toBe(1);
  });

  it('pressing "Yes" again does not create a second venue (idempotency)', async () => {
    await owner.press('cat:onb:p:150000');
    expect(await db.collection('venues').countDocuments()).toBe(1);
  });

  it('the panel lists the venue as pending with 30%', async () => {
    const out = await owner.send(OWNER_LABEL);
    expect(buttons(out)[0]).toMatch(/^cat:v:[0-9a-f]{24}$/);
    const markup = out[0]?.payload.reply_markup?.inline_keyboard?.[0]?.[0]?.text as string;
    expect(markup).toContain('⏳ tasdiqlanmoqda · Olmaliq Arena · 30%');
  });

  it('VC-1: admin approves → owner is notified and venue becomes public', async () => {
    const out = await admin.press(reviewButtons[0] as string);
    expect(out.find((c) => c.method === 'editMessageText')?.payload.text).toContain(
      '✅ Tasdiqlandi',
    );
    const toOwner = out.filter((c) => c.method === 'sendMessage' && c.payload.chat_id === OWNER);
    expect(toOwner[0]?.payload.text).toContain('🎉 «Olmaliq Arena» tasdiqlandi');
    expect((await db.collection('venues').findOne())?.status).toBe('APPROVED');
  });

  it('a second review attempt is refused', async () => {
    const out = await admin.press(reviewButtons[1] as string);
    expect(out[0]?.payload.show_alert).toBe(true);
    expect((await db.collection('venues').findOne())?.status).toBe('APPROVED');
  });

  it('/pending is empty after review', async () => {
    expect(texts(await admin.send('/pending'))).toEqual(["Ko'rib chiqiladigan stadion yo'q."]);
  });
});
