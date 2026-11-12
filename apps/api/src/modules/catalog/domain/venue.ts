import {
  AggregateRoot,
  type Brand,
  createDomainEvent,
  DomainError,
  type GeoPoint,
  type PhoneNumber,
} from '@polya/shared-kernel';

export type VenueId = Brand<string, 'VenueId'>;

/**
 * PENDING_REVIEW → APPROVED (qidiruvda ko'rinadi) yoki REJECTED.
 * APPROVED → ARCHIVED (egasi) / BLOCKED (admin). REJECTED tahrirlangach qayta yuboriladi.
 */
export type VenueStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'ARCHIVED' | 'BLOCKED';

export const AMENITIES = ['PARKING', 'SHOWER', 'LOCKER_ROOM', 'CAFE', 'STANDS', 'WIFI'] as const;
export type Amenity = (typeof AMENITIES)[number];

export class InvalidVenueError extends DomainError {
  readonly code = 'INVALID_VENUE';
}
export class VenueStatusError extends DomainError {
  readonly code = 'VENUE_STATUS_TRANSITION';
}

export const VenueEvents = {
  Submitted: 'catalog.venue.submitted',
  Approved: 'catalog.venue.approved',
  Rejected: 'catalog.venue.rejected',
} as const;

export interface VenueProps {
  ownerId: string;
  slug: string;
  name: string;
  /** Orientir — majburiy, lokatsiya o'rnini bosadi (TZ VC-2) */
  landmarkText: string;
  cityId: string;
  districtId: string | null;
  location: GeoPoint | null;
  description: string | null;
  phones: PhoneNumber[];
  amenities: Amenity[];
  /** Telegram file_id'lar */
  photos: string[];
  status: VenueStatus;
  rejectReason: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const LIMITS = {
  nameMin: 2,
  nameMax: 60,
  landmarkMin: 5,
  landmarkMax: 200,
  descriptionMax: 1000,
  phonesMax: 3,
  /** Mutlaq chegara; tarif bo'yicha chegara (FREE 5 / PREMIUM 15) application qatlamida (TZ VC-2e) */
  photosMax: 15,
} as const;

const len = (s: string) => [...s].length;

export class Venue extends AggregateRoot<VenueId> {
  #p: VenueProps;

  private constructor(id: VenueId, props: VenueProps, version: number) {
    super(id, version);
    this.#p = props;
  }

  /** Onboarding yakuni (TZ VC-2): darhol admin ko'rigiga yuboriladi. */
  static register(params: {
    id: VenueId;
    ownerId: string;
    slug: string;
    name: string;
    landmarkText: string;
    cityId: string;
    ownerPhone: PhoneNumber;
    now: Date;
  }): Venue {
    const venue = new Venue(
      params.id,
      {
        ownerId: params.ownerId,
        slug: params.slug,
        name: validName(params.name),
        landmarkText: validLandmark(params.landmarkText),
        cityId: params.cityId,
        districtId: null,
        location: null,
        description: null,
        phones: [params.ownerPhone],
        amenities: [],
        photos: [],
        status: 'PENDING_REVIEW',
        rejectReason: null,
        approvedAt: null,
        createdAt: params.now,
        updatedAt: params.now,
      },
      0,
    );
    venue.raiseEvent(VenueEvents.Submitted, params.now);
    return venue;
  }

  static reconstitute(id: VenueId, props: VenueProps, version: number): Venue {
    return new Venue(
      id,
      {
        ...props,
        phones: [...props.phones],
        amenities: [...props.amenities],
        photos: [...props.photos],
      },
      version,
    );
  }

  get ownerId(): string {
    return this.#p.ownerId;
  }
  get slug(): string {
    return this.#p.slug;
  }
  get name(): string {
    return this.#p.name;
  }
  get landmarkText(): string {
    return this.#p.landmarkText;
  }
  get cityId(): string {
    return this.#p.cityId;
  }
  get districtId(): string | null {
    return this.#p.districtId;
  }
  get location(): GeoPoint | null {
    return this.#p.location;
  }
  get description(): string | null {
    return this.#p.description;
  }
  get phones(): readonly PhoneNumber[] {
    return this.#p.phones;
  }
  get amenities(): readonly Amenity[] {
    return this.#p.amenities;
  }
  get photos(): readonly string[] {
    return this.#p.photos;
  }
  get status(): VenueStatus {
    return this.#p.status;
  }
  get rejectReason(): string | null {
    return this.#p.rejectReason;
  }
  get approvedAt(): Date | null {
    return this.#p.approvedAt;
  }
  get createdAt(): Date {
    return this.#p.createdAt;
  }
  get updatedAt(): Date {
    return this.#p.updatedAt;
  }

  /** TZ VC-1: faqat tasdiqlangan stadion qidiruvda va katalogda ko'rinadi. */
  get isPublic(): boolean {
    return this.#p.status === 'APPROVED';
  }

