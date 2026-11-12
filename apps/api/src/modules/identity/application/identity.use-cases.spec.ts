import { FixedClock, ObjectIdGenerator } from '@polya/shared-kernel';
import { beforeEach, describe, expect, it } from 'vitest';
import type { TelegramId } from '../domain/user.js';
import { InMemoryUserRepository } from '../infrastructure/in-memory-user.repository.js';
import { StaticAdminDirectory } from './admin-directory.js';
import { StaticCityCatalog } from './city-catalog.js';
import { EnsureUserUseCase } from './ensure-user.use-case.js';
import { ShareContactUseCase } from './share-contact.use-case.js';
import {
  ChangeCityUseCase,
  RenameUserUseCase,
  SetBotBlockedUseCase,
} from './update-profile.use-cases.js';

const profile = { firstName: 'Ali', lastName: null, username: 'ali' };

describe('Identity use cases', () => {
  let repo: InMemoryUserRepository;
  let clock: FixedClock;
  let ensure: EnsureUserUseCase;
  let share: ShareContactUseCase;

  beforeEach(() => {
    repo = new InMemoryUserRepository();
    clock = new FixedClock(new Date('2026-11-12T10:00:00Z'));
    ensure = new EnsureUserUseCase(
      repo,
      clock,
      new ObjectIdGenerator(),
      new StaticAdminDirectory([777]),
      new StaticCityCatalog(),
    );
    share = new ShareContactUseCase(repo, clock);
  });

  describe('EnsureUser (ID-1)', () => {
    it('creates once, then returns the same user', async () => {
      const first = await ensure.execute({
        telegramId: 1,
        profile,
        locale: 'ru',
        interacted: true,
      });
      const second = await ensure.execute({ telegramId: 1, profile, interacted: true });
      expect(first.isNew).toBe(true);
      expect(first.user.language).toBe('ru');
      expect(second.isNew).toBe(false);
      expect(second.user.id).toBe(first.user.id);
    });

    it('parallel /start creates exactly one user', async () => {
      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          ensure.execute({ telegramId: 2, profile, interacted: true }),
        ),
      );
      expect(new Set(results.map((r) => r.user.id)).size).toBe(1);
      expect(results.filter((r) => r.isNew)).toHaveLength(1);
    });

    it('syncs a changed Telegram profile', async () => {
      await ensure.execute({ telegramId: 3, profile, interacted: true });
      const { user } = await ensure.execute({
        telegramId: 3,
        profile: { ...profile, firstName: 'Vali' },
        interacted: true,
      });
      expect(user.displayName).toBe('Vali');
      expect((await repo.findByTelegramId(3 as TelegramId))?.displayName).toBe('Vali');
    });

    it('ID-6: interacting again clears the bot-blocked flag, service updates do not', async () => {
      await ensure.execute({ telegramId: 4, profile, interacted: true });
      await new SetBotBlockedUseCase(repo, clock).execute({ telegramId: 4, blocked: true });

      await ensure.execute({ telegramId: 4, profile, interacted: false });
      expect((await repo.findByTelegramId(4 as TelegramId))?.botBlocked).toBe(true);

      await ensure.execute({ telegramId: 4, profile, interacted: true });
      expect((await repo.findByTelegramId(4 as TelegramId))?.botBlocked).toBe(false);
    });
  });

  describe('ShareContact (ID-2, ID-3)', () => {
    beforeEach(async () => {
      await ensure.execute({ telegramId: 10, profile, interacted: true });
    });

    it("ID-3: rejects someone else's contact", async () => {
      const result = await share.execute({
        senderTelegramId: 10,
        contactTelegramId: 99,
        phoneNumber: '998901112233',
      });
      expect(result).toEqual({ ok: false, error: 'CONTACT_NOT_OWNED' });
      expect((await repo.findByTelegramId(10 as TelegramId))?.isGuest).toBe(true);
    });

    it('ID-3: rejects a contact card without a Telegram user (typed by hand)', async () => {
      const result = await share.execute({
        senderTelegramId: 10,
        contactTelegramId: undefined,
        phoneNumber: '998901112233',
      });
      expect(result).toEqual({ ok: false, error: 'CONTACT_NOT_OWNED' });
    });

    it('rejects an invalid number', async () => {
      const result = await share.execute({
        senderTelegramId: 10,
        contactTelegramId: 10,
        phoneNumber: '12',
      });
      expect(result).toEqual({ ok: false, error: 'INVALID_PHONE' });
    });

    it('stores own contact in E.164', async () => {
      const result = await share.execute({
        senderTelegramId: 10,
        contactTelegramId: 10,
        phoneNumber: '998901112233',
      });
      expect(result.ok && result.value.phone?.value).toBe('+998901112233');
    });

    it('EC-B12: the same number on a new Telegram account moves to that account', async () => {
      await share.execute({
        senderTelegramId: 10,
        contactTelegramId: 10,
        phoneNumber: '998901112233',
      });
      await ensure.execute({ telegramId: 11, profile, interacted: true });

      const result = await share.execute({
        senderTelegramId: 11,
        contactTelegramId: 11,
        phoneNumber: '+998901112233',
      });

      expect(result.ok).toBe(true);
      expect((await repo.findByTelegramId(11 as TelegramId))?.phone?.value).toBe('+998901112233');
      expect((await repo.findByTelegramId(10 as TelegramId))?.isGuest).toBe(true);
    });
  });

  it('Rename returns INVALID_NAME instead of throwing', async () => {
    await ensure.execute({ telegramId: 20, profile, interacted: true });
    const rename = new RenameUserUseCase(repo, clock);
    expect(await rename.execute({ telegramId: 20, name: 'x' })).toEqual({
      ok: false,
      error: 'INVALID_NAME',
    });
    const ok = await rename.execute({ telegramId: 20, name: 'Kapitan' });
    expect(ok.ok && ok.value.displayName).toBe('Kapitan');
  });
});

