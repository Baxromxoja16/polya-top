import { Injectable } from '@nestjs/common';
import { Clock, err, ok, type Result } from '@polya/shared-kernel';
import { BookingQueries } from '../../booking/index.js';
import { CatalogQueries } from '../../catalog/index.js';
import { type ConditionReport, ConditionStore } from '../domain/condition.js';
import { needsModeration } from '../domain/review.js';

const LIFETIME_MS = 48 * 3_600_000;
const PLAYED_WITHIN_MS = 24 * 3_600_000;
const TEXT_MIN = 3;
const TEXT_MAX = 200;

/**
 * TZ RV-8: tezkor maydon holati ("maysa ho'l", "chiroq yarim ishlayapti").
 * Yozishi mumkin: so'nggi 24 soatda shu stadionda o'ynagan o'yinchi yoki stadion egasi. 48 soat yashaydi.
 */
@Injectable()
export class ConditionService {
  constructor(
    private readonly store: ConditionStore,
    private readonly bookings: BookingQueries,
    private readonly catalog: CatalogQueries,
    private readonly clock: Clock,
  ) {}

  async canReport(userId: string, venueId: string): Promise<'OWNER' | 'PLAYER' | null> {
    const card = await this.catalog.venueCard(venueId);
    if (!card) return null;
    if (card.venue.ownerId === userId) return 'OWNER';
    const now = this.clock.now();
    const recent = await this.bookings.playerRecent(
      userId,
      new Date(now.getTime() - PLAYED_WITHIN_MS),
    );
    return recent.some((b) => b.venueId === venueId && b.range.start <= now) ? 'PLAYER' : null;
  }

  async report(
    userId: string,
    venueId: string,
    text: string,
  ): Promise<Result<ConditionReport, 'NOT_ALLOWED' | 'INVALID_TEXT'>> {
    const role = await this.canReport(userId, venueId);
    if (!role) return err('NOT_ALLOWED');
    const value = text.trim().replace(/\s+/g, ' ');
    const length = [...value].length;
    if (length < TEXT_MIN || length > TEXT_MAX || needsModeration(value))
      return err('INVALID_TEXT');
    const now = this.clock.now();
    const report: ConditionReport = {
      venueId,
      authorId: userId,
      byOwner: role === 'OWNER',
      text: value,
      createdAt: now,
      expiresAt: new Date(now.getTime() + LIFETIME_MS),
    };
    await this.store.add(report);
    return ok(report);
  }

  latest(venueId: string): Promise<ConditionReport | null> {
    return this.store.latest(venueId, this.clock.now());
  }
}
