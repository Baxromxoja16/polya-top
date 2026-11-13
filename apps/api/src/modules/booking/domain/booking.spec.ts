import { Money, PhoneNumber, TimeRange } from '@polya/shared-kernel';
import { describe, expect, it } from 'vitest';
import {
  Booking,
  BookingEvents,
  type BookingId,
  BookingTransitionError,
  InvalidBookingError,
} from './booking.js';

const T = (iso: string) => new Date(iso);
const now = T('2026-11-12T10:00:00Z');
const range = (startIso: string, hours = 1) => TimeRange.ofDuration(T(startIso), hours * 60);

const request = (startIso = '2026-11-12T15:00:00Z', at = now) =>
  Booking.request({
    id: 'b1' as BookingId,
    code: 'PT-AAAAA',
    pitchId: 'p1',
    venueId: 'v1',
    ownerId: 'o1',
    playerId: 'u1',
    range: range(startIso),
    businessDate: '2026-11-12',
    price: Money.of(150_000),
    now: at,
  });

describe('Booking state machine (TZ 4.4.1)', () => {
  it('a request is PENDING, does not occupy slots and expires in 60 minutes', () => {
    const b = request();
    expect(b.status).toBe('PENDING');
    expect(b.occupiesSlots).toBe(false);
    expect(b.isActive).toBe(true);
    expect(b.expiresAt?.toISOString()).toBe('2026-11-12T11:00:00.000Z');
    expect(b.pullEvents().map((e) => e.type)).toEqual([BookingEvents.Requested]);
  });

  it('EC-B7: a request close to the game expires at its start, not later', () => {
    const b = request('2026-11-12T10:20:00Z');
    expect(b.expiresAt?.toISOString()).toBe('2026-11-12T10:20:00.000Z');
  });

  it('rejects a request for the past', () => {
    expect(() => request('2026-11-12T09:00:00Z')).toThrow(InvalidBookingError);
  });

  it('PENDING → CONFIRMED occupies slots and clears expiry', () => {
    const b = request();
    b.confirm('o1', now);
    expect(b).toMatchObject({
      status: 'CONFIRMED',
      occupiesSlots: true,
      confirmedBy: 'o1',
      expiresAt: null,
    });
  });

  it('EC-B3: confirming after expiry time is refused even before the sweeper runs', () => {
    const b = request();
    expect(() => b.confirm('o1', T('2026-11-12T11:00:00Z'))).toThrow(BookingTransitionError);
  });

  it('PENDING → REJECTED (owner, with note) and (slot taken)', () => {
    const a = request();
    a.reject('o1', "  Ta'mir  ", now);
    expect(a).toMatchObject({ status: 'REJECTED', rejectReason: 'OWNER', note: "Ta'mir" });
    const b = request();
    b.rejectAsTaken(now);
    expect(b).toMatchObject({ status: 'REJECTED', rejectReason: 'SLOT_TAKEN' });
  });

  it('PENDING → EXPIRED only after expiresAt', () => {
    const b = request();
    expect(() => b.expire(T('2026-11-12T10:59:00Z'))).toThrow(BookingTransitionError);
    b.expire(T('2026-11-12T11:00:00Z'));
    expect(b.status).toBe('EXPIRED');
  });

  it('BK-5: player cancels freely; late cancel of a confirmed game is flagged', () => {
    const early = request('2026-11-12T15:00:00Z');
    early.confirm('o1', now);
    early.cancelByPlayer('u1', now); // 5 soat qoldi
    expect(early).toMatchObject({ status: 'CANCELLED_BY_PLAYER', lateCancel: false });

    const late = request('2026-11-12T12:00:00Z');
    late.confirm('o1', now);
    late.cancelByPlayer('u1', T('2026-11-12T10:30:00Z')); // 1.5 soat qoldi
    expect(late.lateCancel).toBe(true);

    const pending = request('2026-11-12T12:00:00Z');
    pending.cancelByPlayer('u1', T('2026-11-12T10:30:00Z'));
    expect(pending.lateCancel).toBe(false); // tasdiqlanmagan so'rov — kech hisoblanmaydi
  });

  it('cannot cancel after the game started', () => {
    const b = request('2026-11-12T11:00:00Z');
    b.confirm('o1', now);
    expect(() => b.cancelByPlayer('u1', T('2026-11-12T11:10:00Z'))).toThrow(BookingTransitionError);
  });

  it('BK-6: owner cancellation requires a reason and a confirmed booking', () => {
    const b = request();
    expect(() => b.cancelByOwner('o1', "yomg'ir", now)).toThrow(BookingTransitionError); // PENDING
    b.confirm('o1', now);
    expect(() => b.cancelByOwner('o1', '   ', now)).toThrow(InvalidBookingError);
    b.cancelByOwner('o1', 'Chiroq buzildi', now);
    expect(b).toMatchObject({ status: 'CANCELLED_BY_OWNER', note: 'Chiroq buzildi' });
  });

  it('BK-9: completes after the end; no-show within 24 hours only', () => {
    const b = request();
    b.confirm('o1', now);
    expect(() => b.complete(T('2026-11-12T15:30:00Z'))).toThrow(BookingTransitionError);
    b.complete(T('2026-11-12T16:00:00Z'));
    expect(b.status).toBe('COMPLETED');
    expect(() => b.markNoShow('o1', T('2026-11-13T16:00:01Z'))).toThrow(BookingTransitionError);
    b.markNoShow('o1', T('2026-11-13T15:00:00Z'));
    expect(b.status).toBe('NO_SHOW');
  });

  it('illegal transitions are refused (e.g. REJECTED → CONFIRMED)', () => {
    const b = request();
    b.reject('o1', null, now);
    expect(() => b.confirm('o1', now)).toThrow(BookingTransitionError);
    expect(() => b.rejectAsTaken(now)).toThrow(BookingTransitionError);
  });

  it('keeps a history of every transition', () => {
    const b = request();
    b.confirm('o1', now);
    b.cancelByOwner('o1', 'Yopildi', now);
    expect(b.history.map((h) => [h.from, h.to])).toEqual([
      [null, 'PENDING'],
      ['PENDING', 'CONFIRMED'],
      ['CONFIRMED', 'CANCELLED_BY_OWNER'],
    ]);
  });
});

