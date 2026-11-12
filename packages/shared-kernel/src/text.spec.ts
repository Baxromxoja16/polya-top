import { describe, expect, it } from 'vitest';
import { normalizeSearchText, searchTokens, slugify, transliterate } from './text.js';

describe('text normalization (TZ VC-4a)', () => {
  it('transliterates Uzbek and Russian cyrillic', () => {
    expect(transliterate('Ўзбекистон')).toBe('ozbekiston');
    expect(transliterate('Қўқон шаҳри')).toBe('qoqon shahri');
    expect(transliterate('Школа')).toBe('shkola');
  });

  it.each([
    ["O'zbekiston", 'ozbekiston'],
    ['Oʻzbekiston', 'ozbekiston'],
    ['O‘zbekiston', 'ozbekiston'],
    ['O`zbekiston', 'ozbekiston'],
    ['Ozbekiston', 'ozbekiston'],
  ])('unifies apostrophes: %s', (input, expected) => {
    expect(normalizeSearchText(input)).toBe(expected);
  });

  it('splits digits glued to words and drops punctuation', () => {
    expect(normalizeSearchText('21maktab')).toBe('21 maktab');
    expect(normalizeSearchText('21-maktab orqasida!')).toBe('21 maktab orqasida');
    expect(normalizeSearchText('5-mkr, “Bozor” yonida')).toBe('5 mkr bozor yonida');
  });

  it('tokenizes', () => {
    expect(searchTokens('  Markaziy   BOZOR ')).toEqual(['markaziy', 'bozor']);
    expect(searchTokens('...')).toEqual([]);
  });

  it('builds URL-safe slugs', () => {
    expect(slugify('Olmaliq Arena 2')).toBe('olmaliq-arena-2');
    expect(slugify('Стадион «Металлург»')).toBe('stadion-metallurg');
  });
});
