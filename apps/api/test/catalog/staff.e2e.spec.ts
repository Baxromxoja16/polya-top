import { getConnectionToken } from '@nestjs/mongoose';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  addDays,
  FixedClock,
  localizedText,
  Money,
  zonedParts,
  zonedToUtc,
} from '@polya/shared-kernel';
import type { Connection } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RegisterVenueUseCase } from '../../src/modules/catalog/application/register-venue.use-case.js';
import { VenueManagementService } from '../../src/modules/catalog/application/venue-management.service.js';
import type { VenueId } from '../../src/modules/catalog/domain/venue.js';
import { GeographyAdminService } from '../../src/modules/geography/index.js';
import { OpeningHours } from '../../src/modules/scheduling/index.js';
import {
  type ApiCall,
  buttons,
  createTestBot,
  TelegramUserSim,
  texts,
} from '../support/telegram-sim.js';
import { createTestApp, type Infra, startInfra } from '../support/test-app.js';

const TZ = 'Asia/Tashkent';
const OWNER = 8_500_001;
const STAFF = 8_500_002;
const STAFF2 = 8_500_003;
const PLAYER = 8_500_004;

describe('Venue staff (e2e): TZ 3, 4.6, 4.9, EC-D1, EC-D3', () => {
  let infra: Infra;
  let app: NestFastifyApplication;
  let calls: ApiCall[];
  let db: Connection;
  let pitchId: string;
  let venueId: string;
  const sims = new Map<number, TelegramUserSim>();
  const day = addDays(zonedParts(new Date(), TZ).date, 1);
  const clock = new FixedClock(zonedToUtc(day, 10, TZ));
  const sec = (hour: number) => Math.floor(zonedToUtc(day, hour, TZ).getTime() / 1000);
  const u = (id: number) => sims.get(id) as TelegramUserSim;
  const inbox = (chatId: number) =>
    calls
      .filter((c) => c.method === 'sendMessage' && c.payload.chat_id === chatId)
      .map((c) => String(c.payload.text));
  const inviteToken = async () => {
    const out = await u(OWNER).press(`cat:sfi:${venueId}`);
    const link = texts(out).find((t) => t.includes('?start=sf_')) ?? '';
    return link.slice(link.indexOf('?start=') + 7).trim();
  };

  beforeAll(async () => {
    infra = await startInfra();
    const test = createTestBot();
    calls = test.calls;
    app = await createTestApp(
      { MONGO_URI: infra.mongoUri, REDIS_URL: infra.redisUrl },
      { bot: test.bot, clock },
    );
    db = app.get<Connection>(getConnectionToken());
    const city = await app
      .get(GeographyAdminService)
      .createCity({ name: localizedText({ uz: 'Olmaliq', ru: 'Алмалык' }) });
    for (const [id, phone, name] of [
      [OWNER, '998901160001', 'Egasi'],
      [STAFF, '998901160002', 'Menejer'],
      [STAFF2, '998901160003', 'Ikkinchi'],
      [PLAYER, '998901160004', 'Ali'],
    ] as const) {
      const sim = new TelegramUserSim(test.bot, calls, id, {
        first_name: name,
        language_code: 'uz',
      });
      sims.set(id, sim);
      await sim.send('/start');
      await sim.shareContact(phone);
    }
    await db
      .collection('users')
      .updateOne({ telegramId: OWNER }, { $set: { roles: ['PLAYER', 'OWNER'] } });
    const ownerDoc = await db.collection('users').findOne({ telegramId: OWNER });
    const r = await app.get(RegisterVenueUseCase).execute({
      actor: {
        userId: String(ownerDoc?._id),
        roles: ['OWNER'],
        phone: ownerDoc?.phone,
        cityId: city.id,
      },
      name: 'Arena',
      landmarkText: 'Markaz, bozor yonida',
      hours: OpeningHours.of(8, 0),
      pricePerHour: Money.of(150_000),
    });
    if (!r.ok) throw new Error(r.error);
    pitchId = r.value.pitch.id;
    venueId = r.value.venue.id;
    await app
      .get(VenueManagementService)
      .approve({ userId: 'x', roles: ['ADMIN'], phone: null, cityId: null }, venueId as VenueId);
    // FREE limitini sinash uchun founder trial'ni olib tashlaymiz
    await db.collection('subscriptions').deleteMany({});
  });

  afterAll(async () => {
    await app?.close();
    await Promise.all([infra?.mongo.stop(), infra?.redis.stop()]);
  });

  it('the owner opens the staff screen and gets a one-time invite link', async () => {
    const screen = await u(OWNER).press(`cat:sf:${venueId}`);
    expect(texts(screen)[0]).toContain('👥 «Arena» xodimlari (0/1)');
    expect(buttons(screen)).toContain(`cat:sfi:${venueId}`);
    expect(await inviteToken()).toMatch(/^sf_[\w-]+$/);
  });

  it('TZ 3: a user joins via the link, gets the STAFF role, the owner is told', async () => {
    const token = await inviteToken();
    calls.length = 0;
    const out = await u(STAFF).send(`/start ${token}`);
    expect(texts(out).join('\n')).toContain('✅ Siz «Arena» xodimisiz!');
    expect(inbox(OWNER).at(-1)).toContain("Menejer «Arena» xodimi sifatida qo'shildi");
    const staff = await db.collection('users').findOne({ telegramId: STAFF });
    expect(staff?.roles).toContain('STAFF');
    // bir martalik
    expect(texts(await u(STAFF2).send(`/start ${token}`))[0]).toContain(
      'eskirgan yoki ishlatilgan',
    );
  });

  it('4.9: the FREE plan allows only one staff member', async () => {
    const out = await u(OWNER).press(`cat:sfi:${venueId}`);
    expect(out[0]?.payload.text).toContain('limiti');
  });

  it('4.6: a new request goes to the owner and the staff; staff can confirm it', async () => {
    calls.length = 0;
    await u(PLAYER).press(`bk:ok:${pitchId}:${sec(19)}:1`);
    expect(inbox(OWNER).some((t) => t.includes("so'rov") || t.includes('Ali'))).toBe(true);
    const toStaff = calls.find((c) => c.method === 'sendMessage' && c.payload.chat_id === STAFF);
    const confirm = JSON.stringify(toStaff?.payload.reply_markup).match(/bk:c:[0-9a-f]{24}/)?.[0];
    expect(confirm).toBeDefined();
    await u(STAFF).press(confirm as string);
    expect((await db.collection('bookings').findOne())?.status).toBe('CONFIRMED');
  });

  it('staff sees the staff panel, but cannot edit the venue or manage staff', async () => {
    const panel = await u(STAFF).send('🏟 Stadion egasiman');
    expect(texts(panel)[0]).toContain("👥 Siz xodim bo'lgan stadionlar:\n• Arena");
    expect(buttons(panel)).toEqual(['bk:own:pending', 'bk:own:today']);
    const sf = await u(STAFF).press(`cat:sfi:${venueId}`);
    expect(texts(sf).join()).not.toContain('?start=sf_');
  });

  it('EC-D3: removing staff revokes access immediately', async () => {
    const staffId = String((await db.collection('users').findOne({ telegramId: STAFF }))?._id);
    calls.length = 0;
    await u(OWNER).press(`cat:sfr:${venueId}:${staffId}`);
    expect(inbox(STAFF).at(-1)).toContain("xodimlari ro'yxatidan chiqarildingiz");
    await u(PLAYER).press(`bk:ok:${pitchId}:${sec(20)}:1`);
    const pending = await db.collection('bookings').findOne({ status: 'PENDING' });
    const out = await u(STAFF).press(`bk:c:${pending?._id}`);
    expect(out[0]?.payload.show_alert ?? out[0]?.payload.text).toBeTruthy();
    expect((await db.collection('bookings').findOne({ _id: pending?._id }))?.status).toBe(
      'PENDING',
    );
  });
});
