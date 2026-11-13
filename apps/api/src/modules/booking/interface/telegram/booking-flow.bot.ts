import { Injectable } from '@nestjs/common';
import { type Language, PhoneNumber } from '@polya/shared-kernel';
import { type Composer, InlineKeyboard } from 'grammy';
import type { BotContext } from '../../../../platform/telegram/bot-context.js';
import {
  type BotFeature,
  FeatureOrder,
  TelegramFeature,
} from '../../../../platform/telegram/bot-feature.js';
import { TelegramMessenger } from '../../../../platform/telegram/telegram-messenger.js';
import { showMessage } from '../../../../platform/telegram/ui.js';
import { CatalogQueries, type PitchContext } from '../../../catalog/index.js';
import { IdentityQueries, PhoneGate } from '../../../identity/index.js';
import { AvailabilityService } from '../../../scheduling/index.js';
import { type BookingActor, BookingService } from '../../application/booking.service.js';
import type { Booking } from '../../domain/booking.js';
import { isUnreliable } from '../../domain/reputation.js';
import { bookingErrors, bookingMessages, formatSum, ownerText } from './booking.messages.js';
import { formatRange, formatTime } from './booking-format.js';

const ID = '([0-9a-f]{24})';
const SUBMIT = 'booking.submit';
const MAX_HOURS = 4;

export const actorOf = (ctx: BotContext): BookingActor => ({
  userId: ctx.currentUser?.id ?? '',
  roles: ctx.currentUser?.roles ?? [],
  phone: ctx.currentUser?.phone ?? null,
});

/**
 * TZ BK-1…BK-4, Q1: o'yinchi so'rovi (slot → davomiylik → xulosa → bandlash) va Owner qarori.
 * Slot tugmalari (`bk:t:`) Catalog'ning bo'sh vaqtlar to'ridan keladi.
 */
@Injectable()
@TelegramFeature(FeatureOrder.MODULE + 15)
export class BookingFlowBotFeature implements BotFeature {
  constructor(
    private readonly bookings: BookingService,
    private readonly catalog: CatalogQueries,
    private readonly availability: AvailabilityService,
    private readonly identity: IdentityQueries,
    private readonly messenger: TelegramMessenger,
    private readonly phoneGate: PhoneGate,
  ) {
    // TZ 5.2, 6-qadam: telefon so'ralgan bo'lsa, raqam kelgach bandlash davom etadi
    phoneGate.onVerified(SUBMIT, (ctx, data) =>
      this.submit(ctx, data.pitchId as string, Number(data.sec), Number(data.hours)),
    );
  }

  register(bot: Composer<BotContext>): void {
    bot.callbackQuery(new RegExp(`^bk:t:${ID}:(\\d+)$`), async (ctx) => {
      await ctx.answerCallbackQuery();
      await this.chooseDuration(ctx, ctx.match[1] as string, Number(ctx.match[2]));
    });

    bot.callbackQuery(new RegExp(`^bk:d:${ID}:(\\d+):([1-4])$`), async (ctx) => {
      await ctx.answerCallbackQuery();
      await this.summary(ctx, ctx.match[1] as string, Number(ctx.match[2]), Number(ctx.match[3]));
    });

    bot.callbackQuery(new RegExp(`^bk:ok:${ID}:(\\d+):([1-4])$`), async (ctx) => {
      await ctx.answerCallbackQuery();
      const [pitchId, sec, hours] = [
        ctx.match[1] as string,
        Number(ctx.match[2]),
        Number(ctx.match[3]),
      ];
      if (!(await this.phoneGate.require(ctx, { kind: SUBMIT, data: { pitchId, sec, hours } })))
        return;
      await this.submit(ctx, pitchId, sec, hours);
    });

    bot.callbackQuery(new RegExp(`^bk:c:${ID}$`), (ctx) =>
      this.decide(ctx, ctx.match[1] as string, 'confirm'),
    );
    bot.callbackQuery(new RegExp(`^bk:r:${ID}$`), (ctx) =>
      this.decide(ctx, ctx.match[1] as string, 'reject'),
    );
  }

