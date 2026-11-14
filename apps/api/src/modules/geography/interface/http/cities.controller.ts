import { Controller, Get } from '@nestjs/common';
import type { CityDto } from '@polya/contracts';
import { GeographyQueries } from '../../application/geography.service.js';

/** TZ 4.2.1: web-app shahar tanlovi — faqat faol shaharlar va hududlar (ochiq, auth'siz) */
@Controller('cities')
export class CitiesController {
  constructor(private readonly geography: GeographyQueries) {}

  @Get()
  async list(): Promise<CityDto[]> {
    const cities = await this.geography.listCities({ activeOnly: true });
    return cities.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: { uz: c.name.uz, ru: c.name.ru },
      timezone: c.timezone,
      districts: c.districts
        .filter((d) => d.isActive)
        .map((d) => ({ id: d.id, name: { uz: d.name.uz, ru: d.name.ru } })),
    }));
  }
}
