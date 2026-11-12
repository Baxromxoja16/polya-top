import { GrammyError, type InlineKeyboard } from 'grammy';
import type { BotContext } from './bot-context.js';

/**
 * Inline tugmadan kelgan bo'lsa — o'sha xabarni tahrirlaydi (chat to'lib ketmaydi, TZ 5.4).
 * Tahrirlab bo'lmasa (xabar eski yoki o'chirilgan, TZ EC-T4) — yangi xabar yuboradi.
 */
export async function showMessage(
  ctx: BotContext,
  text: string,
  keyboard?: InlineKeyboard,
): Promise<void> {
  const extra = keyboard ? { reply_markup: keyboard } : {};
  if (ctx.callbackQuery?.message) {
    try {
      await ctx.editMessageText(text, extra);
      return;
    } catch (error) {
      if (isNotModified(error)) return;
      if (!(error instanceof GrammyError)) throw error;
    }
  }
  await ctx.reply(text, extra);
}

function isNotModified(error: unknown): boolean {
  return error instanceof GrammyError && error.description.includes('message is not modified');
}
