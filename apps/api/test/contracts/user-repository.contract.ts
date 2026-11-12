import { ConcurrencyConflictError, ObjectIdGenerator, PhoneNumber } from '@polya/shared-kernel';
import { beforeEach, describe, expect, it } from 'vitest';
import { type TelegramId, User, type UserId } from '../../src/modules/identity/domain/user.js';
import {
  PhoneAlreadyTakenError,
  UserAlreadyExistsError,
  type UserRepository,
} from '../../src/modules/identity/domain/user.repository.js';

const ids = new ObjectIdGenerator();
const nextId = () => ids.next() as UserId;
const now = new Date('2026-11-12T10:00:00Z');

export const newUser = (telegramId: number) =>
  User.register({
    id: nextId(),
    telegramId: telegramId as TelegramId,
    profile: { firstName: 'Ali', lastName: null, username: null },
    language: 'uz',
    now,
  });

/**
 * Repository kontrakti: in-memory va Mongo implementatsiyalari BIR XIL testdan o'tadi,
 * shunda unit testlarda ishlatiladigan double haqiqiy xatti-harakatdan farq qilmaydi.
 */
export function describeUserRepositoryContract(
  name: string,
  factory: () => Promise<UserRepository> | UserRepository,
): void {
  describe(`UserRepository contract: ${name}`, () => {
    let repo: UserRepository;
    let tg = 0;
    const freshTelegramId = () => 5_000_000 + Math.floor(Math.random() * 1_000_000) * 100 + ++tg;

    beforeEach(async () => {
      repo = await factory();
    });

    it('round-trips a user with all fields', async () => {
      const user = newUser(freshTelegramId());
      user.verifyPhone(PhoneNumber.parse(`99890${String(freshTelegramId()).slice(-7)}`), now);
      user.rename('Kapitan', now);
      await repo.save(user);
      expect(user.version).toBe(1);

      const loaded = await repo.findByTelegramId(user.telegramId);
      expect(loaded?.id).toBe(user.id);
      expect(loaded?.displayName).toBe('Kapitan');
      expect(loaded?.phone?.value).toBe(user.phone?.value);
      expect(loaded?.version).toBe(1);
      expect((await repo.findById(user.id))?.telegramId).toBe(user.telegramId);
      expect((await repo.findByPhone(user.phone as PhoneNumber))?.id).toBe(user.id);
    });

    it('returns null for unknown users', async () => {
      expect(await repo.findByTelegramId(1 as TelegramId)).toBeNull();
      expect(await repo.findById('f'.repeat(24) as UserId)).toBeNull();
      expect(await repo.findByPhone(PhoneNumber.parse('998000000001'))).toBeNull();
    });

    it('rejects a second user with the same telegramId (ID-1)', async () => {
      const telegramId = freshTelegramId();
      await repo.save(newUser(telegramId));
      await expect(repo.save(newUser(telegramId))).rejects.toBeInstanceOf(UserAlreadyExistsError);
    });

    it('rejects the same phone on two users', async () => {
      const phone = PhoneNumber.parse(`99891${String(freshTelegramId()).slice(-7)}`);
      const a = newUser(freshTelegramId());
      a.verifyPhone(phone, now);
      await repo.save(a);
      const b = newUser(freshTelegramId());
      b.verifyPhone(phone, now);
      await expect(repo.save(b)).rejects.toBeInstanceOf(PhoneAlreadyTakenError);
    });

    it('allows many guests without phone', async () => {
      await repo.save(newUser(freshTelegramId()));
      await expect(repo.save(newUser(freshTelegramId()))).resolves.toBeUndefined();
    });

    it('detects a stale write (optimistic concurrency)', async () => {
      const user = newUser(freshTelegramId());
      await repo.save(user);

      const copyA = await repo.findById(user.id);
      const copyB = await repo.findById(user.id);
      copyA?.changeLanguage('ru', now);
      await repo.save(copyA as User);

      copyB?.rename('Boshqa', now);
      await expect(repo.save(copyB as User)).rejects.toBeInstanceOf(ConcurrencyConflictError);
      expect((await repo.findById(user.id))?.language).toBe('ru');
    });
  });
}
