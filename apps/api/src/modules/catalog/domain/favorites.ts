/**
 * Sevimli stadionlar (TZ VC-8). Oddiy bog'lanish (userId ↔ venueId) — invarianti yo'q, shuning uchun
 * aggregate emas: to'g'ridan-to'g'ri idempotent add/remove.
 */
export abstract class FavoritesRepository {
  abstract add(userId: string, venueId: string, now: Date): Promise<void>;
  abstract remove(userId: string, venueId: string): Promise<void>;
  abstract has(userId: string, venueId: string): Promise<boolean>;
  /** Eng oxirgi qo'shilgani birinchi */
  abstract venueIdsOf(userId: string, limit: number): Promise<string[]>;
}

export const FAVORITES_LIMIT = 50;
