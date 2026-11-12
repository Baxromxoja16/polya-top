import type { Bot } from 'grammy';
import type { BotContext } from './bot-context.js';

export const BOT = Symbol('BOT');
export type PolyaBot = Bot<BotContext>;

export const WEBHOOK_PATH = 'telegram/webhook';

/** Faqat kerakli update turlari — keraksiz trafik va ishlov berish yo'q. */
export const ALLOWED_UPDATES = ['message', 'callback_query', 'my_chat_member'] as const;

export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
