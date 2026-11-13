import { Injectable } from '@nestjs/common';
import { addDays, Clock, PhoneNumber, zonedParts, zonedToUtc } from '@polya/shared-kernel';
import { type Composer, InlineKeyboard, Keyboard } from 'grammy';
import type { BotContext } from '../../../../platform/telegram/bot-context.js';
import {
  type BotFeature,
  FeatureOrder,
  TelegramFeature,
} from '../../../../platform/telegram/bot-feature.js';
import { sendMainMenu } from '../../../../platform/telegram/core.features.js';
import { coreMessages } from '../../../../platform/telegram/core.messages.js';
import { hasRole } from '../../../../platform/telegram/guards.js';
import { defineMessages } from '../../../../platform/telegram/i18n.js';
import { isMainMenuLabel } from '../../../../platform/telegram/main-menu.js';
import { showMessage } from '../../../../platform/telegram/ui.js';
import { CatalogQueries, type PitchContext } from '../../../catalog/index.js';
import { IdentityQueries } from '../../../identity/index.js';
import { AvailabilityService } from '../../../scheduling/index.js';
import { BookingQueries } from '../../application/booking.queries.js';
import { BookingService } from '../../application/booking.service.js';
import type { Booking } from '../../domain/booking.js';
import { bookingMessages, formatSum } from './booking.messages.js';
import { actorOf, BookingFlowBotFeature } from './booking-flow.bot.js';
import { formatRange, formatTime } from './booking-format.js';
import { STATUS_ICON } from './my-bookings.bot.js';

const ID = '([0-9a-f]{24})';
const AWAIT_GUEST = 'booking.guest';
const AWAIT_CANCEL = 'booking.ownerCancel';

const m = defineMessages(
  {
    pendingTitle: "⏳ Javob kutayotgan so'rovlar:",
    pendingEmpty: "Javob kutayotgan so'rov yo'q.",
    todayTitle: (day: string) => `📋 Jadval — ${day}`,
    todayEmpty: "Bugun bandlov yo'q.",
    btnNoShow: (name: string) => `🚫 Kelmadi: ${name}`,
    noShowDone: '🚫 Belgilandi: kelmadi.',
    chooseDate: '🗓 Qaysi kun?',
    gridTitle: (pitch: string, day: string) =>
      `🗓 ${pitch} · ${day}\n🟢 bo'sh · 🟡 so'rov · 🔵 bandlov · ⛔️ blok\nBo'sh vaqtni bosing — qo'lda bandlov yoki blok.`,
    slotActions: (when: string) => `${when} — nima qilamiz?`,
    btnManual: "➕ Qo'lda bandlov",
    btnBlock: '🚫 Bloklash',
    chooseHours: 'Necha soat?',
    askGuest: 'Mijoz ismi va (ixtiyoriy) telefonini yozing, masalan: «Sardor 901234567»',
    manualDone: (when: string) => `✅ Qo'lda bandlov saqlandi: ${when}`,
    blockDone: (when: string) => `⛔️ Vaqt yopildi: ${when}`,
    blockView: (when: string, reason: string) => `⛔️ Blok: ${when}${reason ? `\n${reason}` : ''}`,
    btnUnblock: '♻️ Blokni olib tashlash',
    unblocked: '♻️ Blok olib tashlandi.',
    bookingView: (p: {
      when: string;
      name: string;
      phone: string;
      price: string;
      status: string;
    }) => `🕒 ${p.when}\n👤 ${p.name} · 📱 ${p.phone}\n💰 ${p.price} so'm\n📌 ${p.status}`,
    btnOwnerCancel: '❌ Bekor qilish (sabab bilan)',
    askCancelReason: "Bekor qilish sababini yozing (o'yinchiga yuboriladi):",
    ownerCancelled: "❌ Bandlov bekor qilindi, o'yinchiga xabar yuborildi.",
    slotTaken: 'Bu vaqt band — boshqa vaqt tanlang.',
    invalidPhone: "Telefon raqami noto'g'ri. Qayta yozing:",
    failed: "Amalni bajarib bo'lmadi (vaqt band yoki ish vaqtidan tashqarida).",
    cancelledByOwnerToPlayer: (venue: string, when: string, reason: string) =>
      `❌ ${venue}, ${when} — bandlovingizni egasi bekor qildi.\nSabab: ${reason}`,
  },
  {
    pendingTitle: '⏳ Запросы, ожидающие ответа:',
    pendingEmpty: 'Нет запросов, ожидающих ответа.',
    todayTitle: (day) => `📋 Расписание — ${day}`,
    todayEmpty: 'Сегодня броней нет.',
    btnNoShow: (name) => `🚫 Не пришёл: ${name}`,
    noShowDone: '🚫 Отмечено: не пришёл.',
    chooseDate: '🗓 Какой день?',
    gridTitle: (pitch, day) =>
      `🗓 ${pitch} · ${day}\n🟢 свободно · 🟡 запрос · 🔵 бронь · ⛔️ блок\nНажмите свободное время — ручная бронь или блок.`,
    slotActions: (when) => `${when} — что делаем?`,
    btnManual: '➕ Ручная бронь',
    btnBlock: '🚫 Заблокировать',
    chooseHours: 'Сколько часов?',
    askGuest: 'Напишите имя клиента и (необязательно) телефон, например: «Сардор 901234567»',
    manualDone: (when) => `✅ Ручная бронь сохранена: ${when}`,
    blockDone: (when) => `⛔️ Время закрыто: ${when}`,
    blockView: (when, reason) => `⛔️ Блок: ${when}${reason ? `\n${reason}` : ''}`,
    btnUnblock: '♻️ Снять блок',
    unblocked: '♻️ Блок снят.',
    bookingView: (p) =>
      `🕒 ${p.when}\n👤 ${p.name} · 📱 ${p.phone}\n💰 ${p.price} сум\n📌 ${p.status}`,
    btnOwnerCancel: '❌ Отменить (с причиной)',
    askCancelReason: 'Напишите причину отмены (будет отправлена игроку):',
    ownerCancelled: '❌ Бронь отменена, игрок уведомлён.',
    slotTaken: 'Это время занято — выберите другое.',
    invalidPhone: 'Неверный номер телефона. Напишите ещё раз:',
    failed: 'Не удалось выполнить (время занято или вне часов работы).',
    cancelledByOwnerToPlayer: (venue, when, reason) =>
      `❌ ${venue}, ${when} — владелец отменил вашу бронь.\nПричина: ${reason}`,
  },
);

