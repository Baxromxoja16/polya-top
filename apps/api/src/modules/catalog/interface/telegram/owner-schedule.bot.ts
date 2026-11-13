import { Injectable } from '@nestjs/common';
import {
  addDays,
  DomainError,
  type Language,
  type LocalDate,
  Money,
  weekdayOf,
} from '@polya/shared-kernel';
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
import {
  type DaySelector,
  OpeningHours,
  type PricingRule,
  parsePriceInput,
  WEEKDAYS,
  type Weekday,
} from '../../../scheduling/index.js';
import { ForbiddenError, NotFoundError } from '../../application/actor.js';
import { CatalogQueries } from '../../application/catalog.queries.js';
import { VenueManagementService } from '../../application/venue-management.service.js';
import type { PitchId } from '../../domain/pitch.js';
import { formatSum } from './catalog.messages.js';
import { warnScheduleConflicts } from './schedule-conflicts.view.js';
import { actorOf } from './telegram-actor.js';

const AWAIT = 'catalog.schedule';
const ID = '([0-9a-f]{24})';
const DATE = '(\\d{4}-\\d{2}-\\d{2})';

export const DAY_NAMES: Record<Language, Record<Weekday, string>> = {
  uz: {
    1: 'Dushanba',
    2: 'Seshanba',
    3: 'Chorshanba',
    4: 'Payshanba',
    5: 'Juma',
    6: 'Shanba',
    7: 'Yakshanba',
  },
  ru: {
    1: 'Понедельник',
    2: 'Вторник',
    3: 'Среда',
    4: 'Четверг',
    5: 'Пятница',
    6: 'Суббота',
    7: 'Воскресенье',
  },
};

const m = defineMessages(
  {
    weekTitle: "📅 Hafta kunlari bo'yicha ish vaqti. Kunni tanlang:",
    closed: 'yopiq',
    askDayHours: (day: string) =>
      `${day}: ish vaqtini yozing («08-23», «16-02») yoki «Yopiq» tugmasini bosing:`,
    btnClosed: '🚫 Yopiq',
    exTitle: "📆 Istisno kunlar (bayram, ta'mir):",
    exEmpty: "Istisno kunlar yo'q.",
    btnAddException: "➕ Istisno qo'shish",
    chooseDate: 'Sanani tanlang:',
    askExHours: (date: string) => `${date}: boshqa ish vaqtini yozing («10-14») yoki «Yopiq»:`,
    rulesTitle: (base: string) => `💰 Narx qoidalari\nBazaviy narx: ${base}`,
    rulesEmpty: "Qo'shimcha qoidalar yo'q — har doim bazaviy narx.",
    btnAddRule: "➕ Qoida qo'shish",
    chooseRuleDays: 'Qoida qaysi kunlarga?',
    daysAll: 'Har kuni',
    daysWeekdays: 'Ish kunlari (Du–Ju)',
    daysWeekend: 'Dam olish (Sh–Ya)',
    askRule:
      "Soat oralig'i va narxni yozing, masalan: «18-02 150000» (kechqurun 18:00 dan 02:00 gacha)",
    invalid: '❌ Tushunmadim. Qayta yozing:',
    saved: '✅ Saqlandi.',
    btnBack: '⬅️ Orqaga',
    perHour: "so'm/soat",
  },
  {
    weekTitle: '📅 Время работы по дням недели. Выберите день:',
    closed: 'закрыто',
    askDayHours: (day) => `${day}: напишите время работы («08-23», «16-02») или нажмите «Закрыто»:`,
    btnClosed: '🚫 Закрыто',
    exTitle: '📆 Особые дни (праздник, ремонт):',
    exEmpty: 'Особых дней нет.',
    btnAddException: '➕ Добавить особый день',
    chooseDate: 'Выберите дату:',
    askExHours: (date) => `${date}: напишите другое время («10-14») или «Закрыто»:`,
    rulesTitle: (base) => `💰 Правила цены\nБазовая цена: ${base}`,
    rulesEmpty: 'Дополнительных правил нет — всегда базовая цена.',
    btnAddRule: '➕ Добавить правило',
    chooseRuleDays: 'Для каких дней правило?',
    daysAll: 'Каждый день',
    daysWeekdays: 'Будни (Пн–Пт)',
    daysWeekend: 'Выходные (Сб–Вс)',
    askRule: 'Напишите часы и цену, например: «18-02 150000» (вечером с 18:00 до 02:00)',
    invalid: '❌ Не понял. Напишите ещё раз:',
    saved: '✅ Сохранено.',
    btnBack: '⬅️ Назад',
    perHour: 'сум/час',
  },
);

