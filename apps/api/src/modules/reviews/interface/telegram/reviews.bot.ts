import { Injectable } from '@nestjs/common';
import { type Composer, InlineKeyboard, Keyboard } from 'grammy';
import type { BotContext } from '../../../../platform/telegram/bot-context.js';
import {
  type BotFeature,
  FeatureOrder,
  TelegramFeature,
} from '../../../../platform/telegram/bot-feature.js';
import { sendMainMenu } from '../../../../platform/telegram/core.features.js';
import { coreMessages } from '../../../../platform/telegram/core.messages.js';
import { isAdmin } from '../../../../platform/telegram/guards.js';
import { defineMessages } from '../../../../platform/telegram/i18n.js';
import { isMainMenuLabel } from '../../../../platform/telegram/main-menu.js';
import { TelegramMessenger } from '../../../../platform/telegram/telegram-messenger.js';
import { showMessage } from '../../../../platform/telegram/ui.js';
import { CatalogQueries } from '../../../catalog/index.js';
import { IdentityQueries } from '../../../identity/index.js';
import { ConditionService } from '../../application/condition.service.js';
import { type ReviewActor, ReviewService } from '../../application/review.service.js';
import type { Review } from '../../domain/review.js';

const ID = '([0-9a-f]{24})';
const AWAIT_TEXT = 'reviews.text';
const AWAIT_REPLY = 'reviews.reply';
const AWAIT_CONDITION = 'reviews.condition';
const PAGE = 5;

export const reviewMessages = defineMessages(
  {
    invite: (venue: string) => `⭐ «${venue}»da o'yin qanday o'tdi? Baholang:`,
    thanks: "Rahmat! Qisqa izoh qo'shasizmi? (maysa, chiroq, kiyinish xonasi, xizmat…)",
    btnSkip: "⏭ O'tkazib yuborish",
    saved: '✅ Sharhingiz saqlandi. Rahmat!',
    savedHidden: "✅ Saqlandi. Sharhda telefon/havola bor — moderatsiyadan keyin ko'rinadi.",
    notEligible: "Faqat o'zingiz o'ynagan va yakunlangan o'yinga sharh yozish mumkin.",
    ownVenue: "O'z stadioningizga sharh yozib bo'lmaydi.",
    already: "Bu o'yinga sharh allaqachon yozilgan.",
    listTitle: (venue: string) => `💬 «${venue}» haqida sharhlar:`,
    listEmpty: "Hali sharhlar yo'q.",
    ownerReply: 'Egasi',
    btnMore: '➡️ Yana',
    reported: '⚠️ Shikoyat qabul qilindi. Rahmat!',
    condition: (text: string, ago: string, owner: boolean) =>
      `🌦 So'nggi holat (${ago}${owner ? ', egasidan' : ''}): ${text}`,
    btnCondition: '🌦 Holat yozish',
    askCondition:
      "Maydon holatini qisqa yozing (masalan: «maysa ho'l», «chiroq yarim ishlayapti»):",
    conditionSaved: "✅ Rahmat! 48 soat davomida ko'rinadi.",
    conditionDenied: "Holatni faqat so'nggi 24 soatda shu yerda o'ynaganlar yoki egasi yoza oladi.",
    conditionInvalid: '3–200 belgi, telefon/havolasiz yozing:',
    hoursAgo: (h: number) => (h < 1 ? 'hozirgina' : `${h} soat oldin`),
  },
  {
    invite: (venue) => `⭐ Как прошла игра в «${venue}»? Оцените:`,
    thanks: 'Спасибо! Добавите короткий отзыв? (газон, свет, раздевалка, сервис…)',
    btnSkip: '⏭ Пропустить',
    saved: '✅ Отзыв сохранён. Спасибо!',
    savedHidden: '✅ Сохранено. В отзыве есть телефон/ссылка — он появится после модерации.',
    notEligible: 'Оставить отзыв можно только о своей завершённой игре.',
    ownVenue: 'Нельзя оставить отзыв о своём стадионе.',
    already: 'Отзыв об этой игре уже оставлен.',
    listTitle: (venue) => `💬 Отзывы о «${venue}»:`,
    listEmpty: 'Отзывов пока нет.',
    ownerReply: 'Владелец',
    btnMore: '➡️ Ещё',
    reported: '⚠️ Жалоба принята. Спасибо!',
    condition: (text, ago, owner) =>
      `🌦 Последнее состояние (${ago}${owner ? ', от владельца' : ''}): ${text}`,
    btnCondition: '🌦 Сообщить о состоянии',
    askCondition:
      'Коротко опишите состояние поля (например: «газон мокрый», «свет работает наполовину»):',
    conditionSaved: '✅ Спасибо! Будет видно 48 часов.',
    conditionDenied: 'Сообщать о состоянии могут игравшие здесь за последние 24 часа или владелец.',
    conditionInvalid: 'Напишите 3–200 символов, без телефона/ссылок:',
    hoursAgo: (h) => (h < 1 ? 'только что' : `${h} ч назад`),
  },
);

