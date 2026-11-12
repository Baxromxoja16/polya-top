import { Injectable, Logger } from '@nestjs/common';
import { type GeoPoint, type Money, searchTokens } from '@polya/shared-kernel';
import { type CityId, GeographyQueries, type LandmarkView } from '../../geography/index.js';
import { type PitchSetupView, SchedulingFacade } from '../../scheduling/index.js';
import { FeatureGate } from '../../subscription/index.js';
import type { Pitch } from '../domain/pitch.js';
import { PitchRepository, VenueRepository } from '../domain/repositories.js';
import type { Venue, VenueId } from '../domain/venue.js';
import type { PitchContext } from './pitch-context.js';

export interface PitchCardView {
  id: string;
  name: string;
  format: Pitch['format'];
  surface: Pitch['surface'];
  indoor: boolean | null;
  lighting: boolean | null;
  size: string | null;
  status: Pitch['status'];
  setup: PitchSetupView | undefined;
}

export interface VenueCardView {
  venue: Venue;
  districtName: { uz: string; ru: string } | null;
  pitches: PitchCardView[];
  minPricePerHour: Money | null;
}

export interface VenueListItem {
  venue: Venue;
  distanceMeters: number | null;
  minPricePerHour: Money | null;
  /** VC-5a: PREMIUM stadion — "⭐ Tavsiya etiladi" (sahifada ko'pi bilan 2 ta, yuqorida) */
  recommended?: boolean;
}

/** TZ VC-5a / 4.9 */
export const RECOMMENDED_PER_PAGE = 2;

export interface SearchInput {
  cityId: string;
  query?: string;
  near?: GeoPoint;
  districtId?: string;
  /** Foydalanuvchi bir nechta mos orientirdan birini tanlagan (EC-O7) */
  landmarkId?: string;
  limit: number;
  offset?: number;
}

export interface SearchOutput {
  hits: VenueListItem[];
  /** Matn bir nechta orientirga mos keldi — foydalanuvchiga tanlash taklif qilinadi (EC-O7) */
  landmarkChoices: LandmarkView[];
  usedLandmark: LandmarkView | null;
}

/** "yonida", "orqasida" kabi joylashuv so'zlari qidiruvga xalaqit bermasligi uchun tashlanadi */
const STOPWORDS = new Set([
  'yonida',
  'yaqinida',
  'orqasida',
  'oldida',
  'roparasida',
  'qarshisida',
  'tomonida',
  'atrofida',
  'ichida',
  'yoni',
  'yaqin',
  'ryadom',
  'vozle',
  'okolo',
  'za',
  'u',
  'naprotiv',
  'near',
  'stadion',
  'polya',
  'maydon',
  'pole',
]);

const LANDMARK_RADIUS_M = 2_000;
const NEARBY_RADIUS_M = 15_000;

@Injectable()
export class CatalogQueries {
  readonly #logger = new Logger(CatalogQueries.name);

  constructor(
    private readonly venues: VenueRepository,
    private readonly pitches: PitchRepository,
    private readonly scheduling: SchedulingFacade,
    private readonly geography: GeographyQueries,
    private readonly features: FeatureGate,
  ) {}

  async venueCard(idOrSlug: string): Promise<VenueCardView | null> {
    const venue = /^[0-9a-f]{24}$/.test(idOrSlug)
      ? await this.venues.findById(idOrSlug as VenueId)
      : await this.venues.findBySlug(idOrSlug);
    if (!venue) return null;
    const [pitches, city] = await Promise.all([
      this.pitches.listByVenue(venue.id),
      this.geography.getCity(venue.cityId as CityId),
    ]);
    const setups = await this.scheduling.getSetups(pitches.map((p) => p.id));
    const district = venue.districtId
      ? city?.districts.find((d) => d.id === venue.districtId)
      : undefined;
    const pitchViews = pitches
      .filter((p) => p.status !== 'ARCHIVED')
      .map((p) => ({
        id: p.id,
        name: p.name,
        format: p.format,
        surface: p.surface,
        indoor: p.indoor,
        lighting: p.lighting,
        size: p.size,
        status: p.status,
        setup: setups.get(p.id),
      }));
    return {
      venue,
      districtName: district ? { ...district.name } : null,
      pitches: pitchViews,
      minPricePerHour: minPrice(pitchViews.map((p) => p.setup)),
    };
  }

  async venueIdOfPitch(pitchId: string): Promise<string | null> {
    return (await this.pitches.findById(pitchId as Pitch['id']))?.venueId ?? null;
  }

  async timeZoneOf(cityId: string): Promise<string> {
    return (await this.geography.getCity(cityId as CityId))?.timezone ?? 'Asia/Tashkent';
  }

  /** Booking uchun: maydon + stadion + vaqt zonasi */
  async pitchContext(pitchId: string): Promise<PitchContext | null> {
    const pitch = await this.pitches.findById(pitchId as Pitch['id']);
    const venue = pitch ? await this.venues.findById(pitch.venueId as VenueId) : null;
    if (!pitch || !venue) return null;
    const city = await this.geography.getCity(venue.cityId as CityId);
    return {
      pitchId: pitch.id,
      pitchName: pitch.name,
      isBookable: pitch.isBookable,
      venue: {
        id: venue.id,
        name: venue.name,
        ownerId: venue.ownerId,
        isPublic: venue.isPublic,
        phones: venue.phones,
        landmarkText: venue.landmarkText,
        location: venue.location,
        cityId: venue.cityId,
      },
      timeZone: city?.timezone ?? 'Asia/Tashkent',
    };
  }

