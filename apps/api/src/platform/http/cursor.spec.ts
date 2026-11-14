import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { decodeOffsetCursor, encodeOffsetCursor, nextOffsetCursor } from './cursor.js';

describe('offset cursor', () => {
  it('round-trips and is opaque url-safe text', () => {
    const cursor = encodeOffsetCursor(40);
    expect(cursor).toMatch(/^[\w-]+$/);
    expect(cursor).not.toContain('40');
    expect(decodeOffsetCursor(cursor)).toBe(40);
  });

  it('starts from 0 without a cursor', () => {
    expect(decodeOffsetCursor(undefined)).toBe(0);
  });

  it.each(['abc', encodeOffsetCursor(-1), Buffer.from('o:1.5').toString('base64url')])(
    'rejects a forged cursor %s',
    (cursor) => {
      expect(() => decodeOffsetCursor(cursor)).toThrow(BadRequestException);
    },
  );

  it('gives a next cursor only after a full page', () => {
    expect(nextOffsetCursor(20, 20, 20)).toBe(encodeOffsetCursor(40));
    expect(nextOffsetCursor(20, 20, 7)).toBeNull();
  });
});
