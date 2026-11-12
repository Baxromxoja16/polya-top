import type { LocalizedText } from '@polya/shared-kernel';

export interface CityOption {
  id: string;
  name: LocalizedText;
}

/**
 * Identity'ga kerakli shahar ma'lumoti porti. Implementatsiya Geography kontekstiga
 * ochiq API orqali murojaat qiladi (anti-corruption layer, TZ 7.2).
 */
export abstract class CityCatalog {
  abstract activeCities(): Promise<CityOption[]>;
  abstract isActive(cityId: string): Promise<boolean>;
}

/** Test va seed uchun: o'zgarmas ro'yxat. */
export class StaticCityCatalog extends CityCatalog {
  constructor(private readonly cities: CityOption[] = []) {
    super();
  }

  async activeCities(): Promise<CityOption[]> {
    return this.cities;
  }

  async isActive(cityId: string): Promise<boolean> {
    return this.cities.some((c) => c.id === cityId);
  }
}
