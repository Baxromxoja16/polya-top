import { Injectable } from '@nestjs/common';
import {
  Clock,
  type GeoPoint,
  IdGenerator,
  type LocalDate,
  type Money,
  PhoneNumber,
  zonedParts,
} from '@polya/shared-kernel';
import { type CityId, GeographyQueries } from '../../geography/index.js';
import {
  type DaySelector,
  type OpeningHours,
  type PitchScheduleDetails,
  type PricingRule,
  SchedulingFacade,
  type Weekday,
} from '../../scheduling/index.js';
import { Pitch, type PitchFormat, type PitchId, type Surface } from '../domain/pitch.js';
import { PitchRepository, VenueRepository } from '../domain/repositories.js';
import type { Amenity, Venue, VenueId } from '../domain/venue.js';
import {
  type Actor,
  assertCanManage,
  ForbiddenError,
  isAdminActor,
  NotFoundError,
} from './actor.js';

/** TZ VC-2e: FREE tarifda 5 ta rasm. Premium (4.9) FeatureGate orqali 15 tagacha oshiradi. */
export const FREE_PHOTO_LIMIT = 5;

export type VenueEdit =
  | { kind: 'name'; value: string }
  | { kind: 'landmark'; value: string }
  | { kind: 'location'; value: GeoPoint }
  | { kind: 'district'; value: string | null }
  | { kind: 'description'; value: string | null }
  | { kind: 'phones'; value: string[] }
  | { kind: 'amenity'; value: Amenity }
  | { kind: 'photo'; value: string }
  | { kind: 'clearPhotos' };

export type PitchEdit =
  | { kind: 'format'; value: PitchFormat }
  | { kind: 'surface'; value: Surface }
  | { kind: 'indoor'; value: boolean }
  | { kind: 'lighting'; value: boolean }
  | { kind: 'size'; value: string | null };

export interface EditOutcome {
  venue: Venue;
  /** TZ EC-O5: tasdiqlangan stadion nomi/orientiri o'zgardi — admin'ga xabar */
  notifyAdmins: boolean;
}

@Injectable()
export class VenueManagementService {
  constructor(
    private readonly venues: VenueRepository,
    private readonly pitches: PitchRepository,
    private readonly scheduling: SchedulingFacade,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly geography: GeographyQueries,
  ) {}

  // --- Admin ko'rigi (TZ VC-1, AD-1) ---

  async approve(actor: Actor, venueId: VenueId): Promise<Venue> {
    const venue = await this.loadForAdmin(actor, venueId);
    venue.approve(this.clock.now());
    await this.venues.save(venue);
    return venue;
  }

  async reject(actor: Actor, venueId: VenueId, reason: string | null): Promise<Venue> {
    const venue = await this.loadForAdmin(actor, venueId);
    venue.reject(reason, this.clock.now());
    await this.venues.save(venue);
    return venue;
  }

  // --- Owner tahrirlari (TZ VC-2b) ---

  async edit(actor: Actor, venueId: VenueId, change: VenueEdit): Promise<EditOutcome> {
    const venue = await this.load(actor, venueId);
    const now = this.clock.now();
    let notifyAdmins = false;
    switch (change.kind) {
      case 'name':
        venue.rename(change.value, now);
        notifyAdmins = venue.isPublic;
        break;
      case 'landmark':
        venue.setLandmark(change.value, now);
        notifyAdmins = venue.isPublic;
        break;
      case 'location':
        venue.setLocation(change.value, now);
        break;
      case 'district':
        venue.setDistrict(change.value, now);
        break;
      case 'description':
        venue.setDescription(change.value, now);
        break;
      case 'phones':
        venue.setPhones(
          change.value.map((p) => PhoneNumber.parse(p)),
          now,
        );
        break;
      case 'amenity':
        venue.toggleAmenity(change.value, now);
        break;
      case 'photo':
        venue.addPhoto(change.value, FREE_PHOTO_LIMIT, now);
        break;
      case 'clearPhotos':
        venue.clearPhotos(now);
        break;
    }
    await this.venues.save(venue);
    return { venue, notifyAdmins };
  }

  async setStatus(
    actor: Actor,
    venueId: VenueId,
    action: 'archive' | 'restore' | 'resubmit',
  ): Promise<Venue> {
    const venue = await this.load(actor, venueId);
    const now = this.clock.now();
    if (action === 'archive') venue.archive(now);
    else if (action === 'restore') venue.restore(now);
    else venue.resubmit(now);
    await this.venues.save(venue);
    return venue;
  }

  async editPitch(actor: Actor, pitchId: PitchId, change: PitchEdit): Promise<Pitch> {
    const { venue, pitch } = await this.loadPitch(actor, pitchId);
    const now = this.clock.now();
    switch (change.kind) {
      case 'format':
        pitch.setFormat(change.value, now);
        break;
      case 'surface':
        pitch.setSurface(change.value, now);
        break;
      case 'indoor':
        pitch.setIndoor(change.value, now);
        break;
      case 'lighting':
        pitch.setLighting(change.value, now);
        break;
      case 'size':
        pitch.setSize(change.value, now);
        break;
    }
    await this.pitches.save(pitch);
    await this.syncPitchDetails(venue);
    return pitch;
  }

