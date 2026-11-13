import type { PhoneNumber } from '@polya/shared-kernel';
import { ConcurrencyConflictError } from '@polya/shared-kernel';
import { type TelegramId, User, type UserId, type UserProps } from '../domain/user.js';
import {
  PhoneAlreadyTakenError,
  UserAlreadyExistsError,
  UserRepository,
} from '../domain/user.repository.js';

interface Row {
  id: UserId;
  props: UserProps;
  version: number;
}

/**
 * Test double: Mongo implementatsiyasi bilan BIR XIL kontrakt (unique telegramId/phone,
 * optimistic concurrency). Ikkalasi ham bitta kontrakt testidan o'tadi (user.repository.contract.ts).
 */
export class InMemoryUserRepository extends UserRepository {
  readonly #rows = new Map<UserId, Row>();

  async findById(id: UserId): Promise<User | null> {
    return this.hydrate(this.#rows.get(id));
  }

  async findByTelegramId(telegramId: TelegramId): Promise<User | null> {
    return this.hydrate([...this.#rows.values()].find((r) => r.props.telegramId === telegramId));
  }

  async findByPhone(phone: PhoneNumber): Promise<User | null> {
    return this.hydrate([...this.#rows.values()].find((r) => phone.equals(r.props.phone)));
  }

  async save(user: User): Promise<void> {
    const props = snapshot(user);
    for (const row of this.#rows.values()) {
      if (row.id === user.id) continue;
      if (row.props.telegramId === props.telegramId) {
        throw new UserAlreadyExistsError('telegramId already registered');
      }
      if (props.phone?.equals(row.props.phone)) {
        throw new PhoneAlreadyTakenError('phone already taken');
      }
    }

    const current = this.#rows.get(user.id);
    if (user.version === 0) {
      if (current) throw new UserAlreadyExistsError('id already exists');
    } else if (!current || current.version !== user.version) {
      throw new ConcurrencyConflictError('User was modified concurrently', { id: user.id });
    }
    this.#rows.set(user.id, { id: user.id, props, version: user.version + 1 });
    user.markPersisted();
  }

  private hydrate(row: Row | undefined): User | null {
    return row ? User.reconstitute(row.id, structuredCloneProps(row.props), row.version) : null;
  }
}

function snapshot(user: User): UserProps {
  return {
    telegramId: user.telegramId,
    telegramProfile: { ...user.telegramProfile },
    customName: user.customName,
    cityId: user.cityId,
    phone: user.phone,
    phoneVerifiedAt: user.phoneVerifiedAt,
    language: user.language,
    roles: [...user.roles],
    status: user.status,
    botBlocked: user.botBlocked,
    marketingOptOut: user.marketingOptOut,
    dailyScheduleOff: user.dailyScheduleOff,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function structuredCloneProps(props: UserProps): UserProps {
  return { ...props, telegramProfile: { ...props.telegramProfile }, roles: [...props.roles] };
}
