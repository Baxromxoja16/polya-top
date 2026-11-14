import { Injectable } from '@nestjs/common';
import type { Language } from '@polya/shared-kernel';
import type { UserId } from '../domain/user.js';
import { UserRepository } from '../domain/user.repository.js';
import { AdminDirectory } from './admin-directory.js';
import { findUserByRef } from './user-ref.js';

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

/** Web so'rovini bajarayotgan akkaunt (TZ ID-7): rollar va holat bilan */
export interface AccountView {
  id: string;
  roles: readonly string[];
  phone: string | null;
  language: Language;
  blocked: boolean;
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

  async accountOf(userId: string): Promise<AccountView | null> {
    const user = await this.users.findById(userId as UserId);
    if (!user) return null;
    return {
      id: user.id,
      roles: [...user.roles],
      phone: user.phone?.value ?? null,
      language: user.language,
      blocked: user.status === 'BLOCKED',
    };
  }

  /** Admin buyruqlari uchun: Telegram ID yoki telefon bo'yicha */
  async findByRef(ref: string): Promise<UserContactView | null> {
    const user = await findUserByRef(this.users, ref);
    return user ? this.contactOf(user.id) : null;
  }

  adminTelegramIds(): readonly number[] {
    return this.admins.telegramIds();
  }
}
