import { getConnectionToken } from '@nestjs/mongoose';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { addDays, localizedText, Money, zonedParts, zonedToUtc } from '@polya/shared-kernel';
import type { Connection } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BookingSweeper } from '../../src/modules/booking/index.js';
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
const OWNER = 990_001;
const ALI = 990_002;
const VALI = 990_003;

describe('Booking via bot (e2e): TZ BK-1…BK-4, Q1 (queue + contact exchange)', () => {
  let infra: Infra;
  let app: NestFastifyApplication;
  let calls: ApiCall[];
  let owner: TelegramUserSim;
  let ali: TelegramUserSim;
  let vali: TelegramUserSim;
  let db: Connection;
  let pitchId: string;
  let venueId: string;
  const day = addDays(zonedParts(new Date(), TZ).date, 2);
  const sec = (hour: number) => Math.floor(zonedToUtc(day, hour, TZ).getTime() / 1000);
  const to = (chatId: number, out: ApiCall[]) =>
    out.filter((c) => c.method === 'sendMessage' && c.payload.chat_id === chatId);

  beforeAll(async () => {
    infra = await startInfra();
    const test = createTestBot();
    calls = test.calls;
    app = await createTestApp(
      { MONGO_URI: infra.mongoUri, REDIS_URL: infra.redisUrl },
      { bot: test.bot },
    );
    db = app.get<Connection>(getConnectionToken());
    const city = await app
      .get(GeographyAdminService)
      .createCity({ name: localizedText({ uz: 'Olmaliq', ru: 'Алмалык' }) });
    owner = new TelegramUserSim(test.bot, calls, OWNER);
    ali = new TelegramUserSim(test.bot, calls, ALI, { first_name: 'Ali', language_code: 'uz' });
    vali = new TelegramUserSim(test.bot, calls, VALI, { first_name: 'Vali', language_code: 'ru' });
    for (const [u, phone] of [
      [owner, '998901110001'],
      [ali, '998901110002'],
      [vali, '998901110003'],
    ] as const) {
      await u.send('/start');
      await u.shareContact(phone);
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
      name: 'Olmaliq Arena',
      landmarkText: '5-mikrorayon, 21-maktab orqasida',
      hours: OpeningHours.of(8, 0),
      pricePerHour: Money.of(150_000),
    });
    if (!r.ok) throw new Error(r.error);
    pitchId = r.value.pitch.id;
    venueId = r.value.venue.id;
    await app
      .get(VenueManagementService)
      .approve({ userId: 'x', roles: ['ADMIN'], phone: null, cityId: null }, venueId as VenueId);
  });

  afterAll(async () => {
    await app?.close();
    await Promise.all([infra?.mongo.stop(), infra?.redis.stop()]);
  });

  it('slot → duration options with prices', async () => {
    const out = await ali.press(`bk:t:${pitchId}:${sec(19)}`);
    expect(texts(out)[0]).toContain('Olmaliq Arena, 19:00 — necha soatga?');
    expect(buttons(out)).toEqual([1, 2, 3, 4].map((h) => `bk:d:${pitchId}:${sec(19)}:${h}`));
  });

  it('summary shows price, landmark and phone consent', async () => {
    const out = await ali.press(`bk:d:${pitchId}:${sec(19)}:2`);
    const text = texts(out)[0] as string;
    expect(text).toContain('🏟 Olmaliq Arena · 1-maydon');
    expect(text).toContain("💰 300 000 so'm");
    expect(text).toContain('Raqamingiz stadion egasiga yuboriladi');
    expect(buttons(out)[0]).toBe(`bk:ok:${pitchId}:${sec(19)}:2`);
  });

  it('BK-3: submitting gives the player the venue phone and the owner the player phone', async () => {
    const out = await ali.press(`bk:ok:${pitchId}:${sec(19)}:2`);
    expect(to(ALI, out)[0]?.payload.text).toMatch(/✅ So'rov yuborildi \(PT-[0-9A-Z]{7}\)/);
    expect(to(ALI, out)[0]?.payload.text).toContain('📞 Stadion: +998 90 111 00 01');
    const ownerMsg = to(OWNER, out)[0];
    expect(ownerMsg?.payload.text).toContain("🆕 Yangi so'rov");
    expect(ownerMsg?.payload.text).toContain('👤 Ali');
    expect(ownerMsg?.payload.text).toContain('📱 +998 90 111 00 02');
    expect(buttons([ownerMsg as ApiCall])).toHaveLength(2);
  });

  it('BK-3d: the summary warns about the queue; BK-3b: the owner sees the whole queue', async () => {
    const summary = await vali.press(`bk:d:${pitchId}:${sec(20)}:1`);
    expect(texts(summary)[0]).toContain('🟡 На это время уже 1');

    const out = await vali.press(`bk:ok:${pitchId}:${sec(20)}:1`);
    expect(to(VALI, out)[0]?.payload.text).toContain('Вы 2-й в очереди');
    const ownerMsg = to(OWNER, out)[0];
    expect(ownerMsg?.payload.text).toContain("🟡 Bu vaqtga 2 ta so'rov bor");
    expect(ownerMsg?.payload.text).toContain('1. 👤 Ali · 📱 +998 90 111 00 02');
    expect(ownerMsg?.payload.text).toContain('2. 👤 Vali · 📱 +998 90 111 00 03');
    expect(buttons([ownerMsg as ApiCall]).filter((b) => b?.startsWith('bk:c:'))).toHaveLength(2);
  });

  let valiRequestId = '';
  let aliRequestId = '';

  it('EC-B1c: owner confirms the second in queue → first is told the time went to someone else', async () => {
    const [aliBooking, valiBooking] = await db
      .collection('bookings')
      .find()
      .sort({ createdAt: 1 })
      .toArray();
    aliRequestId = String(aliBooking?._id);
    valiRequestId = String(valiBooking?._id);

    const out = await owner.press(`bk:c:${valiRequestId}`);
    expect(out.find((c) => c.method === 'editMessageText')?.payload.text).toContain(
      '✅ Tasdiqlandi: Vali',
    );
    expect(to(VALI, out)[0]?.payload.text).toContain('🎉 Бронь подтверждена');
    expect(to(ALI, out)[0]?.payload.text).toContain("bu vaqt boshqa o'yinchiga berildi");
    expect((await db.collection('bookings').findOne({ _id: aliBooking?._id }))?.rejectReason).toBe(
      'SLOT_TAKEN',
    );
  });

  it('EC-B4: pressing an old button for an already handled request gives an alert', async () => {
    const out = await owner.press(`bk:c:${aliRequestId}`);
    expect(out[0]).toMatchObject({ method: 'answerCallbackQuery', payload: { show_alert: true } });
  });

  it("EC-D1: a player cannot confirm someone else's request", async () => {
    const out = await ali.press(`bk:c:${valiRequestId}`);
    expect(out[0]?.payload.text).toBe("Bu so'rov sizga tegishli emas");
  });

  it('the booked slot is red in the grid and cannot be requested', async () => {
    const grid = await ali.press(`cat:avd:${pitchId}:${day}`);
    const markup =
      grid.find((c) => c.payload.reply_markup)?.payload.reply_markup?.inline_keyboard?.flat() ?? [];
    expect(markup.find((b: { callback_data: string }) => b.callback_data === 'bk:x')?.text).toBe(
      '🔴 20:00',
    );
    expect(texts(await ali.press(`bk:t:${pitchId}:${sec(20)}`))[0]).toContain(
      'hozirgina band qilindi',
    );
  });

  it('BK-4: owner rejects → player is notified', async () => {
    await ali.press(`bk:ok:${pitchId}:${sec(12)}:1`);
    const pending = await db.collection('bookings').findOne({ status: 'PENDING' });
    const out = await owner.press(`bk:r:${pending?._id}`);
    expect(to(ALI, out)[0]?.payload.text).toContain("so'rov rad etildi");
  });

  it('PhoneGate: a player without phone is asked and the booking resumes after sharing', async () => {
    const newbie = new TelegramUserSim(ali['bot'], calls, 990_010, {
      first_name: 'Yangi',
      language_code: 'uz',
    });
    await newbie.send('/start');
    const asked = await newbie.press(`bk:ok:${pitchId}:${sec(15)}:1`);
    expect(texts(asked)[0]).toContain('telefon raqamingiz kerak');
    const out = await newbie.shareContact('998901110010');
    expect(texts(out).some((t) => t.includes("✅ So'rov yuborildi"))).toBe(true);
  });

  it('BK-12: "Mening bandlovlarim" lists upcoming bookings with status', async () => {
    const out = await vali.send('📅 Мои брони');
    expect(texts(out)[0]).toContain('📅 Предстоящие брони');
    expect(texts(out)[0]).toContain('🟢 Olmaliq Arena');
  });

  it('BK-5: the player cancels a confirmed booking → owner is told, slot is free again', async () => {
    const list = await vali.send('📅 Мои брони');
    const open = buttons(list).find((b) => b?.startsWith('bk:v:')) as string;
    const details = await vali.press(open);
    const cancel = buttons(details).find((b) => b?.startsWith('bk:pc:')) as string;
    const confirm = await vali.press(cancel);
    const yes = buttons(confirm).find((b) => b?.startsWith('bk:pcy:')) as string;
    const out = await vali.press(yes);
    expect(to(OWNER, out)[0]?.payload.text).toContain('bandlovni bekor qildi');
    const grid = await ali.press(`cat:avd:${pitchId}:${day}`);
    const markup =
      grid.find((c) => c.payload.reply_markup)?.payload.reply_markup?.inline_keyboard?.flat() ?? [];
    expect(markup.some((b: { text: string }) => b.text === '🟢 20:00')).toBe(true);
  });

  it('VC-5c: "book again" offers the same time next week', async () => {
    const history = await vali.press('bk:hist');
    const open = buttons(history).find((b) => b?.startsWith('bk:v:')) as string;
    const details = await vali.press(open);
    const again = buttons(details).find((b) => b?.startsWith('bk:again:')) as string;
    const out = await vali.press(again);
    expect(buttons(out)[0]).toBe(`bk:d:${pitchId}:${sec(20) + 7 * 86_400}:1`);
  });

  it('BK-3f: the sweeper expires an unanswered request and tells the player', async () => {
    await ali.press(`bk:ok:${pitchId}:${sec(10)}:1`);
    const pending = await db
      .collection('bookings')
      .findOne({ status: 'PENDING', playerId: { $ne: null } }, { sort: { createdAt: -1 } });
    await db
      .collection('bookings')
      .updateOne({ _id: pending?._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const before = calls.length;
    const result = await app.get(BookingSweeper).run();
    expect(result.expired).toBeGreaterThanOrEqual(1);
    expect((await db.collection('bookings').findOne({ _id: pending?._id }))?.status).toBe(
      'EXPIRED',
    );
    expect(
      to(ALI, calls.slice(before)).some((c) => String(c.payload.text).includes('javob bermadi')),
    ).toBe(true);
  });

  describe('Owner screens (BK-6…BK-8, BK-13)', () => {
    it('owner panel links to pending requests and today', async () => {
      const panel = await owner.send('🏟 Stadion egasiman');
      expect(buttons(panel)).toEqual(expect.arrayContaining(['bk:own:pending', 'bk:own:today']));
    });

    it('pending list shows player phone and decision buttons', async () => {
      await ali.press(`bk:ok:${pitchId}:${sec(13)}:1`);
      const out = await owner.press('bk:own:pending');
      expect(texts(out)[0]).toContain("⏳ Javob kutayotgan so'rovlar");
      expect(texts(out)[0]).toContain('📱 +998 90 111 00 02');
      expect(buttons(out).some((b) => b?.startsWith('bk:c:'))).toBe(true);
    });

    it('BK-7: manual booking from the owner grid rejects the overlapping request', async () => {
      const grid = await owner.press(`bk:ogd:${pitchId}:${day}`);
      const markup =
        grid.find((c) => c.payload.reply_markup)?.payload.reply_markup?.inline_keyboard?.flat() ??
        [];
      expect(markup.find((b: { text: string }) => b.text === '🟡 13:00')).toBeTruthy();
      await owner.press(`bk:om:${pitchId}:${sec(13)}`);
      await owner.press(`bk:omd:${pitchId}:${sec(13)}:1`);
      const out = await owner.send('Sardor 935551122');
      expect(texts(out)[0]).toContain("✅ Qo'lda bandlov saqlandi");
      expect(to(ALI, out)[0]?.payload.text).toContain("boshqa o'yinchiga berildi");
      const manual = await db.collection('bookings').findOne({ source: 'MANUAL' });
      expect(manual).toMatchObject({
        status: 'CONFIRMED',
        guest: { name: 'Sardor', phone: '+998935551122' },
      });
    });

    it('BK-8: block a free slot, then remove the block', async () => {
      await owner.press(`bk:obd:${pitchId}:${sec(9)}:2`);
      expect(await db.collection('slot_locks').countDocuments({ ownerType: 'BLOCK' })).toBe(2);
      const block = await db.collection('blocks').findOne();
      await owner.press(`bk:obr:${block?._id}`);
      expect(await db.collection('slot_locks').countDocuments({ ownerType: 'BLOCK' })).toBe(0);
    });

    it('EC-B13: a block cannot cover a booked slot', async () => {
      const out = await owner.press(`bk:obd:${pitchId}:${sec(13)}:1`);
      expect(texts(out)).toContain('Bu vaqt band — boshqa vaqt tanlang.');
    });

    it('BK-6: owner cancels a confirmed booking with a reason; the player is told', async () => {
      await ali.press(`bk:ok:${pitchId}:${sec(16)}:1`);
      const req = await db
        .collection('bookings')
        .findOne({ status: 'PENDING', playerId: { $ne: null } }, { sort: { createdAt: -1 } });
      await owner.press(`bk:c:${req?._id}`);
      const view = await owner.press(`bk:ov:${req?._id}`);
      expect(buttons(view)).toContain(`bk:oc:${req?._id}`);
      await owner.press(`bk:oc:${req?._id}`);
      const out = await owner.send('Chiroq buzildi');
      expect(to(ALI, out)[0]?.payload.text).toContain('Sabab: Chiroq buzildi');
      expect((await db.collection('bookings').findOne({ _id: req?._id }))?.status).toBe(
        'CANCELLED_BY_OWNER',
      );
    });

    it("another owner cannot open this pitch's grid (EC-D1)", async () => {
      const out = await ali.press(`bk:ogd:${pitchId}:${day}`);
      expect(out[0]?.payload.text).toBe('Bu tugma eskirgan. Menyu yangilandi.');
      expect(texts(out).some((t) => t.includes('🗓'))).toBe(false);
    });
  });
});
