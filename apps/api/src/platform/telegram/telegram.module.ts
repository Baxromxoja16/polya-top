import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DiscoveryModule } from '@nestjs/core';
import { Bot } from 'grammy';
import type { Env } from '../../config/env.schema.js';
import type { BotContext } from './bot-context.js';
import { CoreEarlyFeature, CoreFallbackFeature } from './core.features.js';
import { BOT } from './telegram.tokens.js';
import { TelegramBotService } from './telegram-bot.service.js';
import { TelegramMessenger } from './telegram-messenger.js';
import { TelegramWebhookController } from './telegram-webhook.controller.js';

/** Token yo'q (TELEGRAM_MODE=off) — bot Telegram'ga hech qachon ulanmaydi, lekin DI grafi to'liq. */
const DISABLED_TOKEN = '0:disabled';

@Global()
@Module({
  imports: [DiscoveryModule],
  controllers: [TelegramWebhookController],
  providers: [
    {
      provide: BOT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new Bot<BotContext>(config.get('TELEGRAM_BOT_TOKEN', { infer: true }) ?? DISABLED_TOKEN),
    },
    TelegramBotService,
    TelegramMessenger,
    CoreEarlyFeature,
    CoreFallbackFeature,
  ],
  exports: [BOT, TelegramMessenger],
})
export class TelegramModule {}
