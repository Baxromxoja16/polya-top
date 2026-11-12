import { describe, expect, it } from 'vitest';
import {
  ApplicationAlreadyReviewedError,
  InvalidApplicationNoteError,
  OwnerApplication,
  type OwnerApplicationId,
} from './owner-application.js';
import type { UserId } from './user.js';

const now = new Date('2026-11-12T10:00:00Z');
const submit = (note = 'Olmaliq Arena, 5-mikrorayon') =>
  OwnerApplication.submit({ id: 'a1' as OwnerApplicationId, userId: 'u1' as UserId, note, now });

describe('OwnerApplication (VC-1)', () => {
  it('starts as PENDING with a trimmed note', () => {
    const app = submit('  Olmaliq Arena  ');
    expect(app.status).toBe('PENDING');
    expect(app.note).toBe('Olmaliq Arena');
  });

  it.each(['abc', 'x'.repeat(501)])('rejects note %#', (note) => {
    expect(() => submit(note)).toThrow(InvalidApplicationNoteError);
  });

  it('is approved once by a reviewer', () => {
    const app = submit();
    app.approve('admin' as UserId, now);
    expect(app.status).toBe('APPROVED');
    expect(app.reviewedBy).toBe('admin');
    expect(() => app.reject('admin' as UserId, null, now)).toThrow(ApplicationAlreadyReviewedError);
  });

  it('keeps an optional reject reason', () => {
    const app = submit();
    app.reject('admin' as UserId, '  Manzil noaniq ', now);
    expect(app.status).toBe('REJECTED');
    expect(app.rejectReason).toBe('Manzil noaniq');
  });
});