/** TZ BK-6…BK-9, BK-13: Owner'ning bandlovlarni boshqarishi. */
@Injectable()
@TelegramFeature(FeatureOrder.MODULE + 15)
export class OwnerBookingsBotFeature implements BotFeature {
  constructor(
    private readonly bookings: BookingService,
    private readonly queries: BookingQueries,
    private readonly catalog: CatalogQueries,
    private readonly availability: AvailabilityService,
    private readonly identity: IdentityQueries,
    private readonly flow: BookingFlowBotFeature,
    private readonly clock: Clock,
  ) {}

  register(bot: Composer<BotContext>): void {
    // TZ 3: Staff ham bandlovlarni boshqaradi (resurs darajasida tekshiriladi)
    const owner = bot.filter(
      (ctx) => hasRole(ctx, 'OWNER') || hasRole(ctx, 'STAFF') || hasRole(ctx, 'ADMIN'),
    );

    owner.callbackQuery('bk:own:pending', (ctx) => this.ack(ctx, () => this.pending(ctx)));
    owner.callbackQuery('bk:own:today', (ctx) => this.ack(ctx, () => this.today(ctx)));
    owner.callbackQuery(new RegExp(`^bk:ns:${ID}$`), (ctx) =>
      this.ack(ctx, async () => {
        const r = await this.bookings.markNoShow(actorOf(ctx), ctx.match[1] as string);
        await ctx.reply(r.ok ? m[ctx.lang].noShowDone : m[ctx.lang].failed);
      }),
    );

    owner.callbackQuery(new RegExp(`^bk:og:${ID}$`), (ctx) =>
      this.ack(ctx, () => this.chooseDate(ctx, ctx.match[1] as string)),
    );
    owner.callbackQuery(new RegExp(`^bk:ogd:${ID}:(\\d{4}-\\d{2}-\\d{2})$`), (ctx) =>
      this.ack(ctx, () => this.grid(ctx, ctx.match[1] as string, ctx.match[2] as string)),
    );
    owner.callbackQuery(new RegExp(`^bk:os:${ID}:(\\d+)$`), (ctx) =>
      this.ack(ctx, async () => {
        const [pitchId, sec] = [ctx.match[1] as string, ctx.match[2] as string];
        const c = await this.context(ctx, pitchId);
        if (!c) return;
        await ctx.reply(
          m[ctx.lang].slotActions(
            `${c.pitchName}, ${formatTime(new Date(Number(sec) * 1000), c.timeZone)}`,
          ),
          {
            reply_markup: new InlineKeyboard()
              .text(m[ctx.lang].btnManual, `bk:om:${pitchId}:${sec}`)
              .text(m[ctx.lang].btnBlock, `bk:ob:${pitchId}:${sec}`),
          },
        );
      }),
    );
    for (const kind of ['om', 'ob'] as const) {
      owner.callbackQuery(new RegExp(`^bk:${kind}:${ID}:(\\d+)$`), (ctx) =>
        this.ack(ctx, async () => {
          const [pitchId, sec] = [ctx.match[1] as string, ctx.match[2] as string];
          const kb = new InlineKeyboard();
          for (let h = 1; h <= 4; h++) kb.text(`${h}`, `bk:${kind}d:${pitchId}:${sec}:${h}`);
          await showMessage(ctx, m[ctx.lang].chooseHours, kb);
        }),
      );
    }
    owner.callbackQuery(new RegExp(`^bk:omd:${ID}:(\\d+):([1-4])$`), (ctx) =>
      this.ack(ctx, async () => {
        ctx.session.awaiting = {
          kind: AWAIT_GUEST,
          data: { pitchId: ctx.match[1], sec: Number(ctx.match[2]), hours: Number(ctx.match[3]) },
        };
        await ctx.reply(m[ctx.lang].askGuest, {
          reply_markup: new Keyboard().text(coreMessages[ctx.lang].cancel).resized().oneTime(),
        });
      }),
    );
    owner.callbackQuery(new RegExp(`^bk:obd:${ID}:(\\d+):([1-4])$`), (ctx) =>
      this.ack(ctx, async () => {
        const [pitchId, sec, hours] = [
          ctx.match[1] as string,
          Number(ctx.match[2]),
          Number(ctx.match[3]),
        ];
        const r = await this.bookings.createBlock(actorOf(ctx), {
          pitchId,
          start: new Date(sec * 1000),
          hours,
          reason: null,
        });
        if (!r.ok)
          return void (await ctx.reply(
            r.error === 'SLOT_TAKEN' ? m[ctx.lang].slotTaken : m[ctx.lang].failed,
          ));
        const c = await this.context(ctx, pitchId);
        if (c)
          await showMessage(
            ctx,
            m[ctx.lang].blockDone(formatRange(r.value.block.range, c.timeZone, ctx.lang)),
          );
        await this.notifyTaken(r.value.rejected, c);
      }),
    );
    owner.callbackQuery(new RegExp(`^bk:obv:${ID}$`), (ctx) =>
      this.ack(ctx, async () => {
        await showMessage(
          ctx,
          '⛔️',
          new InlineKeyboard().text(m[ctx.lang].btnUnblock, `bk:obr:${ctx.match[1]}`),
        );
      }),
    );
    owner.callbackQuery(new RegExp(`^bk:obr:${ID}$`), (ctx) =>
      this.ack(ctx, async () => {
        const r = await this.bookings.removeBlock(actorOf(ctx), ctx.match[1] as string);
        await showMessage(ctx, r.ok ? m[ctx.lang].unblocked : m[ctx.lang].failed);
      }),
    );
    owner.callbackQuery(new RegExp(`^bk:ov:${ID}$`), (ctx) =>
      this.ack(ctx, () => this.bookingView(ctx, ctx.match[1] as string)),
    );
    owner.callbackQuery(new RegExp(`^bk:oc:${ID}$`), (ctx) =>
      this.ack(ctx, async () => {
        ctx.session.awaiting = { kind: AWAIT_CANCEL, data: { bookingId: ctx.match[1] } };
        await ctx.reply(m[ctx.lang].askCancelReason, {
          reply_markup: new Keyboard().text(coreMessages[ctx.lang].cancel).resized().oneTime(),
        });
      }),
    );

    owner.on('message:text', async (ctx, next) => {
      const step = ctx.session.awaiting;
      if (!step || isMainMenuLabel(ctx.message.text)) return next();
      if (step.kind === AWAIT_GUEST) return this.onGuest(ctx, step.data ?? {}, ctx.message.text);
      if (step.kind === AWAIT_CANCEL)
        return this.onCancelReason(ctx, step.data?.bookingId as string, ctx.message.text);
      return next();
    });
  }

