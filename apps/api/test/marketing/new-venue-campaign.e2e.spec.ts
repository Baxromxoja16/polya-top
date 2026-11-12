import { getConnectionToken } from '@nestjs/mongoose';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FixedClock, localizedText, Money } from '@polya/shared-kernel';
import { type Connection, Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Actor } from '../../src/modules/catalog/application/actor.js';
import { RegisterVenueUseCase } from '../../src/modules/catalog/application/register-venue.use-case.js';
import { VenueManagementService } from '../../src/modules/catalog/application/venue-management.service.js';
import type { VenueId } from '../../src/modules/catalog/domain/venue.js';
import { GeographyAdminService } from '../../src/modules/geography/index.js';
import { MarketingDispatcher, MarketingService } from '../../src/modules/marketing/index.js';
import { OpeningHours } from '../../src/modules/scheduling/index.js';
import {
  type ApiCall,
  buttons,
  createTestBot,
  TelegramUserSim,
  texts,
} from '../support/telegram-sim.js';
import { createTestApp, type Infra, startInfra } from '../support/test-app.js';

const ADMIN = 1_100_001;
const PLAYERS = [1_100_010, 1_100_011, 1_100_012];
/** Toshkent vaqti = UTC+5 */
const local = (day: number, hour: number, minute = 0) =>
  new Date(Date.UTC(2026, 10, day, hour - 5, minute));

