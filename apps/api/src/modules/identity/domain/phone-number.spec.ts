import { describe, expect, it } from 'vitest';
import { InvalidPhoneNumberError, PhoneNumber } from './phone-number.js';

describe('PhoneNumber', () => {
  it.each([
    ['998901234567', '+998901234567'],
    ['+998901234567', '+998901234567'],
    ['+998 (90) 123-45-67', '+998901234567'],
    ['  998 90 123 45 67 ', '+998901234567'],
    ['+79161234567', '+79161234567'],
  ])('normalizes %s → %s', (raw, expected) => {
    expect(PhoneNumber.parse(raw).value).toBe(expected);
  });

  it.each([
    '',
    'abc',
    '+0123456789',
    '12345',
    '+99890123456',
    '+9989012345678',
    '+1234567890123456',
  ])('rejects %s', (raw) => {
    expect(() => PhoneNumber.parse(raw)).toThrow(InvalidPhoneNumberError);
  });

  it('formats Uzbek numbers for display', () => {
    expect(PhoneNumber.parse('998901234567').format()).toBe('+998 90 123 45 67');
    expect(PhoneNumber.parse('+79161234567').format()).toBe('+79161234567');
  });

  it('compares by value', () => {
    expect(PhoneNumber.parse('998901234567').equals(PhoneNumber.parse('+998901234567'))).toBe(true);
    expect(PhoneNumber.parse('998901234567').equals(null)).toBe(false);
  });
});
