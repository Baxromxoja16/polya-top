import { Injectable } from '@nestjs/common';
import {
  Clock,
  DomainError,
  type GeoPoint,
  IdGenerator,
  type LocalizedText,
  slugify,
} from '@polya/shared-kernel';
import { City, type CityId, type DistrictId } from '../domain/city.js';
import { Landmark, type LandmarkId } from '../domain/landmark.js';
import { CityRepository, LandmarkRepository } from '../domain/repositories.js';

export class CityNotFoundError extends DomainError {
  readonly code = 'CITY_NOT_FOUND';
}

export interface DistrictView {
  id: DistrictId;
  name: LocalizedText;
  isActive: boolean;
}

export interface CityView {
  id: CityId;
  slug: string;
  name: LocalizedText;
  timezone: string;
  center: GeoPoint | null;
  isActive: boolean;
  districts: DistrictView[];
}

export interface LandmarkView {
  id: LandmarkId;
  cityId: CityId;
  name: LocalizedText;
  searchTerms: string[];
  location: GeoPoint;
  isActive: boolean;
}

const toCityView = (c: City): CityView => ({
  id: c.id,
  slug: c.slug,
  name: c.name,
  timezone: c.timezone,
  center: c.center,
  isActive: c.isActive,
  districts: c.districts.map((d) => ({ ...d })),
});

const toLandmarkView = (l: Landmark): LandmarkView => ({
  id: l.id,
  cityId: l.cityId,
  name: l.name,
  searchTerms: l.searchTerms,
  location: l.location,
  isActive: l.isActive,
});

/** Admin amallari (TZ CT-1…CT-3, VC-4b). Ruxsat interfeys qatlamida tekshiriladi. */
@Injectable()
export class GeographyAdminService {
  constructor(
    private readonly cities: CityRepository,
    private readonly landmarks: LandmarkRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async createCity(input: { name: LocalizedText; center?: GeoPoint | null }): Promise<CityView> {
    const city = City.create({
      id: this.ids.next() as CityId,
      slug: slugify(input.name.uz),
      name: input.name,
      center: input.center ?? null,
      now: this.clock.now(),
    });
    await this.cities.save(city);
    return toCityView(city);
  }

  async addDistrict(cityId: CityId, name: LocalizedText): Promise<CityView> {
    const city = await this.load(cityId);
    city.addDistrict({ id: this.ids.next() as DistrictId, name, now: this.clock.now() });
    await this.cities.save(city);
    return toCityView(city);
  }

  async setCityActive(cityId: CityId, isActive: boolean): Promise<CityView> {
    const city = await this.load(cityId);
    if (city.setActive(isActive, this.clock.now())) await this.cities.save(city);
    return toCityView(city);
  }

  async setDistrictActive(
    cityId: CityId,
    districtId: DistrictId,
    isActive: boolean,
  ): Promise<CityView> {
    const city = await this.load(cityId);
    city.setDistrictActive(districtId, isActive, this.clock.now());
    await this.cities.save(city);
    return toCityView(city);
  }

  async setCityCenter(cityId: CityId, center: GeoPoint): Promise<CityView> {
    const city = await this.load(cityId);
    city.setCenter(center, this.clock.now());
    await this.cities.save(city);
    return toCityView(city);
  }

  async addLandmark(input: {
    cityId: CityId;
    name: LocalizedText;
    synonyms: string[];
    location: GeoPoint;
  }): Promise<LandmarkView> {
    await this.load(input.cityId);
    const landmark = Landmark.create({
      id: this.ids.next() as LandmarkId,
      ...input,
      now: this.clock.now(),
    });
    await this.landmarks.save(landmark);
    return toLandmarkView(landmark);
  }

  private async load(id: CityId): Promise<City> {
    const city = await this.cities.findById(id);
    if (!city) throw new CityNotFoundError('City not found', { id });
    return city;
  }
}

/** Boshqa kontekstlar uchun ochiq o'qish API'si (TZ 7.2: faqat ID va facade orqali). */
@Injectable()
export class GeographyQueries {
  constructor(
    private readonly cities: CityRepository,
    private readonly landmarks: LandmarkRepository,
  ) {}

  async listCities(filter: { activeOnly?: boolean } = {}): Promise<CityView[]> {
    return (await this.cities.list(filter)).map(toCityView);
  }

  async getCity(id: CityId): Promise<CityView | null> {
    const city = await this.cities.findById(id);
    return city ? toCityView(city) : null;
  }

  async getCityBySlug(slug: string): Promise<CityView | null> {
    const city = await this.cities.findBySlug(slug);
    return city ? toCityView(city) : null;
  }

  async listLandmarks(
    cityId: CityId,
    filter: { activeOnly?: boolean } = {},
  ): Promise<LandmarkView[]> {
    return (await this.landmarks.listByCity(cityId, filter)).map(toLandmarkView);
  }
}
