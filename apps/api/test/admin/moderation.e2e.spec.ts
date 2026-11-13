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
const ADMIN = 8_400_001;
const OWNER = 8_400_002;
const PLAYER = 8_400_003;
const PLAYER2 = 8_400_004;

describe('Admin moderation (e2e): TZ AD-2, EC-B10, EC-B11', () => {
  let infra: Infra;
  let app: NestFastifyApplication;
  let calls: ApiCall[];
  let db: Connection;
  let pitchId: string;
  let slug: string;
  const sims = new Map<number, TelegramUserSim>();
  const day = addDays(zonedParts(new Date(), TZ).date, 1);
  const local = (hour: number) => zonedToUtc(day, hour, TZ, 0);
  const clock = new FixedClock(local(10));
  const sec = (hour: number) => Math.floor(local(hour).getTime() / 1000);
  const u = (id: number) => sims.get(id) as TelegramUserSim;
  const inbox = (chatId: number) =>
    calls
      .filter((c) => c.method === 'sendMessage' && c.payload.chat_id === chatId)
      .map((c) => String(c.payload.text));
  const latestPending = async () =>
    (
      await db
        .collection('bookings')
        .find({ status: 'PENDING' })
        .sort({ _id: -1 })
        .limit(1)
        .toArray()
    )[0];

  beforeAll(async () => {
    infra = await startInfra();
    const test = createTestBot();
    calls = test.calls;
    app = await createTestApp(
      { MONGO_URI: infra.mongoUri, REDIS_URL: infra.redisUrl, ADMIN_TELEGRAM_IDS: String(ADMIN) },
      { bot: test.bot, clock },
    );
    db = app.get<Connection>(getConnectionToken());
    const city = await app
      .get(GeographyAdminService)
      .createCity({ name: localizedText({ uz: 'Olmaliq', ru: 'Алмалык' }) });
    for (const [id, phone] of [
      [ADMIN, '998901150001'],
      [OWNER, '998901150002'],
      [PLAYER, '998901150003'],
      [PLAYER2, '998901150004'],
    ] as const) {
      const sim = new TelegramUserSim(test.bot, calls, id, {
        first_name: 'U',
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
    slug = r.value.venue.slug;
    await app
      .get(VenueManagementService)
      .approve(
        { userId: 'x', roles: ['ADMIN'], phone: null, cityId: null },
        r.value.venue.id as VenueId,
      );
    // PLAYER: 20:00 tasdiqlangan, 21:00 kutilmoqda
    await u(PLAYER).press(`bk:ok:${pitchId}:${sec(20)}:1`);
    await u(OWNER).press(`bk:c:${(await latestPending())?._id}`);
    await u(PLAYER).press(`bk:ok:${pitchId}:${sec(21)}:1`);
  });

  afterAll(async () => {
    await app?.close();
    await Promise.all([infra?.mongo.stop(), infra?.redis.stop()]);
  });

  it('EC-B11: blocking a player cancels their bookings and tells the owner', async () => {
    calls.length = 0;
    const out = await u(ADMIN).send(`/blockuser ${PLAYER} | Spam`);
    expect(texts(out).at(-1)).toContain('Bekor qilingan bandlovlar: 2');
    expect(inbox(OWNER).filter((t) => t.includes("o'yinchi akkaunti bloklangani"))).toHaveLength(2);
    const statuses = (await db.collection('bookings').find().toArray()).map((b) => b.status);
    expect(statuses.sort()).toEqual(['CANCELLED_BY_PLAYER', 'CANCELLED_BY_PLAYER']);
  });

  it('AD-2: a blocked user is not served', async () => {
    expect(texts(await u(PLAYER).send('/start'))).toEqual([
      "⛔ Akkauntingiz qoidabuzarlik sababli bloklangan. Savollar bo'lsa, qo'llab-quvvatlash xizmatiga yozing.",
    ]);
    const press = await u(PLAYER).press(`bk:ok:${pitchId}:${sec(22)}:1`);
    expect(press[0]?.payload.show_alert).toBe(true);
  });

  it('admins cannot be blocked; unknown refs and repeated actions are reported', async () => {
    expect(texts(await u(ADMIN).send(`/blockuser ${ADMIN}`))).toEqual([
      "Adminni bloklab bo'lmaydi.",
    ]);
    expect(texts(await u(ADMIN).send('/blockuser 123'))).toEqual(['Topilmadi.']);
    expect(texts(await u(ADMIN).send(`/blockuser +998901150003`))[0]).toContain("o'zgarmadi");
  });

  it('unblocking restores the service', async () => {
    expect(texts(await u(ADMIN).send(`/unblockuser ${PLAYER}`))).toEqual([
      '✅ Foydalanuvchi blokdan chiqarildi.',
    ]);
    expect(texts(await u(PLAYER).send('/start'))[0]).not.toContain('⛔');
  });

  it('a non-admin cannot use moderation commands', async () => {
    await u(OWNER).send(`/blockuser ${PLAYER2}`);
    expect((await db.collection('users').findOne({ telegramId: PLAYER2 }))?.status).toBe('ACTIVE');
  });

  it('EC-B10: blocking a venue asks for confirmation, then cancels and tells players', async () => {
    await u(PLAYER2).press(`bk:ok:${pitchId}:${sec(18)}:1`);
    await u(OWNER).press(`bk:c:${(await latestPending())?._id}`);
    const ask = await u(ADMIN).send(`/blockvenue ${slug} | Xavfsizlik tekshiruvi`);
    expect(texts(ask)[0]).toContain("Kelajakdagi 1 ta bandlov/so'rov bekor qilinadi");
    expect((await db.collection('venues').findOne())?.status).toBe('APPROVED');
    calls.length = 0;
    const done = await u(ADMIN).press(buttons(ask)[0] as string);
    expect(texts(done).at(-1)).toContain('«Arena» bloklandi. Bekor qilingan bandlovlar: 1.');
    expect(inbox(PLAYER2).at(-1)).toContain('Sabab: Xavfsizlik tekshiruvi');
    expect((await db.collection('venues').findOne())?.status).toBe('BLOCKED');
  });

  it('a second confirmation is refused; unblock brings the venue back', async () => {
    const again = await u(ADMIN).press(`adm:bv:${(await db.collection('venues').findOne())?._id}`);
    expect(texts(again).at(-1)).toContain('Allaqachon bajarilgan');
    expect(texts(await u(ADMIN).send(`/unblockvenue ${slug}`))).toEqual([
      '✅ «Arena» blokdan chiqarildi.',
    ]);
    expect((await db.collection('venues').findOne())?.status).toBe('APPROVED');
  });

  it('AD-4: /stats shows users, venues and the booking funnel', async () => {
    const text = texts(await u(ADMIN).send('/stats'))[0] ?? '';
    expect(text).toContain('📊 Polya.top statistikasi');
    expect(text).toContain('👥 Foydalanuvchilar: 4');
    expect(text).toContain('Owner: 1');
    expect(text).toContain('🏟 Stadionlar: ✅ 1');
    // ikkala blok natijasida uchala bandlov ham bekor qilingan
    expect(text).toContain("📅 24 soat: so'rov 3 · ✅ 0 · ❌ 0 · ⌛ 0 · 🚫 3");
    expect(texts(await u(OWNER).send('/stats')).join()).not.toContain('📊');
  });
});
