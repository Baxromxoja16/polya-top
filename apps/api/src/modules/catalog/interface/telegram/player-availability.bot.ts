import { Injectable } from '@nestjs/common';
import { addDays, type Language, type LocalDate, zonedToUtc } from '@polya/shared-kernel';
import { type Composer, InlineKeyboard } from 'grammy';
import type { BotContext } from '../../../../platform/telegram/bot-context.js';
import {
  type BotFeature,
  FeatureOrder,
  TelegramFeature,
} from '../../../../platform/telegram/bot-feature.js';
import { defineMessages } from '../../../../platform/telegram/i18n.js';
import { menuLabels } from '../../../../platform/telegram/main-menu.js';
import { showMessage } from '../../../../platform/telegram/ui.js';
import type { SlotView } from '../../../scheduling/index.js';
import { CatalogQueries } from '../../application/catalog.queries.js';
import { FreeSearchService } from '../../application/free-search.service.js';
import { formatSum } from './catalog.messages.js';
import { dayLabel } from './owner-schedule.bot.js';
import { searchMessages } from './player-search.messages.js';

const ID = '([0-9a-f]{24})';
const DATE = '(\\d{4}-\\d{2}-\\d{2})';
const SHOWN_DAYS = 7;
/** Biznes kunidagi tanlanadigan soatlar: 06:00 … 01:00 (25 = tungi 01:00, EC-S1) */
const PICK_HOURS = Array.from({ length: 20 }, (_, i) => i + 6);

const m = defineMessages(
  {
    chooseDate: '📅 Qaysi kun?',
    chooseTime: (day: string) => `🕒 ${day} — soat nechada?`,
    btnNow: "⚡ Hozir bo'sh",
    today: 'Bugun',
    tomorrow: 'Ertaga',
    gridTitle: (pitch: string, day: string) =>
      `⚽ ${pitch} · ${day}\n🟢 bo'sh · 🟡 so'rov bor (navbat) · 🔴 band`,
    gridEmpty: "Bu kunda bo'sh vaqt yo'q (yopiq yoki hammasi o'tib ketgan).",
    choosePitch: 'Qaysi maydon?',
    freeAtTitle: (day: string, time: string) => `🔎 ${day}, ${time} — 1 soatga bo'sh maydonlar:`,
    freeAtEmpty: (day: string, time: string) =>
      `😕 ${day}, ${time} da bo'sh maydon topilmadi. Boshqa vaqtni tanlang.`,
    soonTitle: "⚡ Keyingi 3 soatda bo'sh maydonlar:",
    soonEmpty: "😕 Yaqin 3 soatda bo'sh maydon yo'q.",
    bookedAlert: 'Bu vaqt band.',
    bookingSoon: "🚧 Bandlash tez orada ishga tushadi. Hozircha telefon orqali bog'laning.",
    noCity: 'Avval shahringizni tanlang: ⚙️ Sozlamalar → 🏙 Shahar.',
  },
  {
    chooseDate: '📅 Какой день?',
    chooseTime: (day) => `🕒 ${day} — во сколько?`,
    btnNow: '⚡ Свободно сейчас',
    today: 'Сегодня',
    tomorrow: 'Завтра',
    gridTitle: (pitch, day) =>
      `⚽ ${pitch} · ${day}\n🟢 свободно · 🟡 есть заявка (очередь) · 🔴 занято`,
    gridEmpty: 'На этот день свободного времени нет (закрыто или всё прошло).',
    choosePitch: 'Какое поле?',
    freeAtTitle: (day, time) => `🔎 ${day}, ${time} — свободные поля на 1 час:`,
    freeAtEmpty: (day, time) => `😕 На ${day}, ${time} свободных полей нет. Выберите другое время.`,
    soonTitle: '⚡ Свободные поля в ближайшие 3 часа:',
    soonEmpty: '😕 В ближайшие 3 часа свободных полей нет.',
    bookedAlert: 'Это время занято.',
    bookingSoon: '🚧 Бронирование скоро заработает. Пока свяжитесь по телефону.',
    noCity: 'Сначала выберите город: ⚙️ Настройки → 🏙 Город.',
  },
);

const hh = (hour: number) => `${String(hour % 24).padStart(2, '0')}:00`;
const ICON: Record<SlotView['status'], string> = {
  FREE: '🟢',
  REQUESTED: '🟡',
  BOOKED: '🔴',
  PAST: '',
};

