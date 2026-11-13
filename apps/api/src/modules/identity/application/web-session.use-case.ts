import { Injectable } from '@nestjs/common';
import { DomainError } from '@polya/shared-kernel';
import type { TelegramProfile, User, UserId } from '../domain/user.js';
import { UserRepository } from '../domain/user.repository.js';
import { EnsureUserUseCase } from './ensure-user.use-case.js';
import { UserNotFoundError } from './errors.js';

export class AccountBlockedError extends DomainError {
  readonly code = 'ACCOUNT_BLOCKED';
}

/**
 * TZ ID-7: Web/Mini App sessiyasi. Imzosi tekshirilgan Telegram foydalanuvchisi bot'dagi kabi
 * topiladi yoki yaratiladi (ID-1); bloklangan akkaunt kira olmaydi va sessiyasi yangilanmaydi.
 */
@Injectable()
export class WebSessionUseCase {
  constructor(
    private readonly ensureUser: EnsureUserUseCase,
    private readonly users: UserRepository,
  ) {}

  async login(input: {
    telegramId: number;
    profile: TelegramProfile;
    locale: string | null;
  }): Promise<User> {
    const { user } = await this.ensureUser.execute({
      telegramId: input.telegramId,
      profile: input.profile,
      locale: input.locale ?? undefined,
      // Web'dan kirish bot bilan muloqot emas — "bot bloklangan" belgisiga tegilmaydi
      interacted: false,
    });
    return active(user);
  }

  async activeUser(userId: string): Promise<User> {
    const user = await this.users.findById(userId as UserId);
    if (!user) throw new UserNotFoundError('User not found', { userId });
    return active(user);
  }
}

function active(user: User): User {
  if (user.status === 'BLOCKED') throw new AccountBlockedError('Account is blocked');
  return user;
}
