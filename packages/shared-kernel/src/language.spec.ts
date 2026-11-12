import { describe, expect, it } from 'vitest';
import { isLanguage, languageFromLocale } from './language.js';

describe('Language', () => {
  it.each([
    ['ru', 'ru'],
    ['ru-RU', 'ru'],
    ['RU', 'ru'],
    ['uz', 'uz'],
    ['en', 'uz'],
    ['', 'uz'],
    [undefined, 'uz'],
  ])('maps locale %s → %s', (locale, expected) => {
    expect(languageFromLocale(locale)).toBe(expected);
  });

  it('guards unknown values', () => {
    expect(isLanguage('uz')).toBe(true);
    expect(isLanguage('en')).toBe(false);
    expect(isLanguage(1)).toBe(false);
  });
});
