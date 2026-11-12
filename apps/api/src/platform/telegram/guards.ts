import type { BotContext } from './bot-context.js';

export function hasRole(ctx: BotContext, role: string): boolean {
  return ctx.currentUser?.roles.includes(role) ?? false;
}

/** Admin buyruqlari oddiy foydalanuvchiga ko'rinmaydi: rad etish o'rniga fallback ("menyudan tanlang"). */
export const isAdmin = (ctx: BotContext): boolean => hasRole(ctx, 'ADMIN');

/** "Olmaliq | Алмалык | bozor, rynok" → ["Olmaliq", "Алмалык", "bozor, rynok"] */
export function splitPipe(input: string): string[] {
  return input.split('|').map((part) => part.trim());
}

/** "olmaliq 5-mkr | 5-мкр" → ["olmaliq", "5-mkr | 5-мкр"] */
export function splitFirstWord(input: string): [string, string] {
  const trimmed = input.trim();
  const space = trimmed.search(/\s/);
  return space === -1 ? [trimmed, ''] : [trimmed.slice(0, space), trimmed.slice(space + 1).trim()];
}
