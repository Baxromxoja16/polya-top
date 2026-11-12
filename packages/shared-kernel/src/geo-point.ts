import { DomainError } from './domain-error.js';

export class InvalidGeoPointError extends DomainError {
  readonly code = 'INVALID_GEO_POINT';
}

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

export interface GeoJsonPoint {
  type: 'Point';
  /** GeoJSON tartibi: [longitude, latitude] */
  coordinates: [number, number];
}

/** WGS84 koordinata. Mongo'da GeoJSON Point sifatida saqlanadi (2dsphere indeks, TZ 9). */
export class GeoPoint {
  private constructor(
    readonly lat: number,
    readonly lng: number,
  ) {}

  static of(lat: number, lng: number): GeoPoint {
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      throw new InvalidGeoPointError('Latitude must be within [-90, 90]', { lat });
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      throw new InvalidGeoPointError('Longitude must be within [-180, 180]', { lng });
    }
    return new GeoPoint(lat, lng);
  }

  static fromGeoJson(point: GeoJsonPoint): GeoPoint {
    return GeoPoint.of(point.coordinates[1], point.coordinates[0]);
  }

  /** Haversine — katta doira bo'yicha masofa, metrda. */
  distanceTo(other: GeoPoint): number {
    const dLat = toRad(other.lat - this.lat);
    const dLng = toRad(other.lng - this.lng);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(this.lat)) * Math.cos(toRad(other.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
  }

  toGeoJson(): GeoJsonPoint {
    return { type: 'Point', coordinates: [this.lng, this.lat] };
  }

  equals(other: GeoPoint): boolean {
    return this.lat === other.lat && this.lng === other.lng;
  }
}
