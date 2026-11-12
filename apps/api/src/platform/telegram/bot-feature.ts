import { SetMetadata } from '@nestjs/common';
import type { Composer } from 'grammy';
import type { BotContext } from './bot-context.js';

export const BOT_FEATURE_ORDER = Symbol('polya:bot-feature-order');

/**
 * Bot middleware'lari bajarilish tartibi. Kichik raqam — oldinroq.
 * Kontekst middleware'lari (foydalanuvchini yuklash) handler'lardan oldin turishi shart.
 */
export const FeatureOrder = {
  CONTEXT: 0,
  CORE_EARLY: 50,
  MODULE: 100,
  FALLBACK: 1000,
} as const;

/**
 * Bounded context o'z bot handler'larini platformaga shu interfeys orqali qo'shadi.
 * Platforma ularni `DiscoveryService` bilan topadi — modullar bir-birini bilmaydi.
 */
export interface BotFeature {
  register(bot: Composer<BotContext>): void;
}

export const TelegramFeature = (order: number): ClassDecorator =>
  SetMetadata(BOT_FEATURE_ORDER, order);