describe('System cancellation (EC-B10, EC-B11)', () => {
  it('a blocked player: pending and confirmed become cancelled by player, never "late"', () => {
    const b = request('2026-11-12T10:40:00Z');
    b.confirm('o1', now);
    b.cancelBySystem('PLAYER_BLOCKED', 'Akkaunt bloklandi', now);
    expect(b).toMatchObject({
      status: 'CANCELLED_BY_PLAYER',
      occupiesSlots: false,
      lateCancel: false,
    });
  });

  it('a blocked venue: a pending request is rejected, a confirmed game is cancelled by owner', () => {
    const pending = request();
    pending.cancelBySystem('VENUE_BLOCKED', 'Stadion bloklandi', now);
    expect(pending.status).toBe('REJECTED');
    const confirmed = request();
    confirmed.confirm('o1', now);
    confirmed.cancelBySystem('VENUE_BLOCKED', 'Stadion bloklandi', now);
    expect(confirmed).toMatchObject({ status: 'CANCELLED_BY_OWNER', note: 'Stadion bloklandi' });
  });
});

describe('Manual booking (BK-7)', () => {
  it('is CONFIRMED immediately with guest details', () => {
    const b = Booking.manual({
      id: 'b2' as BookingId,
      code: 'PT-BBBBB',
      pitchId: 'p1',
      venueId: 'v1',
      ownerId: 'o1',
      createdBy: 'o1',
      guest: { name: ' Sardor ', phone: PhoneNumber.parse('998901112233') },
      range: range('2026-11-12T15:00:00Z', 2),
      businessDate: '2026-11-12',
      price: Money.of(300_000),
      now,
    });
    expect(b).toMatchObject({ status: 'CONFIRMED', source: 'MANUAL', playerId: null });
    expect(b.guest?.name).toBe('Sardor');
    expect(() => b.markNoShow('o1', now)).toThrow(BookingTransitionError);
  });
});
