import { DomainError } from './domain-error.js';
import { LANGUAGES, type Language } from './language.js';

export class InvalidLocalizedTextError extends DomainError {
  readonly code = 'INVALID_LOCALIZED_TEXT';
}

/** Admin kiritadigan nomlar (shahar, hudud, orientir) — har bir tilda majburiy. */
export type LocalizedText = Readonly<Record<Language, string>>;

export function localizedText(
  input: Record<Language, string>,
  options: { maxLength?: number } = {},
): LocalizedText {
  const maxLength = options.maxLength ?? 80;
  const result = {} as Record<Language, string>;
  for (const lang of LANGUAGES) {
    const value = (input[lang] ?? '').trim().replace(/\s+/g, ' ');
    if (!value)
      throw new InvalidLocalizedTextError('Text is required for every language', { lang });
    if ([...value].length > maxLength) {
      throw new InvalidLocalizedTextError('Text is too long', { lang, maxLength });
    }
    result[lang] = value;
  }
  return Object.freeze(result);
}