  async pitchContexts(pitchIds: readonly string[]): Promise<Map<string, PitchContext>> {
    const result = new Map<string, PitchContext>();
    for (const id of new Set(pitchIds)) {
      const ctx = await this.pitchContext(id);
      if (ctx) result.set(id, ctx);
    }
    return result;
  }

  async ownerVenues(ownerId: string): Promise<Venue[]> {
    return this.venues.listByOwner(ownerId);
  }

  async pendingReview(): Promise<Venue[]> {
    return this.venues.listPendingReview();
  }

  async venuesByIds(ids: readonly string[]): Promise<VenueListItem[]> {
    return this.withPrices(
      (await this.venues.findByIds(ids)).map((venue) => ({ venue, distanceMeters: null })),
    );
  }

  /** TZ VC-4: matn, orientir, hudud, yaqinlik. Faqat APPROVED (VC-1). */
  async search(input: SearchInput): Promise<SearchOutput> {
    const tokens = searchTokens(input.query ?? '').filter((t) => !STOPWORDS.has(t));
    let landmarkChoices: LandmarkView[] = [];
    let usedLandmark: LandmarkView | null = null;

    if (input.landmarkId || tokens.length > 0) {
      const landmarks = await this.geography.listLandmarks(input.cityId as CityId, {
        activeOnly: true,
      });
      const matched = input.landmarkId
        ? landmarks.filter((l) => l.id === input.landmarkId)
        : matchLandmarks(tokens.join(' '), landmarks);
      if (matched.length === 1) usedLandmark = matched[0] ?? null;
      else if (matched.length > 1) landmarkChoices = matched;
    }

    const limit = input.limit;
    const offset = input.offset ?? 0;
    const base = {
      cityId: input.cityId,
      ...(input.districtId ? { districtId: input.districtId } : {}),
    };

    const near = usedLandmark?.location ?? input.near;
    const nearHits = near
      ? await this.venues.search({
          ...base,
          near: {
            point: near,
            maxDistanceMeters: usedLandmark ? LANDMARK_RADIUS_M : NEARBY_RADIUS_M,
          },
          // Orientir ishlatilganda matn faqat orientirni topish uchun edi — stadion nomiga qo'llanmaydi
          ...(usedLandmark || tokens.length === 0 ? {} : { tokens }),
          limit: offset + limit,
        })
      : [];
    const textHits =
      tokens.length > 0
        ? await this.venues.search({ ...base, tokens, limit: offset + limit })
        : near
          ? []
          : await this.venues.search({ ...base, limit: offset + limit });

    const located = nearHits.filter((h) => h.distanceMeters !== null);
    // EC-O8: orientir rejimida lokatsiyasiz stadionlar faqat matn bo'yicha mos kelsa chiqadi
    const unlocated = usedLandmark ? [] : nearHits.filter((h) => h.distanceMeters === null);
    const seen = new Set<string>();
    const merged = [...located, ...textHits, ...unlocated].filter((h) => {
      if (seen.has(h.venue.id)) return false;
      seen.add(h.venue.id);
      return true;
    });
    const hits = await this.recommendFirst(
      await this.withPrices(merged.slice(offset, offset + limit)),
    );

    if (hits.length === 0 && input.query) {
      // TZ EC-O6: topilmagan so'rovlar — sinonimlar lug'atini to'ldirish uchun
      this.#logger.log({ query: input.query, cityId: input.cityId }, 'search.miss');
    }
    return { hits, landmarkChoices, usedLandmark };
  }

  /**
   * VC-5a: sahifadagi (mos keladigan!) PREMIUM stadionlardan ko'pi bilan 2 tasi belgisi bilan yuqoriga chiqadi.
   * Mos kelmaydigan premium stadion qidiruvga "qo'shilmaydi" — reklama natijani buzmaydi.
   */
  private async recommendFirst(items: VenueListItem[]): Promise<VenueListItem[]> {
    const premium = await this.features.premiumAmong(items.map((i) => i.venue.id));
    const top = items.filter((i) => premium.has(i.venue.id)).slice(0, RECOMMENDED_PER_PAGE);
    const rest = items.filter((i) => !top.includes(i));
    return [...top.map((i) => ({ ...i, recommended: true })), ...rest];
  }

  private async withPrices(
    items: { venue: Venue; distanceMeters: number | null }[],
  ): Promise<VenueListItem[]> {
    const pitches = await this.pitches.listByVenues(items.map((i) => i.venue.id));
    const setups = await this.scheduling.getSetups(pitches.map((p) => p.id));
    return items.map((item) => ({
      ...item,
      minPricePerHour: minPrice(
        pitches
          .filter((p) => p.venueId === item.venue.id && p.isBookable)
          .map((p) => setups.get(p.id)),
      ),
    }));
  }
}

function matchLandmarks(query: string, landmarks: LandmarkView[]): LandmarkView[] {
  if (query.length < 3) return [];
  return landmarks.filter((l) =>
    l.searchTerms.some((term) => term === query || term.includes(query) || query.includes(term)),
  );
}

function minPrice(setups: (PitchSetupView | undefined)[]): Money | null {
  let min: Money | null = null;
  for (const s of setups) {
    const price = s?.basePricePerHour;
    if (price && (!min || price.compareTo(min) < 0)) min = price;
  }
  return min;
}