describe('Marketing: "new pitch opened" campaigns (e2e): TZ 4.6.1, MK-1…MK-7, EC-M1…M3', () => {
  let infra: Infra;
  let app: NestFastifyApplication;
  let calls: ApiCall[];
  let db: Connection;
  let dispatcher: MarketingDispatcher;
  let sims: TelegramUserSim[];
  let makeVenue: (name: string) => Promise<VenueId>;
  const clock = new FixedClock(local(12, 8));
  const admin: Actor = { userId: 'a'.repeat(24), roles: ['ADMIN'], phone: null, cityId: null };

  /** Bitta update'dan tashqari kelgan (messenger) xabarlar */
  const inbox = (chatId: number) =>
    calls.filter((c) => c.method === 'sendMessage' && c.payload.chat_id === chatId);
  const campaigns = () => db.collection('campaigns').find().sort({ createdAt: 1 }).toArray();

  beforeAll(async () => {
    infra = await startInfra();
    const test = createTestBot();
    calls = test.calls;
    app = await createTestApp(
      { MONGO_URI: infra.mongoUri, REDIS_URL: infra.redisUrl, ADMIN_TELEGRAM_IDS: String(ADMIN) },
      { bot: test.bot, clock },
    );
    db = app.get<Connection>(getConnectionToken());
    dispatcher = app.get(MarketingDispatcher);
    const city = await app
      .get(GeographyAdminService)
      .createCity({ name: localizedText({ uz: 'Olmaliq', ru: 'Алмалык' }) });
    sims = PLAYERS.map((id) => new TelegramUserSim(test.bot, calls, id));
    for (const s of sims) await s.send('/start');
    await db.collection('users').updateMany({}, { $set: { cityId: city.id } });

    const owner: Actor = {
      userId: 'b'.repeat(24),
      roles: ['OWNER'],
      phone: '+998901112233',
      cityId: city.id,
    };
    makeVenue = async (name) => {
      const r = await app.get(RegisterVenueUseCase).execute({
        actor: owner,
        name,
        landmarkText: `${name} orientiri, maktab yonida`,
        hours: OpeningHours.of(8, 0),
        pricePerHour: Money.of(150_000),
      });
      if (!r.ok) throw new Error(r.error);
      const id = r.value.venue.id as VenueId;
      await app.get(VenueManagementService).approve(admin, id);
      return id;
    };
  });

  afterAll(async () => {
    await app?.close();
    await Promise.all([infra?.mongo.stop(), infra?.redis.stop()]);
  });

  it('MK-3: an approval at 08:00 is not announced before 10:00', async () => {
    await makeVenue('Olmaliq Arena');
    calls.length = 0;
    expect((await dispatcher.run()).started).toBe(0);
    expect(inbox(PLAYERS[0] as number)).toHaveLength(0);
    expect(await db.collection('venue_announcements').countDocuments({ status: 'PENDING' })).toBe(
      1,
    );
  });

  it('EC-M3: venues opened the same day are merged into one message at 10:00', async () => {
    await makeVenue('Metallurg');
    clock.set(local(12, 10));
    const report = await dispatcher.run();
    expect(report.started).toBe(1);
    const [msg] = inbox(PLAYERS[0] as number);
    expect(inbox(PLAYERS[0] as number)).toHaveLength(1);
    expect(msg?.payload.text).toContain('🆕 Shahringizda 2 ta yangi polya ochildi!');
    expect(msg?.payload.text).toContain(
      "Olmaliq Arena\n   📍 Olmaliq Arena orientiri, maktab yonida · 💰 150 000 so'm dan",
    );
    // MK-4: har bir marketing xabarida o'chirish tugmasi
    const markup = msg?.payload.reply_markup as
      | { inline_keyboard: { callback_data: string }[][] }
      | undefined;
    const data = (markup?.inline_keyboard ?? []).flat().map((b) => b.callback_data);
    expect(data.at(-1)).toBe('id:mkt:off');
    const [c] = await campaigns();
    expect(c).toMatchObject({ status: 'DONE', stats: { sent: 3, delivered: 3, skipped: 0 } });
  });

  it('EC-M2: each venue is announced only once', async () => {
    calls.length = 0;
    await dispatcher.run();
    expect(inbox(PLAYERS[0] as number)).toHaveLength(0);
    expect(await campaigns()).toHaveLength(1);
  });

  it('MK-7: pressing a campaign button opens the card and is counted as a click', async () => {
    const [c] = await campaigns();
    const venueId = ((c?.venueIds ?? []) as string[])[0] as string;
    const out = await sims[0]?.press(`mk:o:${c?._id}:${venueId}`);
    const venue = await db.collection('venues').findOne({ _id: new Types.ObjectId(venueId) });
    expect(texts(out ?? []).join('\n')).toContain(`🏟 ${venue?.name}`);
    expect(buttons(out ?? []).length).toBeGreaterThan(0);
    expect((await campaigns())[0]?.stats.clicked).toBe(1);
  });

  it('MK-4: an opted-out user gets no further marketing messages', async () => {
    await sims[1]?.press('id:mkt:off');
    calls.length = 0;
    await makeVenue('Yoshlik');
    await dispatcher.run();
    expect(inbox(PLAYERS[0] as number)).toHaveLength(1);
    expect(inbox(PLAYERS[1] as number)).toHaveLength(0);
    expect(inbox(PLAYERS[0] as number)[0]?.payload.text).toContain('🏟 Yoshlik');
  });

  it('MK-2: the third marketing message within a week is dropped', async () => {
    calls.length = 0;
    await makeVenue('Navbahor');
    await dispatcher.run();
    expect(inbox(PLAYERS[0] as number)).toHaveLength(0);
    const last = (await campaigns()).at(-1);
    expect(last).toMatchObject({ status: 'DONE', stats: { sent: 0, skipped: 2 } });
  });

  it('MK-2: a week later the quota is free again', async () => {
    clock.set(local(20, 12));
    calls.length = 0;
    await makeVenue('Sharq');
    await dispatcher.run();
    expect(inbox(PLAYERS[0] as number)).toHaveLength(1);
  });

  it('EC-M1: a campaign whose venue was archived before sending is cancelled', async () => {
    const id = await makeVenue('Bekor');
    const marketing = app.get(MarketingService);
    await marketing.discover();
    const [started] = await marketing.startNewVenueCampaigns();
    await db.collection('venues').updateOne({ name: 'Bekor' }, { $set: { status: 'ARCHIVED' } });
    calls.length = 0;
    await dispatcher.run();
    expect(inbox(PLAYERS[0] as number)).toHaveLength(0);
    const doc = await db.collection('campaigns').findOne({ venueIds: id });
    expect(doc?._id.toHexString()).toBe(started?.id);
    expect(doc?.status).toBe('CANCELLED');
  });

  it('MK-7: a high block ratio alerts admins once, after results settle', async () => {
    // Oldingi tick'larda 10 daqiqadan oldin tugaganlari allaqachon tekshirilgan — oxirgisi qoladi
    const last = (await campaigns()).filter((c) => c.status === 'DONE' && c.stats.sent > 0).at(-1);
    await db
      .collection('campaigns')
      .updateOne({ _id: last?._id }, { $set: { 'stats.blocked': 5, 'stats.delivered': 10 } });
    calls.length = 0;
    clock.set(local(20, 12, 30));
    expect((await dispatcher.run()).alerts).toBe(1);
    expect(inbox(ADMIN)[0]?.payload.text).toContain('⚠️ Kampaniya');
    expect((await dispatcher.run()).alerts).toBe(0);
  });
});
