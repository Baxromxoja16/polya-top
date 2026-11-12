import { describe, expect, it } from 'vitest';
import { InvalidTimeRangeError, TimeRange } from './time-range.js';

const at = (iso: string) => new Date(iso);
const range = (from: string, to: string) => TimeRange.of(at(from), at(to));

describe('TimeRange', () => {
  it('rejects empty and inverted ranges', () => {
    expect(() => range('2026-11-11T14:00:00Z', '2026-11-11T14:00:00Z')).toThrow(
      InvalidTimeRangeError,
    );
    expect(() => range('2026-11-11T15:00:00Z', '2026-11-11T14:00:00Z')).toThrow(
      InvalidTimeRangeError,
    );
  });

  it('rejects invalid dates', () => {
    expect(() => TimeRange.of(new Date('nope'), at('2026-11-11T14:00:00Z'))).toThrow(
      InvalidTimeRangeError,
    );
  });

  it('is half-open: adjacent ranges do not overlap', () => {
    const a = range('2026-11-11T14:00:00Z', '2026-11-11T15:00:00Z');
    const b = range('2026-11-11T15:00:00Z', '2026-11-11T16:00:00Z');
    expect(a.overlaps(b)).toBe(false);
    expect(b.overlaps(a)).toBe(false);
    expect(a.contains(at('2026-11-11T15:00:00Z'))).toBe(false);
    expect(b.contains(at('2026-11-11T15:00:00Z'))).toBe(true);
  });

  it('detects partial overlap (TZ EC-B1b: 19-21 vs 20-21)', () => {
    const a = range('2026-11-11T14:00:00Z', '2026-11-11T16:00:00Z');
    const b = range('2026-11-11T15:00:00Z', '2026-11-11T16:00:00Z');
    expect(a.overlaps(b)).toBe(true);
    expect(a.encloses(b)).toBe(true);
    expect(b.encloses(a)).toBe(false);
  });

  it('splits into hourly slot-lock units', () => {
    const parts = range('2026-11-11T14:00:00Z', '2026-11-11T17:00:00Z').split(60);
    expect(parts.map((p) => p.start.toISOString())).toEqual([
      '2026-11-11T14:00:00.000Z',
      '2026-11-11T15:00:00.000Z',
      '2026-11-11T16:00:00.000Z',
    ]);
  });

  it('refuses to split a range that is off the grid', () => {
    expect(() => range('2026-11-11T14:00:00Z', '2026-11-11T15:30:00Z').split(60)).toThrow(
      InvalidTimeRangeError,
    );
  });

  it('crosses midnight without special cases (TZ EC-S1)', () => {
    const r = TimeRange.ofDuration(at('2026-11-11T19:00:00Z'), 120);
    expect(r.end.toISOString()).toBe('2026-11-11T21:00:00.000Z');
    expect(r.durationMinutes).toBe(120);
  });

  it('is immutable from the outside', () => {
    const r = range('2026-11-11T14:00:00Z', '2026-11-11T15:00:00Z');
    r.start.setUTCFullYear(2000);
    expect(r.start.toISOString()).toBe('2026-11-11T14:00:00.000Z');
  });
});
