import { Injectable } from '@nestjs/common';
import type { Composer } from 'grammy';
import type { BotContext } from './bot-context.js';
import { type BotFeature, FeatureOrder, TelegramFeature } from './bot-feature.js';
import { CANCEL_LABELS, coreMessages } from './core.messages.js';
import { isAdmin } from './guards.js';
import {
  ADMIN_MENU,
  adminMenuKeyboard,
  isAdminMenuLabel,
  isMainMenuLabel,
  mainMenuKeyboard,
} from './main-menu.js';

const ADMIN_MENU_TITLE = '🛠 Admin panel 👇';

/** Admin'ga — admin menyusi (o'yinchi rejimini tanlamagan bo'lsa), qolganlarga — o'yinchi menyusi. */
export async function sendMainMenu(ctx: BotContext, text?: string): Promise<void> {
  const admin = isAdmin(ctx);
  const adminMenu = admin && ctx.session.menuMode !== 'player';
  await ctx.reply(text ?? (adminMenu ? ADMIN_MENU_TITLE : coreMessages[ctx.lang].mainMenu), {
    reply_markup: adminMenu ? adminMenuKeyboard() : mainMenuKeyboard(ctx.lang, admin),
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

    // Admin: admin menyusi ↔ o'yinchi menyusi (Owner'dagi "🏟 Stadion egasiman" kabi)
    const admin = bot.filter(isAdmin);
    admin.hears(ADMIN_MENU.playerMode, (ctx) => {
      ctx.session.menuMode = 'player';
      return reset(ctx);
    });
    admin.hears(ADMIN_MENU.adminMode, (ctx) => {
      ctx.session.menuMode = undefined;
      return reset(ctx);
    });
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
      const known = isMainMenuLabel(text) && (isAdmin(ctx) || !isAdminMenuLabel(text));
      await sendMainMenu(
        ctx,
        known ? coreMessages[ctx.lang].comingSoon : coreMessages[ctx.lang].unknown,
      );
    });
  }
}