/** TZ SP-1, SP-2, SP-4: Owner haftalik jadval, istisno kunlar va narx qoidalarini boshqaradi. */
@Injectable()
@TelegramFeature(FeatureOrder.MODULE + 10)
export class OwnerScheduleBotFeature implements BotFeature {
  constructor(
    private readonly manage: VenueManagementService,
    private readonly queries: CatalogQueries,
  ) {}

  register(bot: Composer<BotContext>): void {
    const owner = bot.filter((ctx) => hasRole(ctx, 'OWNER') || hasRole(ctx, 'ADMIN'));

    owner.callbackQuery(new RegExp(`^cat:wk:${ID}$`), (ctx) =>
      this.guard(ctx, () => this.showWeek(ctx, ctx.match[1] as string)),
    );
    owner.callbackQuery(new RegExp(`^cat:wd:${ID}:([1-7])$`), (ctx) =>
      this.guard(ctx, async () => {
        const [pitchId, day] = [ctx.match[1] as string, Number(ctx.match[2]) as Weekday];
        this.await_(ctx, { op: 'day', pitchId, day });
        await ctx.reply(m[ctx.lang].askDayHours(DAY_NAMES[ctx.lang][day]), {
          reply_markup: new InlineKeyboard().text(
            m[ctx.lang].btnClosed,
            `cat:wdc:${pitchId}:${day}`,
          ),
        });
      }),
    );
    owner.callbackQuery(new RegExp(`^cat:wdc:${ID}:([1-7])$`), (ctx) =>
      this.guard(ctx, async () => {
        const pitchId = ctx.match[1] as string;
        await this.manage.setPitchDayHours(
          actorOf(ctx),
          pitchId as PitchId,
          Number(ctx.match[2]) as Weekday,
          null,
        );
        ctx.session.awaiting = undefined;
        await this.showWeek(ctx, pitchId, true);
      }),
    );

    owner.callbackQuery(new RegExp(`^cat:ex:${ID}$`), (ctx) =>
      this.guard(ctx, () => this.showExceptions(ctx, ctx.match[1] as string)),
    );
    owner.callbackQuery(new RegExp(`^cat:exa:${ID}$`), (ctx) =>
      this.guard(ctx, async () => {
        const pitchId = ctx.match[1] as string;
        const today = await this.todayOfPitch(ctx, pitchId);
        const kb = new InlineKeyboard();
        for (let i = 0; i < 14; i++) {
          const d = addDays(today, i);
          kb.text(dayLabel(ctx.lang, d), `cat:exn:${pitchId}:${d}`);
          if (i % 2 === 1) kb.row();
        }
        kb.row().text(m[ctx.lang].btnBack, `cat:ex:${pitchId}`);
        await showMessage(ctx, m[ctx.lang].chooseDate, kb);
      }),
    );
    owner.callbackQuery(new RegExp(`^cat:exn:${ID}:${DATE}$`), (ctx) =>
      this.guard(ctx, async () => {
        const [pitchId, date] = [ctx.match[1] as string, ctx.match[2] as string];
        this.await_(ctx, { op: 'exception', pitchId, date });
        await ctx.reply(m[ctx.lang].askExHours(dayLabel(ctx.lang, date)), {
          reply_markup: new InlineKeyboard().text(
            m[ctx.lang].btnClosed,
            `cat:exc:${pitchId}:${date}`,
          ),
        });
      }),
    );
    owner.callbackQuery(new RegExp(`^cat:exc:${ID}:${DATE}$`), (ctx) =>
      this.guard(ctx, async () => {
        const pitchId = ctx.match[1] as string;
        await this.manage.setPitchException(
          actorOf(ctx),
          pitchId as PitchId,
          ctx.match[2] as string,
          null,
        );
        ctx.session.awaiting = undefined;
        await this.showExceptions(ctx, pitchId, true);
      }),
    );
    owner.callbackQuery(new RegExp(`^cat:exd:${ID}:${DATE}$`), (ctx) =>
      this.guard(ctx, async () => {
        const pitchId = ctx.match[1] as string;
        await this.manage.removePitchException(
          actorOf(ctx),
          pitchId as PitchId,
          ctx.match[2] as string,
        );
        await this.showExceptions(ctx, pitchId);
      }),
    );

    owner.callbackQuery(new RegExp(`^cat:pr:${ID}$`), (ctx) =>
      this.guard(ctx, () => this.showRules(ctx, ctx.match[1] as string)),
    );
    owner.callbackQuery(new RegExp(`^cat:pra:${ID}$`), (ctx) =>
      this.guard(ctx, async () => {
        const pitchId = ctx.match[1] as string;
        const t = m[ctx.lang];
        await showMessage(
          ctx,
          t.chooseRuleDays,
          new InlineKeyboard()
            .text(t.daysAll, `cat:prn:${pitchId}:ALL`)
            .row()
            .text(t.daysWeekdays, `cat:prn:${pitchId}:WEEKDAYS`)
            .row()
            .text(t.daysWeekend, `cat:prn:${pitchId}:WEEKEND`)
            .row()
            .text(t.btnBack, `cat:pr:${pitchId}`),
        );
      }),
    );
    owner.callbackQuery(new RegExp(`^cat:prn:${ID}:(ALL|WEEKDAYS|WEEKEND)$`), (ctx) =>
      this.guard(ctx, async () => {
        this.await_(ctx, {
          op: 'rule',
          pitchId: ctx.match[1] as string,
          days: ctx.match[2] as string,
        });
        await ctx.reply(m[ctx.lang].askRule, {
          reply_markup: new Keyboard().text(coreMessages[ctx.lang].cancel).resized().oneTime(),
        });
      }),
    );
    owner.callbackQuery(new RegExp(`^cat:prd:${ID}:${ID}$`), (ctx) =>
      this.guard(ctx, async () => {
        const pitchId = ctx.match[1] as string;
        await this.manage.removePriceRule(actorOf(ctx), pitchId as PitchId, ctx.match[2] as string);
        await this.showRules(ctx, pitchId);
      }),
    );

    owner.on('message:text', async (ctx, next) => {
      const step = ctx.session.awaiting;
      if (step?.kind !== AWAIT || isMainMenuLabel(ctx.message.text)) return next();
      await this.guard(ctx, () => this.onText(ctx, step.data ?? {}, ctx.message.text));
    });
  }

