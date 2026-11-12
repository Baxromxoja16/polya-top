import { Injectable } from '@nestjs/common';
import { Clock } from '@polya/shared-kernel';
import { type Composer, InlineKeyboard } from 'grammy';
import type { BotContext } from '../../../../platform/telegram/bot-context.js';
import {
  type BotFeature,
  FeatureOrder,
  TelegramFeature,
} from '../../../../platform/telegram/bot-feature.js';
import { defineMessages } from '../../../../platform/telegram/i18n.js';
import { menuLabels } from '../../../../platform/telegram/main-menu.js';
import { TelegramMessenger } from '../../../../platform/telegram/telegram-messenger.js';
import { showMessage } from '../../../../platform/telegram/ui.js';
import { CatalogQueries, type PitchContext } from '../../../catalog/index.js';
import { IdentityQueries } from '../../../identity/index.js';
import { BookingQueries } from '../../application/booking.queries.js';
import { BookingService } from '../../application/booking.service.js';
import { type Booking, type BookingStatus, FREE_CANCEL_HOURS } from '../../domain/booking.js';
import { formatSum } from './booking.messages.js';
import { actorOf } from './booking-flow.bot.js';
import { formatRange } from './booking-format.js';

const ID = '([0-9a-f]{24})';
const WEEK_MS = 7 * 86_400_000;

export const STATUS_ICON: Record<BookingStatus, string> = {
  PENDING: '🟡',
  CONFIRMED: '🟢',
  COMPLETED: '✅',
  NO_SHOW: '🚫',
  REJECTED: '❌',
  EXPIRED: '⌛️',
  CANCELLED_BY_PLAYER: '↩️',
  CANCELLED_BY_OWNER: '❌',
};

const m = defineMessages(
  {
    upcomingTitle: '📅 Kelgusi bandlovlar:',
    empty: "Sizda faol bandlov yo'q. «⚽ Bo'sh maydon topish» orqali bandlang.",
    btnHistory: '🕘 Tarix',
    historyTitle: '🕘 Oxirgi bandlovlar:',
    historyEmpty: "Tarix bo'sh.",
    status: (s: string) =>
      ({
        PENDING: 'egasi tasdiqlashi kutilmoqda',
        CONFIRMED: 'tasdiqlangan',
        COMPLETED: "o'ynaldi",
        NO_SHOW: 'kelmadi deb belgilangan',
        REJECTED: 'rad etilgan',
        EXPIRED: "muddati o'tgan",
        CANCELLED_BY_PLAYER: 'siz bekor qildingiz',
        CANCELLED_BY_OWNER: 'egasi bekor qildi',
      })[s] ?? s,
    details: (p: {
      code: string;
      venue: string;
      pitch: string;
      when: string;
      price: string;
      status: string;
      phones: string;
    }) =>
      `${p.code}\n🏟 ${p.venue} · ${p.pitch}\n🕒 ${p.when}\n💰 ${p.price} so'm\n📌 ${p.status}\n📞 ${p.phones}`,
    btnCancel: '❌ Bekor qilish',
    btnAgain: '🔁 Yana bandlash (keyingi hafta)',
    btnBack: '⬅️ Orqaga',
    cancelConfirm: 'Bandlovni bekor qilasizmi?',
    lateWarning: `\n\n⚠️ O'yinga ${FREE_CANCEL_HOURS} soatdan kam qoldi — kech bekor qilish reytingingizga ta'sir qiladi.`,
    btnYesCancel: '✅ Ha, bekor qilish',
    cancelled: '↩️ Bandlov bekor qilindi.',
    cannotCancel: "Bu bandlovni endi bekor qilib bo'lmaydi.",
    again: (when: string) => `🔁 ${when} — davom etamizmi?`,
    btnContinue: '⏱ Davom etish',
  },
  {
    upcomingTitle: '📅 Предстоящие брони:',
    empty: 'Активных броней нет. Забронируйте через «⚽ Найти свободное поле».',
    btnHistory: '🕘 История',
    historyTitle: '🕘 Последние брони:',
    historyEmpty: 'История пуста.',
    status: (s) =>
      ({
        PENDING: 'ждёт подтверждения владельца',
        CONFIRMED: 'подтверждена',
        COMPLETED: 'сыграно',
        NO_SHOW: 'отмечена неявка',
        REJECTED: 'отклонена',
        EXPIRED: 'истекла',
        CANCELLED_BY_PLAYER: 'вы отменили',
        CANCELLED_BY_OWNER: 'владелец отменил',
      })[s] ?? s,
    details: (p) =>
      `${p.code}\n🏟 ${p.venue} · ${p.pitch}\n🕒 ${p.when}\n💰 ${p.price} сум\n📌 ${p.status}\n📞 ${p.phones}`,
    btnCancel: '❌ Отменить',
    btnAgain: '🔁 Забронировать снова (через неделю)',
    btnBack: '⬅️ Назад',
    cancelConfirm: 'Отменить бронь?',
    lateWarning: `\n\n⚠️ До игры меньше ${FREE_CANCEL_HOURS} ч — поздняя отмена влияет на ваш рейтинг.`,
    btnYesCancel: '✅ Да, отменить',
    cancelled: '↩️ Бронь отменена.',
    cannotCancel: 'Эту бронь уже нельзя отменить.',
    again: (when) => `🔁 ${when} — продолжим?`,
    btnContinue: '⏱ Продолжить',
  },
);