  private async chooseDuration(ctx: BotContext, pitchId: string, sec: number): Promise<void> {
    const m = bookingMessages[ctx.lang];
    const context = await this.catalog.pitchContext(pitchId);
    if (!context) return;
    const start = new Date(sec * 1000);
    const kb = new InlineKeyboard();
    let any = false;
    for (let h = 1; h <= MAX_HOURS; h++) {
      const q = await this.availability.quote({
        pitchId,
        start,
        hours: h,
        timeZone: context.timeZone,
      });
      if (!q.ok) {
        if (h === 1) return void (await ctx.reply(bookingErrors[ctx.lang][q.error]));
        break;
      }
      any = true;
      kb.text(
        `${m.hours(h)} · ${formatSum(q.quote.total.amount)}`,
        `bk:d:${pitchId}:${sec}:${h}`,
      ).row();
    }
    if (!any) return void (await ctx.reply(m.noDurations));
    await ctx.reply(
      m.chooseDuration(`${context.venue.name}, ${formatTime(start, context.timeZone)}`),
      { reply_markup: kb },
    );
  }

  private async summary(
    ctx: BotContext,
    pitchId: string,
    sec: number,
    hours: number,
  ): Promise<void> {
    const m = bookingMessages[ctx.lang];
    const context = await this.catalog.pitchContext(pitchId);
    if (!context) return;
    const q = await this.availability.quote({
      pitchId,
      start: new Date(sec * 1000),
      hours,
      timeZone: context.timeZone,
    });
    if (!q.ok) return void (await ctx.reply(bookingErrors[ctx.lang][q.error]));
    const { quote } = q;
    const prices = quote.breakdown.map((b) => b.price.amount);
    let text = m.summary({
      venue: context.venue.name,
      pitch: context.pitchName,
      landmark: context.venue.landmarkText,
      when: formatRange(quote.range, context.timeZone, ctx.lang),
      total: formatSum(quote.total.amount),
    });
    // TZ EC-S5: narx zonalari kesishsa — taqsimot
    if (new Set(prices).size > 1) text += m.breakdown(prices.map(formatSum).join(' + '));
    if (quote.pendingRequests > 0) text += m.queueWarning(quote.pendingRequests);
    text += m.consent;
    await showMessage(
      ctx,
      text,
      new InlineKeyboard()
        .text(m.btnConfirm, `bk:ok:${pitchId}:${sec}:${hours}`)
        .row()
        .text(m.btnBack, `bk:t:${pitchId}:${sec}`),
    );
  }

  private async submit(
    ctx: BotContext,
    pitchId: string,
    sec: number,
    hours: number,
  ): Promise<void> {
    const m = bookingMessages[ctx.lang];
    const result = await this.bookings.request(actorOf(ctx), {
      pitchId,
      start: new Date(sec * 1000),
      hours,
    });
    if (!result.ok) return void (await ctx.reply(bookingErrors[ctx.lang][result.error]));
    const { booking, context, queueAhead } = result.value;
    let text = m.requested({
      code: booking.code,
      phones: context.venue.phones.map((p) => p.format()).join(', '),
      ttl: formatTime(booking.expiresAt ?? booking.range.start, context.timeZone),
    });
    if (queueAhead.length > 0) text += m.requestedInQueue(queueAhead.length + 1);
    await ctx.reply(text);
    await this.notifyOwner(booking, [...queueAhead, booking], context);
  }

  /** TZ BK-3, BK-3b: Owner'ga so'rov — navbat bo'lsa, hammasi birga, har biriga tugma bilan */
  private async notifyOwner(
    booking: Booking,
    queue: Booking[],
    context: PitchContext,
  ): Promise<void> {
    // TZ 4.6: Owner + barcha Staff
    const managers = (
      await Promise.all(
        [context.venue.ownerId, ...context.venue.staffIds].map((id) => this.identity.contactOf(id)),
      )
    ).filter((c) => c !== null);
    if (managers.length === 0) return;
    let text = ownerText.newRequest({
      venue: context.venue.name,
      pitch: context.pitchName,
      when: formatRange(booking.range, context.timeZone, 'uz'),
      total: formatSum(booking.price.amount),
    });
    const kb = new InlineKeyboard();
    const players = await Promise.all(queue.map((b) => this.playerLabel(b)));
    if (queue.length > 1) {
      text += ownerText.queueHeader(queue.length);
      queue.forEach((b, i) => {
        const p = players[i] as { name: string; phone: string };
        text += `\n${ownerText.queueLine(i + 1, p.name, p.phone, formatTime(b.createdAt, context.timeZone))}`;
        kb.text(`✅ ${i + 1}. ${p.name}`, `bk:c:${b.id}`)
          .text('❌', `bk:r:${b.id}`)
          .row();
      });
    } else {
      const p = players[0] as { name: string; phone: string };
      text += ownerText.single(p.name, p.phone);
      text += `
${await this.reputationLine(booking)}`;
      kb.text('✅ Tasdiqlash', `bk:c:${booking.id}`).text('❌ Rad etish', `bk:r:${booking.id}`);
    }
    for (const m of managers) await this.messenger.send(m.telegramId, text, kb);
  }

