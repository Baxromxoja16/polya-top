import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  InvalidLocalDateError,
  weekdayOf,
  zonedParts,
  zonedToUtc,
} from './zoned-time.js';

const TASHKENT = 'Asia/Tashkent'; // UTC+5, yozgi vaqt yo'q

describe('zoned time', () => {
  it('converts Tashkent local time to UTC (+5)', () => {
    expect(zonedToUtc('2026-11-12', 19, TASHKENT).toISOString()).toBe('2026-11-12T14:00:00.000Z');
  });

  it('EC-S1: hours beyond 24 roll into the next calendar day', () => {
    expect(zonedToUtc('2026-11-12', 25, TASHKENT).toISOString()).toBe('2026-11-12T20:00:00.000Z');
    expect(zonedParts(zonedToUtc('2026-11-12', 25, TASHKENT), TASHKENT)).toMatchObject({
      date: '2026-11-13',
      hour: 1,
    });
  });

  it('reads local parts and ISO weekday', () => {
    const p = zonedParts(new Date('2026-11-15T20:30:00Z'), TASHKENT);
    expect(p).toMatchObject({ date: '2026-11-16', hour: 1, minute: 30, weekday: 1 });
  });

  it('handles a DST zone correctly (Europe/Berlin, last Sunday of March)', () => {
    expect(zonedToUtc('2026-03-28', 12, 'Europe/Berlin').toISOString()).toBe(
      '2026-03-28T11:00:00.000Z',
    );
    expect(zonedToUtc('2026-03-30', 12, 'Europe/Berlin').toISOString()).toBe(
      '2026-03-30T10:00:00.000Z',
    );
  });

  it('date arithmetic', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(weekdayOf('2026-11-15')).toBe(7);
    expect(weekdayOf('2026-11-16')).toBe(1);
    expect(daysBetween('2026-11-12', '2026-11-26')).toBe(14);
  });

  it('rejects invalid dates', () => {
    expect(() => addDays('2026-02-30', 1)).toThrow(InvalidLocalDateError);
    expect(() => weekdayOf('12.11.2026')).toThrow(InvalidLocalDateError);
  });
});
