import { Injectable } from '@nestjs/common';
import { Money, PhoneNumber } from '@polya/shared-kernel';
import { type Composer, InlineKeyboard, Keyboard } from 'grammy';
import type { BotContext } from '../../../../platform/telegram/bot-context.js';
import {
  type BotFeature,
  FeatureOrder,
  TelegramFeature,
} from '../../../../platform/telegram/bot-feature.js';
import { sendMainMenu } from '../../../../platform/telegram/core.features.js';
import { coreMessages } from '../../../../platform/telegram/core.messages.js';
import { hasRole, isAdmin } from '../../../../platform/telegram/guards.js';
import { isMainMenuLabel, menuLabels } from '../../../../platform/telegram/main-menu.js';
import { TelegramMessenger } from '../../../../platform/telegram/telegram-messenger.js';
import { showMessage } from '../../../../platform/telegram/ui.js';
import { IdentityQueries } from '../../../identity/index.js';
import {
  InvalidOpeningHoursError,
  OpeningHours,
  parsePriceInput,
} from '../../../scheduling/index.js';
import { CatalogQueries } from '../../application/catalog.queries.js';
import { RegisterVenueUseCase } from '../../application/register-venue.use-case.js';
import { VenueManagementService } from '../../application/venue-management.service.js';
import { LIMITS, type Venue, type VenueId, type VenueStatus } from '../../domain/venue.js';
import { catalogMessages, formatSum } from './catalog.messages.js';
import { actorOf } from './telegram-actor.js';

const ONB = 'catalog.onb';
type Step = 'name' | 'landmark' | 'hours' | 'customHours' | 'price';

interface Draft {
  step?: Step;
  name?: string;
  landmark?: string;
  open?: number;
  close?: number;
}

const HOUR_PRESETS: readonly [number, number][] = [
  [8, 0],
  [16, 2],
  [7, 23],
];

const len = (s: string) => [...s.trim()].length;

/**
 * TZ VC-1, VC-2: Owner paneli va stadion qo'shish (nom → orientir → ish vaqti → narx).
 * Owner bo'lmaganlar uchun "🏟 Stadion egasiman" ni Identity (ariza) ushlaydi — bu feature undan keyin.
 */
@Injectable()
@TelegramFeature(FeatureOrder.MODULE + 10)
export class OwnerOnboardingBotFeature implements BotFeature {
  constructor(
    private readonly register_: RegisterVenueUseCase,
    private readonly manage: VenueManagementService,
    private readonly queries: CatalogQueries,
    private readonly identity: IdentityQueries,
    private readonly messenger: TelegramMessenger,
  ) {}

  register(bot: Composer<BotContext>): void {
    const owner = bot.filter((ctx) => hasRole(ctx, 'OWNER'));
    owner.hears(menuLabels('owner'), (ctx) => this.showPanel(ctx));
    owner.callbackQuery('cat:panel', async (ctx) => {
      await ctx.answerCallbackQuery();
      await this.showPanel(ctx);
    });

    owner.callbackQuery('cat:new', async (ctx) => {
      await ctx.answerCallbackQuery();
      const draft = this.draft(ctx);
      if (draft.name) {
        const m = catalogMessages[ctx.lang];
        await ctx.reply(m.resumeDraft(draft.name), {
          reply_markup: new InlineKeyboard()
            .text(m.btnResume, 'cat:onb:resume')
            .text(m.btnRestart, 'cat:onb:restart'),
        });
        return;
      }
      await this.ask(ctx, 'name');
    });
    owner.callbackQuery('cat:onb:resume', async (ctx) => {
      await ctx.answerCallbackQuery();
      await this.ask(ctx, this.draft(ctx).step ?? 'name');
    });
    owner.callbackQuery('cat:onb:restart', async (ctx) => {
      await ctx.answerCallbackQuery();
      this.saveDraft(ctx, {});
      await this.ask(ctx, 'name');
    });

    owner.callbackQuery(/^cat:onb:h:(\d{1,2}):(\d{1,2})$/, async (ctx) => {
      await ctx.answerCallbackQuery();
      await this.acceptHours(ctx, OpeningHours.of(Number(ctx.match[1]), Number(ctx.match[2])));
    });
    owner.callbackQuery('cat:onb:h:other', async (ctx) => {
      await ctx.answerCallbackQuery();
      await this.ask(ctx, 'customHours');
    });
    owner.callbackQuery(/^cat:onb:p:(\d+)$/, async (ctx) => {
      await ctx.answerCallbackQuery();
      await this.submit(ctx, Number(ctx.match[1]));
    });

    owner.on('message:text', async (ctx, next) => {
      if (ctx.session.awaiting?.kind !== ONB || isMainMenuLabel(ctx.message.text)) return next();
      await this.onText(ctx, ctx.message.text);
    });

    // --- Admin ko'rigi (TZ VC-1, AD-1) ---
    const admin = bot.filter(isAdmin);
    admin.command('pending', async (ctx) => {
      const pending = await this.queries.pendingReview();
      if (pending.length === 0) return void (await ctx.reply("Ko'rib chiqiladigan stadion yo'q."));
      for (const venue of pending)
        await ctx.reply(await this.adminText(venue), { reply_markup: reviewKeyboard(venue.id) });
    });
    admin.callbackQuery(/^cat:(ok|no):([0-9a-f]{24})$/, async (ctx) => {
      const id = ctx.match[2] as VenueId;
      try {
        const venue =
          ctx.match[1] === 'ok'
            ? await this.manage.approve(actorOf(ctx), id)
            : await this.manage.reject(actorOf(ctx), id, null);
        await ctx.answerCallbackQuery();
        const verdict = venue.isPublic ? '✅ Tasdiqlandi' : '❌ Rad etildi';
        await ctx.editMessageText(
          `${ctx.callbackQuery.message?.text ?? ''}\n\n${verdict} — ${ctx.from.first_name}`,
        );
        await this.notifyOwner(venue);
      } catch {
        await ctx.answerCallbackQuery({
          text: "Allaqachon ko'rib chiqilgan yoki topilmadi",
          show_alert: true,
        });
      }
    });
  }

