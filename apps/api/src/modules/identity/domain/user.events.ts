import type { DomainEvent } from '@polya/shared-kernel';

export const UserEvents = {
  Registered: 'identity.user.registered',
  PhoneVerified: 'identity.user.phone_verified',
  PhoneReleased: 'identity.user.phone_released',
  BotBlocked: 'identity.user.bot_blocked',
  BotUnblocked: 'identity.user.bot_unblocked',
} as const;

export type UserRegistered = DomainEvent<
  typeof UserEvents.Registered,
  { telegramId: number; language: string }
>;
export type UserPhoneVerified = DomainEvent<
  typeof UserEvents.PhoneVerified,
  { phone: string; previousPhone: string | null }
>;
/** Raqam boshqa Telegram akkauntiga o'tdi (TZ EC-B12): eski akkauntdan olib tashlandi. */
export type UserPhoneReleased = DomainEvent<typeof UserEvents.PhoneReleased, { phone: string }>;
export type UserBotBlocked = DomainEvent<typeof UserEvents.BotBlocked, Record<string, never>>;
export type UserBotUnblocked = DomainEvent<typeof UserEvents.BotUnblocked, Record<string, never>>;