  private async pending(ctx: BotContext): Promise<void> {
    const t = m[ctx.lang];
    const venues = await this.catalog.managedVenues(ctx.currentUser?.id ?? '');
    const pending = await this.queries.pendingForVenues(venues.map((v) => v.id));
    if (pending.length === 0) return void (await showMessage(ctx, t.pendingEmpty));
    const contexts = await this.catalog.pitchContexts(pending.map((b) => b.pitchId));
    const kb = new InlineKeyboard();
    const lines: string[] = [];
    for (const [i, b] of pending.entries()) {
      const c = contexts.get(b.pitchId);
      const p = await this.person(b);
      lines.push(
        `${i + 1}. ${c?.venue.name ?? ''} · ${c ? formatRange(b.range, c.timeZone, ctx.lang) : ''}\n   👤 ${p.name} · 📱 ${p.phone}`,
      );
      kb.text(`✅ ${i + 1}`, `bk:c:${b.id}`)
        .text(`❌ ${i + 1}`, `bk:r:${b.id}`)
        .row();
    }
    await showMessage(ctx, `${t.pendingTitle}\n\n${lines.join('\n\n')}`, kb);
  }

  /** TZ BK-13 */
  private async today(ctx: BotContext): Promise<void> {
    const t = m[ctx.lang];
    const venues = await this.catalog.managedVenues(ctx.currentUser?.id ?? '');
    const tz = venues[0] ? await this.catalog.timeZoneOf(venues[0].cityId) : 'Asia/Tashkent';
    const today = zonedParts(this.clock.now(), tz).date;
    const from = zonedToUtc(today, 0, tz);
    const to = zonedToUtc(today, 30, tz); // tungi soatlar bilan (EC-S1)
    const items = await this.queries.venueSchedule(
      venues.map((v) => v.id),
      from,
      to,
    );
    if (items.length === 0)
      return void (await showMessage(ctx, `${t.todayTitle(today)}\n\n${t.todayEmpty}`));
    const contexts = await this.catalog.pitchContexts(items.map((b) => b.pitchId));
    const kb = new InlineKeyboard();
    const lines: string[] = [];
    for (const b of items) {
      const c = contexts.get(b.pitchId);
      const p = await this.person(b);
      lines.push(
        `${STATUS_ICON[b.status]} ${c ? formatRange(b.range, c.timeZone, ctx.lang).split(' · ')[1] : ''} · ${c?.pitchName ?? ''} · ${p.name} · ${p.phone}`,
      );
      if (b.status === 'COMPLETED' && b.source === 'BOT')
        kb.text(t.btnNoShow(p.name), `bk:ns:${b.id}`).row();
      else kb.text(`${STATUS_ICON[b.status]} ${p.name}`, `bk:ov:${b.id}`).row();
    }
    await showMessage(ctx, `${t.todayTitle(today)}\n\n${lines.join('\n')}`, kb);
  }

