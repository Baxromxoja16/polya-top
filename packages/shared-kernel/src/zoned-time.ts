import { DomainError } from './domain-error.js';

export class InvalidLocalDateError extends DomainError {
  readonly code = 'INVALID_LOCAL_DATE';
}

/** Kalendar sanasi, vaqt zonasisiz: "2026-11-12" */
export type LocalDate = string;

const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** ISO: 1 = dushanba … 7 = yakshanba */
  weekday: number;
  date: LocalDate;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

const WEEKDAY: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
const pad = (n: number) => String(n).padStart(2, '0');

/** UTC instant → shahar vaqtidagi qismlar. */
export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = Object.fromEntries(
    formatter(timeZone)
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  );
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  return {
    year,
    month,
    day,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: WEEKDAY[parts.weekday as string] ?? 1,
    date: `${year}-${pad(month)}-${pad(day)}`,
  };
}

function offsetMs(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return asUtc - Math.floor(instant.getTime() / 60_000) * 60_000;
}

/**
 * Shahar vaqtidagi sana + soat → UTC instant. `hour` 24 dan katta bo'lishi mumkin
 * (yarim tundan keyingi slotlar, TZ EC-S1): 2026-11-12 + 25 soat = 13-noyabr 01:00.
 */
export function zonedToUtc(date: LocalDate, hour: number, timeZone: string, minute = 0): Date {
  const [y, m, d] = parseLocalDate(date);
  const guess = Date.UTC(y, m - 1, d, hour, minute);
  const first = guess - offsetMs(new Date(guess), timeZone);
  // Yozgi vaqt chegarasida offset o'zgarishi mumkin — bir marta tuzatamiz
  const second = guess - offsetMs(new Date(first), timeZone);
  return new Date(second);
}

export function parseLocalDate(date: LocalDate): [number, number, number] {
  const match = LOCAL_DATE.exec(date);
  if (!match) throw new InvalidLocalDateError('Expected YYYY-MM-DD', { date });
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
    throw new InvalidLocalDateError('Date does not exist', { date });
  }
  return [y, m, d];
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const [y, m, d] = parseLocalDate(date);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

/** ISO hafta kuni: 1 = dushanba … 7 = yakshanba */
export function weekdayOf(date: LocalDate): number {
  const [y, m, d] = parseLocalDate(date);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return js === 0 ? 7 : js;
}

export function daysBetween(from: LocalDate, to: LocalDate): number {
  const [y1, m1, d1] = parseLocalDate(from);
  const [y2, m2, d2] = parseLocalDate(to);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}
