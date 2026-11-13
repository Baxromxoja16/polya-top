import { Injectable } from '@nestjs/common';
import type { Composer } from 'grammy';
import type { BotContext } from '../../../../platform/telegram/bot-context.js';
import {
  type BotFeature,
  FeatureOrder,
  TelegramFeature,
} from '../../../../platform/telegram/bot-feature.js';
import { hasRole } from '../../../../platform/telegram/guards.js';
import { SetDailyScheduleUseCase } from '../../application/update-profile.use-cases.js';
import { toCurrentUser } from './identity.context.js';
import { identityMessages } from './identity.messages.js';

/**
 * TZ 4.6: Owner panelidagi "🗓 Kunlik jadval" tugmasi (`id:daily:on|off`). Sozlama Identity'da;
 * saqlangach boshqaruv Owner paneliga (`cat:panel`) beriladi — u yangilangan holatni chizadi.
 * Shuning uchun modul handler'laridan oldin ishlaydi.
 */
@Injectable()
@TelegramFeature(FeatureOrder.MODULE - 10)
export class OwnerPreferencesBotFeature implements BotFeature {
  constructor(private readonly setDaily: SetDailyScheduleUseCase) {}

  register(bot: Composer<BotContext>): void {
    bot
      .filter((ctx) => hasRole(ctx, 'OWNER'))
      .callbackQuery(/^id:daily:(on|off)$/, async (ctx, next) => {
        const off = ctx.match[1] === 'off';
        const user = await this.setDaily.execute({ telegramId: ctx.from.id, off });
        ctx.currentUser = toCurrentUser(user, false);
        const m = identityMessages[ctx.lang];
        await ctx.answerCallbackQuery({ text: off ? m.dailyOff : m.dailyOn });
        ctx.callbackQuery.data = 'cat:panel';
        await next();
      });
  }
}