/**
 * TZ 5.2 ("Bo'sh maydon topish"), VC-5b ("Hozir bo'sh"), VC-6, kartochkada "⏰ Bo'sh vaqtlar".
 * Slot tugmasi `bk:t:<pitchId>:<startSec>` — bandlash oqimini Booking konteksti (4-bosqich) ushlaydi.
 */
@Injectable()
@TelegramFeature(FeatureOrder.MODULE + 20)
export class PlayerAvailabilityBotFeature implements BotFeature {
  constructor(
    private readonly free: FreeSearchService,
    private readonly catalog: CatalogQueries,
  ) {}

  register(bot: Composer<BotContext>): void {
    bot.hears(menuLabels('find'), (ctx) => this.chooseDate(ctx));

    bot.callbackQuery(/^fs:d:(\d{4}-\d{2}-\d{2})$/, async (ctx) => {
      await ctx.answerCallbackQuery();
      const date = ctx.match[1] as string;
      const today = await this.cityToday(ctx);
      if (!today) return;
      const kb = new InlineKeyboard();
      PICK_HOURS.forEach((h, i) => {
        kb.text(hh(h), `fs:t:${date}:${h}`);
        if (i % 5 === 4) kb.row();
      });
      await showMessage(ctx, m[ctx.lang].chooseTime(dateLabel(ctx.lang, date, today)), kb);
    });

    bot.callbackQuery(/^fs:t:(\d{4}-\d{2}-\d{2}):(\d{1,2})$/, async (ctx) => {
      await ctx.answerCallbackQuery();
      const cityId = ctx.currentUser?.cityId;
      if (!cityId) return void (await ctx.reply(m[ctx.lang].noCity));
      const [date, hour] = [ctx.match[1] as string, Number(ctx.match[2])];
      const start = zonedToUtc(date, hour, await this.free.timezoneOf(cityId));
      const found = await this.free.freeAt(cityId, start, 1);
      const day = dateLabel(ctx.lang, date, await this.free.today(cityId));
      if (found.length === 0) return void (await ctx.reply(m[ctx.lang].freeAtEmpty(day, hh(hour))));
      const kb = new InlineKeyboard();
      const lines = found.slice(0, 10).map((f, i) => {
        kb.text(
          `${i + 1}. ${f.venue.name}`,
          `bk:t:${f.pitch.id}:${Math.floor(start.getTime() / 1000)}`,
        )
          .text('ℹ️', `cat:c:${f.venue.id}`)
          .row();
        return `${i + 1}. ${f.venue.name} · ${f.pitch.name} · ${formatSum(f.quote.total.amount)} ${searchMessages[ctx.lang].perHour}\n   📍 ${f.venue.landmarkText}`;
      });
      await ctx.reply(`${m[ctx.lang].freeAtTitle(day, hh(hour))}\n\n${lines.join('\n\n')}`, {
        reply_markup: kb,
      });
    });

    bot.callbackQuery('fs:now', async (ctx) => {
      await ctx.answerCallbackQuery();
      const cityId = ctx.currentUser?.cityId;
      if (!cityId) return void (await ctx.reply(m[ctx.lang].noCity));
      const soon = await this.free.freeSoon(cityId, 3);
      if (soon.length === 0) return void (await ctx.reply(m[ctx.lang].soonEmpty));
      const kb = new InlineKeyboard();
      const lines = soon.slice(0, 10).map((s, i) => {
        kb.text(`${i + 1}. ${hh(s.slot.hour)} ${s.venue.name}`, slotCallback(s.pitch.id, s.slot))
          .text('ℹ️', `cat:c:${s.venue.id}`)
          .row();
        return `${i + 1}. ${ICON[s.slot.status]} ${hh(s.slot.hour)} · ${s.venue.name} · ${s.pitch.name} · ${formatSum(s.slot.price.amount)}`;
      });
      await ctx.reply(`${m[ctx.lang].soonTitle}\n\n${lines.join('\n')}`, { reply_markup: kb });
    });

    // Kartochkadagi "⏰ Bo'sh vaqtlar"
    bot.callbackQuery(new RegExp(`^cat:av:${ID}$`), async (ctx) => {
      await ctx.answerCallbackQuery();
      const card = await this.catalog.venueCard(ctx.match[1] as string);
      const pitches = card?.pitches.filter((p) => p.status === 'ACTIVE') ?? [];
      if (!card?.venue.isPublic || pitches.length === 0) return;
      if (pitches.length === 1)
        return this.chooseGridDate(ctx, pitches[0]?.id as string, card.venue.cityId);
      const kb = new InlineKeyboard();
      for (const p of pitches) kb.text(`⚽ ${p.name}`, `cat:avp:${p.id}`).row();
      await ctx.reply(m[ctx.lang].choosePitch, { reply_markup: kb });
    });
    bot.callbackQuery(new RegExp(`^cat:avp:${ID}$`), async (ctx) => {
      await ctx.answerCallbackQuery();
      const venueId = await this.catalog.venueIdOfPitch(ctx.match[1] as string);
      const card = venueId ? await this.catalog.venueCard(venueId) : null;
      if (card) await this.chooseGridDate(ctx, ctx.match[1] as string, card.venue.cityId);
    });
    bot.callbackQuery(new RegExp(`^cat:avd:${ID}:${DATE}$`), async (ctx) => {
      await ctx.answerCallbackQuery();
      await this.showGrid(ctx, ctx.match[1] as string, ctx.match[2] as string);
    });

    bot.callbackQuery('bk:x', (ctx) => ctx.answerCallbackQuery({ text: m[ctx.lang].bookedAlert }));
    // Booking konteksti (4-bosqich) ulanguncha — vaqtinchalik javob
    bot.callbackQuery(/^bk:t:/, (ctx) =>
      ctx.answerCallbackQuery({ text: m[ctx.lang].bookingSoon, show_alert: true }),
    );
  }

