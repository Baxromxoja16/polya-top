import { describe, expect, it } from 'vitest';
import { FixedClock } from './clock.js';
import { OBJECT_ID_PATTERN, ObjectIdGenerator } from './id.js';

describe('ObjectIdGenerator', () => {
  it('produces unique ObjectId-compatible ids', () => {
    const gen = new ObjectIdGenerator();
    const ids = Array.from({ length: 10_000 }, () => gen.next());
    for (const id of ids) expect(id).toMatch(OBJECT_ID_PATTERN);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('FixedClock', () => {
  it('is controllable and returns copies', () => {
    const clock = new FixedClock(new Date('2026-11-11T10:00:00Z'));
    clock.now().setUTCFullYear(2000);
    expect(clock.now().toISOString()).toBe('2026-11-11T10:00:00.000Z');
    clock.advanceBy(90 * 60_000);
    expect(clock.now().toISOString()).toBe('2026-11-11T11:30:00.000Z');
  });
});
