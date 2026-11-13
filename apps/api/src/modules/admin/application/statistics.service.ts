import { Injectable } from '@nestjs/common';
import { Clock } from '@polya/shared-kernel';
import { BookingQueries } from '../../booking/index.js';
import { CatalogQueries } from '../../catalog/index.js';
import { type UserCounts, UserStatistics } from '../../identity/index.js';

export interface BookingFunnel {
  requests: number;
  confirmed: number;
  rejected: number;
  expired: number;
  cancelled: number;
  noShow: number;
  /** So'rovdan o'yingacha (tasdiqlangan + o'tgan) ulushi, % */
  conversion: number;
}

export interface PlatformStats {
  users: UserCounts;
  venues: Partial<Record<string, number>>;
  today: BookingFunnel;
  week: BookingFunnel;
}

const sum = (c: Partial<Record<string, number>>, keys: string[]) =>
  keys.reduce((s, k) => s + (c[k] ?? 0), 0);

/** TZ AD-4: foydalanuvchilar, stadionlar, bandlovlar, konversiya */
@Injectable()
export class StatisticsService {
  constructor(
    private readonly users: UserStatistics,
    private readonly catalog: CatalogQueries,
    private readonly bookings: BookingQueries,
    private readonly clock: Clock,
  ) {}

  async snapshot(): Promise<PlatformStats> {
    const now = this.clock.now().getTime();
    const dayAgo = new Date(now - 86_400_000);
    const weekAgo = new Date(now - 7 * 86_400_000);
    const [users, venues, today, week] = await Promise.all([
      this.users.counts(weekAgo),
      this.catalog.venueCounts(),
      this.bookings.countsSince(dayAgo),
      this.bookings.countsSince(weekAgo),
    ]);
    return { users, venues, today: funnel(today), week: funnel(week) };
  }
}

/** Bot so'rovlari (qo'lda bandlovlar ham bor — ular `requests`ga kiradi, chunki CONFIRMED) */
export function funnel(c: Partial<Record<string, number>>): BookingFunnel {
  const confirmed = sum(c, ['CONFIRMED', 'COMPLETED', 'NO_SHOW']);
  const requests = sum(c, [
    'PENDING',
    'CONFIRMED',
    'REJECTED',
    'EXPIRED',
    'CANCELLED_BY_PLAYER',
    'CANCELLED_BY_OWNER',
    'COMPLETED',
    'NO_SHOW',
  ]);
  return {
    requests,
    confirmed,
    rejected: c.REJECTED ?? 0,
    expired: c.EXPIRED ?? 0,
    cancelled: sum(c, ['CANCELLED_BY_PLAYER', 'CANCELLED_BY_OWNER']),
    noShow: c.NO_SHOW ?? 0,
    conversion: requests ? Math.round((confirmed / requests) * 100) : 0,
  };
}
