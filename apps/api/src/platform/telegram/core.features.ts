import { Injectable } from '@nestjs/common';
import type { Composer } from 'grammy';
import type { BotContext } from './bot-context.js';
import { type BotFeature, FeatureOrder, TelegramFeature } from './bot-feature.js';
import { CANCEL_LABELS, coreMessages } from './core.messages.js';
import { isMainMenuLabel, mainMenuKeyboard } from './main-menu.js';

export async function sendMainMenu(ctx: BotContext, text?: string): Promise<void> {
  await ctx.reply(text ?? coreMessages[ctx.lang].mainMenu, {
    reply_markup: mainMenuKeyboard(ctx.lang),
  });
}

/** "Bekor qilish" va /menu — har qanday ko'p qadamli oqimdan chiqish (modul handler'laridan oldin). */
@Injectable()
@TelegramFeature(FeatureOrder.CORE_EARLY)
export class CoreEarlyFeature implements BotFeature {
  register(bot: Composer<BotContext>): void {
    const reset = async (ctx: BotContext, text?: string) => {
      ctx.session.awaiting = undefined;
      ctx.session.afterPhone = undefined;
      await sendMainMenu(ctx, text);
    };
    bot.hears(CANCEL_LABELS, (ctx) => reset(ctx, coreMessages[ctx.lang].cancelled));
    bot.command('menu', (ctx) => reset(ctx));
  }
}

/** Hech bir modul tutmagan update'lar (TZ EC-T3, EC-T9). */
@Injectable()
@TelegramFeature(FeatureOrder.FALLBACK)
export class CoreFallbackFeature implements BotFeature {
  register(bot: Composer<BotContext>): void {
    // Eskirgan inline tugma: "soat" aylanmasin, foydalanuvchi menyuga qaytsin
    bot.on('callback_query', async (ctx) => {
      await ctx.answerCallbackQuery({ text: coreMessages[ctx.lang].staleButton });
      await sendMainMenu(ctx);
    });

    bot.on('message', async (ctx) => {
      const text = ctx.message.text;
      await sendMainMenu(
        ctx,
        isMainMenuLabel(text) ? coreMessages[ctx.lang].comingSoon : coreMessages[ctx.lang].unknown,
      );
    });
  }
}
