import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { session } from 'grammy';
import type { Redis } from 'ioredis';
import type { Env } from '../../config/env.schema.js';
import { REDIS } from '../redis/redis.module.js';
import type { BotContext, SessionData } from './bot-context.js';
import { BOT_FEATURE_ORDER, type BotFeature } from './bot-feature.js';
import { coreMessages } from './core.messages.js';
import { dedupUpdates, defaultLanguage } from './middlewares.js';
import { RedisSessionStorage } from './redis-session.storage.js';
import {
  ALLOWED_UPDATES,
  BOT,
  type PolyaBot,
  SESSION_TTL_SECONDS,
  WEBHOOK_PATH,
} from './telegram.tokens.js';

/**
 * Bot middleware zanjirini yig'adi va rejimga qarab ishga tushiradi:
 *   dedup → til → guruh filtri → sessiya → modul feature'lari (order bo'yicha)
 */
@Injectable()
export class TelegramBotService implements OnApplicationBootstrap, OnApplicationShutdown {
  readonly #logger = new Logger(TelegramBotService.name);
  #composed = false;

  constructor(
    @Inject(BOT) private readonly bot: PolyaBot,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly config: ConfigService<Env, true>,
    private readonly discovery: DiscoveryService,
    private readonly reflector: Reflector,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.compose();
    const mode = this.config.get('TELEGRAM_MODE', { infer: true });
    if (mode === 'polling') this.startPolling();
    if (mode === 'webhook') await this.setupWebhook();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.bot.isRunning()) await this.bot.stop();
  }

  private compose(): void {
    if (this.#composed) return;
    this.#composed = true;
    const bot = this.bot;

    bot.use(dedupUpdates(this.redis));
    bot.use(defaultLanguage);

    // TZ EC-T8: MVP faqat shaxsiy chatda. Guruhda faqat /start ga yo'riqnoma, qolgani jim.
    const nonPrivate = bot.filter((ctx) => ctx.chat !== undefined && ctx.chat.type !== 'private');
    nonPrivate.command('start', (ctx) =>
      ctx.reply(coreMessages[ctx.lang].privateOnly(ctx.me.username)),
    );
    nonPrivate.use(() => undefined);

    bot.use(
      session<SessionData, BotContext>({
        initial: () => ({}),
        storage: new RedisSessionStorage<SessionData>(this.redis, SESSION_TTL_SECONDS),
        getSessionKey: (ctx) => ctx.from?.id.toString(),
      }),
    );

    for (const feature of this.discoverFeatures()) feature.register(bot);

    bot.catch((error) => {
      this.#logger.error(
        { err: error.error, updateId: error.ctx.update.update_id },
        'Unhandled bot error',
      );
    });
  }

  private discoverFeatures(): BotFeature[] {
    return this.discovery
      .getProviders()
      .flatMap((wrapper) => {
        if (!wrapper.metatype || !wrapper.instance) return [];
        const order = this.reflector.get<number | undefined>(BOT_FEATURE_ORDER, wrapper.metatype);
        return order === undefined ? [] : [{ order, feature: wrapper.instance as BotFeature }];
      })
      .sort((a, b) => a.order - b.order)
      .map((x) => x.feature);
  }

  private startPolling(): void {
    void this.bot
      .start({
        allowed_updates: [...ALLOWED_UPDATES],
        onStart: (info) => this.#logger.log(`Bot @${info.username} started (long polling)`),
      })
      .catch((error: unknown) => this.#logger.error({ err: error }, 'Polling stopped with error'));
    void this.setCommands();
  }

  private async setupWebhook(): Promise<void> {
    const url = `${this.config.get('PUBLIC_URL', { infer: true })}/api/v1/${WEBHOOK_PATH}`;
    await this.bot.init();
    await this.bot.api.setWebhook(url, {
      secret_token: this.config.get('TELEGRAM_WEBHOOK_SECRET', { infer: true }),
      allowed_updates: [...ALLOWED_UPDATES],
    });
    await this.setCommands();
    this.#logger.log(`Bot @${this.bot.botInfo.username} webhook set: ${url}`);
  }

  private async setCommands(): Promise<void> {
    try {
      await this.bot.api.setMyCommands([
        { command: 'start', description: 'Boshlash' },
        { command: 'menu', description: 'Asosiy menyu' },
      ]);
      await this.bot.api.setMyCommands(
        [
          { command: 'start', description: 'Начать' },
          { command: 'menu', description: 'Главное меню' },
        ],
        { language_code: 'ru' },
      );
    } catch (error) {
      this.#logger.warn({ err: error }, 'setMyCommands failed');
    }
  }
}
