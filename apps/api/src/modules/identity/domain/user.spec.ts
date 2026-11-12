import { PhoneNumber } from '@polya/shared-kernel';
import { describe, expect, it } from 'vitest';
import { UserEvents } from './user.events.js';
import { InvalidDisplayNameError, type TelegramId, User, type UserId } from './user.js';

const now = new Date('2026-11-12T10:00:00Z');
const later = new Date('2026-11-12T11:00:00Z');

const newUser = () =>
  User.register({
    id: 'a'.repeat(24) as UserId,
    telegramId: 1001 as TelegramId,
    profile: { firstName: ' Ali ', lastName: '', username: 'ali_fc' },
    language: 'uz',
    now,
  });

describe('User', () => {
  it('registers as an active PLAYER guest without phone', () => {
    const user = newUser();
    expect(user.roles).toEqual(['PLAYER']);
    expect(user.status).toBe('ACTIVE');
    expect(user.isGuest).toBe(true);
    expect(user.telegramProfile).toEqual({ firstName: 'Ali', lastName: null, username: 'ali_fc' });
    expect(user.pullEvents().map((e) => e.type)).toEqual([UserEvents.Registered]);
  });

  it('verifies phone once; repeating the same phone is a no-op', () => {
    const user = newUser();
    user.pullEvents();
    expect(user.verifyPhone(PhoneNumber.parse('998901234567'), later)).toBe(true);
    expect(user.isGuest).toBe(false);
    expect(user.phoneVerifiedAt).toEqual(later);
    expect(user.verifyPhone(PhoneNumber.parse('+998901234567'), later)).toBe(false);
    const events = user.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toEqual({ phone: '+998901234567', previousPhone: null });
  });

  it('releasing a phone turns the user back into a guest (EC-B12)', () => {
    const user = newUser();
    user.verifyPhone(PhoneNumber.parse('998901234567'), now);
    user.pullEvents();
    user.releasePhone(later);
    expect(user.isGuest).toBe(true);
    expect(user.pullEvents().map((e) => e.type)).toEqual([UserEvents.PhoneReleased]);
  });

  describe('displayName (EC-T6)', () => {
    it('prefers custom name, then Telegram name, then username', () => {
      const user = newUser();
      expect(user.displayName).toBe('Ali');
      user.rename('  Ali   Valiyev ', later);
      expect(user.displayName).toBe('Ali Valiyev');
    });

    it('falls back to username, then null', () => {
      const user = newUser();
      user.syncTelegramProfile({ firstName: '  ', lastName: null, username: 'ali_fc' }, later);
      expect(user.displayName).toBe('ali_fc');
      user.syncTelegramProfile({ firstName: '', lastName: null, username: null }, later);
      expect(user.displayName).toBeNull();
    });

    it('Telegram profile sync does not overwrite a custom name', () => {
      const user = newUser();
      user.rename('Kapitan', later);
      user.syncTelegramProfile({ firstName: 'Vali', lastName: null, username: null }, later);
      expect(user.displayName).toBe('Kapitan');
    });
  });

  it('profile sync reports whether anything changed', () => {
    const user = newUser();
    expect(
      user.syncTelegramProfile({ firstName: 'Ali', lastName: null, username: 'ali_fc' }, later),
    ).toBe(false);
    expect(
      user.syncTelegramProfile({ firstName: 'Ali', lastName: 'V', username: 'ali_fc' }, later),
    ).toBe(true);
    expect(user.updatedAt).toEqual(later);
  });

  it.each(['A', 'x'.repeat(65), 'Ali\u0000', 'https://spam.uz', 'Ali @channel_promo', 't.me/x'])(
    'rejects invalid display name %j',
    (name) => {
      expect(() => newUser().rename(name, later)).toThrow(InvalidDisplayNameError);
    },
  );

  it('counts name length in characters, not UTF-16 units', () => {
    const user = newUser();
    user.rename('⚽⚽', later);
    expect(user.displayName).toBe('⚽⚽');
  });

  it('bot blocking is idempotent (ID-6)', () => {
    const user = newUser();
    user.pullEvents();
    expect(user.markBotBlocked(later)).toBe(true);
    expect(user.markBotBlocked(later)).toBe(false);
    expect(user.markBotUnblocked(later)).toBe(true);
    expect(user.markBotUnblocked(later)).toBe(false);
    expect(user.pullEvents().map((e) => e.type)).toEqual([
      UserEvents.BotBlocked,
      UserEvents.BotUnblocked,
    ]);
  });

  it('language change reports no-op', () => {
    const user = newUser();
    expect(user.changeLanguage('uz', later)).toBe(false);
    expect(user.changeLanguage('ru', later)).toBe(true);
    expect(user.language).toBe('ru');
  });
});
