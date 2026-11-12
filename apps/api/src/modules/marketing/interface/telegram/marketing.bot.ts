import { Injectable } from '@nestjs/common';
import type { Composer } from 'grammy';
import type { BotContext } from '../../../../platform/telegram/bot-context.js';
import {
  type BotFeature,
  FeatureOrder,
  TelegramFeature,
} from '../../../../platform/telegram/bot-feature.js';
import { MarketingService } from '../../application/marketing.service.js';

/**
 * MK-7: kampaniya tugmasi bosilishini hisoblaydi va boshqaruvni stadion kartochkasiga beradi.
 * Catalog'ni bilmaydi — faqat callback protokoli: `mk:o:<campaign>:<venue>` → `cat:c:<venue>`.
 * Shuning uchun modul handler'laridan oldin ishlaydi.
 */
@Injectable()
@TelegramFeature(FeatureOrder.MODULE - 10)
export class MarketingBotFeature implements BotFeature {
  constructor(private readonly marketing: MarketingService) {}

  register(bot: Composer<BotContext>): void {
    bot.callbackQuery(/^mk:o:([0-9a-f]{24}):([0-9a-f]{24})$/, async (ctx, next) => {
      await this.marketing.record(ctx.match[1] as string, 'clicked');
      ctx.callbackQuery.data = `cat:c:${ctx.match[2]}`;
      await next();
    });
  }
}