  private async decide(
    ctx: BotContext,
    bookingId: string,
    action: 'confirm' | 'reject',
  ): Promise<void> {
    const actor = actorOf(ctx);
    if (action === 'confirm') {
      const result = await this.bookings.confirm(actor, bookingId);
      if (!result.ok)
        return void (await ctx.answerCallbackQuery({
          text: decisionError(result.error),
          show_alert: true,
        }));
      await ctx.answerCallbackQuery();
      const { booking, rejected, context } = result.value;
      const player = await this.playerLabel(booking);
      await this.appendToMessage(ctx, ownerText.confirmed(player.name, ctx.from?.first_name ?? ''));
      await this.notifyPlayer(booking, (lang) =>
        bookingMessages[lang].confirmedToPlayer({
          code: booking.code,
          venue: context.venue.name,
          when: formatRange(booking.range, context.timeZone, lang),
        }),
      );
      for (const r of rejected) {
        await this.notifyPlayer(r, (lang) =>
          bookingMessages[lang].takenToPlayer({
            venue: context.venue.name,
            when: formatRange(r.range, context.timeZone, lang),
          }),
        );
      }
      return;
    }
    const result = await this.bookings.reject(actor, bookingId, null);
    if (!result.ok)
      return void (await ctx.answerCallbackQuery({
        text: decisionError(result.error),
        show_alert: true,
      }));
    await ctx.answerCallbackQuery();
    const booking = result.value;
    const context = await this.catalog.pitchContext(booking.pitchId);
    await this.appendToMessage(ctx, ownerText.rejected(ctx.from?.first_name ?? ''));
    if (context) {
      await this.notifyPlayer(booking, (lang) =>
        bookingMessages[lang].rejectedToPlayer({
          venue: context.venue.name,
          when: formatRange(booking.range, context.timeZone, lang),
          note: booking.note,
        }),
      );
    }
  }

  /** TZ 4.8: Owner so'rovda o'yinchi reputatsiyasini ko'radi */
  private async reputationLine(b: Booking): Promise<string> {
    if (!b.playerId) return '';
    const r = await this.bookings.reputationOf(b.playerId);
    if (r.completed + r.noShow + r.lateCancel === 0) return ownerText.newPlayer;
    return ownerText.reputation({ ...r, unreliable: isUnreliable(r) });
  }

  async notifyPlayer(booking: Booking, text: (lang: Language) => string): Promise<void> {
    if (!booking.playerId) return;
    const player = await this.identity.contactOf(booking.playerId);
    if (player && !player.botBlocked)
      await this.messenger.send(player.telegramId, text(player.language));
  }

  private async playerLabel(b: Booking): Promise<{ name: string; phone: string }> {
    if (!b.playerId) return { name: b.guest?.name ?? '—', phone: b.guest?.phone?.format() ?? '—' };
    const c = await this.identity.contactOf(b.playerId);
    return {
      name: c?.displayName ?? `#${c?.telegramId ?? '?'}`,
      phone: c?.phone ? PhoneNumber.parse(c.phone).format() : '—',
    };
  }

  private async appendToMessage(ctx: BotContext, suffix: string): Promise<void> {
    const text = ctx.callbackQuery?.message?.text ?? '';
    await ctx.editMessageText(`${text}${suffix}`).catch(() => undefined);
  }
}

function decisionError(code: string): string {
  switch (code) {
    case 'EXPIRED':
      return ownerText.expired;
    case 'SLOT_TAKEN':
      return ownerText.slotTaken;
    case 'FORBIDDEN':
      return ownerText.forbidden;
    default:
      return ownerText.alreadyHandled;
  }
}