  private async showPanel(ctx: BotContext): Promise<void> {
    const m = catalogMessages[ctx.lang];
    const venues = await this.queries.ownerVenues(ctx.currentUser?.id ?? '');
    const kb = new InlineKeyboard();
    for (const v of venues) {
      kb.text(
        `${statusLabel(ctx, v.status)} · ${v.name} · ${v.completeness()}%`,
        `cat:v:${v.id}`,
      ).row();
    }
    kb.text(m.btnAddVenue, 'cat:new');
    await showMessage(ctx, venues.length ? m.panelTitle : `${m.panelTitle}\n\n${m.panelEmpty}`, kb);
  }

  private async onText(ctx: BotContext, text: string): Promise<void> {
    const m = catalogMessages[ctx.lang];
    const draft = this.draft(ctx);
    switch (draft.step) {
      case 'name':
        if (len(text) < LIMITS.nameMin || len(text) > LIMITS.nameMax)
          return void (await ctx.reply(m.invalidName));
        this.saveDraft(ctx, { ...draft, name: text.trim() });
        return this.ask(ctx, 'landmark');
      case 'landmark':
        if (len(text) < LIMITS.landmarkMin || len(text) > LIMITS.landmarkMax) {
          return void (await ctx.reply(m.invalidLandmark));
        }
        this.saveDraft(ctx, { ...draft, landmark: text.trim() });
        return this.ask(ctx, 'hours');
      case 'hours':
      case 'customHours':
        try {
          return await this.acceptHours(ctx, OpeningHours.parse(text));
        } catch (error) {
          if (error instanceof InvalidOpeningHoursError)
            return void (await ctx.reply(m.invalidHours));
          throw error;
        }
      case 'price': {
        const price = parsePriceInput(text);
        if (price.kind === 'invalid') return void (await ctx.reply(m.invalidPrice));
        if (price.kind === 'confirm') {
          await ctx.reply(m.confirmPrice(formatSum(price.amount)), {
            reply_markup: new InlineKeyboard().text(m.btnYes, `cat:onb:p:${price.amount}`),
          });
          return;
        }
        return this.submit(ctx, price.amount);
      }
      default:
        return this.ask(ctx, 'name');
    }
  }

  private async acceptHours(ctx: BotContext, hours: OpeningHours): Promise<void> {
    const draft = this.draft(ctx);
    if (!draft.name || !draft.landmark) return this.ask(ctx, 'name');
    this.saveDraft(ctx, { ...draft, open: hours.openHour, close: hours.closeHour });
    // TZ EC-O3: yarim tundan o'tadigan vaqt aniq ko'rsatiladi
    await ctx.reply(catalogMessages[ctx.lang].hoursChosen(hours.format(), hours.crossesMidnight));
    await this.ask(ctx, 'price');
  }

