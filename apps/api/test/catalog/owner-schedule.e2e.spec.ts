import { getConnectionToken } from '@nestjs/mongoose';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { addDays, localizedText, Money, zonedParts } from '@polya/shared-kernel';
import type { Connection } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RegisterVenueUseCase } from '../../src/modules/catalog/application/register-venue.use-case.js';
import { GeographyAdminService } from '../../src/modules/geography/index.js';
import { OpeningHours } from '../../src/modules/scheduling/index.js';
import { buttons, createTestBot, TelegramUserSim, texts } from '../support/telegram-sim.js';
import { createTestApp, type Infra, startInfra } from '../support/test-app.js';

const OWNER = 970_001;

describe('Owner schedule & pricing via bot (e2e): TZ SP-1, SP-2, SP-4', () => {
  let infra: Infra;
  let app: NestFastifyApplication;
  let owner: TelegramUserSim;
  let db: Connection;
  let pitchId: string;
  const schedule = () => db.collection('pitch_schedules').findOne();
  const pricing = () => db.collection('pricing_plans').findOne();

  beforeAll(async () => {
    infra = await startInfra();
    const test = createTestBot();
    app = await createTestApp(
      { MONGO_URI: infra.mongoUri, REDIS_URL: infra.redisUrl },
      { bot: test.bot },
    );
    db = app.get<Connection>(getConnectionToken());
    const city = await app
      .get(GeographyAdminService)
      .createCity({ name: localizedText({ uz: 'Olmaliq', ru: 'Алмалык' }) });
    owner = new TelegramUserSim(test.bot, test.calls, OWNER);
    await owner.send('/start');
    await owner.shareContact('998909700001');
    await db
      .collection('users')
      .updateOne({ telegramId: OWNER }, { $set: { roles: ['PLAYER', 'OWNER'] } });
    const doc = await db.collection('users').findOne({ telegramId: OWNER });
    const r = await app.get(RegisterVenueUseCase).execute({
      actor: { userId: String(doc?._id), roles: ['OWNER'], phone: doc?.phone, cityId: city.id },
      name: 'Arena',
      landmarkText: 'Markaz, bozor yonida',
      hours: OpeningHours.of(8, 0),
      pricePerHour: Money.of(100_000),
    });
    if (!r.ok) throw new Error(r.error);
    pitchId = r.value.pitch.id;
  });

  afterAll(async () => {
    await app?.close();
    await Promise.all([infra?.mongo.stop(), infra?.redis.stop()]);
  });

  it('SP-1: the week view lists all 7 days; Sunday can be closed', async () => {
    const week = await owner.press(`cat:wk:${pitchId}`);
    expect(buttons(week).filter((b) => b?.startsWith('cat:wd:'))).toHaveLength(7);
    expect(texts(week)[0]).toContain('Hafta kunlari');

    await owner.press(`cat:wd:${pitchId}:7`);
    await owner.press(`cat:wdc:${pitchId}:7`);
    expect((await schedule())?.weekly.map((d: { day: number }) => d.day)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
  });

  it('SP-1: a single day gets its own hours', async () => {
    await owner.press(`cat:wd:${pitchId}:1`);
    expect(texts(await owner.send('10-22')).at(-1)).toContain('Hafta kunlari');
    const monday = (await schedule())?.weekly.find((d: { day: number }) => d.day === 1);
    expect(monday).toMatchObject({ open: 10, closeExt: 22 });
  });

  it('invalid hours keep the step and explain', async () => {
    await owner.press(`cat:wd:${pitchId}:2`);
    expect(texts(await owner.send('kechqurun'))).toEqual(['❌ Tushunmadim. Qayta yozing:']);
    await owner.send('❌ Bekor qilish');
  });

  it('SP-2: add a closed exception day from the next 14 days, then remove it', async () => {
    const picker = await owner.press(`cat:exa:${pitchId}`);
    const dates = buttons(picker).filter((b) => b?.startsWith('cat:exn:'));
    expect(dates).toHaveLength(14);
    const today = zonedParts(new Date(), 'Asia/Tashkent').date;
    expect(dates[0]).toBe(`cat:exn:${pitchId}:${today}`);

    const target = addDays(today, 3);
    await owner.press(`cat:exn:${pitchId}:${target}`);
    const list = await owner.press(`cat:exc:${pitchId}:${target}`);
    expect(buttons(list)).toContain(`cat:exd:${pitchId}:${target}`);
    expect((await schedule())?.exceptions).toEqual([{ date: target, closed: true }]);

    await owner.press(`cat:exd:${pitchId}:${target}`);
    expect((await schedule())?.exceptions).toEqual([]);
  });

  it('SP-2: an exception with special hours', async () => {
    const date = addDays(zonedParts(new Date(), 'Asia/Tashkent').date, 5);
    await owner.press(`cat:exn:${pitchId}:${date}`);
    await owner.send('10-14');
    expect((await schedule())?.exceptions).toEqual([
      { date, closed: false, open: 10, closeExt: 14 },
    ]);
  });

  it('SP-4: add an evening price rule for every day', async () => {
    await owner.press(`cat:pra:${pitchId}`);
    await owner.press(`cat:prn:${pitchId}:ALL`);
    const out = await owner.send('18-02 180k');
    expect(texts(out).at(-1)).toContain("Bazaviy narx: 100 000 so'm/soat");
    expect(buttons(out)[0]).toMatch(new RegExp(`^cat:prd:${pitchId}:[0-9a-f]{24}$`));
    expect((await pricing())?.rules).toEqual([
      expect.objectContaining({
        days: { kind: 'ALL' },
        fromHour: 18,
        toHour: 2,
        pricePerHour: 180_000,
      }),
    ]);
  });

  it('a malformed rule is rejected', async () => {
    await owner.press(`cat:prn:${pitchId}:WEEKEND`);
    expect(texts(await owner.send('kechqurun qimmat'))).toEqual(['❌ Tushunmadim. Qayta yozing:']);
    await owner.send('❌ Bekor qilish');
    expect((await pricing())?.rules).toHaveLength(1);
  });

  it('a rule can be removed', async () => {
    const list = await owner.press(`cat:pr:${pitchId}`);
    await owner.press(buttons(list)[0] as string);
    expect((await pricing())?.rules).toEqual([]);
  });
});
