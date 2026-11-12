import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { GeoPoint, localizedText, Money } from '@polya/shared-kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Actor } from '../../src/modules/catalog/application/actor.js';
import { CatalogQueries } from '../../src/modules/catalog/application/catalog.queries.js';
import { RegisterVenueUseCase } from '../../src/modules/catalog/application/register-venue.use-case.js';
import { VenueManagementService } from '../../src/modules/catalog/application/venue-management.service.js';
import type { VenueId } from '../../src/modules/catalog/domain/venue.js';
import { type CityView, GeographyAdminService } from '../../src/modules/geography/index.js';
import { OpeningHours } from '../../src/modules/scheduling/index.js';
import { createTestApp, type Infra, startInfra } from '../support/test-app.js';

const CENTER = { lat: 40.8447, lng: 69.5983 };
const at = (dLatKm: number) => GeoPoint.of(CENTER.lat + dLatKm / 111, CENTER.lng);

describe('Catalog: onboarding, review and search (e2e) — phase 2 DoD', () => {
  let infra: Infra;
  let app: NestFastifyApplication;
  let city: CityView;
  let register: RegisterVenueUseCase;
  let manage: VenueManagementService;
  let queries: CatalogQueries;
  const admin: Actor = {
    userId: 'a'.repeat(24),
    roles: ['PLAYER', 'ADMIN'],
    phone: null,
    cityId: null,
  };
  let owner: Actor;

  const create = async (name: string, landmarkText: string, price = 150_000) => {
    const result = await register.execute({
      actor: owner,
      name,
      landmarkText,
      hours: OpeningHours.of(8, 0),
      pricePerHour: Money.of(price),
    });
    if (!result.ok) throw new Error(result.error);
    return result.value;
  };
  const approve = (id: string) => manage.approve(admin, id as VenueId);
  const names = (out: Awaited<ReturnType<CatalogQueries['search']>>) =>
    out.hits.map((h) => h.venue.name);

  beforeAll(async () => {
    infra = await startInfra();
    app = await createTestApp({ MONGO_URI: infra.mongoUri, REDIS_URL: infra.redisUrl });
    register = app.get(RegisterVenueUseCase);
    manage = app.get(VenueManagementService);
    queries = app.get(CatalogQueries);
    const geo = app.get(GeographyAdminService);
    city = await geo.createCity({ name: localizedText({ uz: 'Olmaliq', ru: 'Алмалык' }) });
    await geo.addLandmark({
      cityId: city.id,
      name: localizedText({ uz: 'Markaziy bozor', ru: 'Центральный рынок' }),
      synonyms: ['bozor'],
      location: at(2),
    });
    owner = {
      userId: 'b'.repeat(24),
      roles: ['PLAYER', 'OWNER'],
      phone: '+998901112233',
      cityId: city.id,
    };
  });

  afterAll(async () => {
    await app?.close();
    await Promise.all([infra?.mongo.stop(), infra?.redis.stop()]);
  });

  it('VC-2: register creates venue + "1-maydon" with hours and price, pending review', async () => {
    const { venue, pitch } = await create('Olmaliq Arena', '5-mikrorayon, 21-maktab orqasida');
    expect(venue.status).toBe('PENDING_REVIEW');
    expect(venue.slug).toBe('olmaliq-arena');
    const card = await queries.venueCard(venue.slug);
    expect(card?.pitches.map((p) => p.name)).toEqual(['1-maydon']);
    expect(card?.pitches[0]?.setup?.uniformHours?.format()).toBe('08:00–00:00');
    expect(card?.minPricePerHour?.amount).toBe(150_000);
    expect(pitch.venueId).toBe(venue.id);
  });

  it('VC-1 / DoD: PENDING_REVIEW venues are not searchable', async () => {
    expect(names(await queries.search({ cityId: city.id, limit: 10 }))).toEqual([]);
  });

  it('only an OWNER with phone and city can register', async () => {
    const r = await register.execute({
      actor: { ...owner, roles: ['PLAYER'] },
      name: 'X Arena',
      landmarkText: 'Markaz, bozor yonida',
      hours: OpeningHours.of(8, 0),
      pricePerHour: Money.of(100_000),
    });
    expect(r).toEqual({ ok: false, error: 'NOT_OWNER' });
  });

  it('EC-B18: a same-name venue in the city is reported; slug gets a suffix', async () => {
    const { venue, sameNameVenues } = await create('Olmaliq  arena', 'Boshqa joy, vokzal yonida');
    expect(venue.slug).toBe('olmaliq-arena-2');
    expect(sameNameVenues).toHaveLength(1);
  });

  it('DoD: nearby search orders by distance; venues without location go last (VC-2d)', async () => {
    const far = await create('Far Field', 'Shahar chekkasi, 10 km');
    const near = await create('Near Field', 'Markazga yaqin, 1 km');
    const noLoc = await create('NoLoc Field', 'Lokatsiyasiz, faqat orientir');
    for (const [v, km] of [
      [far.venue, 9],
      [near.venue, 1],
    ] as const) {
      await manage.edit(owner, v.id, { kind: 'location', value: at(km) });
    }
    for (const v of [far.venue, near.venue, noLoc.venue]) await approve(v.id);

    const out = await queries.search({ cityId: city.id, near: at(0), limit: 10 });
    expect(names(out)).toEqual(['Near Field', 'Far Field', 'NoLoc Field']);
    expect(out.hits[0]?.distanceMeters).toBeGreaterThan(900);
    expect(out.hits[0]?.distanceMeters).toBeLessThan(1100);
    expect(out.hits[2]?.distanceMeters).toBeNull();
  });

  it('VC-4a: text search by landmark words, apostrophes and cyrillic are normalized', async () => {
    const out = await queries.search({ cityId: city.id, query: '21 maktab', limit: 10 });
    expect(names(out)).toEqual([]); // Olmaliq Arena hali tasdiqlanmagan

    const [arena] = await queries.ownerVenues(owner.userId);
    await approve(arena?.id as string);
    expect(names(await queries.search({ cityId: city.id, query: '21maktab', limit: 10 }))).toEqual([
      'Olmaliq Arena',
    ]);
    expect(
      names(await queries.search({ cityId: city.id, query: 'ОЛМАЛИК АРЕНА', limit: 10 })),
    ).toEqual([]);
    expect(names(await queries.search({ cityId: city.id, query: 'olmal', limit: 10 }))).toEqual([
      'Olmaliq Arena',
    ]);
  });

  it('VC-4b: "bozor yonida" finds the landmark and venues near it even without the word in their text', async () => {
    const out = await queries.search({ cityId: city.id, query: 'bozor yonida', limit: 10 });
    expect(out.usedLandmark?.name.uz).toBe('Markaziy bozor');
    // bozor 2 km da: Near Field undan 1 km, Far Field 7 km (radius 2 km)
    expect(names(out)).toContain('Near Field');
    expect(names(out)).not.toContain('Far Field');
    expect(names(out)).not.toContain('NoLoc Field');
  });

  it('EC-O6: nothing found returns an empty list without throwing', async () => {
    const out = await queries.search({ cityId: city.id, query: 'zzzzqqq', limit: 10 });
    expect(out.hits).toEqual([]);
  });

  it('VC-2c: approved venues without location sort by completeness', async () => {
    const out = await queries.search({ cityId: city.id, limit: 10 });
    const scores = out.hits.map((h) => h.venue.completeness());
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });
});
