import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import {
  type GeoPointDto,
  type MoneyDto,
  type VenueCardDto,
  type VenueListItemDto,
  type VenueSearchQuery,
  type VenueSearchResponse,
  venueSearchQuerySchema,
} from '@polya/contracts';
import { GeoPoint, type Money } from '@polya/shared-kernel';
import { decodeOffsetCursor, nextOffsetCursor } from '../../../../platform/http/cursor.js';
import { ZodValidationPipe } from '../../../../platform/http/zod-validation.pipe.js';
import type { LandmarkView } from '../../../geography/index.js';
import { CatalogQueries, type VenueListItem } from '../../application/catalog.queries.js';

/**
 * TZ VC-4, 7.7: o'yinchi uchun ochiq katalog (auth'siz — bot ham /start'gacha qidirishga ruxsat beradi).
 * Faqat APPROVED stadionlar; Owner telefonlari bu yerda yo'q (kontakt — bandlovdan keyin, BK-3).
 */
@Controller('venues')
export class VenuesController {
  constructor(private readonly catalog: CatalogQueries) {}

  @Get()
  async search(
    @Query(new ZodValidationPipe(venueSearchQuerySchema)) query: VenueSearchQuery,
  ): Promise<VenueSearchResponse> {
    const offset = decodeOffsetCursor(query.cursor);
    const out = await this.catalog.search({
      cityId: query.cityId,
      limit: query.limit,
      offset,
      ...(query.q ? { query: query.q } : {}),
      ...(query.districtId ? { districtId: query.districtId } : {}),
      ...(query.landmarkId ? { landmarkId: query.landmarkId } : {}),
      ...(query.lat !== undefined && query.lng !== undefined
        ? { near: GeoPoint.of(query.lat, query.lng) }
        : {}),
    });
    return {
      items: out.hits.map(toListItem),
      nextCursor: nextOffsetCursor(offset, query.limit, out.hits.length),
      landmarkChoices: out.landmarkChoices.map(toLandmarkRef),
      usedLandmark: out.usedLandmark ? toLandmarkRef(out.usedLandmark) : null,
    };
  }

  @Get(':idOrSlug')
  async card(@Param('idOrSlug') idOrSlug: string): Promise<VenueCardDto> {
    const card = /^[\w-]{1,100}$/.test(idOrSlug) ? await this.catalog.venueCard(idOrSlug) : null;
    // Tasdiqlanmagan/bloklangan stadion "yo'q" — mavjudligini ham oshkor qilmaymiz
    if (!card?.venue.isPublic) {
      throw new NotFoundException({ code: 'VENUE_NOT_FOUND', message: 'Venue not found' });
    }
    const { venue } = card;
    return {
      id: venue.id,
      slug: venue.slug,
      name: venue.name,
      cityId: venue.cityId,
      landmarkText: venue.landmarkText,
      districtName: card.districtName,
      description: venue.description,
      location: toGeo(venue.location),
      amenities: [...venue.amenities],
      photoCount: venue.photos.length,
      rating: { ...venue.rating },
      minPricePerHour: toMoney(card.minPricePerHour),
      pitches: card.pitches.map((p) => ({
        id: p.id,
        name: p.name,
        format: p.format,
        surface: p.surface,
        indoor: p.indoor,
        lighting: p.lighting,
        size: p.size,
        bookable: p.status === 'ACTIVE',
        basePricePerHour: toMoney(p.setup?.basePricePerHour ?? null),
      })),
    };
  }
}

function toListItem(hit: VenueListItem): VenueListItemDto {
  const { venue } = hit;
  return {
    id: venue.id,
    slug: venue.slug,
    name: venue.name,
    landmarkText: venue.landmarkText,
    districtId: venue.districtId,
    location: toGeo(venue.location),
    rating: { ...venue.rating },
    minPricePerHour: toMoney(hit.minPricePerHour),
    distanceMeters: hit.distanceMeters === null ? null : Math.round(hit.distanceMeters),
    recommended: hit.recommended === true,
  };
}

const toLandmarkRef = (l: LandmarkView) => ({ id: l.id, name: { uz: l.name.uz, ru: l.name.ru } });

const toGeo = (p: GeoPoint | null): GeoPointDto | null => (p ? { lat: p.lat, lng: p.lng } : null);

const toMoney = (m: Money | null): MoneyDto | null =>
  m ? { amount: m.amount, currency: 'UZS' } : null;
