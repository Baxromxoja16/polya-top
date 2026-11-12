/**
 * Qidiruv va slug uchun matnni normallashtirish (TZ VC-4a):
 * kirill → lotin, apostroflar olib tashlanadi, katta-kichik farqsiz, "21maktab" → "21 maktab".
 */

// biome-ignore format: jadval ko'rinishida o'qilishi oson
const CYRILLIC_TO_LATIN: Readonly<Record<string, string>> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'x', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya',
  ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h',
};

// Barcha apostrof ko'rinishlari: o' oʻ o‘ o’ o` oʼ
const APOSTROPHES = /['`ʻʼ‘’]/g;

export function transliterate(input: string): string {
  let out = '';
  for (const ch of input.toLowerCase()) out += CYRILLIC_TO_LATIN[ch] ?? ch;
  return out;
}

export function normalizeSearchText(input: string): string {
  return transliterate(input.normalize('NFKC'))
    .replace(APOSTROPHES, '')
    .replace(/(\d)(\p{L})/gu, '$1 $2')
    .replace(/(\p{L})(\d)/gu, '$1 $2')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function searchTokens(input: string): string[] {
  const normalized = normalizeSearchText(input);
  return normalized ? normalized.split(' ') : [];
}

export function slugify(input: string): string {
  return normalizeSearchText(input)
    .replace(/[^a-z0-9 ]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}
