import { Injectable } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Composer } from 'grammy';
import type { Connection } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IdentityModule, PhoneGate } from '../../src/modules/identity/index.js';
import type { BotContext } from '../../src/platform/telegram/bot-context.js';
import {
  type BotFeature,
  FeatureOrder,
  TelegramFeature,
} from '../../src/platform/telegram/bot-feature.js';
import {
  type ApiCall,
  buttons,
  createTestBot,
  keyboardLabels,
  nextUpdateId,
  TelegramUserSim,
  texts,
} from '../support/telegram-sim.js';
import { createTestApp, type Infra, startInfra } from '../support/test-app.js';

/** Boshqa modul (masalan, Booking) PhoneGate'dan qanday foydalanishini taqlid qiladi. */
@Injectable()
@TelegramFeature(FeatureOrder.MODULE + 1)
class NeedsPhoneTestFeature implements BotFeature {
  constructor(private readonly phoneGate: PhoneGate) {
    phoneGate.onVerified('test.book', async (ctx, data) => {
      await ctx.reply(`resumed:${String(data.slot)}`);
    });
  }

  register(bot: Composer<BotContext>): void {
    bot.command('book', async (ctx) => {
      if (!(await this.phoneGate.require(ctx, { kind: 'test.book', data: { slot: 'S1' } }))) return;
      await ctx.reply('booked-directly');
    });
  }
}