const stars = (n: number) => '⭐'.repeat(n) + '☆'.repeat(5 - n);

export function ratingKeyboard(bookingId: string): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (let n = 1; n <= 5; n++) kb.text(`${n}⭐`, `rv:r:${bookingId}:${n}`);
  return kb;
}

/** TZ RV-1…RV-6, AD-3 */
@Injectable()
@TelegramFeature(FeatureOrder.MODULE + 15)
export class ReviewsBotFeature implements BotFeature {
  constructor(
    private readonly reviews: ReviewService,
    private readonly catalog: CatalogQueries,
    private readonly identity: IdentityQueries,
    private readonly messenger: TelegramMessenger,
    private readonly conditions: ConditionService,
  ) {}

  register(bot: Composer<BotContext>): void {
    bot.callbackQuery(new RegExp(`^rv:start:${ID}$`), async (ctx) => {
      await ctx.answerCallbackQuery();
      const eligible = await this.reviews.eligibility(actorOf(ctx), ctx.match[1] as string);
      if (!eligible.ok) return void (await ctx.reply(this.errorText(ctx, eligible.error)));
      await ctx.reply(reviewMessages[ctx.lang].invite(eligible.value.venue.name), {
        reply_markup: ratingKeyboard(ctx.match[1] as string),
      });
    });

    bot.callbackQuery(new RegExp(`^rv:r:${ID}:([1-5])$`), async (ctx) => {
      const m = reviewMessages[ctx.lang];
      const result = await this.reviews.create(actorOf(ctx), {
        bookingId: ctx.match[1] as string,
        rating: Number(ctx.match[2]),
      });
      if (!result.ok)
        return void (await ctx.answerCallbackQuery({
          text: this.errorText(ctx, result.error),
          show_alert: true,
        }));
      await ctx.answerCallbackQuery();
      ctx.session.awaiting = { kind: AWAIT_TEXT, data: { reviewId: result.value.review.id } };
      await showMessage(
        ctx,
        `${stars(result.value.review.rating)}\n\n${m.thanks}`,
        new InlineKeyboard().text(m.btnSkip, 'rv:skip'),
      );
      await this.notifyOwner(
        result.value.review,
        result.value.context.venue.ownerId,
        result.value.context.venue.name,
      );
    });

    bot.callbackQuery('rv:skip', async (ctx) => {
      await ctx.answerCallbackQuery();
      ctx.session.awaiting = undefined;
      await showMessage(ctx, reviewMessages[ctx.lang].saved);
    });

    bot.callbackQuery(new RegExp(`^rv:list:${ID}:(\\d+)$`), async (ctx) => {
      await ctx.answerCallbackQuery();
      await this.list(ctx, ctx.match[1] as string, Number(ctx.match[2]));
    });

    bot.callbackQuery(new RegExp(`^rv:cond:${ID}$`), async (ctx) => {
      await ctx.answerCallbackQuery();
      const m = reviewMessages[ctx.lang];
      if (!(await this.conditions.canReport(ctx.currentUser?.id ?? '', ctx.match[1] as string))) {
        return void (await ctx.reply(m.conditionDenied));
      }
      ctx.session.awaiting = { kind: AWAIT_CONDITION, data: { venueId: ctx.match[1] } };
      await ctx.reply(m.askCondition, {
        reply_markup: new Keyboard().text(coreMessages[ctx.lang].cancel).resized().oneTime(),
      });
    });

    bot.callbackQuery(new RegExp(`^rv:rep:${ID}$`), async (ctx) => {
      await this.reviews.report(actorOf(ctx), ctx.match[1] as string);
      await ctx.answerCallbackQuery({ text: reviewMessages[ctx.lang].reported });
    });

    // RV-5: Owner javobi
    bot.callbackQuery(new RegExp(`^rv:rp:${ID}$`), async (ctx) => {
      await ctx.answerCallbackQuery();
      ctx.session.awaiting = { kind: AWAIT_REPLY, data: { reviewId: ctx.match[1] } };
      await ctx.reply("💬 Javobingizni yozing (bir marta, hammaga ko'rinadi):", {
        reply_markup: new Keyboard().text(coreMessages[ctx.lang].cancel).resized().oneTime(),
      });
    });

    bot.on('message:text', async (ctx, next) => {
      const step = ctx.session.awaiting;
      if (!step || isMainMenuLabel(ctx.message.text)) return next();
      if (step.kind === AWAIT_TEXT) {
        ctx.session.awaiting = undefined;
        const r = await this.reviews.edit(actorOf(ctx), step.data?.reviewId as string, {
          text: ctx.message.text,
        });
        const m = reviewMessages[ctx.lang];
        return void (await sendMainMenu(ctx, r.ok && !r.value.isVisible ? m.savedHidden : m.saved));
      }
      if (step.kind === AWAIT_CONDITION) {
        const m = reviewMessages[ctx.lang];
        const r = await this.conditions.report(
          ctx.currentUser?.id ?? '',
          step.data?.venueId as string,
          ctx.message.text,
        );
        if (!r.ok && r.error === 'INVALID_TEXT') return void (await ctx.reply(m.conditionInvalid));
        ctx.session.awaiting = undefined;
        return void (await sendMainMenu(ctx, r.ok ? m.conditionSaved : m.conditionDenied));
      }
      if (step.kind === AWAIT_REPLY) {
        ctx.session.awaiting = undefined;
        const r = await this.reviews.reply(
          actorOf(ctx),
          step.data?.reviewId as string,
          ctx.message.text,
        );
        return void (await sendMainMenu(
          ctx,
          r.ok
            ? '✅ Javob saqlandi.'
            : "Javob berib bo'lmadi (allaqachon javob berilgan yoki ruxsat yo'q).",
        ));
      }
      return next();
    });

    // TZ AD-3: moderatsiya
    const admin = bot.filter(isAdmin);
    admin.command('reviews', async (ctx) => {
      const hidden = await this.reviews.listForModeration(10);
      if (hidden.length === 0) return void (await ctx.reply("Moderatsiya navbati bo'sh."));
      for (const r of hidden) {
        await ctx.reply(`${stars(r.rating)} · ${r.hiddenReason}\n${r.text ?? '—'}`, {
          reply_markup: new InlineKeyboard()
            .text("✅ Ko'rsatish", `rv:mod:${r.id}:SHOW`)
            .text("🗑 O'chirish", `rv:mod:${r.id}:DELETE`),
        });
      }
    });
    admin.callbackQuery(new RegExp(`^rv:mod:${ID}:(SHOW|DELETE)$`), async (ctx) => {
      const r = await this.reviews.moderate(
        actorOf(ctx),
        ctx.match[1] as string,
        ctx.match[2] as 'SHOW' | 'DELETE',
      );
      await ctx.answerCallbackQuery({ text: r.ok ? 'OK' : 'Xato' });
      if (r.ok)
        await ctx
          .editMessageText(`${ctx.callbackQuery.message?.text ?? ''}\n\n→ ${ctx.match[2]}`)
          .catch(() => undefined);
    });
  }

