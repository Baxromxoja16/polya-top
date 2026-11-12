import { Injectable } from '@nestjs/common';
import { addDays, Clock, zonedParts } from '@polya/shared-kernel';
import { type Composer, InlineKeyboard } from 'grammy';
import type { BotContext } from '../../../../platform/telegram/bot-context.js';
import {
  type BotFeature,
  FeatureOrder,
  TelegramFeature,
} from '../../../../platform/telegram/bot-feature.js';
import { hasRole } from '../../../../platform/telegram/guards.js';
import { showMessage } from '../../../../platform/telegram/ui.js';
import { CatalogQueries } from '../../../catalog/index.js';
import { AvailabilityService, type SlotView } from '../../../scheduling/index.js';
import { PromotionService } from '../../application/promotion.service.js';
import {
  MAX_DISCOUNT_PERCENT,
  MIN_DISCOUNT_PERCENT,
  PROMOTION_HORIZON_MS,
  PROMOTION_MAX_HOURS,
} from '../../domain/promotion.js';
import { formatSum } from './marketing.messages.js';
import { promotionErrors, promotionMessages } from './promotion.messages.js';

const ID = '[0-9a-f]{24}';
const HOUR_MS = 3_600_000;
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * TZ 4.9: Owner chegirma e'lonini yaratadi. Kirish — Catalog'ning stadion ekranidagi
 * `mk:p:v:<venueId>` tugmasi. Qadamlar: maydon → boshlanish → soatlar → foiz → tasdiq.
 * Holat callback ma'lumotida (sessiya kerak emas): `mk:p:<qadam>:<pitch>:<unixSec>:<soat>:<foiz>`.
 */
@Injectable()
@TelegramFeature(FeatureOrder.MODULE)
export class PromotionBotFeature implements BotFeature {
  constructor(
    private readonly promotions: PromotionService,
    private readonly catalog: CatalogQueries,
    private readonly availability: AvailabilityService,
    private readonly clock: Clock,
  ) {}

  register(bot: Composer<BotContext>): void {
    const owner = bot.filter((ctx) => hasRole(ctx, 'OWNER'));

    owner.callbackQuery(new RegExp(`^mk:p:v:(${ID})$`), async (ctx) => {
      await ctx.answerCallbackQuery();
      await this.start(ctx, ctx.match[1] as string);
    });
    owner.callbackQuery(new RegExp(`^mk:p:pt:(${ID})$`), async (ctx) => {
      await ctx.answerCallbackQuery();
      await this.chooseStart(ctx, ctx.match[1] as string);
    });
    owner.callbackQuery(new RegExp(`^mk:p:s:(${ID}):(\\d+)$`), async (ctx) => {
      await ctx.answerCallbackQuery();
      await this.chooseHours(ctx, ctx.match[1] as string, Number(ctx.match[2]));
    });
    owner.callbackQuery(new RegExp(`^mk:p:h:(${ID}):(\\d+):(\\d)$`), async (ctx) => {
      await ctx.answerCallbackQuery();
      const [, pitchId, sec, hours] = ctx.match;
      await this.choosePercent(ctx, `${pitchId}:${sec}:${hours}`);
    });
    owner.callbackQuery(new RegExp(`^mk:p:d:(${ID}):(\\d+):(\\d):(\\d+)$`), async (ctx) => {
      await ctx.answerCallbackQuery();
      const [, pitchId, sec, hours, pct] = ctx.match;
      await this.preview(ctx, pitchId as string, Number(sec), Number(hours), Number(pct));
    });
    owner.callbackQuery(new RegExp(`^mk:p:ok:(${ID}):(\\d+):(\\d):(\\d+)$`), async (ctx) => {
      const [, pitchId, sec, hours, pct] = ctx.match;
      const result = await this.promotions.create({
        actorUserId: ctx.currentUser?.id ?? '',
        pitchId: pitchId as string,
        start: new Date(Number(sec) * 1000),
        hours: Number(hours),
        percent: Number(pct),
      });
      if (!result.ok) {
        await ctx.answerCallbackQuery({
          text: promotionErrors[ctx.lang][result.error],
          show_alert: true,
        });
        return;
      }
      await ctx.answerCallbackQuery();
      await showMessage(ctx, promotionMessages[ctx.lang].published, new InlineKeyboard());
    });
  }

  private async start(ctx: BotContext, venueId: string): Promise<void> {
    const m = promotionMessages[ctx.lang];
    const card = await this.catalog.venueCard(venueId);
    if (!card || card.venue.ownerId !== ctx.currentUser?.id)
      return void (await ctx.reply(promotionErrors[ctx.lang].FORBIDDEN));
    const left = await this.promotions.remaining(venueId);
    if (left === 0) {
      const premium = (await this.promotions.limit(venueId)) > 0;
      return void (await ctx.reply(premium ? m.limitReached : m.premiumOnly));
    }
    const pitches = card.pitches.filter((p) => p.status === 'ACTIVE');
    const [only] = pitches;
    if (pitches.length === 1 && only) {
      await ctx.reply(m.intro(left));
      return this.chooseStart(ctx, only.id);
    }
    const kb = new InlineKeyboard();
    for (const p of pitches) kb.text(`⚽ ${p.name}`, `mk:p:pt:${p.id}`).row();
    await ctx.reply(`${m.intro(left)}\n\n${m.choosePitch}`, { reply_markup: kb });
  }

