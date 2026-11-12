import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DelayedError, type Job, Queue, UnrecoverableError, Worker } from 'bullmq';
import { GrammyError, type InlineKeyboard } from 'grammy';
import { Redis } from 'ioredis';
import type { Env } from '../../config/env.schema.js';
import { REDIS } from '../redis/redis.module.js';
import { BOT, type PolyaBot } from './telegram.tokens.js';

const QUEUE = 'tg-out';
/** Telegram: umumiy ~30 xabar/s — zaxira bilan 25 (TZ 4.6, EC-T2) */
const GLOBAL_PER_SECOND = 25;
/** Telegram: bitta chatga ~1 xabar/s */
const PER_CHAT_MS = 1_000;

interface OutgoingMessage {
  chatId: number;
  text: string;
  // biome-ignore lint/suspicious/noExplicitAny: InlineKeyboard JSON ko'rinishi
  replyMarkup?: any;
}

type BlockedListener = (chatId: number) => Promise<void>;

/**
 * Boshqa foydalanuvchilarga xabar yuborish (TZ 4.6).
 * - `queue` rejimi (produksiya): BullMQ navbati — rate limit, retry, 429 da `retry_after` kutish.
 * - `direct` rejimi (testlar/lokal): darhol yuboradi.
 * Ikkalasida ham: 403 (bot bloklangan) — qayta urinilmaydi, `onBlocked` tinglovchilariga xabar (EC-T1).
 * Xabarnoma — yon ta'sir: yetkazilmasa ham chaqiruvchi oqim to'xtamaydi.
 */
@Injectable()
export class TelegramMessenger implements OnModuleInit, OnApplicationShutdown {
  readonly #logger = new Logger(TelegramMessenger.name);
  readonly #blockedListeners: BlockedListener[] = [];
  #queue: Queue<OutgoingMessage> | null = null;
  #worker: Worker<OutgoingMessage> | null = null;
  #connection: Redis | null = null;

  constructor(
    @Inject(BOT) private readonly bot: PolyaBot,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onModuleInit(): void {
    if (this.config.get('NOTIFICATIONS_MODE', { infer: true }) !== 'queue') return;
    // BullMQ blokirovka qiluvchi buyruqlar uchun alohida ulanish talab qiladi
    this.#connection = new Redis(this.config.get('REDIS_URL', { infer: true }), {
      maxRetriesPerRequest: null,
      connectionName: 'polya-bullmq',
    });
    this.#connection.on('error', () => undefined);
    this.#queue = new Queue<OutgoingMessage>(QUEUE, { connection: this.#connection });
    this.#worker = new Worker<OutgoingMessage>(QUEUE, (job, token) => this.process(job, token), {
      connection: this.#connection,
      concurrency: 5,
      limiter: { max: GLOBAL_PER_SECOND, duration: 1_000 },
    });
    this.#worker.on('failed', (job, error) =>
      this.#logger.warn(
        { err: error, chatId: job?.data.chatId, attempts: job?.attemptsMade },
        'Delivery failed',
      ),
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.#worker?.close();
    await this.#queue?.close();
    await this.#connection?.quit().catch(() => undefined);
  }

  /** Identity shu orqali "bot bloklangan" holatini saqlaydi (platforma Identity'ni bilmaydi). */
  onBlocked(listener: BlockedListener): void {
    this.#blockedListeners.push(listener);
  }

  /** @returns qabul qilindi (navbatga qo'yildi yoki yuborildi) */
  async send(chatId: number, text: string, keyboard?: InlineKeyboard): Promise<boolean> {
    const message: OutgoingMessage = {
      chatId,
      text,
      ...(keyboard ? { replyMarkup: keyboard } : {}),
    };
    if (this.#queue) {
      await this.#queue.add('send', message, {
        attempts: 5,
        backoff: { type: 'exponential', delay: 2_000 },
        removeOnComplete: 1_000,
        removeOnFail: 5_000,
      });
      return true;
    }
    try {
      await this.deliver(message);
      return true;
    } catch (error) {
      await this.classify(error, message.chatId);
      this.#logger.warn({ err: error, chatId }, 'Message was not delivered');
      return false;
    }
  }

  async sendToMany(
    chatIds: readonly number[],
    text: string,
    keyboard?: InlineKeyboard,
  ): Promise<number> {
    let accepted = 0;
    for (const chatId of chatIds) if (await this.send(chatId, text, keyboard)) accepted++;
    return accepted;
  }

  private async process(job: Job<OutgoingMessage>, token: string | undefined): Promise<void> {
    // Bitta chatga sekundiga bitta xabar: band bo'lsa — keyinroqqa suriladi
    const free = await this.redis.set(
      `tg:chat-rate:${job.data.chatId}`,
      '1',
      'PX',
      PER_CHAT_MS,
      'NX',
    );
    if (free !== 'OK') {
      await job.moveToDelayed(Date.now() + PER_CHAT_MS, token);
      throw new DelayedError();
    }
    try {
      await this.deliver(job.data);
    } catch (error) {
      const verdict = await this.classify(error, job.data.chatId);
      if (verdict.retryAfterSec !== null) {
        await job.moveToDelayed(Date.now() + verdict.retryAfterSec * 1_000, token);
        throw new DelayedError();
      }
      if (verdict.permanent) throw new UnrecoverableError(String(error));
      throw error;
    }
  }

  private async deliver(message: OutgoingMessage): Promise<void> {
    await this.bot.api.sendMessage(
      message.chatId,
      message.text,
      message.replyMarkup ? { reply_markup: message.replyMarkup } : {},
    );
  }

  /** 403 — bloklangan (doimiy), 400 chat topilmadi (doimiy), 429 — kutish, qolgani — vaqtinchalik. */
  private async classify(
    error: unknown,
    chatId: number,
  ): Promise<{ permanent: boolean; retryAfterSec: number | null }> {
    if (!(error instanceof GrammyError)) return { permanent: false, retryAfterSec: null };
    if (error.error_code === 429)
      return { permanent: false, retryAfterSec: error.parameters.retry_after ?? 5 };
    if (error.error_code === 403) {
      for (const listener of this.#blockedListeners) await listener(chatId).catch(() => undefined);
      return { permanent: true, retryAfterSec: null };
    }
    if (error.error_code === 400) return { permanent: true, retryAfterSec: null };
    return { permanent: false, retryAfterSec: null };
  }
}