/** TZ BK-12 (mening bandlovlarim), BK-5 (bekor qilish), VC-5c ("yana bandlash"). */
@Injectable()
@TelegramFeature(FeatureOrder.MODULE + 15)
export class MyBookingsBotFeature implements BotFeature {
  constructor(
    private readonly queries: BookingQueries,
    private readonly bookings: BookingService,
    private readonly catalog: CatalogQueries,
    private readonly identity: IdentityQueries,
    private readonly messenger: TelegramMessenger,
    private readonly clock: Clock,
  ) {}

  register(bot: Composer<BotContext>): void {
    bot.hears(menuLabels('bookings'), (ctx) => this.list(ctx, 'upcoming'));
    bot.callbackQuery('bk:hist', async (ctx) => {
      await ctx.answerCallbackQuery();
      await this.list(ctx, 'history');
    });
    bot.callbackQuery('bk:mine', async (ctx) => {
      await ctx.answerCallbackQuery();
      await this.list(ctx, 'upcoming');
    });

    bot.callbackQuery(new RegExp(`^bk:v:${ID}$`), async (ctx) => {
      await ctx.answerCallbackQuery();
      const found = await this.own(ctx, ctx.match[1] as string);
      if (found) await this.details(ctx, found.booking, found.context);
    });

    bot.callbackQuery(new RegExp(`^bk:pc:${ID}$`), async (ctx) => {
      await ctx.answerCallbackQuery();
      const found = await this.own(ctx, ctx.match[1] as string);
      if (!found) return;
      const t = m[ctx.lang];
      const late =
        found.booking.status === 'CONFIRMED' &&
        found.booking.range.start.getTime() - this.clock.now().getTime() <
          FREE_CANCEL_HOURS * 3_600_000;
      await showMessage(
        ctx,
        `${t.cancelConfirm}${late ? t.lateWarning : ''}`,
        new InlineKeyboard()
          .text(t.btnYesCancel, `bk:pcy:${found.booking.id}`)
          .row()
          .text(t.btnBack, `bk:v:${found.booking.id}`),
      );
    });

    bot.callbackQuery(new RegExp(`^bk:pcy:${ID}$`), async (ctx) => {
      const t = m[ctx.lang];
      const result = await this.bookings.cancelByPlayer(actorOf(ctx), ctx.match[1] as string);
      if (!result.ok)
        return void (await ctx.answerCallbackQuery({ text: t.cannotCancel, show_alert: true }));
      await ctx.answerCallbackQuery();
      await showMessage(ctx, t.cancelled);
      await this.notifyOwner(result.value);
    });

    bot.callbackQuery(new RegExp(`^bk:again:${ID}$`), async (ctx) => {
      await ctx.answerCallbackQuery();
      const found = await this.own(ctx, ctx.match[1] as string);
      if (!found) return;
      // Keyingi hafta shu kuni va vaqtida; o'tib ketgan bo'lsa — yana bir hafta
      let start = found.booking.range.start.getTime() + WEEK_MS;
      while (start <= this.clock.now().getTime()) start += WEEK_MS;
      const hours = found.booking.range.durationMinutes / 60;
      const sec = Math.floor(start / 1000);
      const when = formatRange(
        { start: new Date(start), end: new Date(start + hours * 3_600_000) } as Booking['range'],
        found.context.timeZone,
        ctx.lang,
      );
      await ctx.reply(m[ctx.lang].again(when), {
        reply_markup: new InlineKeyboard().text(
          m[ctx.lang].btnContinue,
          `bk:d:${found.booking.pitchId}:${sec}:${Math.min(4, hours)}`,
        ),
      });
    });
  }

