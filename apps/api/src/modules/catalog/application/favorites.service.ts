import { Injectable } from '@nestjs/common';
import { Clock } from '@polya/shared-kernel';
import { FAVORITES_LIMIT, FavoritesRepository } from '../domain/favorites.js';
import { VenueRepository } from '../domain/repositories.js';
import type { VenueId } from '../domain/venue.js';
import type { CatalogQueries, VenueListItem } from './catalog.queries.js';

@Injectable()
export class FavoritesService {
  constructor(
    private readonly favorites: FavoritesRepository,
    private readonly venues: VenueRepository,
    private readonly clock: Clock,
  ) {}

  /** @returns yangi holat: true — sevimlilarda */
  async toggle(userId: string, venueId: string): Promise<boolean> {
    if (await this.favorites.has(userId, venueId)) {
      await this.favorites.remove(userId, venueId);
      return false;
    }
    const venue = await this.venues.findById(venueId as VenueId);
    if (!venue?.isPublic) return false;
    await this.favorites.add(userId, venueId, this.clock.now());
    return true;
  }

  isFavorite(userId: string, venueId: string): Promise<boolean> {
    return this.favorites.has(userId, venueId);
  }

  /** Faqat hozir ham ochiq stadionlar (arxivlangan/bloklanganlar ro'yxatda chiqmaydi). */
  async list(userId: string, catalog: CatalogQueries): Promise<VenueListItem[]> {
    const ids = await this.favorites.venueIdsOf(userId, FAVORITES_LIMIT);
    const items = await catalog.venuesByIds(ids);
    const order = new Map(ids.map((id, i) => [id, i]));
    return items
      .filter((i) => i.venue.isPublic)
      .sort((a, b) => (order.get(a.venue.id) ?? 0) - (order.get(b.venue.id) ?? 0));
  }
}