describe('Identity bot (e2e): TZ ID-1…ID-6', () => {
  let infra: Infra;
  let app: NestFastifyApplication;
  let calls: ApiCall[];
  let sim: (id: number, lang?: string) => TelegramUserSim;
  let users: () => ReturnType<Connection['collection']>;

  beforeAll(async () => {
    infra = await startInfra();
    const test = createTestBot();
    calls = test.calls;
    app = await createTestApp(
      { MONGO_URI: infra.mongoUri, REDIS_URL: infra.redisUrl },
      { bot: test.bot, imports: [IdentityModule], providers: [NeedsPhoneTestFeature] },
    );
    sim = (id, lang = 'uz') =>
      new TelegramUserSim(test.bot, calls, id, { first_name: 'Ali', language_code: lang });
    const connection = app.get<Connection>(getConnectionToken());
    users = () => connection.collection('users');
  });

  afterAll(async () => {
    await app?.close();
    await Promise.all([infra?.mongo.stop(), infra?.redis.stop()]);
  });

  describe('ID-1, ID-4: /start and language', () => {
    it('first /start registers the user and asks for a language', async () => {
      const ali = sim(1001, 'ru');
      const out = await ali.send('/start');

      expect(texts(out)).toEqual(['Tilni tanlang · Выберите язык']);
      expect(buttons(out)).toEqual(['id:lang:uz:new', 'id:lang:ru:new']);
      const doc = await users().findOne({ telegramId: 1001 });
      expect(doc).toMatchObject({
        language: 'ru',
        roles: ['PLAYER'],
        phone: null,
        firstName: 'Ali',
      });
    });

    it('choosing a language saves it and shows the welcome with a localized menu', async () => {
      const out = await sim(1001, 'ru').press('id:lang:uz:new');

      expect(out.map((c) => c.method)).toEqual([
        'answerCallbackQuery',
        'editMessageText',
        'sendMessage',
      ]);
      expect(texts(out)[0]).toBe("✅ Til: O'zbekcha");
      expect(texts(out)[1]).toContain('Assalomu alaykum, Ali!');
      expect(keyboardLabels(out)).toContain('⚙️ Sozlamalar');
      expect((await users().findOne({ telegramId: 1001 }))?.language).toBe('uz');
    });

    it('second /start is idempotent and greets back', async () => {
      const out = await sim(1001).send('/start');
      expect(texts(out)).toEqual(['Xush kelibsiz, Ali! Quyidagi menyudan tanlang 👇']);
      expect(await users().countDocuments({ telegramId: 1001 })).toBe(1);
    });

    it('ID-1: parallel first updates create exactly one user', async () => {
      const u = sim(1002);
      await Promise.all(Array.from({ length: 8 }, () => u.send('/start')));
      expect(await users().countDocuments({ telegramId: 1002 })).toBe(1);
    });
  });

  describe('ID-2, ID-3: phone via contact sharing', () => {
    it("ID-3: someone else's contact is rejected", async () => {
      const u = sim(2001);
      await u.send('/start');
      const out = await u.shareContact('998901234567', 9999);
      expect(texts(out)[0]).toContain('Bu sizning kontaktingiz emas');
      expect((await users().findOne({ telegramId: 2001 }))?.phone).toBeNull();
    });

    it('ID-3: a contact card without user_id (typed by hand) is rejected', async () => {
      const out = await sim(2001).shareContact('998901234567', null);
      expect(texts(out)[0]).toContain('Bu sizning kontaktingiz emas');
    });

    it('ID-2: a phone typed as text is not accepted', async () => {
      const u = sim(2001);
      await u.press('id:phone');
      const out = await u.send('+998 90 123 45 67');
      expect(texts(out)[0]).toContain("qo'lda yozmang");
      expect((await users().findOne({ telegramId: 2001 }))?.phone).toBeNull();
    });

    it('ID-2: own contact is saved in E.164 and the menu comes back', async () => {
      const out = await sim(2001).shareContact('998901234567');
      expect(texts(out)).toEqual(['✅ Raqamingiz saqlandi: +998 90 123 45 67']);
      expect(keyboardLabels(out)).toContain('⚙️ Sozlamalar');
      expect((await users().findOne({ telegramId: 2001 }))?.phone).toBe('+998901234567');
    });

    it('EC-B12: the same number on a new account moves to it', async () => {
      const newAccount = sim(2002);
      await newAccount.send('/start');
      await newAccount.shareContact('+998901234567');
      expect((await users().findOne({ telegramId: 2002 }))?.phone).toBe('+998901234567');
      expect((await users().findOne({ telegramId: 2001 }))?.phone).toBeNull();
    });
  });

  describe('TZ 5.2 step 6: PhoneGate keeps the flow', () => {
    it('asks for a phone, then resumes the original action after sharing', async () => {
      const u = sim(3001);
      await u.send('/start');

      const asked = await u.send('/book');
      expect(texts(asked)[0]).toContain('telefon raqamingiz kerak');
      expect(keyboardLabels(asked)).toContain('📱 Raqamni yuborish');

      const out = await u.shareContact('998911112233');
      expect(texts(out)).toEqual(['✅ Raqamingiz saqlandi: +998 91 111 22 33', 'resumed:S1']);

      const direct = await u.send('/book');
      expect(texts(direct)).toEqual(['booked-directly']);
    });

    it('cancel drops the pending action', async () => {
      const u = sim(3002);
      await u.send('/start');
      await u.send('/book');
      expect(texts(await u.send('❌ Bekor qilish'))).toEqual(['Bekor qilindi.']);
      const out = await u.shareContact('998911112244');
      expect(texts(out)).toEqual(['✅ Raqamingiz saqlandi: +998 91 111 22 44']);
    });
  });

  describe('ID-5: settings and rename', () => {
    it('shows settings with phone and language', async () => {
      const out = await sim(2002).send('⚙️ Sozlamalar');
      expect(texts(out)[0]).toContain('📱 Telefon: +998 90 123 45 67');
      expect(buttons(out)).toEqual(['id:lang', 'id:phone', 'id:name', 'id:city']);
    });

    it('rejects an invalid name and accepts a valid one', async () => {
      const u = sim(2002);
      await u.press('id:name');
      expect(texts(await u.send('x'))[0]).toContain('2–64');
      expect(texts(await u.send('Kapitan Ali'))).toEqual(['✅ Ism saqlandi: Kapitan Ali']);
      expect((await users().findOne({ telegramId: 2002 }))?.customName).toBe('Kapitan Ali');
    });

    it('EC-T9: tapping a menu button while renaming abandons the rename', async () => {
      const u = sim(2002);
      await u.press('id:name');
      await u.send('⚙️ Sozlamalar');
      expect((await users().findOne({ telegramId: 2002 }))?.customName).toBe('Kapitan Ali');
    });

    it('changing language from settings switches the menu language', async () => {
      const out = await sim(2002).press('id:lang:ru');
      expect(texts(out)).toEqual(['✅ Язык: Русский', 'Главное меню 👇']);
      expect(keyboardLabels(out)).toContain('⚙️ Настройки');
    });
  });

  describe('ID-6: bot blocked by the user', () => {
    it('marks and unmarks the user', async () => {
      const u = sim(4001);
      await u.send('/start');
      await u.setBotStatus('kicked');
      expect((await users().findOne({ telegramId: 4001 }))?.botBlocked).toBe(true);
      await u.setBotStatus('member');
      expect((await users().findOne({ telegramId: 4001 }))?.botBlocked).toBe(false);
    });

    it('writing to the bot again also clears the flag', async () => {
      const u = sim(4001);
      await u.setBotStatus('kicked');
      await u.send('/start');
      expect((await users().findOne({ telegramId: 4001 }))?.botBlocked).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('EC-T5: a re-delivered update is processed once', async () => {
      const u = sim(5001);
      const id = nextUpdateId();
      const update = {
        message: {
          message_id: 1,
          date: Math.floor(Date.now() / 1000),
          chat: { id: 5001, type: 'private', first_name: 'Ali' },
          from: u.from,
          text: '/start',
          entities: [{ type: 'bot_command', offset: 0, length: 6 }],
        },
      };
      // biome-ignore lint/suspicious/noExplicitAny: raw update
      const first = await u.act(update as any, id);
      // biome-ignore lint/suspicious/noExplicitAny: raw update
      const second = await u.act(update as any, id);
      expect(texts(first)).toHaveLength(1);
      expect(second).toEqual([]);
    });

    it('EC-T8: in a group the bot only explains itself and registers nobody', async () => {
      const u = sim(5002);
      const out = await u.send('/start', { id: -100500, type: 'group', title: 'Futbol' });
      expect(texts(out)).toEqual([
        "Men faqat shaxsiy chatda ishlayman. Menga to'g'ridan-to'g'ri yozing: @polya_test_bot",
      ]);
      expect(await users().countDocuments({ telegramId: 5002 })).toBe(0);
      expect(await u.send('salom', { id: -100500, type: 'group', title: 'Futbol' })).toEqual([]);
    });

    it('EC-T3: a stale inline button gets an alert and the menu', async () => {
      const out = await sim(1001).press('old:button:xyz');
      expect(out[0]).toMatchObject({
        method: 'answerCallbackQuery',
        payload: { text: 'Bu tugma eskirgan. Menyu yangilandi.' },
      });
      expect(texts(out)).toEqual(['Asosiy menyu 👇']);
    });

    it('not yet implemented menu items say "coming soon"', async () => {
      expect(texts(await sim(1001).send("⚽ Bo'sh maydon topish"))).toEqual([
        "🚧 Bu bo'lim tez orada ishga tushadi.",
      ]);
    });

    it('free text is treated as a search query (no cities yet → explains)', async () => {
      expect(texts(await sim(1001).send('salom'))).toEqual([
        "Hozircha bot ishlaydigan shaharlar qo'shilmagan.",
      ]);
    });

    it('a sticker (non-text) gets the menu', async () => {
      const u = sim(1001);
      const out = await u.act({
        message: {
          message_id: 1,
          date: 0,
          chat: { id: 1001, type: 'private' },
          from: u.from,
          sticker: {
            file_id: 's',
            file_unique_id: 's',
            type: 'regular',
            width: 1,
            height: 1,
            is_animated: false,
            is_video: false,
          },
        },
        // biome-ignore lint/suspicious/noExplicitAny: raw update
      } as any);
      expect(texts(out)).toEqual(["Menyudan kerakli bo'limni tanlang 👇"]);
    });

    it('EC-T6: an empty/emoji-only Telegram name gets a fallback', async () => {
      const u = new TelegramUserSim(
        // biome-ignore lint/suspicious/noExplicitAny: reuse bot from closure
        (sim(0) as any).bot,
        calls,
        6001234,
        { first_name: ' ', language_code: 'uz' },
      );
      await u.send('/start');
      await u.press('id:lang:uz:new');
      const out = await u.send('/start');
      expect(texts(out)[0]).toContain('Foydalanuvchi #1234');
    });
  });
});