  /** TZ VC-2a: qo'shimcha maydon. Ish vaqti va narx birinchi maydondan olinadi (keyin o'zgartiriladi). */
  async addPitch(actor: Actor, venueId: VenueId, name: string): Promise<Pitch> {
    const venue = await this.load(actor, venueId);
    const existing = await this.pitches.listByVenue(venue.id);
    const pitch = Pitch.create({
      id: this.ids.next() as PitchId,
      venueId: venue.id,
      name,
      now: this.clock.now(),
    });
    const template = existing[0]
      ? (await this.scheduling.getSetups([existing[0].id])).get(existing[0].id)
      : undefined;
    if (template?.uniformHours)
      await this.scheduling.setUniformHours(pitch.id, template.uniformHours);
    if (template?.basePricePerHour)
      await this.scheduling.setBasePrice(pitch.id, template.basePricePerHour);
    await this.pitches.save(pitch);
    return pitch;
  }

  async setPitchHours(actor: Actor, pitchId: PitchId, hours: OpeningHours): Promise<void> {
    await this.loadPitch(actor, pitchId);
    await this.scheduling.setUniformHours(pitchId, hours);
  }

  async setPitchPrice(actor: Actor, pitchId: PitchId, price: Money): Promise<void> {
    await this.loadPitch(actor, pitchId);
    await this.scheduling.setBasePrice(pitchId, price);
  }

  async scheduleDetails(actor: Actor, pitchId: PitchId): Promise<PitchScheduleDetails> {
    await this.loadPitch(actor, pitchId);
    return this.scheduling.details(pitchId);
  }

  /** TZ SP-1: hafta kuni bo'yicha (null — yopiq) */
  async setPitchDayHours(
    actor: Actor,
    pitchId: PitchId,
    day: Weekday,
    hours: OpeningHours | null,
  ): Promise<void> {
    await this.loadPitch(actor, pitchId);
    await this.scheduling.setDayHours(pitchId, day, hours);
  }

  /** TZ SP-2. Mavjud bandlovlar bilan to'qnashuv ogohlantirishi (EC-S2, EC-S3) — 4-bosqichda. */
  async setPitchException(
    actor: Actor,
    pitchId: PitchId,
    date: LocalDate,
    hours: OpeningHours | null,
  ): Promise<void> {
    const { venue } = await this.loadPitch(actor, pitchId);
    await this.scheduling.setException(pitchId, date, hours, await this.todayOf(venue));
  }

  async removePitchException(actor: Actor, pitchId: PitchId, date: LocalDate): Promise<void> {
    await this.loadPitch(actor, pitchId);
    await this.scheduling.removeException(pitchId, date);
  }

  /** TZ SP-4 */
  async addPriceRule(
    actor: Actor,
    pitchId: PitchId,
    rule: { days: DaySelector; fromHour: number; toHour: number; pricePerHour: Money },
  ): Promise<PricingRule> {
    await this.loadPitch(actor, pitchId);
    return this.scheduling.addPriceRule(pitchId, rule);
  }

  async removePriceRule(actor: Actor, pitchId: PitchId, ruleId: string): Promise<void> {
    await this.loadPitch(actor, pitchId);
    await this.scheduling.removePriceRule(pitchId, ruleId);
  }

  /** Stadion shahri vaqt zonasidagi bugungi sana */
  async todayOf(venue: Venue): Promise<LocalDate> {
    const city = await this.geography.getCity(venue.cityId as CityId);
    return zonedParts(this.clock.now(), city?.timezone ?? 'Asia/Tashkent').date;
  }

  private async syncPitchDetails(venue: Venue): Promise<void> {
    const pitches = await this.pitches.listByVenue(venue.id);
    venue.syncPitchDetails(
      pitches.some((p) => p.hasDetails),
      this.clock.now(),
    );
    await this.venues.save(venue);
  }

  private async load(actor: Actor, venueId: VenueId): Promise<Venue> {
    const venue = await this.venues.findById(venueId);
    if (!venue) throw new NotFoundError('Venue not found', { venueId });
    assertCanManage(actor, venue.ownerId);
    return venue;
  }

  private async loadForAdmin(actor: Actor, venueId: VenueId): Promise<Venue> {
    if (!isAdminActor(actor)) throw new ForbiddenError('Admin only');
    const venue = await this.venues.findById(venueId);
    if (!venue) throw new NotFoundError('Venue not found', { venueId });
    return venue;
  }

  private async loadPitch(actor: Actor, pitchId: PitchId): Promise<{ venue: Venue; pitch: Pitch }> {
    const pitch = await this.pitches.findById(pitchId);
    if (!pitch) throw new NotFoundError('Pitch not found', { pitchId });
    const venue = await this.load(actor, pitch.venueId as VenueId);
    return { venue, pitch };
  }
}
