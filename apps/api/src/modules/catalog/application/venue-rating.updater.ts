import { Injectable } from '@nestjs/common';
import { Clock, ConcurrencyConflictError } from '@polya/shared-kernel';
import { VenueRepository } from '../domain/repositories.js';
import type { VenueId } from '../domain/venue.js';

/** TZ RV-7: Reviews konteksti sharhlar o'zgarganda stadion reytingini shu orqali yangilaydi. */
@Injectable()
export class VenueRatingUpdater {
  constructor(
    private readonly venues: VenueRepository,
    private readonly clock: Clock,
  ) {}

  async update(venueId: string, avg: number, count: number): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const venue = await this.venues.findById(venueId as VenueId);
      if (!venue) return;
      venue.setRating(avg, count, this.clock.now());
      try {
        await this.venues.save(venue);
        return;
      } catch (error) {
        if (!(error instanceof ConcurrencyConflictError)) throw error;
      }
    }
  }
}
