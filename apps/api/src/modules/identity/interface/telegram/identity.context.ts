import { Injectable } from '@nestjs/common';
import type { Composer } from 'grammy';
import type { BotContext, CurrentUser } from '../../../../platform/telegram/bot-context.js';
import {
  type BotFeature,
  FeatureOrder,
  TelegramFeature,
} from '../../../../platform/telegram/bot-feature.js';
import { EnsureUserUseCase } from '../../application/ensure-user.use-case.js';
import type { User } from '../../domain/user.js';
import { identityMessages } from './identity.messages.js';

export function toCurrentUser(user: User, isNew: boolean): CurrentUser {
  return {
    id: user.id,
    telegramId: user.telegramId,
    language: user.language,
    displayName: user.displayName,
    phone: user.phone?.value ?? null,
    cityId: user.cityId,
    roles: user.roles,
    marketingOptOut: user.marketingOptOut,
    isNew,
  };
}

/**
 * Har bir update uchun foydalanuvchini yuklaydi/yaratadi (TZ ID-1) va `ctx.currentUser`, `ctx.lang`ni
 * to'ldiradi. Boshqa modullar foydalanuvchini shu yerdan oladi — Identity'ning ichiga kirmaydi.
 */
@Injectable()
@TelegramFeature(FeatureOrder.CONTEXT)
export class IdentityContextFeature implements BotFeature {
  constructor(private readonly ensureUser: EnsureUserUseCase) {}

  register(bot: Composer<BotContext>): void {
    bot.use(async (ctx, next) => {
      const from = ctx.from;
      if (!from || from.is_bot) return next();

      const { user, isNew } = await this.ensureUser.execute({
        telegramId: from.id,
        profile: {
          firstName: from.first_name,
          lastName: from.last_name ?? null,
          username: from.username ?? null,
        },
        locale: from.language_code,
        interacted: ctx.myChatMember === undefined,
      });
      ctx.currentUser = toCurrentUser(user, isNew);
      ctx.lang = user.language;
      // TZ AD-2: bloklangan foydalanuvchiga bot xizmat qilmaydi (xizmat update'lari bundan mustasno)
      if (user.status === 'BLOCKED' && !ctx.myChatMember) {
        const text = identityMessages[ctx.lang].accountBlocked;
        if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text, show_alert: true });
        else if (ctx.message) await ctx.reply(text);
        return;
      }
      await next();
    });
  }
}
