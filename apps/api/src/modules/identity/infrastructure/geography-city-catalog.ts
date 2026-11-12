import { Injectable } from '@nestjs/common';
import { type CityId, GeographyQueries } from '../../geography/index.js';
import { CityCatalog, type CityOption } from '../application/city-catalog.js';

@Injectable()
export class GeographyCityCatalog extends CityCatalog {
  constructor(private readonly geography: GeographyQueries) {
    super();
  }

  async activeCities(): Promise<CityOption[]> {
    const cities = await this.geography.listCities({ activeOnly: true });
    return cities.map((c) => ({ id: c.id, name: c.name }));
  }

  async isActive(cityId: string): Promise<boolean> {
    return (await this.geography.getCity(cityId as CityId))?.isActive ?? false;
  }
}
