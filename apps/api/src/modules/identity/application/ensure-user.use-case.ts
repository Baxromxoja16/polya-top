import { Injectable } from '@nestjs/common';
import { Clock, IdGenerator, languageFromLocale } from '@polya/shared-kernel';
import { type TelegramId, type TelegramProfile, User, type UserId } from '../domain/user.js';
import { UserAlreadyExistsError, UserRepository } from '../domain/user.repository.js';

export interface EnsureUserInput {
  telegramId: number;
  profile: TelegramProfile;
  /** Telegram `language_code` — faqat yangi foydalanuvchining boshlang'ich tili uchun. */
  locale?: string | undefined;
  /**
   * Foydalanuvchi botga haqiqatan yozdimi (xabar/tugma). `true` bo'lsa, "bot bloklangan" belgisi
   * olib tashlanadi (TZ ID-6). `my_chat_member` kabi xizmat update'larida `false`.
   */
  interacted: boolean;
}

export interface EnsureUserOutput {
  user: User;
  isNew: boolean;
}

/**
 * TZ ID-1: foydalanuvchini telegramId bo'yicha topadi yoki yaratadi — idempotent.
 * Ikki parallel update (ikki marta /start) bitta foydalanuvchi yaratadi: ikkinchisi unique
 * index'ga urilib, mavjud yozuvni qayta o'qiydi.
 */
@Injectable()
export class EnsureUserUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(input: EnsureUserInput): Promise<EnsureUserOutput> {
    const telegramId = input.telegramId as TelegramId;
    const existing = await this.users.findByTelegramId(telegramId);
    if (existing) return { user: await this.refresh(existing, input), isNew: false };

    const user = User.register({
      id: this.ids.next() as UserId,
      telegramId,
      profile: input.profile,
      language: languageFromLocale(input.locale),
      now: this.clock.now(),
    });
    try {
      await this.users.save(user);
      return { user, isNew: true };
    } catch (error) {
      if (!(error instanceof UserAlreadyExistsError)) throw error;
      const winner = await this.users.findByTelegramId(telegramId);
      if (!winner) throw error;
      return { user: winner, isNew: false };
    }
  }

  private async refresh(user: User, input: EnsureUserInput): Promise<User> {
    const now = this.clock.now();
    const profileChanged = user.syncTelegramProfile(input.profile, now);
    const unblocked = input.interacted && user.markBotUnblocked(now);
    if (profileChanged || unblocked) await this.users.save(user);
    return user;
  }
}