  private async chooseDate(ctx: BotContext, pitchId: string): Promise<void> {
    const c = await this.context(ctx, pitchId);
    if (!c) return;
    const today = zonedParts(this.clock.now(), c.timeZone).date;
    const kb = new InlineKeyboard();
    for (let i = 0; i < 7; i++) {
      const d = addDays(today, i);
      kb.text(d.slice(5).split('-').reverse().join('.'), `bk:ogd:${pitchId}:${d}`);
      if (i % 4 === 3) kb.row();
    }
    await showMessage(ctx, m[ctx.lang].chooseDate, kb);
  }

  private async grid(ctx: BotContext, pitchId: string, date: string): Promise<void> {
    const c = await this.context(ctx, pitchId);
    if (!c) return;
    const slots = (await this.availability.dayView(pitchId, date, c.timeZone)).filter(
      (s) => s.status !== 'PAST',
    );
    const from = slots[0]?.start ?? new Date();
    const to = slots.at(-1)?.end ?? new Date();
    const [bookings, blocks] = await Promise.all([
      this.queries.venueSchedule([c.venue.id], from, to),
      this.queries.blocks([pitchId], from, to),
    ]);
    const kb = new InlineKeyboard();
    slots.forEach((s, i) => {
      const hh = `${String(s.hour % 24).padStart(2, '0')}:00`;
      const covers = (r: { start: Date; end: Date }) => r.start <= s.start && s.start < r.end;
      const booking = bookings.find(
        (b) => b.pitchId === pitchId && b.status === 'CONFIRMED' && covers(b.range),
      );
      const block = blocks.find((b) => covers(b.range));
      if (booking) kb.text(`🔵 ${hh}`, `bk:ov:${booking.id}`);
      else if (block) kb.text(`⛔️ ${hh}`, `bk:obv:${block.id}`);
      else if (s.status === 'REQUESTED') kb.text(`🟡 ${hh}`, 'bk:own:pending');
      else kb.text(`🟢 ${hh}`, `bk:os:${pitchId}:${Math.floor(s.start.getTime() / 1000)}`);
      if (i % 4 === 3) kb.row();
    });
    await showMessage(
      ctx,
      m[ctx.lang].gridTitle(c.pitchName, date.slice(5).split('-').reverse().join('.')),
      kb,
    );
  }

