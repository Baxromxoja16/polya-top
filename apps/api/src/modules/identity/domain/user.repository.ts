import type { PhoneNumber } from '@polya/shared-kernel';
import { DomainError } from '@polya/shared-kernel';
import type { TelegramId, User, UserId } from './user.js';

/** Bir xil telegramId bilan ikkinchi foydalanuvchi yaratishga urinish (parallel /start). */
export class UserAlreadyExistsError extends DomainError {
  readonly code = 'USER_ALREADY_EXISTS';
}

/** Raqam boshqa akkauntga band (unique index buzildi). */
export class PhoneAlreadyTakenError extends DomainError {
  readonly code = 'PHONE_ALREADY_TAKEN';
}

/**
 * Repository porti. Implementatsiya — infrastructure qatlamida (Mongo).
 * `save` yangi aggregate'ni (version 0) qo'shadi, mavjudini optimistic concurrency bilan yangilaydi:
 * eskirgan versiyada `ConcurrencyConflictError` beradi.
 */
export abstract class UserRepository {
  abstract findById(id: UserId): Promise<User | null>;
  abstract findByTelegramId(telegramId: TelegramId): Promise<User | null>;
  abstract findByPhone(phone: PhoneNumber): Promise<User | null>;
  abstract save(user: User): Promise<void>;
}
