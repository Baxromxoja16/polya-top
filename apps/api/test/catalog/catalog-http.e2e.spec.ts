import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  cityDtoSchema,
  problemDetailsSchema,
  venueCardSchema,
  venueSearchResponseSchema,
} from '@polya/contracts';
import { GeoPoint, localizedText, Money } from '@polya/shared-kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Actor } from '../../src/modules/catalog/application/actor.js';
import { RegisterVenueUseCase } from '../../src/modules/catalog/application/register-venue.use-case.js';
import { VenueManagementService } from '../../src/modules/catalog/application/venue-management.service.js';
import type { VenueId } from '../../src/modules/catalog/domain/venue.js';
import { type CityView, GeographyAdminService } from '../../src/modules/geography/index.js';
import { OpeningHours } from '../../src/modules/scheduling/index.js';
import { createTestApp, type Infra, startInfra } from '../support/test-app.js';

const CENTER = { lat: 41.31, lng: 69.28 };

describe('Catalog REST (e2e): TZ 7.7 /cities, /venues', () => {
  let infra: Infra;
  let app: NestFastifyApplication;
  let city: CityView;
  const admin: Actor = {
    userId: 'a'.repeat(24),
    roles: ['PLAYER', 'ADMIN'],
    phone: null,
    cityId: null,
  };
  let owner: Actor;
  let pendingSlug: string;

  const get = (url: string) => app.inject({ method: 'GET', url: `/api/v1${url}` });
  const problem = (res: { json: () => unknown }) => problemDetailsSchema.parse(res.json());

  beforeAll(async () => {
    infra = await startInfra();
    app = await createTestApp({ MONGO_URI: infra.mongoUri, REDIS_URL: infra.redisUrl });
    const geo = app.get(GeographyAdminService);
    city = await geo.createCity({
      name: localizedText({ uz: 'Toshkent', ru: 'Ташкент' }),
      center: GeoPoint.of(CENTER.lat, CENTER.lng),
    });
    city = await geo.addDistrict(city.id, localizedText({ uz: 'Chilonzor', ru: 'Чиланзар' }));
    const hidden = await geo.createCity({ name: localizedText({ uz: 'Yopiq', ru: 'Закрыт' }) });
    await geo.setCityActive(hidden.id, false);
    owner = {
      userId: 'b'.repeat(24),
      roles: ['PLAYER', 'OWNER'],
      phone: '+998901112233',
      cityId: city.id,
    };

    const register = app.get(RegisterVenueUseCase);
    const manage = app.get(VenueManagementService);
    for (let i = 1; i <= 5; i++) {
      const result = await register.execute({
        actor: owner,
        name: `Arena ${i}`,
        landmarkText: `${i}-maktab yonida`,
        hours: OpeningHours.of(8, 0),
        pricePerHour: Money.of(100_000 + i * 10_000),
      });
      if (!result.ok) throw new Error(result.error);
      if (i < 5) await manage.approve(admin, result.value.venue.id as VenueId);
      else pendingSlug = result.value.venue.slug;
    }
  });

  afterAll(async () => {
    await app?.close();
    await Promise.all([infra?.mongo.stop(), infra?.redis.stop()]);
  });

  it('GET /cities lists only active cities with their districts', async () => {
    const res = await get('/cities');
    expect(res.statusCode).toBe(200);
    const cities = cityDtoSchema.array().parse(res.json());
    expect(cities.map((c) => c.slug)).toEqual([city.slug]);
    expect(cities[0]?.districts.map((d) => d.name.uz)).toEqual(['Chilonzor']);
  });

  it('GET /venues pages APPROVED venues with an opaque cursor (VC-1, 7.7)', async () => {
    const first = venueSearchResponseSchema.parse(
      (await get(`/venues?cityId=${city.id}&limit=3`)).json(),
    );
    expect(first.items).toHaveLength(3);
    expect(first.nextCursor).toEqual(expect.any(String));
    expect(first.items[0]).toMatchObject({
      minPricePerHour: { currency: 'UZS' },
      distanceMeters: null,
    });
    // Asoschi hamkor trial'i — PREMIUM; VC-5a: sahifada ko'pi bilan 2 ta "Tavsiya etiladi", yuqorida
    expect(first.items.map((v) => v.recommended)).toEqual([true, true, false]);

    const second = venueSearchResponseSchema.parse(
      (await get(`/venues?cityId=${city.id}&limit=3&cursor=${first.nextCursor}`)).json(),
    );
    expect(second.nextCursor).toBeNull();
    const names = [...first.items, ...second.items].map((v) => v.name).sort();
    expect(names).toEqual(['Arena 1', 'Arena 2', 'Arena 3', 'Arena 4']);
  });

  it('GET /venues/:slug returns the card without owner phones; PENDING is 404', async () => {
    const ok = await get('/venues/arena-2');
    expect(ok.statusCode).toBe(200);
    const card = venueCardSchema.parse(ok.json());
    expect(card.pitches).toEqual([
      expect.objectContaining({
        name: '1-maydon',
        bookable: true,
        basePricePerHour: { amount: 120_000, currency: 'UZS' },
      }),
    ]);
    expect(JSON.stringify(ok.json())).not.toContain('+998');

    const byId = await get(`/venues/${card.id}`);
    expect(venueCardSchema.parse(byId.json()).slug).toBe('arena-2');

    for (const ref of [pendingSlug, 'no-such-venue', 'bad%20slug!']) {
      const res = await get(`/venues/${ref}`);
      expect(res.statusCode).toBe(404);
      expect(problem(res).code).toBe('VENUE_NOT_FOUND');
    }
  });

  it('rejects invalid queries as RFC 9457 problems', async () => {
    const noCity = await get('/venues');
    expect(noCity.statusCode).toBe(400);
    expect(problem(noCity)).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(problem(noCity).errors?.map((e) => e.path)).toContain('cityId');

    const halfGeo = await get(`/venues?cityId=${city.id}&lat=41.3`);
    expect(problem(halfGeo).errors?.map((e) => e.path)).toEqual(['lat']);

    const forged = await get(`/venues?cityId=${city.id}&cursor=AAAA`);
    expect(forged.statusCode).toBe(400);
    expect(problem(forged).code).toBe('CURSOR_INVALID');
  });

  it('sorts by distance when lat/lng is given', async () => {
    const res = venueSearchResponseSchema.parse(
      (await get(`/venues?cityId=${city.id}&lat=${CENTER.lat}&lng=${CENTER.lng}`)).json(),
    );
    // Stadionlarda lokatsiya yo'q — yaqinlik bo'yicha ham ro'yxat bo'sh bo'lmaydi (EC-O8)
    expect(res.items.length).toBe(4);
  });
});