describe('EnsureUser: ADMIN role follows ADMIN_TELEGRAM_IDS', () => {
  it('grants ADMIN to listed ids and revokes it when removed from the list', async () => {
    const repo = new InMemoryUserRepository();
    const clock = new FixedClock(new Date('2026-11-12T10:00:00Z'));
    const ids = new ObjectIdGenerator();
    const profile = { firstName: 'Admin', lastName: null, username: null };

    const asAdmin = new EnsureUserUseCase(
      repo,
      clock,
      ids,
      new StaticAdminDirectory([777]),
      new StaticCityCatalog(),
    );
    const first = await asAdmin.execute({ telegramId: 777, profile, interacted: true });
    expect(first.user.roles).toEqual(['PLAYER', 'ADMIN']);

    const removed = new EnsureUserUseCase(
      repo,
      clock,
      ids,
      new StaticAdminDirectory([]),
      new StaticCityCatalog(),
    );
    const second = await removed.execute({ telegramId: 777, profile, interacted: true });
    expect(second.user.roles).toEqual(['PLAYER']);
    expect((await repo.findByTelegramId(777 as TelegramId))?.roles).toEqual(['PLAYER']);
  });
});

describe('City selection (CT-4, EC-C1)', () => {
  const profile = { firstName: 'Ali', lastName: null, username: null };
  const olmaliq = { id: 'c1', name: { uz: 'Olmaliq', ru: 'Алмалык' } };
  const angren = { id: 'c2', name: { uz: 'Angren', ru: 'Ангрен' } };

  const setup = (cities: (typeof olmaliq)[]) => {
    const repo = new InMemoryUserRepository();
    const clock = new FixedClock(new Date('2026-11-12T10:00:00Z'));
    const catalog = new StaticCityCatalog(cities);
    return {
      repo,
      ensure: new EnsureUserUseCase(
        repo,
        clock,
        new ObjectIdGenerator(),
        new StaticAdminDirectory([]),
        catalog,
      ),
      changeCity: new ChangeCityUseCase(repo, clock, catalog),
    };
  };

  it('EC-C1: the only active city is assigned without asking', async () => {
    const { ensure } = setup([olmaliq]);
    expect((await ensure.execute({ telegramId: 1, profile, interacted: true })).user.cityId).toBe(
      'c1',
    );
  });

  it('with several cities the user stays without a city until choosing', async () => {
    const { ensure, changeCity } = setup([olmaliq, angren]);
    expect(
      (await ensure.execute({ telegramId: 1, profile, interacted: true })).user.cityId,
    ).toBeNull();
    const result = await changeCity.execute({ telegramId: 1, cityId: 'c2' });
    expect(result.ok && result.value.cityId).toBe('c2');
  });

  it('CT-4: an inactive or unknown city cannot be chosen', async () => {
    const { ensure, changeCity } = setup([olmaliq, angren]);
    await ensure.execute({ telegramId: 1, profile, interacted: true });
    expect(await changeCity.execute({ telegramId: 1, cityId: 'zzz' })).toEqual({
      ok: false,
      error: 'CITY_NOT_AVAILABLE',
    });
  });
});
