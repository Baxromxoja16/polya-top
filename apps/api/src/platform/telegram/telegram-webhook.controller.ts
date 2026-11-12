import { timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Logger,
  NotFoundException,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Update } from 'grammy/types';
import type { Env } from '../../config/env.schema.js';
import { BOT, type PolyaBot, WEBHOOK_PATH } from './telegram.tokens.js';

const SECRET_HEADER = 'x-telegram-bot-api-secret-token';

@Controller()
export class TelegramWebhookController {
  readonly #logger = new Logger(TelegramWebhookController.name);

  constructor(
    @Inject(BOT) private readonly bot: PolyaBot,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Telegram webhook. Secret header tekshiriladi (soxta update'lardan himoya).
   * Handler xatosi bo'lsa ham 200 qaytariladi: aks holda Telegram update'ni qayta-qayta yuboradi
   * (xato log'ga yoziladi, takrorlanish esa dedup bilan yopilgan).
   */
  @Post(WEBHOOK_PATH)
  @HttpCode(200)
  async handle(
    @Headers(SECRET_HEADER) secret: string | undefined,
    @Body() update: Update,
  ): Promise<{ ok: true }> {
    if (this.config.get('TELEGRAM_MODE', { infer: true }) !== 'webhook') {
      throw new NotFoundException();
    }
    if (
      !secret ||
      !safeEqual(secret, this.config.get('TELEGRAM_WEBHOOK_SECRET', { infer: true }))
    ) {
      throw new UnauthorizedException();
    }
    if (typeof update !== 'object' || update === null || typeof update.update_id !== 'number') {
      throw new BadRequestException('Invalid Telegram update');
    }
    try {
      await this.bot.handleUpdate(update);
    } catch (error) {
      this.#logger.error({ err: error, updateId: update.update_id }, 'Webhook update failed');
    }
    return { ok: true };
  }
}

function safeEqual(a: string, b: string | undefined): boolean {
  if (b === undefined) return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