  private async list(ctx: BotContext, venueId: string, offset: number): Promise<void> {
    const m = reviewMessages[ctx.lang];
    const card = await this.catalog.venueCard(venueId);
    if (!card) return;
    const items = await this.reviews.listForVenue(venueId, PAGE, offset);
    const latest = offset === 0 ? await this.conditions.latest(venueId) : null;
    const ago = latest ? Math.floor((Date.now() - latest.createdAt.getTime()) / 3_600_000) : 0;
    const header = latest
      ? `${m.listTitle(card.venue.name)}\n${m.condition(latest.text, m.hoursAgo(ago), latest.byOwner)}`
      : m.listTitle(card.venue.name);
    const kb = new InlineKeyboard();
    // TZ RV-8: holat yozish (ruxsat bosilganda tekshiriladi)
    if (offset === 0) kb.text(m.btnCondition, `rv:cond:${venueId}`).row();
    if (items.length === 0 && offset === 0) {
      return void (await ctx.reply(`${header}\n\n${m.listEmpty}`, { reply_markup: kb }));
    }
    const lines: string[] = [];
    for (const [i, r] of items.entries()) {
      const author = await this.identity.contactOf(r.authorId);
      const date = r.createdAt.toISOString().slice(0, 10).split('-').reverse().join('.');
      lines.push(
        [
          `${stars(r.rating)} · ${author?.displayName ?? '—'} · ${date}`,
          r.text,
          r.ownerReply ? `↳ ${m.ownerReply}: ${r.ownerReply.text}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
      );
      kb.text(`⚠️ ${offset + i + 1}`, `rv:rep:${r.id}`);
    }
    if (items.length === PAGE) kb.row().text(m.btnMore, `rv:list:${venueId}:${offset + PAGE}`);
    await ctx.reply(`${header}\n\n${lines.join('\n\n')}`, {
      reply_markup: kb,
    });
  }

  /** TZ 4.6: Owner'ga yangi sharh */
  private async notifyOwner(review: Review, ownerId: string, venueName: string): Promise<void> {
    const owner = await this.identity.contactOf(ownerId);
    if (!owner) return;
    await this.messenger.send(
      owner.telegramId,
      `💬 Yangi sharh — ${venueName}\n${stars(review.rating)}${review.text ? `\n${review.text}` : ''}`,
      new InlineKeyboard().text('💬 Javob berish', `rv:rp:${review.id}`),
    );
  }

  private errorText(ctx: BotContext, code: string): string {
    const m = reviewMessages[ctx.lang];
    return code === 'OWN_VENUE'
      ? m.ownVenue
      : code === 'ALREADY_REVIEWED'
        ? m.already
        : m.notEligible;
  }
}

const actorOf = (ctx: BotContext): ReviewActor => ({
  userId: ctx.currentUser?.id ?? '',
  roles: ctx.currentUser?.roles ?? [],
});
