import { Inject, Injectable, Logger } from '@nestjs/common';
import type { InlineKeyboard } from 'grammy';
import { BOT, type PolyaBot } from './telegram.tokens.js';

/**
 * Boshqa foydalanuvchiga (admin, Owner, Player) xabar yuborish.
 * Yetkazilmasa (bot bloklangan — EC-T1, chat yo'q) xato log'ga yoziladi, chaqiruvchi oqim to'xtamaydi.
 * 5-bosqichda Outbox + navbat (rate limit, retry) bilan almashtiriladi — chaqiruv joylari o'zgarmaydi.
 */
@Injectable()
export class TelegramMessenger {
  readonly #logger = new Logger(TelegramMessenger.name);

  constructor(@Inject(BOT) private readonly bot: PolyaBot) {}

  async send(chatId: number, text: string, keyboard?: InlineKeyboard): Promise<boolean> {
    try {
      await this.bot.api.sendMessage(chatId, text, keyboard ? { reply_markup: keyboard } : {});
      return true;
    } catch (error) {
      this.#logger.warn({ err: error, chatId }, 'Message was not delivered');
      return false;
    }
  }

  async sendToMany(
    chatIds: readonly number[],
    text: string,
    keyboard?: InlineKeyboard,
  ): Promise<number> {
    let delivered = 0;
    for (const chatId of chatIds) if (await this.send(chatId, text, keyboard)) delivered++;
    return delivered;
  }
}
