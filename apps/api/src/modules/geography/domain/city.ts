import {
  AggregateRoot,
  type Brand,
  DomainError,
  type GeoPoint,
  type LocalizedText,
  normalizeSearchText,
} from '@polya/shared-kernel';

export type CityId = Brand<string, 'CityId'>;
export type DistrictId = Brand<string, 'DistrictId'>;

export class InvalidCityError extends DomainError {
  readonly code = 'INVALID_CITY';
}
export class DuplicateDistrictError extends DomainError {
  readonly code = 'DUPLICATE_DISTRICT';
}
export class DistrictNotFoundError extends DomainError {
  readonly code = 'DISTRICT_NOT_FOUND';
}

export interface District {
  readonly id: DistrictId;
  readonly name: LocalizedText;
  readonly isActive: boolean;
}

export interface CityProps {
  slug: string;
  name: LocalizedText;
  timezone: string;
  center: GeoPoint | null;
  isActive: boolean;
  order: number;
  districts: District[];
  createdAt: Date;
  updatedAt: Date;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const DEFAULT_TIMEZONE = 'Asia/Tashkent';

/**
 * Shahar (TZ 4.2.1). Faqat Admin yaratadi va boshqaradi; hududlar shahar ichida (CT-3).
 * Hudud o'chirilmaydi, faqat nofaol qilinadi — unga bog'langan stadionlar bo'lishi mumkin (EC-C5).
 */
export class City extends AggregateRoot<CityId> {
  #props: CityProps;

  private constructor(id: CityId, props: CityProps, version: number) {
    super(id, version);
    this.#props = props;
  }

  static create(params: {
    id: CityId;
    slug: string;
    name: LocalizedText;
    timezone?: string;
    center?: GeoPoint | null;
    order?: number;
    now: Date;
  }): City {
    if (!SLUG.test(params.slug) || params.slug.length > 40) {
      throw new InvalidCityError('Slug must be lowercase latin, digits and dashes', {
        slug: params.slug,
      });
    }
    const timezone = params.timezone ?? DEFAULT_TIMEZONE;
    assertTimezone(timezone);
    return new City(
      params.id,
      {
        slug: params.slug,
        name: params.name,
        timezone,
        center: params.center ?? null,
        isActive: true,
        order: params.order ?? 0,
        districts: [],
        createdAt: params.now,
        updatedAt: params.now,
      },
      0,
    );
  }

  static reconstitute(id: CityId, props: CityProps, version: number): City {
    return new City(id, { ...props, districts: [...props.districts] }, version);
  }

  get slug(): string {
    return this.#props.slug;
  }
  get name(): LocalizedText {
    return this.#props.name;
  }
  get timezone(): string {
    return this.#props.timezone;
  }
  get center(): GeoPoint | null {
    return this.#props.center;
  }
  get isActive(): boolean {
    return this.#props.isActive;
  }
  get order(): number {
    return this.#props.order;
  }
  get districts(): readonly District[] {
    return this.#props.districts;
  }
  get activeDistricts(): readonly District[] {
    return this.#props.districts.filter((d) => d.isActive);
  }
  get createdAt(): Date {
    return this.#props.createdAt;
  }
  get updatedAt(): Date {
    return this.#props.updatedAt;
  }

  district(id: DistrictId): District | undefined {
    return this.#props.districts.find((d) => d.id === id);
  }

  addDistrict(params: { id: DistrictId; name: LocalizedText; now: Date }): District {
    const key = normalizeSearchText(params.name.uz);
    if (this.#props.districts.some((d) => normalizeSearchText(d.name.uz) === key)) {
      throw new DuplicateDistrictError('District with this name already exists', {
        name: params.name.uz,
      });
    }
    const district: District = { id: params.id, name: params.name, isActive: true };
    this.#props.districts = [...this.#props.districts, district];
    this.touch(params.now);
    return district;
  }

  setDistrictActive(id: DistrictId, isActive: boolean, now: Date): void {
    const found = this.district(id);
    if (!found) throw new DistrictNotFoundError('District not found', { id });
    this.#props.districts = this.#props.districts.map((d) =>
      d.id === id ? { ...d, isActive } : d,
    );
    this.touch(now);
  }

  setActive(isActive: boolean, now: Date): boolean {
    if (this.#props.isActive === isActive) return false;
    this.#props.isActive = isActive;
    this.touch(now);
    return true;
  }

  setCenter(center: GeoPoint, now: Date): void {
    this.#props.center = center;
    this.touch(now);
  }

  private touch(now: Date): void {
    this.#props.updatedAt = now;
  }
}

function assertTimezone(timezone: string): void {
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone });
  } catch {
    throw new InvalidCityError('Unknown IANA timezone', { timezone });
  }
}
