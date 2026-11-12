import { describe, expect, it } from 'vitest';
import { InvalidSubscriptionError, Subscription } from './subscription.js';

const now = new Date('2026-11-12T10:00:00Z');
const days = (n: number) => new Date(now.getTime() + n * 86_400_000);

describe('Subscription (TZ 4.9)', () => {
  it('is FREE by default', () => {
    expect(Subscription.empty('v1').planAt(now)).toBe('FREE');
  });

  it('Q16: the founder trial is granted once for 90 days', () => {
    const s = Subscription.empty('v1');
    expect(s.startFounderTrial(90, now)).toBe(true);
    expect(s.startFounderTrial(90, now)).toBe(false);
    expect(s.planAt(days(89))).toBe('PREMIUM');
    expect(s.planAt(days(91))).toBe('FREE');
  });

  it('a manual extension continues from the end of the active period', () => {
    const s = Subscription.empty('v1');
    s.startFounderTrial(90, now);
    s.extend(30, 'MANUAL_PAYMENT', 'admin', days(10));
    expect(s.premiumEndsAt(now)?.toISOString()).toBe(days(120).toISOString());
  });

  it('after expiry an extension starts from now', () => {
    const s = Subscription.empty('v1');
    s.extend(10, 'MANUAL_PAYMENT', 'admin', now);
    s.extend(30, 'MANUAL_PAYMENT', 'admin', days(20));
    expect(s.planAt(days(15))).toBe('FREE');
    expect(s.planAt(days(25))).toBe('PREMIUM');
  });

  it('rejects invalid durations', () => {
    expect(() => Subscription.empty('v1').extend(0, 'MANUAL_PAYMENT', null, now)).toThrow(
      InvalidSubscriptionError,
    );
  });
});
