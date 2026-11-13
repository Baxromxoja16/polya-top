import { Injectable } from '@nestjs/common';
import type { Language } from '@polya/shared-kernel';
import type { UserId } from '../domain/user.js';
import { UserRepository } from '../domain/user.repository.js';
import { AdminDirectory } from './admin-directory.js';

/** Boshqa kontekstlar uchun minimal foydalanuvchi ko'rinishi (xabar yuborish, kontakt ko'rsatish). */
export interface UserContactView {
  id: string;
  telegramId: number;
  language: Language;
  displayName: string | null;
  phone: string | null;
  botBlocked: boolean;
  /** TZ 4.6 */
  dailyScheduleOff: boolean;
}

@Injectable()
export class IdentityQueries {
  constructor(
    private readonly users: UserRepository,
    private readonly admins: AdminDirectory,
  ) {}

  async contactOf(userId: string): Promise<UserContactView | null> {
    const user = await this.users.findById(userId as UserId);
    if (!user) return null;
    return {
      id: user.id,
      telegramId: user.telegramId,
      language: user.language,
      displayName: user.displayName,
      phone: user.phone?.value ?? null,
      botBlocked: user.botBlocked,
      dailyScheduleOff: user.dailyScheduleOff,
    };
  }

  adminTelegramIds(): readonly number[] {
    return this.admins.telegramIds();
  }
}