  private async chooseDate(ctx: BotContext): Promise<void> {
    const today = await this.cityToday(ctx);
    if (!today) return;
    const kb = new InlineKeyboard().text(m[ctx.lang].btnNow, 'fs:now').row();
    for (let i = 0; i < SHOWN_DAYS; i++) {
      const date = addDays(today, i);
      kb.text(dateLabel(ctx.lang, date, today), `fs:d:${date}`);
      if (i % 2 === 1 || i === 0) kb.row();
    }
    await ctx.reply(m[ctx.lang].chooseDate, { reply_markup: kb });
  }

  private async chooseGridDate(ctx: BotContext, pitchId: string, cityId: string): Promise<void> {
    const dates = (await this.free.bookableDates(cityId)).slice(0, SHOWN_DAYS);
    const today = dates[0] as string;
    const kb = new InlineKeyboard();
    dates.forEach((d, i) => {
      kb.text(dateLabel(ctx.lang, d, today), `cat:avd:${pitchId}:${d}`);
      if (i % 2 === 1 || i === 0) kb.row();
    });
    await ctx.reply(m[ctx.lang].chooseDate, { reply_markup: kb });
  }

  private async showGrid(ctx: BotContext, pitchId: string, date: LocalDate): Promise<void> {
    const venueId = await this.catalog.venueIdOfPitch(pitchId);
    const card = venueId ? await this.catalog.venueCard(venueId) : null;
    const pitch = card?.pitches.find((p) => p.id === pitchId);
    if (!card || !pitch) return;
    const slots = (await this.free.dayGrid(pitchId, date)).filter((s) => s.status !== 'PAST');
    const day = dateLabel(ctx.lang, date, await this.free.today(card.venue.cityId));
    if (slots.length === 0)
      return void (await showMessage(
        ctx,
        `${m[ctx.lang].gridTitle(pitch.name, day)}\n\n${m[ctx.lang].gridEmpty}`,
      ));
    const kb = new InlineKeyboard();
    slots.forEach((s, i) => {
      kb.text(
        `${ICON[s.status]} ${hh(s.hour)}`,
        s.status === 'BOOKED' ? 'bk:x' : slotCallback(pitchId, s),
      );
      if (i % 4 === 3) kb.row();
    });
    const prices = [...new Set(slots.map((s) => s.price.amount))].sort((a, b) => a - b);
    const priceLine = prices.map((p) => formatSum(p)).join(' / ');
    await showMessage(
      ctx,
      `${m[ctx.lang].gridTitle(pitch.name, day)}\n💰 ${priceLine} ${searchMessages[ctx.lang].perHour}`,
      kb,
    );
  }

  private async cityToday(ctx: BotContext): Promise<LocalDate | null> {
    const cityId = ctx.currentUser?.cityId;
    if (!cityId) {
      await ctx.reply(m[ctx.lang].noCity);
      return null;
    }
    return this.free.today(cityId);
  }
}

export function slotCallback(pitchId: string, slot: { start: Date }): string {
  return `bk:t:${pitchId}:${Math.floor(slot.start.getTime() / 1000)}`;
}

function dateLabel(lang: Language, date: LocalDate, today: LocalDate): string {
  if (date === today) return m[lang].today;
  if (date === addDays(today, 1)) return m[lang].tomorrow;
  return dayLabel(lang, date);
}
