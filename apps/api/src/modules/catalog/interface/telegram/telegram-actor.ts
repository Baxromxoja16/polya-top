import type { BotContext } from '../../../../platform/telegram/bot-context.js';
import type { Actor } from '../../application/actor.js';

export function actorOf(ctx: BotContext): Actor {
  const u = ctx.currentUser;
  return {
    userId: u?.id ?? '',
    roles: u?.roles ?? [],
    phone: u?.phone ?? null,
    cityId: u?.cityId ?? null,
  };
}
