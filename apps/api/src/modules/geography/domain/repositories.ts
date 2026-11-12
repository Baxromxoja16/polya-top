import { DomainError } from '@polya/shared-kernel';
import type { City, CityId } from './city.js';
import type { Landmark, LandmarkId } from './landmark.js';

export class CitySlugTakenError extends DomainError {
  readonly code = 'CITY_SLUG_TAKEN';
}

export abstract class CityRepository {
  abstract findById(id: CityId): Promise<City | null>;
  abstract findBySlug(slug: string): Promise<City | null>;
  /** `order`, keyin nom bo'yicha tartiblangan. */
  abstract list(filter?: { activeOnly?: boolean }): Promise<City[]>;
  abstract save(city: City): Promise<void>;
}

export abstract class LandmarkRepository {
  abstract findById(id: LandmarkId): Promise<Landmark | null>;
  abstract listByCity(cityId: CityId, filter?: { activeOnly?: boolean }): Promise<Landmark[]>;
  abstract save(landmark: Landmark): Promise<void>;
}