  private async onText(
    ctx: BotContext,
    data: Record<string, unknown>,
    text: string,
  ): Promise<void> {
    const t = m[ctx.lang];
    const pitchId = data.pitchId as PitchId;
    const actor = actorOf(ctx);
    try {
      if (data.op === 'day') {
        await this.manage.setPitchDayHours(
          actor,
          pitchId,
          data.day as Weekday,
          OpeningHours.parse(text),
        );
      } else if (data.op === 'exception') {
        await this.manage.setPitchException(
          actor,
          pitchId,
          data.date as LocalDate,
          OpeningHours.parse(text),
        );
      } else if (data.op === 'rule') {
        const match = text.trim().match(/^(\d{1,2})\s*[-–]\s*(\d{1,2})\s+(.+)$/);
        const price = match ? parsePriceInput(match[3] as string) : { kind: 'invalid' as const };
        if (!match || price.kind !== 'ok') return void (await ctx.reply(t.invalid));
        await this.manage.addPriceRule(actor, pitchId, {
          days: { kind: data.days as 'ALL' | 'WEEKDAYS' | 'WEEKEND' },
          fromHour: Number(match[1]),
          toHour: Number(match[2]),
          pricePerHour: Money.of(price.amount),
        });
      }
    } catch (error) {
      if (
        error instanceof DomainError &&
        !(error instanceof ForbiddenError) &&
        !(error instanceof NotFoundError)
      ) {
        return void (await ctx.reply(t.invalid));
      }
      throw error;
    }
    ctx.session.awaiting = undefined;
    await sendMainMenu(ctx, t.saved);
    if (data.op === 'day') await this.showWeek(ctx, pitchId, true);
    else if (data.op === 'exception') await this.showExceptions(ctx, pitchId, true);
    else await this.showRules(ctx, pitchId, true);
  }

  private async showWeek(ctx: BotContext, pitchId: string, asNew = false): Promise<void> {
    const t = m[ctx.lang];
    const details = await this.manage.scheduleDetails(actorOf(ctx), pitchId as PitchId);
    const kb = new InlineKeyboard();
    for (const day of WEEKDAYS) {
      const hours = details.weekly.get(day);
      kb.text(
        `${DAY_NAMES[ctx.lang][day]}: ${hours ? hours.format() : t.closed}`,
        `cat:wd:${pitchId}:${day}`,
      ).row();
    }
    kb.text(t.btnBack, `cat:p:${pitchId}`);
    await this.show(ctx, t.weekTitle, kb, asNew);
    // asNew — saqlangandan keyin (EC-S2)
    if (asNew) await warnScheduleConflicts(ctx, this.manage, pitchId);
  }

