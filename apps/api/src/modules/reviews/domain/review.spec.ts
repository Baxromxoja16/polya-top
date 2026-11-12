import { describe, expect, it } from 'vitest';
import {
  InvalidReviewError,
  needsModeration,
  Review,
  type ReviewId,
  ReviewRuleError,
} from './review.js';

const now = new Date('2026-11-12T10:00:00Z');
const later = (days: number) => new Date(now.getTime() + days * 86_400_000);
const create = (text: string | null = "Zo'r maydon, chiroq yaxshi", rating = 5) =>
  Review.create({
    id: 'r1' as ReviewId,
    bookingId: 'b1',
    venueId: 'v1',
    pitchId: 'p1',
    authorId: 'u1',
    rating,
    text,
    now,
  });

describe('Review (TZ 4.5)', () => {
  it('is visible by default; rating must be 1..5', () => {
    expect(create().isVisible).toBe(true);
    expect(() => create(null, 0)).toThrow(InvalidReviewError);
    expect(() => create(null, 6)).toThrow(InvalidReviewError);
    expect(() => create('x'.repeat(1001))).toThrow(InvalidReviewError);
  });

  it.each([
    "Qo'ng'iroq qiling +998 90 123 45 67",
    'Batafsil: https://spam.uz',
    'Kanalga obuna: @super_promo',
    'Tupoy egasi',
  ])('EC-R5: %j goes to moderation', (text) => {
    expect(needsModeration(text)).toBe(true);
    const r = create(text);
    expect(r).toMatchObject({ status: 'HIDDEN', hiddenReason: 'AUTO_FILTER' });
  });

  it('RV-4: the author edits within 7 days; edits are filtered too', () => {
    const r = create();
    r.edit('u1', { rating: 3, text: 'yaxshi' }, later(6));
    expect(r).toMatchObject({ rating: 3, text: 'yaxshi' });
    r.edit('u1', { text: 'www.x.uz' }, later(6));
    expect(r.status).toBe('HIDDEN');
    r.edit('u1', { text: 'tuzatdim' }, later(6));
    expect(r.status).toBe('VISIBLE');
    expect(() => r.edit('u1', { rating: 1 }, later(8))).toThrow(ReviewRuleError);
    expect(() => r.edit('u2', { rating: 1 }, later(1))).toThrow(ReviewRuleError);
  });

  it('RV-4: the author deletes any time (soft)', () => {
    const r = create();
    r.delete('u1', later(30));
    expect(r.status).toBe('DELETED');
  });

  it('RV-5: the owner replies once', () => {
    const r = create();
    r.reply('Rahmat!', now);
    expect(r.ownerReply?.text).toBe('Rahmat!');
    expect(() => r.reply('Yana', now)).toThrow(ReviewRuleError);
  });

  it('RV-6: three distinct reports hide it; duplicates and self-reports do not count', () => {
    const r = create();
    expect(r.report('u1', now)).toBe(false);
    expect(r.report('a', now)).toBe(true);
    expect(r.report('a', now)).toBe(false);
    r.report('b', now);
    expect(r.isVisible).toBe(true);
    r.report('c', now);
    expect(r).toMatchObject({ status: 'HIDDEN', hiddenReason: 'REPORTS' });
  });

  it('AD-3: a moderator restores (clearing reports) or deletes', () => {
    const r = create('www.x.uz');
    r.moderate('SHOW', now);
    expect(r.isVisible).toBe(true);
    r.moderate('DELETE', now);
    expect(r.status).toBe('DELETED');
    r.moderate('SHOW', now);
    expect(r.status).toBe('DELETED'); // o'chirilgan qaytmaydi
  });
});
