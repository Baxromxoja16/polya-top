import { describe, expect, it } from 'vitest';
import { GeoPoint, InvalidGeoPointError } from './geo-point.js';
import { InvalidLocalizedTextError, localizedText } from './localized-text.js';

describe('GeoPoint', () => {
  it.each([
    [91, 0],
    [-91, 0],
    [0, 181],
    [Number.NaN, 0],
  ])('rejects (%s, %s)', (lat, lng) => {
    expect(() => GeoPoint.of(lat, lng)).toThrow(InvalidGeoPointError);
  });

  it('round-trips GeoJSON with [lng, lat] order', () => {
    const p = GeoPoint.of(40.8447, 69.5983);
    expect(p.toGeoJson()).toEqual({ type: 'Point', coordinates: [69.5983, 40.8447] });
    expect(GeoPoint.fromGeoJson(p.toGeoJson()).equals(p)).toBe(true);
  });

  it('measures distance (Olmaliq → Toshkent ≈ 65 km)', () => {
    const olmaliq = GeoPoint.of(40.8447, 69.5983);
    const tashkent = GeoPoint.of(41.2995, 69.2401);
    expect(olmaliq.distanceTo(tashkent) / 1000).toBeGreaterThan(55);
    expect(olmaliq.distanceTo(tashkent) / 1000).toBeLessThan(65);
    expect(olmaliq.distanceTo(olmaliq)).toBe(0);
  });
});

describe('localizedText', () => {
  it('trims and collapses spaces', () => {
    expect(localizedText({ uz: '  Olmaliq ', ru: 'Алмалык   шахар' })).toEqual({
      uz: 'Olmaliq',
      ru: 'Алмалык шахар',
    });
  });

  it('requires every language and limits length', () => {
    expect(() => localizedText({ uz: 'Olmaliq', ru: ' ' })).toThrow(InvalidLocalizedTextError);
    expect(() => localizedText({ uz: 'x'.repeat(81), ru: 'y' })).toThrow(InvalidLocalizedTextError);
  });
});
