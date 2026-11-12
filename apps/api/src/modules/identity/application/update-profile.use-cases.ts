import { Injectable } from '@nestjs/common';
import { Clock, err, type Language, ok, type Result } from '@polya/shared-kernel';
import { InvalidDisplayNameError, type TelegramId, type User } from '../domain/user.js';
import { UserRepository } from '../domain/user.repository.js';
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
