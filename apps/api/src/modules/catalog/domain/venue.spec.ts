import { GeoPoint, PhoneNumber } from '@polya/shared-kernel';
import { describe, expect, it } from 'vitest';
import { InvalidPitchError, Pitch, type PitchId } from './pitch.js';
import { InvalidVenueError, Venue, VenueEvents, type VenueId, VenueStatusError } from './venue.js';

const now = new Date('2026-11-12T10:00:00Z');
const register = (over: Partial<{ name: string; landmarkText: string }> = {}) =>
  Venue.register({
    id: 'v1' as VenueId,
    ownerId: 'owner1',
    slug: 'olmaliq-arena',
    name: over.name ?? ' Olmaliq  Arena ',
    landmarkText: over.landmarkText ?? '5-mikrorayon, 21-maktab orqasida',
    cityId: 'city1',
    ownerPhone: PhoneNumber.parse('998901112233'),
    now,
  });

describe('Venue', () => {
  it('VC-2: registration needs only name and landmark, owner phone is the contact', () => {
    const v = register();
    expect(v.name).toBe('Olmaliq Arena');
    expect(v.status).toBe('PENDING_REVIEW');
    expect(v.isPublic).toBe(false);
    expect(v.phones.map((p) => p.value)).toEqual(['+998901112233']);
    expect(v.location).toBeNull();
    expect(v.pullEvents().map((e) => e.type)).toEqual([VenueEvents.Submitted]);
  });

  it.each([
    [{ name: 'A' }],
    [{ name: 'x'.repeat(61) }],
    [{ landmarkText: 'bor' }], // EC-O4
  ])('rejects invalid input %j', (over) => {
    expect(() => register(over)).toThrow(InvalidVenueError);
  });

  it('VC-2c: completeness starts at 30% and grows with optional data', () => {
    const v = register();
    expect(v.completeness(false)).toBe(30);
    v.addPhoto('file-1', 5, now);
    v.setLocation(GeoPoint.of(40.84, 69.6), now);
    expect(v.completeness(false)).toBe(70);
    v.toggleAmenity('PARKING', now);
    v.setDescription('Yopiq zal', now);
    expect(v.completeness(true)).toBe(100);
  });

  it('VC-1: only an approved venue is public; review happens once', () => {
    const v = register();
    v.approve(now);
    expect(v.isPublic).toBe(true);
    expect(() => v.reject('late', now)).toThrow(VenueStatusError);
  });

  it('a rejected venue can be resubmitted', () => {
    const v = register();
    v.reject(' Manzil noaniq ', now);
    expect(v.rejectReason).toBe('Manzil noaniq');
    v.resubmit(now);
    expect(v.status).toBe('PENDING_REVIEW');
  });

  it('restoring from archive keeps approval if it was approved before', () => {
    const approved = register();
    approved.approve(now);
    approved.archive(now);
    approved.restore(now);
    expect(approved.status).toBe('APPROVED');

    const fresh = register();
    fresh.archive(now);
    fresh.restore(now);
    expect(fresh.status).toBe('PENDING_REVIEW');
  });

  it('VC-2e: photo limit is enforced', () => {
    const v = register();
    for (let i = 0; i < 5; i++) v.addPhoto(`f${i}`, 5, now);
    expect(() => v.addPhoto('f5', 5, now)).toThrow(InvalidVenueError);
  });

  it('phones are deduplicated and limited to 1..3', () => {
    const v = register();
    const p = (s: string) => PhoneNumber.parse(s);
    v.setPhones([p('998901112233'), p('+998901112233'), p('998935554433')], now);
    expect(v.phones).toHaveLength(2);
    expect(() => v.setPhones([], now)).toThrow(InvalidVenueError);
  });
});

describe('Pitch', () => {
  const pitch = () => Pitch.create({ id: 'p1' as PitchId, venueId: 'v1', name: '1-maydon', now });

  it('has details only when format and surface are set', () => {
    const p = pitch();
    expect(p.hasDetails).toBe(false);
    p.setFormat('6x6', now);
    p.setSurface('ARTIFICIAL', now);
    expect(p.hasDetails).toBe(true);
  });

  it('normalizes size', () => {
    const p = pitch();
    p.setSize(' 40 × 20 ', now);
    expect(p.size).toBe('40x20');
    expect(() => p.setSize('katta', now)).toThrow(InvalidPitchError);
  });
});
