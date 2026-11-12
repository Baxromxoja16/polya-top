import type { Language } from '@polya/shared-kernel';

type MessageValue = string | ((...args: never[]) => string);

/** Rus lug'ati o'zbekcha bilan bir xil kalitlar va parametrlarga ega bo'lishi shart. */
export type MessageShape<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => string ? (...args: A) => string : string;
};

/**
 * Tipli lug'at: kalit yoki parametr yetishmasa — kompilyatsiya xatosi, runtime'da "undefined" matn yo'q.
 *
 *   const m = defineMessages({ hi: (n: string) => `Salom, ${n}` }, { hi: (n) => `Привет, ${n}` });
 *   m[ctx.lang].hi('Ali');
 */
export function defineMessages<const T extends Record<string, MessageValue>>(
  uz: T,
  ru: MessageShape<T>,
): Record<Language, MessageShape<T>> {
  return { uz: uz as unknown as MessageShape<T>, ru };
}
