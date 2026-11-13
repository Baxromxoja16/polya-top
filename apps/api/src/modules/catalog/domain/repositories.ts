import { DomainError, type GeoPoint } from '@polya/shared-kernel';
import type { Pitch, PitchId } from './pitch.js';
import type { Venue, VenueId } from './venue.js';

export class VenueSlugTakenError extends DomainError {
  readonly code = 'VENUE_SLUG_TAKEN';
}

export interface VenueSearchCriteria {
  cityId: string;
  districtId?: string;
  /** Normallashtirilgan tokenlar — har biri nom/orientir so'zlarining prefiksiga mos kelishi kerak */
  tokens?: string[];
  near?: { point: GeoPoint; maxDistanceMeters: number };
  limit: number;
  offset?: number;
}

export interface VenueSearchHit {
  venue: Venue;
  /** `near` berilgan va stadion lokatsiyasi bo'lsa */
  distanceMeters: number | null;
}

export abstract class VenueRepository {
  abstract findById(id: VenueId): Promise<Venue | null>;
  abstract findBySlug(slug: string): Promise<Venue | null>;
  abstract slugExists(slug: string): Promise<boolean>;
  abstract listByOwner(ownerId: string): Promise<Venue[]>;
  /** TZ 3: xodim biriktirilgan stadionlar */
  abstract listByStaff(userId: string): Promise<Venue[]>;
  abstract listPendingReview(): Promise<Venue[]>;
  abstract findByIds(ids: readonly string[]): Promise<Venue[]>;
  /** MK-5: "Yangi polya" e'loni uchun — shu vaqtdan keyin tasdiqlangan ommaviy stadionlar */
  abstract listApprovedSince(since: Date): Promise<Venue[]>;
  /** Faqat APPROVED. Saralash: `near` bo'lsa — masofa (lokatsiyasizlar oxirida, VC-2d), aks holda to'liqlik. */
  abstract search(criteria: VenueSearchCriteria): Promise<VenueSearchHit[]>;
  /** TZ EC-B18: shu shaharda bir xil normallashtirilgan nomli stadionlar */
  abstract findSameName(cityId: string, name: string, excludeId?: VenueId): Promise<Venue[]>;
  abstract save(venue: Venue): Promise<void>;
  /** TZ AD-4 */
  abstract countByStatus(): Promise<Partial<Record<string, number>>>;
}

export abstract class PitchRepository {
  abstract findById(id: PitchId): Promise<Pitch | null>;
  abstract listByVenue(venueId: string): Promise<Pitch[]>;
  abstract listByVenues(venueIds: readonly string[]): Promise<Pitch[]>;
  abstract save(pitch: Pitch): Promise<void>;
}
