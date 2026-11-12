import { Injectable } from '@nestjs/common';
import { Clock, IdGenerator, languageFromLocale } from '@polya/shared-kernel';
import { type TelegramId, type TelegramProfile, User, type UserId } from '../domain/user.js';
import { UserAlreadyExistsError, UserRepository } from '../domain/user.repository.js';
import { AdminDirectory } from './admin-directory.js';
import { CityCatalog } from './city-catalog.js';

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
    private readonly admins: AdminDirectory,
    private readonly cities: CityCatalog,
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
    this.syncAdminRole(user);
    await this.assignSoleCity(user);
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
    const rolesChanged = this.syncAdminRole(user);
    const cityAssigned = await this.assignSoleCity(user);
    if (profileChanged || unblocked || rolesChanged || cityAssigned) await this.users.save(user);
    return user;
  }

  /** TZ EC-C1: faol shahar bitta bo'lsa — so'ramasdan o'sha tanlanadi. */
  private async assignSoleCity(user: User): Promise<boolean> {
    if (user.cityId) return false;
    const active = await this.cities.activeCities();
    const only = active.length === 1 ? active[0] : undefined;
    return only ? user.changeCity(only.id, this.clock.now()) : false;
  }

  /** ADMIN roli env bilan sinxron: ro'yxatdan chiqarilgan odam keyingi update'dayoq huquqni yo'qotadi. */
  private syncAdminRole(user: User): boolean {
    const now = this.clock.now();
    return this.admins.isAdmin(user.telegramId)
      ? user.grantRole('ADMIN', now)
      : user.revokeRole('ADMIN', now);
  }
}