  private async showExceptions(ctx: BotContext, pitchId: string, asNew = false): Promise<void> {
    const t = m[ctx.lang];
    const details = await this.manage.scheduleDetails(actorOf(ctx), pitchId as PitchId);
    const kb = new InlineKeyboard();
    for (const e of details.exceptions) {
      kb.text(
        `🗑 ${dayLabel(ctx.lang, e.date)} — ${e.hours ? e.hours.format() : t.closed}`,
        `cat:exd:${pitchId}:${e.date}`,
      ).row();
    }
    kb.text(t.btnAddException, `cat:exa:${pitchId}`).row().text(t.btnBack, `cat:p:${pitchId}`);
    await this.show(
      ctx,
      details.exceptions.length ? t.exTitle : `${t.exTitle}\n${t.exEmpty}`,
      kb,
      asNew,
    );
    // EC-S3: yopiq kun / qisqargan soatlar band vaqtga tushsa
    if (asNew) await warnScheduleConflicts(ctx, this.manage, pitchId);
  }

  private async showRules(ctx: BotContext, pitchId: string, asNew = false): Promise<void> {
    const t = m[ctx.lang];
    const details = await this.manage.scheduleDetails(actorOf(ctx), pitchId as PitchId);
    const kb = new InlineKeyboard();
    for (const r of details.rules)
      kb.text(`🗑 ${ruleLabel(ctx.lang, r)}`, `cat:prd:${pitchId}:${r.id}`).row();
    kb.text(t.btnAddRule, `cat:pra:${pitchId}`).row().text(t.btnBack, `cat:p:${pitchId}`);
    const title = t.rulesTitle(`${formatSum(details.basePricePerHour.amount)} ${t.perHour}`);
    await this.show(ctx, details.rules.length ? title : `${title}\n${t.rulesEmpty}`, kb, asNew);
  }

  private async show(
    ctx: BotContext,
    text: string,
    kb: InlineKeyboard,
    asNew: boolean,
  ): Promise<void> {
    if (asNew) await ctx.reply(text, { reply_markup: kb });
    else await showMessage(ctx, text, kb);
  }

  private await_(ctx: BotContext, data: Record<string, unknown>): void {
    ctx.session.awaiting = { kind: AWAIT, data };
  }

  private async todayOfPitch(ctx: BotContext, pitchId: string): Promise<LocalDate> {
    await this.manage.scheduleDetails(actorOf(ctx), pitchId as PitchId); // egalik tekshiruvi
    const venueId = await this.queries.venueIdOfPitch(pitchId);
    const card = venueId ? await this.queries.venueCard(venueId) : null;
    if (!card) throw new NotFoundError('Venue not found');
    return this.manage.todayOf(card.venue);
  }

  private async guard(ctx: BotContext, action: () => Promise<void>): Promise<void> {
    try {
      await action();
      if (ctx.callbackQuery) await ctx.answerCallbackQuery().catch(() => undefined);
    } catch (error) {
      if (error instanceof ForbiddenError || error instanceof NotFoundError) {
        if (ctx.callbackQuery)
          await ctx.answerCallbackQuery({
            text: coreMessages[ctx.lang].staleButton,
            show_alert: true,
          });
        return;
      }
      throw error;
    }
  }
}

/** "Ju, 20.11" */
export function dayLabel(lang: Language, date: LocalDate): string {
  const short = DAY_NAMES[lang][weekdayOf(date) as Weekday].slice(0, 2);
  return `${short}, ${date.slice(8, 10)}.${date.slice(5, 7)}`;
}

function ruleLabel(lang: Language, r: PricingRule): string {
  const t = m[lang];
  const days: Record<DaySelector['kind'], string> = {
    ALL: t.daysAll,
    WEEKDAYS: t.daysWeekdays,
    WEEKEND: t.daysWeekend,
    DATE: r.days.kind === 'DATE' ? r.days.date : '',
  };
  const hh = (h: number) => `${String(h % 24).padStart(2, '0')}:00`;
  return `${days[r.days.kind]} ${hh(r.fromHour)}–${hh(r.toHour)} · ${formatSum(r.pricePerHour.amount)}`;
}
