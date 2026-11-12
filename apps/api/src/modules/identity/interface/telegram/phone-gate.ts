import { Injectable } from '@nestjs/common';
import { Keyboard } from 'grammy';
import type { BotContext, PendingStep } from '../../../../platform/telegram/bot-context.js';
import { coreMessages } from '../../../../platform/telegram/core.messages.js';
import { identityMessages } from './identity.messages.js';

export const AWAITING_PHONE = 'identity.phone';

type Continuation = (ctx: BotContext, data: Record<string, unknown>) => Promise<void>;

/**
 * TZ 5.2, 6-qadam: telefon talab qilinadigan amal (masalan, bandlash) oldidan chaqiriladi.
 * Raqam bo'lmasa — so'raydi va amalni eslab qoladi; raqam kelgach o'sha amal davom etadi.
 *
 *   if (!(await phoneGate.require(ctx, { kind: 'booking.confirm', data: { slotId } }))) return;
 *   phoneGate.onVerified('booking.confirm', (ctx, data) => ...);
 */
@Injectable()
export class PhoneGate {
  readonly #continuations = new Map<string, Continuation>();

  onVerified(kind: string, continuation: Continuation): void {
    if (this.#continuations.has(kind)) throw new Error(`Continuation "${kind}" already registered`);
    this.#continuations.set(kind, continuation);
  }

  /** @returns `true` — raqam bor, davom etish mumkin; `false` — raqam so'raldi. */
  async require(ctx: BotContext, then?: PendingStep): Promise<boolean> {
    if (ctx.currentUser?.phone) return true;
    ctx.session.afterPhone = then;
    await askForPhone(ctx);
    return false;
  }

  /** Raqam tasdiqlangandan keyin. @returns kutilgan amal bajarildimi */
  async resume(ctx: BotContext): Promise<boolean> {
    const step = ctx.session.afterPhone;
    ctx.session.afterPhone = undefined;
    const continuation = step ? this.#continuations.get(step.kind) : undefined;
    if (!step || !continuation) return false;
    await continuation(ctx, step.data ?? {});
    return true;
  }
}

export async function askForPhone(ctx: BotContext): Promise<void> {
  const m = identityMessages[ctx.lang];
  ctx.session.awaiting = { kind: AWAITING_PHONE };
  await ctx.reply(m.askPhone, {
    reply_markup: new Keyboard()
      .requestContact(m.btnSharePhone)
      .row()
      .text(coreMessages[ctx.lang].cancel)
      .resized()
      .oneTime(),
  });
}
