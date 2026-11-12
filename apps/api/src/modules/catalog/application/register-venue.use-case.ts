import { Injectable } from '@nestjs/common';
import {
  Clock,
  err,
  IdGenerator,
  type Money,
  ok,
  PhoneNumber,
  type Result,
  slugify,
} from '@polya/shared-kernel';
import { type OpeningHours, SchedulingFacade } from '../../scheduling/index.js';
import { Pitch, type PitchId } from '../domain/pitch.js';
import { PitchRepository, VenueRepository } from '../domain/repositories.js';
import { Venue, type VenueId } from '../domain/venue.js';
import type { Actor } from './actor.js';

export const DEFAULT_PITCH_NAME = '1-maydon';

export interface RegisterVenueInput {
  actor: Actor;
  name: string;
  landmarkText: string;
  hours: OpeningHours;
  pricePerHour: Money;
}

export interface RegisterVenueOutput {
  venue: Venue;
  pitch: Pitch;
  /** TZ EC-B18: shu shaharda nomi bir xil stadionlar — admin'ga ogohlantirish */
  sameNameVenues: Venue[];
}

export type RegisterVenueError = 'NOT_OWNER' | 'PHONE_REQUIRED' | 'CITY_REQUIRED';

/**
 * TZ VC-2, VC-2a: sodda onboarding — nom, orientir, ish vaqti, narx. "1-maydon" avtomatik.
 * Stadion darhol admin ko'rigiga tushadi (PENDING_REVIEW).
 */
@Injectable()
export class RegisterVenueUseCase {
  constructor(
    private readonly venues: VenueRepository,
    private readonly pitches: PitchRepository,
    private readonly scheduling: SchedulingFacade,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(
    input: RegisterVenueInput,
  ): Promise<Result<RegisterVenueOutput, RegisterVenueError>> {
    const { actor } = input;
    if (!actor.roles.includes('OWNER')) return err('NOT_OWNER');
    if (!actor.phone) return err('PHONE_REQUIRED');
    if (!actor.cityId) return err('CITY_REQUIRED');

    const now = this.clock.now();
    const venueId = this.ids.next() as VenueId;
    const venue = Venue.register({
      id: venueId,
      ownerId: actor.userId,
      slug: await this.uniqueSlug(input.name, venueId),
      name: input.name,
      landmarkText: input.landmarkText,
      cityId: actor.cityId,
      ownerPhone: PhoneNumber.parse(actor.phone),
      now,
    });
    const pitch = Pitch.create({
      id: this.ids.next() as PitchId,
      venueId,
      name: DEFAULT_PITCH_NAME,
      now,
    });

    // Jadval va narx avval: ular xato bersa (masalan, narx chegaradan tashqari), stadion yaratilmaydi
    await this.scheduling.setUniformHours(pitch.id, input.hours);
    await this.scheduling.setBasePrice(pitch.id, input.pricePerHour);
    await this.pitches.save(pitch);
    await this.venues.save(venue);
    const sameNameVenues = await this.venues.findSameName(venue.cityId, venue.name, venueId);
    return ok({ venue, pitch, sameNameVenues });
  }

  private async uniqueSlug(name: string, venueId: string): Promise<string> {
    const base = slugify(name) || `stadion-${venueId.slice(-6)}`;
    for (let i = 1; i <= 20; i++) {
      const candidate = i === 1 ? base : `${base}-${i}`;
      if (!(await this.venues.slugExists(candidate))) return candidate;
    }
    return `${base}-${venueId.slice(-6)}`;
  }
}
