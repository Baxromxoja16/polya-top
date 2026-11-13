import { Injectable } from '@nestjs/common';
import { PhoneNumber } from '@polya/shared-kernel';
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
import { AdminDirectory } from '../../application/admin-directory.js';
import {
  ReviewOwnerApplicationUseCase,
  SubmitOwnerApplicationUseCase,
} from '../../application/owner-application.use-cases.js';
import { OwnerApplicationRepository } from '../../domain/owner-application.js';
import type { UserId } from '../../domain/user.js';
import { adminApplicationText, ownerApplicationMessages } from './owner-application.messages.js';
import { PhoneGate } from './phone-gate.js';

const AWAIT_NOTE = 'identity.owner.note';
const AFTER_PHONE = 'identity.owner.apply';

/**
 * TZ VC-1: "🏟 Stadion egasiman" — Owner bo'lmaganlar uchun ariza oqimi.
 * Owner'lar uchun shu tugmani Catalog konteksti (keyinroq ulanadi) ushlaydi.
 */
@Injectable()
@TelegramFeature(FeatureOrder.MODULE)
export class OwnerApplicationBotFeature implements BotFeature {
  constructor(
    private readonly submit: SubmitOwnerApplicationUseCase,
    private readonly review: ReviewOwnerApplicationUseCase,
    private readonly applications: OwnerApplicationRepository,
    private readonly admins: AdminDirectory,
    private readonly phoneGate: PhoneGate,
    private readonly messenger: TelegramMessenger,
  ) {
    phoneGate.onVerified(AFTER_PHONE, (ctx) => this.askNote(ctx));
  }

  register(bot: Composer<BotContext>): void {
    bot.hears(menuLabels('owner'), async (ctx, next) => {
      // Owner va xodimlar uchun panel Catalog'da (xodim ariza bermaydi)
      if (hasRole(ctx, 'OWNER') || hasRole(ctx, 'STAFF')) return next();
      const userId = ctx.currentUser?.id as UserId | undefined;
      if (userId && (await this.applications.findPendingByUser(userId))) {
        await ctx.reply(ownerApplicationMessages[ctx.lang].alreadyPending);
        return;
      }
      if (!(await this.phoneGate.require(ctx, { kind: AFTER_PHONE }))) return;
      await this.askNote(ctx);
    });

    bot.on('message:text', async (ctx, next) => {
      if (ctx.session.awaiting?.kind !== AWAIT_NOTE || isMainMenuLabel(ctx.message.text)) {
        return next();
      }
      const m = ownerApplicationMessages[ctx.lang];
      const result = await this.submit.execute({ telegramId: ctx.from.id, note: ctx.message.text });
      if (!result.ok && result.error === 'INVALID_NOTE') {
        await ctx.reply(m.invalidNote);
        return;
      }
      ctx.session.awaiting = undefined;
      if (!result.ok) {
        await sendMainMenu(ctx, result.error === 'ALREADY_PENDING' ? m.alreadyPending : undefined);
        return;
      }
      await sendMainMenu(ctx, m.submitted);
      await this.notifyAdmins(ctx, result.value.id, result.value.note);
    });

    const admin = bot.filter(isAdmin);
    admin.callbackQuery(/^own:(ok|no):([0-9a-f]{24})$/, async (ctx) => {
      const decision = ctx.match[1] === 'ok' ? 'APPROVE' : 'REJECT';
      const result = await this.review.execute({
        applicationId: ctx.match[2] as string,
        reviewerTelegramId: ctx.from.id,
        decision,
      });
      if (!result.ok) {
        await ctx.answerCallbackQuery({
          text: result.error === 'ALREADY_REVIEWED' ? "Allaqachon ko'rib chiqilgan" : 'Topilmadi',
          show_alert: true,
        });
        return;
      }
      await ctx.answerCallbackQuery();
      const verdict = decision === 'APPROVE' ? '✅ Tasdiqlandi' : '❌ Rad etildi';
      await ctx.editMessageText(
        `${ctx.callbackQuery.message?.text ?? ''}\n\n${verdict} — ${ctx.from.first_name}`,
      );

      const { applicant, application } = result.value;
      const m = ownerApplicationMessages[applicant.language];
      await this.messenger.send(
        applicant.telegramId,
        decision === 'APPROVE' ? m.approved : m.rejected(application.rejectReason),
      );
    });
  }

  private async askNote(ctx: BotContext): Promise<void> {
    ctx.session.awaiting = { kind: AWAIT_NOTE };
    await ctx.reply(ownerApplicationMessages[ctx.lang].askNote, {
      reply_markup: new Keyboard().text(coreMessages[ctx.lang].cancel).resized().oneTime(),
    });
  }

  private async notifyAdmins(ctx: BotContext, applicationId: string, note: string): Promise<void> {
    const user = ctx.currentUser;
    const text = adminApplicationText({
      name: user?.displayName ?? ctx.from?.first_name ?? '—',
      phone: user?.phone ? PhoneNumber.parse(user.phone).format() : '—',
      username: ctx.from?.username ?? null,
      note,
    });
    const keyboard = new InlineKeyboard()
      .text('✅ Tasdiqlash', `own:ok:${applicationId}`)
      .text('❌ Rad etish', `own:no:${applicationId}`);
    await this.messenger.sendToMany(this.admins.telegramIds(), text, keyboard);
  }
}
