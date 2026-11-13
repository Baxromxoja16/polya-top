import { Injectable } from '@nestjs/common';
import { type Composer, InlineKeyboard } from 'grammy';
import type { BotContext } from '../../../../platform/telegram/bot-context.js';
import {
  type BotFeature,
  FeatureOrder,
  TelegramFeature,
} from '../../../../platform/telegram/bot-feature.js';
import { sendMainMenu } from '../../../../platform/telegram/core.features.js';
import { hasRole } from '../../../../platform/telegram/guards.js';
import { defineMessages } from '../../../../platform/telegram/i18n.js';
import { menuLabels } from '../../../../platform/telegram/main-menu.js';
import { TelegramMessenger } from '../../../../platform/telegram/telegram-messenger.js';
import { showMessage } from '../../../../platform/telegram/ui.js';
import { IdentityQueries } from '../../../identity/index.js';
import { CatalogQueries } from '../../application/catalog.queries.js';
import { type AcceptError, StaffService } from '../../application/staff.service.js';
import type { VenueId } from '../../domain/venue.js';
import { actorOf } from './telegram-actor.js';

const ID = '([0-9a-f]{24})';
export const STAFF_INVITE_PREFIX = 'sf_';

const m = defineMessages(
  {
    title: (venue: string, n: number, limit: string) =>
      `👥 «${venue}» xodimlari (${n}/${limit})\n\nXodim so'rovlarni tasdiqlaydi/rad etadi, qo'lda bandlov va bloklar qo'yadi. Narx va stadionni o'zgartira olmaydi.`,
    empty: "Hozircha xodim yo'q.",
    unlimited: 'cheksiz',
    btnInvite: '➕ Xodim taklif qilish',
    btnBack: '⬅️ Orqaga',
    invite: (link: string) =>
      `Bu havolani xodimingizga yuboring (48 soat, bir martalik):\n\n${link}`,
    limit: "Tarifingizda xodimlar limiti to'lgan. ⭐ PREMIUM'da cheksiz.",
    removed: "✅ Xodim olib tashlandi. Uning ruxsati darhol bekor bo'ldi.",
    youWereRemoved: (venue: string) => `ℹ️ Siz «${venue}» xodimlari ro'yxatidan chiqarildingiz.`,
    joined: (venue: string) =>
      `✅ Siz «${venue}» xodimisiz!\n\nYangi so'rovlar sizga ham keladi. Boshqaruv: 🏟 Stadion egasiman.`,
    ownerNotice: (name: string, venue: string) =>
      `👥 ${name} «${venue}» xodimi sifatida qo'shildi.`,
    staffPanel: (venues: string) => `👥 Siz xodim bo'lgan stadionlar:\n${venues}`,
    btnPending: "🟡 Kutilayotgan so'rovlar",
    btnToday: '📅 Bugungi jadval',
  },
  {
    title: (venue, n, limit) =>
      `👥 Сотрудники «${venue}» (${n}/${limit})\n\nСотрудник подтверждает/отклоняет заявки, вносит брони и блоки. Цены и стадион менять не может.`,
    empty: 'Сотрудников пока нет.',
    unlimited: 'без лимита',
    btnInvite: '➕ Пригласить сотрудника',
    btnBack: '⬅️ Назад',
    invite: (link) => `Отправьте эту ссылку сотруднику (48 часов, одноразовая):\n\n${link}`,
    limit: 'Лимит сотрудников по тарифу исчерпан. В ⭐ PREMIUM — без лимита.',
    removed: '✅ Сотрудник удалён. Его доступ сразу отозван.',
    youWereRemoved: (venue) => `ℹ️ Вы удалены из сотрудников «${venue}».`,
    joined: (venue) =>
      `✅ Вы сотрудник «${venue}»!\n\nНовые заявки будут приходить и вам. Управление: 🏟 Я владелец стадиона.`,
    ownerNotice: (name, venue) => `👥 ${name} добавлен(а) сотрудником «${venue}».`,
    staffPanel: (venues) => `👥 Стадионы, где вы сотрудник:\n${venues}`,
    btnPending: '🟡 Ожидающие заявки',
    btnToday: '📅 Расписание на сегодня',
  },
);

const acceptErrors: Record<AcceptError, { uz: string; ru: string }> = {
  INVALID_INVITE: {
    uz: "Taklif havolasi eskirgan yoki ishlatilgan. Egasidan yangisini so'rang.",
    ru: 'Ссылка устарела или уже использована. Попросите новую у владельца.',
  },
  IS_OWNER: { uz: 'Bu sizning stadioningiz.', ru: 'Это ваш стадион.' },
  ALREADY_STAFF: { uz: 'Siz allaqachon xodimsiz.', ru: 'Вы уже сотрудник.' },
  LIMIT_REACHED: {
    uz: "Bu stadionda xodimlar limiti to'lgan.",
    ru: 'У этого стадиона исчерпан лимит сотрудников.',
  },
};

