import { describe, expect, it } from 'vitest';
import { InvalidOpeningHoursError, OpeningHours } from './opening-hours.js';

describe('OpeningHours', () => {
  it('a normal day', () => {
    const h = OpeningHours.of(8, 23);
    expect(h.crossesMidnight).toBe(false);
    expect(h.durationHours).toBe(15);
    expect(h.format()).toBe('08:00–23:00');
  });

  it('EC-S1: closing after midnight belongs to the same business day', () => {
    const h = OpeningHours.of(16, 2);
    expect(h.crossesMidnight).toBe(true);
    expect(h.durationHours).toBe(10);
    expect(h.closeHour).toBe(2);
    expect(h.format()).toBe('16:00–02:00');
  });

  it('closing at midnight (0 or 24) does not cross into the next day', () => {
    expect(OpeningHours.of(8, 0).equals(OpeningHours.of(8, 24))).toBe(true);
    expect(OpeningHours.of(8, 0).crossesMidnight).toBe(false);
    expect(OpeningHours.of(8, 0).durationHours).toBe(16);
  });

  it('open = close means around the clock', () => {
    expect(OpeningHours.of(6, 6).durationHours).toBe(24);
  });

  it.each([
    [24, 5],
    [-1, 5],
    [8.5, 20],
    [8, 25],
  ])('rejects (%s, %s)', (open, close) => {
    expect(() => OpeningHours.of(open, close)).toThrow(InvalidOpeningHoursError);
  });

  it.each([
    ['8-23', '08:00–23:00'],
    ['08:00-02:00', '08:00–02:00'],
    ['16 - 2', '16:00–02:00'],
    ['08.00–00.00', '08:00–00:00'],
  ])('parses %j', (input, formatted) => {
    expect(OpeningHours.parse(input).format()).toBe(formatted);
  });

  it.each(['08:30-23:00', 'kechqurun', '8', '8-23-1'])('EC-S6: rejects %j', (input) => {
    expect(() => OpeningHours.parse(input)).toThrow(InvalidOpeningHoursError);
  });
});
