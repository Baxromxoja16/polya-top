import { GeoPoint, localizedText } from '@polya/shared-kernel';
import { describe, expect, it } from 'vitest';
import {
  City,
  type CityId,
  type DistrictId,
  DistrictNotFoundError,
  DuplicateDistrictError,
  InvalidCityError,
} from './city.js';
import { Landmark, type LandmarkId } from './landmark.js';

const now = new Date('2026-11-12T10:00:00Z');
const olmaliq = () =>
  City.create({
    id: 'c'.repeat(24) as CityId,
    slug: 'olmaliq',
    name: localizedText({ uz: 'Olmaliq', ru: 'Алмалык' }),
    now,
  });

describe('City', () => {
  it('is created active with the default timezone', () => {
    const city = olmaliq();
    expect(city.isActive).toBe(true);
    expect(city.timezone).toBe('Asia/Tashkent');
    expect(city.districts).toEqual([]);
  });

  it.each(['Olmaliq', 'olma liq', '-olmaliq', 'olmaliq-', ''])('rejects slug %j', (slug) => {
    expect(() =>
      City.create({ id: 'c'.repeat(24) as CityId, slug, name: olmaliq().name, now }),
    ).toThrow(InvalidCityError);
  });

  it('rejects an unknown timezone', () => {
    expect(() =>
      City.create({
        id: 'c'.repeat(24) as CityId,
        slug: 'x',
        name: olmaliq().name,
        timezone: 'Mars/Olympus',
        now,
      }),
    ).toThrow(InvalidCityError);
  });

  it('adds districts and rejects duplicates by normalized name', () => {
    const city = olmaliq();
    city.addDistrict({
      id: 'd1' as DistrictId,
      name: localizedText({ uz: '5-mikrorayon', ru: '5-микрорайон' }),
      now,
    });
    expect(() =>
      city.addDistrict({
        id: 'd2' as DistrictId,
        name: localizedText({ uz: '5 MIKRORAYON', ru: 'x' }),
        now,
      }),
    ).toThrow(DuplicateDistrictError);
    expect(city.districts).toHaveLength(1);
  });

  it('EC-C5: districts are deactivated, never removed', () => {
    const city = olmaliq();
    city.addDistrict({
      id: 'd1' as DistrictId,
      name: localizedText({ uz: 'Markaz', ru: 'Центр' }),
      now,
    });
    city.setDistrictActive('d1' as DistrictId, false, now);
    expect(city.districts).toHaveLength(1);
    expect(city.activeDistricts).toHaveLength(0);
    expect(() => city.setDistrictActive('nope' as DistrictId, true, now)).toThrow(
      DistrictNotFoundError,
    );
  });
});

describe('Landmark', () => {
  it('exposes normalized search terms from both names and synonyms', () => {
    const landmark = Landmark.create({
      id: 'l1' as LandmarkId,
      cityId: 'c'.repeat(24) as CityId,
      name: localizedText({ uz: 'Markaziy bozor', ru: 'Центральный рынок' }),
      synonyms: ['bozor', ' bozor ', 'rynok'],
      location: GeoPoint.of(40.84, 69.6),
      now,
    });
    expect(landmark.synonyms).toEqual(['bozor', 'rynok']);
    expect(landmark.searchTerms).toEqual(['markaziy bozor', 'tsentralniy rinok', 'bozor', 'rynok']);
  });
});
