import { Injectable } from '@nestjs/common';
import { Clock, err, type Language, ok, PhoneNumber, type Result } from '@polya/shared-kernel';
import { InvalidDisplayNameError, type TelegramId, type User } from '../domain/user.js';
import { UserRepository } from '../domain/user.repository.js';
import { AdminDirectory } from './admin-directory.js';
import { CityCatalog } from './city-catalog.js';
import { UserNotFoundError } from './errors.js';

// @Injectable — konstruktor metadata'si (DI) voris klasslarga meros bo'lib o'tishi uchun
@Injectable()
abstract class UserCommand {
  constructor(
    protected readonly users: UserRepository,
    protected readonly clock: Clock,
  ) {}

  protected async load(telegramId: number): Promise<User> {
    const user = await this.users.findByTelegramId(telegramId as TelegramId);
    if (!user) throw new UserNotFoundError('User is not registered', { telegramId });
    return user;
  }
}

/** TZ ID-4 */
@Injectable()
export class ChangeLanguageUseCase extends UserCommand {
  async execute(input: { telegramId: number; language: Language }): Promise<User> {
    const user = await this.load(input.telegramId);
    if (user.changeLanguage(input.language, this.clock.now())) await this.users.save(user);
    return user;
  }
}

/** TZ ID-5 */
@Injectable()
export class RenameUserUseCase extends UserCommand {
  async execute(input: {
    telegramId: number;
    name: string;
  }): Promise<Result<User, 'INVALID_NAME'>> {
    const user = await this.load(input.telegramId);
    try {
      user.rename(input.name, this.clock.now());
    } catch (error) {
      if (error instanceof InvalidDisplayNameError) return err('INVALID_NAME');
      throw error;
    }
    await this.users.save(user);
    return ok(user);
  }
}

/** TZ 4.6: Owner kunlik jadvalni o'chiradi/yoqadi */
@Injectable()
export class SetDailyScheduleUseCase extends UserCommand {
  async execute(input: { telegramId: number; off: boolean }): Promise<User> {
    const user = await this.load(input.telegramId);
    if (user.setDailyScheduleOff(input.off, this.clock.now())) await this.users.save(user);
    return user;
  }
}

/** TZ MK-4: marketing xabarlarini o'chirish/yoqish */
@Injectable()
export class SetMarketingOptOutUseCase extends UserCommand {
  async execute(input: { telegramId: number; optOut: boolean }): Promise<User> {
    const user = await this.load(input.telegramId);
    if (user.setMarketingOptOut(input.optOut, this.clock.now())) await this.users.save(user);
    return user;
  }
}

export type BlockUserError = 'NOT_FOUND' | 'IS_ADMIN' | 'NO_CHANGE';

/**
 * TZ AD-2: foydalanuvchini Telegram ID yoki telefon raqami bo'yicha bloklash/blokdan chiqarish.
 * Platforma adminini bloklab bo'lmaydi.
 */
@Injectable()
export class SetUserBlockedUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly clock: Clock,
    private readonly admins: AdminDirectory,
  ) {}

  async execute(input: {
    ref: string;
    blocked: boolean;
  }): Promise<Result<{ userId: string; telegramId: number }, BlockUserError>> {
    const user = await this.find(input.ref);
    if (!user) return err('NOT_FOUND');
    if (input.blocked && this.admins.isAdmin(user.telegramId)) return err('IS_ADMIN');
    const now = this.clock.now();
    const changed = input.blocked ? user.block(now) : user.unblock(now);
    if (!changed) return err('NO_CHANGE');
    await this.users.save(user);
    return ok({ userId: user.id, telegramId: user.telegramId });
  }

  private async find(ref: string): Promise<User | null> {
    // "+998…" yoki "998…" — telefon; qolgan raqamlar — Telegram ID
    const trimmed = ref.trim().replace(/[\s()-]/g, '');
    if (/^\+?998\d{9}$/.test(trimmed)) {
      try {
        return await this.users.findByPhone(PhoneNumber.parse(trimmed));
      } catch {
        return null;
      }
    }
    return /^\d{1,15}$/.test(trimmed)
      ? this.users.findByTelegramId(Number(trimmed) as TelegramId)
      : null;
  }
}

/** TZ ID-6, EC-T1: foydalanuvchi botni bloklagan/blokdan chiqargan. */
@Injectable()
export class SetBotBlockedUseCase extends UserCommand {
  async execute(input: { telegramId: number; blocked: boolean }): Promise<void> {
    const user = await this.users.findByTelegramId(input.telegramId as TelegramId);
    if (!user) return; // botni hech qachon ishlatmagan odam — saqlaydigan narsa yo'q
    const now = this.clock.now();
    const changed = input.blocked ? user.markBotBlocked(now) : user.markBotUnblocked(now);
    if (changed) await this.users.save(user);
  }
}

/** TZ CT-4: shahar faqat faol shaharlar ro'yxatidan tanlanadi. */
@Injectable()
export class ChangeCityUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly clock: Clock,
    private readonly cities: CityCatalog,
  ) {}

  async execute(input: {
    telegramId: number;
    cityId: string;
  }): Promise<Result<User, 'CITY_NOT_AVAILABLE'>> {
    if (!(await this.cities.isActive(input.cityId))) return err('CITY_NOT_AVAILABLE');
    const user = await this.users.findByTelegramId(input.telegramId as TelegramId);
    if (!user)
      throw new UserNotFoundError('User is not registered', { telegramId: input.telegramId });
    if (user.changeCity(input.cityId, this.clock.now())) await this.users.save(user);
    return ok(user);
  }
}
