import { PhoneNumber } from '@polya/shared-kernel';
import type { TelegramId, User } from '../domain/user.js';
import type { UserRepository } from '../domain/user.repository.js';

/**
 * Admin buyruqlaridagi foydalanuvchi havolasi: "+998…" / "998…" — telefon, qolgan raqamlar — Telegram ID.
 */
export async function findUserByRef(users: UserRepository, ref: string): Promise<User | null> {
  const trimmed = ref.trim().replace(/[\s()-]/g, '');
  if (/^\+?998\d{9}$/.test(trimmed)) {
    try {
      return await users.findByPhone(PhoneNumber.parse(trimmed));
    } catch {
      return null;
    }
  }
  return /^\d{1,15}$/.test(trimmed) ? users.findByTelegramId(Number(trimmed) as TelegramId) : null;
}
