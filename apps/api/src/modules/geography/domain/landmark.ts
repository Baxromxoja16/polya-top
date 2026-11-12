import {
  AggregateRoot,
  type Brand,
  type GeoPoint,
  type LocalizedText,
  normalizeSearchText,
} from '@polya/shared-kernel';
import type { CityId } from './city.js';

export type LandmarkId = Brand<string, 'LandmarkId'>;

export interface LandmarkProps {
  cityId: CityId;
  name: LocalizedText;
  /** Qo'shimcha yozilishlar: "rynok", "bozorcha" (TZ VC-4b) */
  synonyms: string[];
  location: GeoPoint;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Orientir — Admin kiritadigan mashhur joy (bozor, maktab, vokzal) koordinatasi bilan (TZ VC-4b).
 * Foydalanuvchi "bozor yonida" desa, matn orientirga mos kelsa, qidiruv shu nuqta atrofida bajariladi.
 */
export class Landmark extends AggregateRoot<LandmarkId> {
  #props: LandmarkProps;

  private constructor(id: LandmarkId, props: LandmarkProps, version: number) {
    super(id, version);
    this.#props = props;
  }

  static create(params: {
    id: LandmarkId;
    cityId: CityId;
    name: LocalizedText;
    synonyms?: string[];
    location: GeoPoint;
    now: Date;
  }): Landmark {
    return new Landmark(
      params.id,
      {
        cityId: params.cityId,
        name: params.name,
        synonyms: uniqueSynonyms(params.synonyms ?? []),
        location: params.location,
        isActive: true,
        createdAt: params.now,
        updatedAt: params.now,
      },
      0,
    );
  }

  static reconstitute(id: LandmarkId, props: LandmarkProps, version: number): Landmark {
    return new Landmark(id, { ...props, synonyms: [...props.synonyms] }, version);
  }

  get cityId(): CityId {
    return this.#props.cityId;
  }
  get name(): LocalizedText {
    return this.#props.name;
  }
  get synonyms(): readonly string[] {
    return this.#props.synonyms;
  }
  get location(): GeoPoint {
    return this.#props.location;
  }
  get isActive(): boolean {
    return this.#props.isActive;
  }
  get createdAt(): Date {
    return this.#props.createdAt;
  }
  get updatedAt(): Date {
    return this.#props.updatedAt;
  }

  /** Qidiruv uchun barcha nomlar normallashtirilgan holda: ["markaziy bozor", "tsentralniy rinok", "rynok"] */
  get searchTerms(): string[] {
    return [
      ...new Set(
        [this.#props.name.uz, this.#props.name.ru, ...this.#props.synonyms].map(
          normalizeSearchText,
        ),
      ),
    ].filter(Boolean);
  }

  setActive(isActive: boolean, now: Date): void {
    this.#props.isActive = isActive;
    this.#props.updatedAt = now;
  }
}

function uniqueSynonyms(input: string[]): string[] {
  return [...new Set(input.map((s) => s.trim()).filter(Boolean))].slice(0, 20);
}