  /** Kelgusi 24 soatdagi bo'sh (va chegirmasiz) slotlar */
  private async freeSlots(pitchId: string): Promise<{ slots: SlotView[]; timeZone: string }> {
    const ctx = await this.catalog.pitchContext(pitchId);
    if (!ctx) return { slots: [], timeZone: 'UTC' };
    const now = this.clock.now();
    const today = zonedParts(now, ctx.timeZone).date;
    const days = [addDays(today, -1), today, addDays(today, 1)];
    const views = (
      await Promise.all(days.map((d) => this.availability.dayView(pitchId, d, ctx.timeZone)))
    ).flat();
    const limit = now.getTime() + PROMOTION_HORIZON_MS;
    const slots = views.filter(
      (s) =>
        s.status !== 'BOOKED' &&
        s.status !== 'PAST' &&
        s.discountPercent === 0 &&
        s.end.getTime() <= limit,
    );
    return { slots, timeZone: ctx.timeZone };
  }

  private label(ctx: BotContext, start: Date, timeZone: string): string {
    const p = zonedParts(start, timeZone);
    const today = zonedParts(this.clock.now(), timeZone).date;
    return `${p.date === today ? '' : '↪ '}${pad(p.hour)}:00`;
  }

  private async chooseStart(ctx: BotContext, pitchId: string): Promise<void> {
    const m = promotionMessages[ctx.lang];
    const { slots, timeZone } = await this.freeSlots(pitchId);
    if (slots.length === 0) return void (await ctx.reply(m.noFreeSlots));
    const kb = new InlineKeyboard();
    slots.forEach((s, i) => {
      kb.text(this.label(ctx, s.start, timeZone), `mk:p:s:${pitchId}:${s.start.getTime() / 1000}`);
      if (i % 4 === 3) kb.row();
    });
    await ctx.reply(m.chooseStart, { reply_markup: kb });
  }

  private async chooseHours(ctx: BotContext, pitchId: string, sec: number): Promise<void> {
    const m = promotionMessages[ctx.lang];
    const { slots } = await this.freeSlots(pitchId);
    const free = new Set(slots.map((s) => s.start.getTime()));
    let max = 0;
    while (max < PROMOTION_MAX_HOURS && free.has(sec * 1000 + max * HOUR_MS)) max++;
    if (max === 0) return void (await ctx.reply(promotionErrors[ctx.lang].NOT_FREE));
    const kb = new InlineKeyboard();
    for (let h = 1; h <= max; h++) kb.text(m.hours(h), `mk:p:h:${pitchId}:${sec}:${h}`);
    await showMessage(ctx, m.chooseHours, kb);
  }

  private async choosePercent(ctx: BotContext, base: string): Promise<void> {
    const kb = new InlineKeyboard();
    for (let p = MIN_DISCOUNT_PERCENT; p <= MAX_DISCOUNT_PERCENT; p += 10)
      kb.text(`−${p}%`, `mk:p:d:${base}:${p}`);
    await showMessage(ctx, promotionMessages[ctx.lang].choosePercent, kb);
  }

  private async preview(
    ctx: BotContext,
    pitchId: string,
    sec: number,
    hours: number,
    percent: number,
  ): Promise<void> {
    const m = promotionMessages[ctx.lang];
    const pctx = await this.catalog.pitchContext(pitchId);
    const { slots, timeZone } = await this.freeSlots(pitchId);
    const chosen = slots.filter(
      (s) => s.start.getTime() >= sec * 1000 && s.start.getTime() < sec * 1000 + hours * HOUR_MS,
    );
    if (!pctx || chosen.length !== hours)
      return void (await ctx.reply(promotionErrors[ctx.lang].NOT_FREE));
    const min = Math.min(...chosen.map((s) => s.price.amount));
    const start = new Date(sec * 1000);
    const end = new Date(sec * 1000 + hours * HOUR_MS);
    const day =
      zonedParts(start, timeZone).date === zonedParts(this.clock.now(), timeZone).date
        ? m.today
        : m.tomorrow;
    const e = zonedParts(end, timeZone);
    await showMessage(
      ctx,
      m.preview({
        pitch: `${pctx.venue.name} · ${pctx.pitchName}`,
        when: `${day} ${this.label(ctx, start, timeZone).replace('↪ ', '')}–${pad(e.hour)}:00`,
        percent,
        old: formatSum(min),
        price: formatSum(Math.round((min * (100 - percent)) / 100)),
      }),
      new InlineKeyboard().text(m.btnPublish, `mk:p:ok:${pitchId}:${sec}:${hours}:${percent}`),
    );
  }
}