/** TZ 3: xodimlar (Owner taklif qiladi, xodim deep link orqali qo'shiladi) */
@Injectable()
// /start sf_… Identity'ning /start handler'idan oldin ushlanishi kerak (deep link kabi)
@TelegramFeature(FeatureOrder.MODULE - 5)
export class StaffBotFeature implements BotFeature {
  constructor(
    private readonly staff: StaffService,
    private readonly queries: CatalogQueries,
    private readonly identity: IdentityQueries,
    private readonly messenger: TelegramMessenger,
  ) {}

  register(bot: Composer<BotContext>): void {
    bot.command('start', async (ctx, next) => {
      const payload = ctx.match.trim();
      if (!payload.startsWith(STAFF_INVITE_PREFIX) || !ctx.currentUser) return next();
      const r = await this.staff.accept(
        payload.slice(STAFF_INVITE_PREFIX.length),
        ctx.currentUser.id,
      );
      if (!r.ok) {
        await ctx.reply(acceptErrors[r.error][ctx.lang]);
        return sendMainMenu(ctx);
      }
      await sendMainMenu(ctx, m[ctx.lang].joined(r.value.name));
      const owner = await this.identity.contactOf(r.value.ownerId);
      if (owner)
        await this.messenger.send(
          owner.telegramId,
          m[owner.language].ownerNotice(
            ctx.currentUser.displayName ?? ctx.from?.first_name ?? '—',
            r.value.name,
          ),
        );
    });

    // Faqat xodim (o'z stadioni yo'q) — "🏟 Stadion egasiman" xodim paneliga olib boradi
    bot
      .filter((ctx) => hasRole(ctx, 'STAFF') && !hasRole(ctx, 'OWNER'))
      .hears(menuLabels('owner'), (ctx) => this.showStaffPanel(ctx));

    bot.callbackQuery(new RegExp(`^cat:sf:${ID}$`), async (ctx) => {
      await ctx.answerCallbackQuery();
      await this.show(ctx, ctx.match[1] as string);
    });
    bot.callbackQuery(new RegExp(`^cat:sfi:${ID}$`), async (ctx) => {
      const r = await this.staff.invite(actorOf(ctx), ctx.match[1] as VenueId).catch(() => null);
      if (!r) return void (await ctx.answerCallbackQuery());
      if (!r.ok)
        return void (await ctx.answerCallbackQuery({ text: m[ctx.lang].limit, show_alert: true }));
      await ctx.answerCallbackQuery();
      await ctx.reply(
        m[ctx.lang].invite(
          `https://t.me/${ctx.me.username}?start=${STAFF_INVITE_PREFIX}${r.value}`,
        ),
      );
    });
    bot.callbackQuery(new RegExp(`^cat:sfr:${ID}:${ID}$`), async (ctx) => {
      const [, venueId, userId] = ctx.match;
      const removed = await this.staff
        .remove(actorOf(ctx), venueId as VenueId, userId as string)
        .catch(() => false);
      await ctx.answerCallbackQuery(removed ? { text: m[ctx.lang].removed } : undefined);
      if (!removed) return;
      const [card, ex] = await Promise.all([
        this.queries.venueCard(venueId as string),
        this.identity.contactOf(userId as string),
      ]);
      if (card && ex)
        await this.messenger.send(ex.telegramId, m[ex.language].youWereRemoved(card.venue.name));
      await this.show(ctx, venueId as string);
    });
  }

  private async show(ctx: BotContext, venueId: string): Promise<void> {
    const t = m[ctx.lang];
    const info = await this.staff.staffOf(actorOf(ctx), venueId as VenueId).catch(() => null);
    if (!info) return;
    const contacts = await Promise.all(
      info.venue.staffIds.map((id) => this.identity.contactOf(id)),
    );
    const kb = new InlineKeyboard();
    info.venue.staffIds.forEach((id, i) => {
      const c = contacts[i];
      kb.text(`🗑 ${c?.displayName ?? '—'}`, `cat:sfr:${venueId}:${id}`).row();
    });
    kb.text(t.btnInvite, `cat:sfi:${venueId}`).row().text(t.btnBack, `cat:v:${venueId}`);
    const limit =
      Number.isFinite(info.limit) && info.limit < 100 ? String(info.limit) : t.unlimited;
    const head = t.title(info.venue.name, info.venue.staffIds.length, limit);
    await showMessage(ctx, info.venue.staffIds.length ? head : `${head}\n\n${t.empty}`, kb);
  }

  /** Faqat xodim bo'lgan (o'z stadioni yo'q) foydalanuvchi uchun panel */
  async showStaffPanel(ctx: BotContext): Promise<void> {
    const t = m[ctx.lang];
    const venues = await this.queries.staffVenues(ctx.currentUser?.id ?? '');
    const kb = new InlineKeyboard()
      .text(t.btnPending, 'bk:own:pending')
      .row()
      .text(t.btnToday, 'bk:own:today');
    await ctx.reply(t.staffPanel(venues.map((v) => `• ${v.name}`).join('\n') || '—'), {
      reply_markup: kb,
    });
  }
}