  private async list(ctx: BotContext, kind: 'upcoming' | 'history'): Promise<void> {
    const t = m[ctx.lang];
    const userId = ctx.currentUser?.id ?? '';
    const items =
      kind === 'upcoming'
        ? await this.queries.playerUpcoming(userId)
        : await this.queries.playerHistory(userId);
    const contexts = await this.catalog.pitchContexts(items.map((b) => b.pitchId));
    const kb = new InlineKeyboard();
    const lines = items.map((b) => {
      const c = contexts.get(b.pitchId);
      const when = c ? formatRange(b.range, c.timeZone, ctx.lang) : '';
      kb.text(`${STATUS_ICON[b.status]} ${c?.venue.name ?? '—'} · ${when}`, `bk:v:${b.id}`).row();
      return `${STATUS_ICON[b.status]} ${c?.venue.name ?? '—'} · ${when} · ${t.status(b.status)}`;
    });
    if (kind === 'upcoming') kb.text(t.btnHistory, 'bk:hist');
    else kb.text(t.btnBack, 'bk:mine');
    const empty = kind === 'upcoming' ? t.empty : t.historyEmpty;
    const title = kind === 'upcoming' ? t.upcomingTitle : t.historyTitle;
    const text = items.length ? `${title}\n\n${lines.join('\n')}` : empty;
    if (ctx.callbackQuery) await showMessage(ctx, text, kb);
    else await ctx.reply(text, { reply_markup: kb });
  }

  private async details(ctx: BotContext, b: Booking, c: PitchContext): Promise<void> {
    const t = m[ctx.lang];
    const kb = new InlineKeyboard();
    if (b.isActive && b.range.start > this.clock.now()) kb.text(t.btnCancel, `bk:pc:${b.id}`).row();
    if (b.status === 'COMPLETED') kb.text('⭐', `rv:start:${b.id}`);
    if (b.source === 'BOT' && !b.isActive) kb.text(t.btnAgain, `bk:again:${b.id}`).row();
    kb.text(t.btnBack, 'bk:mine');
    await showMessage(
      ctx,
      t.details({
        code: b.code,
        venue: c.venue.name,
        pitch: c.pitchName,
        when: formatRange(b.range, c.timeZone, ctx.lang),
        price: formatSum(b.price.amount),
        status: `${STATUS_ICON[b.status]} ${t.status(b.status)}`,
        phones: c.venue.phones.map((p) => p.format()).join(', '),
      }),
      kb,
    );
  }

  /** Faqat o'z bandlovi (TZ EC-D1) */
  private async own(
    ctx: BotContext,
    bookingId: string,
  ): Promise<{ booking: Booking; context: PitchContext } | null> {
    const booking = await this.queries.byId(bookingId);
    if (!booking || booking.playerId !== ctx.currentUser?.id) return null;
    const context = await this.catalog.pitchContext(booking.pitchId);
    return context ? { booking, context } : null;
  }

  private async notifyOwner(b: Booking): Promise<void> {
    const c = await this.catalog.pitchContext(b.pitchId);
    const owner = c ? await this.identity.contactOf(c.venue.ownerId) : null;
    const player = b.playerId ? await this.identity.contactOf(b.playerId) : null;
    if (!c || !owner) return;
    const late = b.lateCancel ? ' (kech bekor qilish)' : '';
    await this.messenger.send(
      owner.telegramId,
      `↩️ ${player?.displayName ?? "O'yinchi"} bandlovni bekor qildi${late}\n🏟 ${c.venue.name} · ${c.pitchName}\n🕒 ${formatRange(b.range, c.timeZone, 'uz')}`,
    );
  }
}
