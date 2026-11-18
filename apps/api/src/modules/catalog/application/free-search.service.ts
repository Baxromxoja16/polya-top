import { Injectable } from '@nestjs/common';
import { addDays, Clock, type LocalDate, zonedParts } from '@polya/shared-kernel';
import { type CityId, GeographyQueries } from '../../geography/index.js';
import { AvailabilityService, type Quote, type SlotView } from '../../scheduling/index.js';
import type { Pitch } from '../domain/pitch.js';
import { PitchRepository, VenueRepository } from '../domain/repositories.js';
import type { Venue, VenueId } from '../domain/venue.js';

export interface FreePitch {
  venue: Venue;
  pitch: Pitch;
  quote: Quote;
}

export interface SoonFree {
  venue: Venue;
  pitch: Pitch;
  slot: SlotView;
}

const DEFAULT_TZ = 'Asia/Tashkent';
const MAX_VENUES = 200;

/**
 * TZ 5.2, VC-5b, VC-6: vaqt bo'yicha bo'sh maydonlarni topish (Catalog + Scheduling birlashmasi).
 * Faqat APPROVED stadionlarning ACTIVE maydonlari.
 */
@Injectable()
export class FreeSearchService {
  constructor(
    private readonly venues: VenueRepository,
    private readonly pitches: PitchRepository,
    private readonly availability: AvailabilityService,
    private readonly geography: GeographyQueries,
    private readonly clock: Clock,
  ) {}

  async timezoneOf(cityId: string): Promise<string> {
    return (await this.geography.getCity(cityId as CityId))?.timezone ?? DEFAULT_TZ;
  }

  async today(cityId: string): Promise<LocalDate> {
    return zonedParts(this.clock.now(), await this.timezoneOf(cityId)).date;
  }

  async bookableDates(cityId: string): Promise<LocalDate[]> {
    return this.availability.bookableDates(await this.timezoneOf(cityId));
  }

  /** "Ertaga 20:00 da 1 soat bo'sh" — narx bo'yicha arzonidan. */
  async freeAt(cityId: string, start: Date, hours: number): Promise<FreePitch[]> {
    const tz = await this.timezoneOf(cityId);
    const pairs = await this.cityPitches(cityId);
    const quotes = await this.availability.findFree({
      pitchIds: pairs.map((p) => p.pitch.id),
      start,
      hours,
      timeZoneOf: () => tz,
    });
    return pairs
      .flatMap((p) => {
        const quote = quotes.get(p.pitch.id);
        return quote ? [{ ...p, quote }] : [];
      })
      .sort(
        (a, b) =>
          a.quote.total.compareTo(b.quote.total) || b.venue.completeness() - a.venue.completeness(),
      );
  }

  /** TZ VC-5b: keyingi `withinHours` soat ichida boshlanadigan eng yaqin bo'sh slot (har maydon uchun bittadan). */
  async freeSoon(cityId: string, withinHours = 3): Promise<SoonFree[]> {
    const tz = await this.timezoneOf(cityId);
    const now = this.clock.now();
    const until = now.getTime() + withinHours * 3_600_000;
    const today = zonedParts(now, tz).date;
    const pairs = await this.cityPitches(cityId);
    const results: SoonFree[] = [];
    await Promise.all(
      pairs.map(async ({ venue, pitch }) => {
        // Tungi slotlar oldingi biznes kunida bo'lishi mumkin (EC-S1); kechqurun 3 soatlik oyna
        // yarim tundan o'tadi — ertangi kunning birinchi slotlari ham hisobga olinadi
        const days = await Promise.all(
          [addDays(today, -1), today, addDays(today, 1)].map((d) =>
            this.availability.dayView(pitch.id, d, tz),
          ),
        );
        const slot = days
          .flat()
          .filter(
            (s) => (s.status === 'FREE' || s.status === 'REQUESTED') && s.start.getTime() <= until,
          )
          .sort((a, b) => a.start.getTime() - b.start.getTime())[0];
        if (slot) results.push({ venue, pitch, slot });
      }),
    );
    return results.sort((a, b) => a.slot.start.getTime() - b.slot.start.getTime());
  }

  async dayGrid(pitchId: string, date: LocalDate): Promise<SlotView[]> {
    const pitch = await this.pitches.findById(pitchId as Pitch['id']);
    const venue = pitch ? await this.venues.findById(pitch.venueId as VenueId) : null;
    if (!pitch || !venue?.isPublic || !pitch.isBookable) return [];
    return this.availability.dayView(pitchId, date, await this.timezoneOf(venue.cityId));
  }

  private async cityPitches(cityId: string): Promise<{ venue: Venue; pitch: Pitch }[]> {
    // EC-C2: nofaol shaharda qidiruv to'xtatiladi
    if (!(await this.geography.getCity(cityId as CityId))?.isActive) return [];
    const hits = await this.venues.search({ cityId, limit: MAX_VENUES });
    const venues = hits.map((h) => h.venue);
    const pitches = await this.pitches.listByVenues(venues.map((v) => v.id));
    return pitches
      .filter((p) => p.isBookable)
      .flatMap((pitch) => {
        const venue = venues.find((v) => v.id === pitch.venueId);
        return venue ? [{ venue, pitch }] : [];
      });
  }
}