  private async submit(ctx: BotContext, amount: number): Promise<void> {
    const m = catalogMessages[ctx.lang];
    const draft = this.draft(ctx);
    if (!draft.name || !draft.landmark || draft.open === undefined || draft.close === undefined) {
      return this.ask(ctx, 'name');
    }
    // Idempotentlik: "Ha" ikki marta bosilsa, ikkinchisida qoralama yo'q — ikkinchi stadion yaratilmaydi
    this.saveDraft(ctx, undefined);
    ctx.session.awaiting = undefined;

    const result = await this.register_.execute({
      actor: actorOf(ctx),
      name: draft.name,
      landmarkText: draft.landmark,
      hours: OpeningHours.of(draft.open, draft.close),
      pricePerHour: Money.of(amount),
    });
    if (!result.ok) {
      this.saveDraft(ctx, { ...draft, step: 'price' });
      const text = result.error === 'CITY_REQUIRED' ? m.cityRequired : m.phoneRequired;
      return void (await sendMainMenu(ctx, text));
    }
    const { venue, sameNameVenues } = result.value;
    await sendMainMenu(ctx, m.submitted(venue.name));
    await ctx.reply('👇', {
      reply_markup: new InlineKeyboard().text(m.btnManage, `cat:v:${venue.id}`),
    });
    const warning = sameNameVenues.length
      ? `\n\n⚠️ Shu shaharda nomi bir xil stadion bor: ${sameNameVenues.map((v) => `«${v.name}» (${v.landmarkText})`).join(', ')}`
      : '';
    await this.messenger.sendToMany(
      this.identity.adminTelegramIds(),
      `${await this.adminText(venue, { hours: OpeningHours.of(draft.open, draft.close).format(), amount })}${warning}`,
      reviewKeyboard(venue.id),
    );
  }

  private async ask(ctx: BotContext, step: Step): Promise<void> {
    const m = catalogMessages[ctx.lang];
    this.saveDraft(ctx, { ...this.draft(ctx), step });
    ctx.session.awaiting = { kind: ONB };
    const cancel = new Keyboard().text(coreMessages[ctx.lang].cancel).resized().oneTime();
    if (step === 'name') return void (await ctx.reply(m.askName, { reply_markup: cancel }));
    if (step === 'landmark') return void (await ctx.reply(m.askLandmark, { reply_markup: cancel }));
    if (step === 'customHours')
      return void (await ctx.reply(m.askCustomHours, { reply_markup: cancel }));
    if (step === 'price') return void (await ctx.reply(m.askPrice, { reply_markup: cancel }));
    const kb = new InlineKeyboard();
    for (const [o, c] of HOUR_PRESETS)
      kb.text(OpeningHours.of(o, c).format(), `cat:onb:h:${o}:${c}`).row();
    kb.text(m.btnOtherHours, 'cat:onb:h:other');
    await ctx.reply(m.askHours, { reply_markup: kb });
  }

  private async adminText(
    venue: Venue,
    extra?: { hours: string; amount: number },
  ): Promise<string> {
    const owner = await this.identity.contactOf(venue.ownerId);
    const phone = owner?.phone ? PhoneNumber.parse(owner.phone).format() : '—';
    return [
      '🆕 Yangi stadion — tasdiqlash kerak',
      '',
      `🏟 ${venue.name}`,
      `📍 ${venue.landmarkText}`,
      ...(extra ? [`🕒 ${extra.hours}`, `💰 ${formatSum(extra.amount)} so'm/soat`] : []),
      `👤 ${owner?.displayName ?? '—'} · 📱 ${phone}`,
    ].join('\n');
  }

  private async notifyOwner(venue: Venue): Promise<void> {
    const owner = await this.identity.contactOf(venue.ownerId);
    if (!owner) return;
    const m = catalogMessages[owner.language];
    await this.messenger.send(
      owner.telegramId,
      venue.isPublic
        ? m.venueApproved(venue.name)
        : m.venueRejected(venue.name, venue.rejectReason),
    );
  }

  private draft(ctx: BotContext): Draft {
    return (ctx.session.drafts?.[ONB] as Draft | undefined) ?? {};
  }

  private saveDraft(ctx: BotContext, draft: Draft | undefined): void {
    const drafts = { ...(ctx.session.drafts ?? {}) };
    if (draft) drafts[ONB] = { ...draft };
    else delete drafts[ONB];
    ctx.session.drafts = drafts;
  }
}

function reviewKeyboard(venueId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Tasdiqlash', `cat:ok:${venueId}`)
    .text('❌ Rad etish', `cat:no:${venueId}`);
}

export function statusLabel(ctx: BotContext, status: VenueStatus): string {
  const m = catalogMessages[ctx.lang];
  return {
    PENDING_REVIEW: m.statusPending,
    APPROVED: m.statusApproved,
    REJECTED: m.statusRejected,
    ARCHIVED: m.statusArchived,
    BLOCKED: m.statusBlocked,
  }[status];
}
