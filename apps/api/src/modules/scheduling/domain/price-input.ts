import { MAX_PRICE_PER_HOUR, MIN_PRICE_PER_HOUR } from './pitch-schedule.js';

export type PriceInput =
  | { kind: 'ok'; amount: number }
  /** "150" — ehtimol 150 000 nazarda tutilgan: tasdiq so'raladi (TZ EC-O2) */
  | { kind: 'confirm'; amount: number }
  | { kind: 'invalid' };

const MULTIPLIERS: readonly [RegExp, number][] = [
  [/(mln|million|млн|миллион)/, 1_000_000],
  [/(k|ming|тыс|тысяч|т)$/, 1_000],
];

/**
 * Owner yozgan narxni o'qiydi: "150000", "150 000 so'm", "150k", "150 ming", "1.5 mln", "1,5 млн".
 */
export function parsePriceInput(raw: string): PriceInput {
  let text = raw
    .toLowerCase()
    .replace(/so['ʻ‘’`]?m|сум|uzs/g, '')
    .trim();
  let multiplier = 1;
  for (const [pattern, factor] of MULTIPLIERS) {
    if (pattern.test(text)) {
      multiplier = factor;
      text = text.replace(pattern, '').trim();
      break;
    }
  }
  // Mingliklar orasidagi bo'shliq/nuqta: "150 000", "150.000"; o'nli kasr faqat ko'paytuvchi bilan
  const compact = text.replace(/\s+/g, '');
  const normalized =
    multiplier > 1 ? compact.replace(',', '.') : compact.replace(/[.,](?=\d{3}(\D|$))/g, '');
  const shape = multiplier > 1 ? /^\d+(\.\d+)?$/ : /^\d+$/;
  if (!shape.test(normalized)) return { kind: 'invalid' };

  const amount = Math.round(Number(normalized) * multiplier);
  if (!Number.isSafeInteger(amount) || amount <= 0) return { kind: 'invalid' };
  if (amount < MIN_PRICE_PER_HOUR) {
    const guess = amount * 1_000;
    return guess <= MAX_PRICE_PER_HOUR ? { kind: 'confirm', amount: guess } : { kind: 'invalid' };
  }
  return amount > MAX_PRICE_PER_HOUR ? { kind: 'invalid' } : { kind: 'ok', amount };
}