  private async bookingView(ctx: BotContext, bookingId: string): Promise<void> {
    const b = await this.queries.byId(bookingId);
    const c = b ? await this.context(ctx, b.pitchId) : null;
    if (!b || !c) return;
    const p = await this.person(b);
    const kb = new InlineKeyboard();
    if (b.status === 'CONFIRMED' && b.range.start > this.clock.now())
      kb.text(m[ctx.lang].btnOwnerCancel, `bk:oc:${b.id}`);
    await showMessage(
      ctx,
      m[ctx.lang].bookingView({
        when: formatRange(b.range, c.timeZone, ctx.lang),
        name: p.name,
        phone: p.phone,
        price: formatSum(b.price.amount),
        status: `${STATUS_ICON[b.status]} ${b.code}`,
      }),
      kb,
    );
  }

  private async onGuest(
    ctx: BotContext,
    data: Record<string, unknown>,
    text: string,
  ): Promise<void> {
    const t = m[ctx.lang];
    const match = text.trim().match(/^(.+?)(?:\s+(\+?[\d\s()-]{9,}))?$/);
    const name = match?.[1]?.trim() ?? text.trim();
    const phone = match?.[2]?.replace(/\D/g, '') ?? null;
    const r = await this.bookings.createManual(actorOf(ctx), {
      pitchId: data.pitchId as string,
      start: new Date(Number(data.sec) * 1000),
      hours: Number(data.hours),
      guestName: name,
      guestPhone: phone ? (phone.length === 9 ? `998${phone}` : phone) : null,
    });
    if (!r.ok) {
      if (r.error === 'INVALID_PHONE') return void (await ctx.reply(t.invalidPhone));
      ctx.session.awaiting = undefined;
      return void (await sendMainMenu(ctx, r.error === 'SLOT_TAKEN' ? t.slotTaken : t.failed));
    }
    ctx.session.awaiting = undefined;
    const { booking, rejected, context } = r.value;
    await sendMainMenu(ctx, t.manualDone(formatRange(booking.range, context.timeZone, ctx.lang)));
    await this.notifyTaken(rejected, context);
  }

  /** TZ BK-6 */
  private async onCancelReason(ctx: BotContext, bookingId: string, reason: string): Promise<void> {
    ctx.session.awaiting = undefined;
    const r = await this.bookings.cancelByOwner(actorOf(ctx), bookingId, reason);
    if (!r.ok) return void (await sendMainMenu(ctx, m[ctx.lang].failed));
    await sendMainMenu(ctx, m[ctx.lang].ownerCancelled);
    const c = await this.catalog.pitchContext(r.value.pitchId);
    if (c) {
      await this.flow.notifyPlayer(r.value, (lang) =>
        m[lang].cancelledByOwnerToPlayer(
          c.venue.name,
          formatRange(r.value.range, c.timeZone, lang),
          reason.trim(),
        ),
      );
    }
  }

  private async notifyTaken(rejected: Booking[], c: PitchContext | null): Promise<void> {
    if (!c) return;
    for (const b of rejected) {
      await this.flow.notifyPlayer(b, (lang) =>
        bookingMessages[lang].takenToPlayer({
          venue: c.venue.name,
          when: formatRange(b.range, c.timeZone, lang),
        }),
      );
    }
  }

  private async person(b: Booking): Promise<{ name: string; phone: string }> {
    if (!b.playerId) return { name: b.guest?.name ?? '—', phone: b.guest?.phone?.format() ?? '—' };
    const c = await this.identity.contactOf(b.playerId);
    return {
      name: c?.displayName ?? '—',
      phone: c?.phone ? PhoneNumber.parse(c.phone).format() : '—',
    };
  }

  /** Faqat o'z stadioni (TZ EC-D1) */
  private async context(ctx: BotContext, pitchId: string): Promise<PitchContext | null> {
    const c = await this.catalog.pitchContext(pitchId);
    const me = ctx.currentUser?.id ?? '';
    const allowed =
      c && (c.venue.ownerId === me || c.venue.staffIds.includes(me) || hasRole(ctx, 'ADMIN'));
    if (!c || !allowed) return null;
    return c;
  }

  private async ack(ctx: BotContext, action: () => Promise<void>): Promise<void> {
    await ctx.answerCallbackQuery().catch(() => undefined);
    await action();
  }
}