  /**
   * TZ VC-2c: majburiy 4 maydon (nom, orientir, ish vaqti, narx) — 30%;
   * rasm +20, lokatsiya +20, qulayliklar +10, maydon tafsilotlari +10, tavsif +10.
   */
  completeness(hasPitchDetails: boolean): number {
    return (
      30 +
      (this.#p.photos.length > 0 ? 20 : 0) +
      (this.#p.location ? 20 : 0) +
      (this.#p.amenities.length > 0 ? 10 : 0) +
      (hasPitchDetails ? 10 : 0) +
      (this.#p.description ? 10 : 0)
    );
  }

  approve(now: Date): void {
    this.transition(['PENDING_REVIEW'], 'APPROVED', now);
    this.#p.approvedAt = now;
    this.#p.rejectReason = null;
    this.raiseEvent(VenueEvents.Approved, now);
  }

  reject(reason: string | null, now: Date): void {
    this.transition(['PENDING_REVIEW'], 'REJECTED', now);
    this.#p.rejectReason = reason?.trim() || null;
    this.raiseEvent(VenueEvents.Rejected, now);
  }

  /** Rad etilgan stadion tuzatilgach qayta yuboriladi. */
  resubmit(now: Date): void {
    this.transition(['REJECTED'], 'PENDING_REVIEW', now);
    this.raiseEvent(VenueEvents.Submitted, now);
  }

  archive(now: Date): void {
    this.transition(['APPROVED', 'PENDING_REVIEW', 'REJECTED'], 'ARCHIVED', now);
  }

  /** Arxivdan qaytarish: ilgari tasdiqlangan bo'lsa — darhol APPROVED, aks holda qayta ko'rik. */
  restore(now: Date): void {
    this.transition(['ARCHIVED'], this.#p.approvedAt ? 'APPROVED' : 'PENDING_REVIEW', now);
  }

  block(now: Date): void {
    this.transition(['APPROVED', 'PENDING_REVIEW', 'REJECTED', 'ARCHIVED'], 'BLOCKED', now);
  }

  rename(name: string, now: Date): void {
    this.#p.name = validName(name);
    this.touch(now);
  }

  setLandmark(text: string, now: Date): void {
    this.#p.landmarkText = validLandmark(text);
    this.touch(now);
  }

  setLocation(location: GeoPoint, now: Date): void {
    this.#p.location = location;
    this.touch(now);
  }

  setDistrict(districtId: string | null, now: Date): void {
    this.#p.districtId = districtId;
    this.touch(now);
  }

  setDescription(text: string | null, now: Date): void {
    const value = text?.trim() || null;
    if (value && len(value) > LIMITS.descriptionMax) {
      throw new InvalidVenueError('Description is too long', { max: LIMITS.descriptionMax });
    }
    this.#p.description = value;
    this.touch(now);
  }

  setPhones(phones: PhoneNumber[], now: Date): void {
    const unique = phones.filter((p, i) => phones.findIndex((q) => q.equals(p)) === i);
    if (unique.length === 0 || unique.length > LIMITS.phonesMax) {
      throw new InvalidVenueError('Venue needs 1..3 contact phones', { max: LIMITS.phonesMax });
    }
    this.#p.phones = unique;
    this.touch(now);
  }

  toggleAmenity(amenity: Amenity, now: Date): void {
    this.#p.amenities = this.#p.amenities.includes(amenity)
      ? this.#p.amenities.filter((a) => a !== amenity)
      : [...this.#p.amenities, amenity];
    this.touch(now);
  }

  addPhoto(fileId: string, limit: number, now: Date): void {
    const cap = Math.min(limit, LIMITS.photosMax);
    if (this.#p.photos.length >= cap) {
      throw new InvalidVenueError('Photo limit reached', { limit: cap });
    }
    if (!this.#p.photos.includes(fileId)) this.#p.photos = [...this.#p.photos, fileId];
    this.touch(now);
  }

  clearPhotos(now: Date): void {
    this.#p.photos = [];
    this.touch(now);
  }

  private transition(from: VenueStatus[], to: VenueStatus, now: Date): void {
    if (!from.includes(this.#p.status)) {
      throw new VenueStatusError('Illegal venue status transition', { from: this.#p.status, to });
    }
    this.#p.status = to;
    this.touch(now);
  }

  private raiseEvent(type: string, now: Date): void {
    this.raise(
      createDomainEvent({
        type,
        aggregateId: this.id,
        occurredAt: now,
        payload: { ownerId: this.#p.ownerId, cityId: this.#p.cityId },
      }),
    );
  }

  private touch(now: Date): void {
    this.#p.updatedAt = now;
  }
}

function validName(name: string): string {
  const value = name.trim().replace(/\s+/g, ' ');
  if (len(value) < LIMITS.nameMin || len(value) > LIMITS.nameMax) {
    throw new InvalidVenueError('Venue name length is out of range', {
      min: LIMITS.nameMin,
      max: LIMITS.nameMax,
    });
  }
  return value;
}

/** TZ EC-O4: orientir kamida 5 belgi */
function validLandmark(text: string): string {
  const value = text.trim().replace(/\s+/g, ' ');
  if (len(value) < LIMITS.landmarkMin || len(value) > LIMITS.landmarkMax) {
    throw new InvalidVenueError('Landmark length is out of range', {
      min: LIMITS.landmarkMin,
      max: LIMITS.landmarkMax,
    });
  }
  return value;
}
