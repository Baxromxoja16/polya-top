import { type Language, type TimeRange, zonedParts } from '@polya/shared-kernel';

const DAYS: Record<Language, string[]> = {
  uz: ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'],
  ru: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
};
const pad = (n: number) => String(n).padStart(2, '0');

/** "Ju, 20.11 · 19:00–21:00" — stadion vaqt zonasida */
export function formatRange(range: TimeRange, timeZone: string, lang: Language): string {
  const s = zonedParts(range.start, timeZone);
  const e = zonedParts(range.end, timeZone);
  return `${DAYS[lang][s.weekday - 1]}, ${pad(s.day)}.${pad(s.month)} · ${pad(s.hour)}:${pad(s.minute)}–${pad(e.hour)}:${pad(e.minute)}`;
}

export function formatTime(instant: Date, timeZone: string): string {
  const p = zonedParts(instant, timeZone);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}
