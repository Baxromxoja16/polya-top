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
import { dedupUpdates, defaultLanguage, rateLimit } from './middlewares.js';
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

    // Xatolar chegarasi: webhook ham, polling ham (handleUpdate bot.catch'ni chaqirmaydi)
    bot.use(async (ctx, next) => {
      try {
        await next();
      } catch (error) {
        await this.onError(ctx, error);
      }
    });
    bot.use(dedupUpdates(this.redis));
    bot.use(defaultLanguage);
    bot.use(rateLimit(this.redis, this.config.get('BOT_RATE_LIMIT_PER_MINUTE', { infer: true })));

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

    // Polling rejimida grammY'ning o'zi ushlaydigan xatolar uchun (odatda bu yerga yetib kelmaydi)
    bot.catch((error) => this.onError(error.ctx, error.error));
  }

  private async onError(ctx: BotContext, error: unknown): Promise<void> {
    this.#logger.error({ err: error, updateId: ctx.update.update_id }, 'Unhandled bot error');
    // Foydalanuvchiga — "kutilmagan xatolik"; tugma aylanib qolmasin
    const text = coreMessages[ctx.lang ?? 'uz'].error;
    await (ctx.callbackQuery
      ? ctx.answerCallbackQuery({ text, show_alert: true })
      : ctx.chat?.type === 'private'
        ? ctx.reply(text)
        : Promise.resolve()
    ).catch(() => undefined);
    await this.alertAdmins(error);
  }

  /**
   * TZ 7 (monitoring): self-hosted muhitda Sentry o'rniga — adminlarga Telegram'da qisqa xabar.
   * Daqiqasiga ko'pi bilan bitta (Redis SET NX), batafsili — log'da.
   */
  private async alertAdmins(error: unknown): Promise<void> {
    const admins = this.config.get('ADMIN_TELEGRAM_IDS', { infer: true });
    if (admins.length === 0) return;
    const fresh = await this.redis.set('tg:alert:bot-error', '1', 'EX', 60, 'NX').catch(() => null);
    if (fresh !== 'OK') return;
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    const text = `🚨 Botda kutilmagan xatolik:\n${message.slice(0, 500)}\n\nBatafsil — server log'ida.`;
    for (const id of admins) await this.bot.api.sendMessage(id, text).catch(() => undefined);
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
