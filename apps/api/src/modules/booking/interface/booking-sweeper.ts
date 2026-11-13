import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { addDays, Clock, PhoneNumber, TimeRange, zonedParts } from '@polya/shared-kernel';
import { InlineKeyboard } from 'grammy';
import type { Redis } from 'ioredis';
import type { Env } from '../../../config/env.schema.js';
import { REDIS } from '../../../platform/redis/redis.module.js';
import { TelegramMessenger } from '../../../platform/telegram/telegram-messenger.js';
import { CatalogQueries } from '../../catalog/index.js';
import { IdentityQueries } from '../../identity/index.js';
import { SLOT_MINUTES } from '../../scheduling/index.js';
import { BookingService } from '../application/booking.service.js';
import { SlotWatchService } from '../application/slot-watch.service.js';
import type { Booking } from '../domain/booking.js';
import { bookingMessages, ownerText } from './telegram/booking.messages.js';
import { BookingFlowBotFeature } from './telegram/booking-flow.bot.js';
import { formatRange, formatTime } from './telegram/booking-format.js';
import { STATUS_ICON } from './telegram/my-bookings.bot.js';
import { freedKeyboard, watchMessages } from './telegram/slot-watch.bot.js';

/** TZ 4.6: Owner'ga ertangi jadval shu soatdan keyin (shahar vaqti) */
const DAILY_HOUR = 21;

export interface SweepReport {
  expired: number;
  completed: number;
  reminders: number;
  nudges: number;
  daily: number;
  watches: number;
}

/**
 * Davriy fon ishlari (TZ 4.6, 7.6, BK-3f, BK-9). Har bir ish holatdan kelib chiqadi va idempotent:
 * muddat/yakunlash — optimistic versiya; eslatmalar — atomik flag; kunlik jadval — Redis SET NX.
 * Interval `BOOKING_SWEEP_SECONDS` (0 — o'chiq, testlar `run()`ni o'zi chaqiradi).
 */
@Injectable()
export class BookingSweeper implements OnApplicationBootstrap, OnApplicationShutdown {
  readonly #logger = new Logger(BookingSweeper.name);
  #timer: NodeJS.Timeout | null = null;
  #running = false;

  constructor(
    private readonly bookings: BookingService,
    private readonly catalog: CatalogQueries,
    private readonly identity: IdentityQueries,
    private readonly flow: BookingFlowBotFeature,
    private readonly messenger: TelegramMessenger,
    private readonly config: ConfigService<Env, true>,
    private readonly clock: Clock,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly watches: SlotWatchService,
  ) {}

  onApplicationBootstrap(): void {
    const seconds = this.config.get('BOOKING_SWEEP_SECONDS', { infer: true });
    if (seconds > 0) this.#timer = setInterval(() => void this.run(), seconds * 1000);
  }

  onApplicationShutdown(): void {
    if (this.#timer) clearInterval(this.#timer);
  }

  async run(): Promise<SweepReport> {
    const report: SweepReport = {
      expired: 0,
      completed: 0,
      reminders: 0,
      nudges: 0,
      daily: 0,
      watches: 0,
    };
    if (this.#running) return report;
    this.#running = true;
    try {
      const { expired, completed } = await this.bookings.sweep();
      report.completed = completed.length;
      for (const b of expired) if (await this.toPlayer(b, 'expired')) report.expired++;
      for (const b of await this.bookings.dueReminders())
        if (await this.toPlayer(b, 'reminder')) report.reminders++;
      for (const b of await this.bookings.dueOwnerNudges())
        if (await this.nudgeOwner(b)) report.nudges++;
      report.daily = await this.dailySchedules();
      report.watches = await this.notifyWatchers();
      return report;
    } catch (error) {
      this.#logger.error({ err: error }, 'Booking sweep failed');
      return report;
    } finally {
      this.#running = false;
    }
  }

  private async toPlayer(b: Booking, kind: 'expired' | 'reminder'): Promise<boolean> {
    const c = await this.catalog.pitchContext(b.pitchId);
    if (!c) return false;
    await this.flow.notifyPlayer(b, (lang) => {
      const when = formatRange(b.range, c.timeZone, lang);
      return kind === 'expired'
        ? bookingMessages[lang].expiredToPlayer({ venue: c.venue.name, when })
        : bookingMessages[lang].reminderToPlayer({
            venue: c.venue.name,
            when,
            landmark: c.venue.landmarkText,
            phones: c.venue.phones.map((p) => p.format()).join(', '),
          });
    });
    return true;
  }

  /** TZ VC-5d: bo'shagan slot — navbatdagi obunachiga (tranzaksion, MK-1) */
  private async notifyWatchers(): Promise<number> {
    let sent = 0;
    for (const w of await this.watches.dueNotifications()) {
      const [c, user] = await Promise.all([
        this.catalog.pitchContext(w.pitchId),
        this.identity.contactOf(w.userId),
      ]);
      if (!c || !user) continue;
      const range = TimeRange.ofDuration(w.slotStart, SLOT_MINUTES);
      await this.messenger.send(
        user.telegramId,
        watchMessages[user.language].freed({
          venue: `${c.venue.name} · ${c.pitchName}`,
          when: formatRange(range, c.timeZone, user.language),
        }),
        freedKeyboard(user.language, w.pitchId, w.slotStart),
      );
      sent++;
    }
    return sent;
  }

  /** TZ BK-3f: muddati tugashiga oz qolgan so'rov — Owner'ga tugmalar bilan qayta */
  private async nudgeOwner(b: Booking): Promise<boolean> {
    const c = await this.catalog.pitchContext(b.pitchId);
    if (!c) return false;
    // TZ 4.6: Owner + Staff
    const managers = (
      await Promise.all(
        [c.venue.ownerId, ...c.venue.staffIds].map((id) => this.identity.contactOf(id)),
      )
    ).filter((m) => m !== null);
    if (managers.length === 0) return false;
    const player = b.playerId ? await this.identity.contactOf(b.playerId) : null;
    const minutes = Math.max(
      1,
      Math.round(((b.expiresAt?.getTime() ?? 0) - this.clock.now().getTime()) / 60_000),
    );
    const text = ownerText.nudge({
      venue: c.venue.name,
      when: formatRange(b.range, c.timeZone, 'uz'),
      name: player?.displayName ?? '—',
      phone: player?.phone ? PhoneNumber.parse(player.phone).format() : '—',
      minutes,
    });
    const kb = new InlineKeyboard()
      .text('✅ Tasdiqlash', `bk:c:${b.id}`)
      .text('❌ Rad etish', `bk:r:${b.id}`);
    for (const m of managers) await this.messenger.send(m.telegramId, text, kb);
    return true;
  }

  /** TZ 4.6: har kuni 21:00 dan keyin Owner'ga ertangi jadval — bir marta (Redis SET NX) */
  private async dailySchedules(): Promise<number> {
    const upcoming = await this.bookings.upcomingBookings(30);
    // Joriy egasi bo'yicha (EC-T10: egalik o'tkazilgan bo'lsa, bandlovdagi `ownerId` eskirgan)
    const owners = await this.catalog.pitchContexts([...new Set(upcoming.map((b) => b.pitchId))]);
    const byOwner = new Map<string, Booking[]>();
    for (const b of upcoming) {
      const ownerId = owners.get(b.pitchId)?.venue.ownerId ?? b.ownerId;
      byOwner.set(ownerId, [...(byOwner.get(ownerId) ?? []), b]);
    }
    let sent = 0;
    for (const [ownerId, items] of byOwner) {
      const contexts = await this.catalog.pitchContexts(items.map((b) => b.pitchId));
      const tz = contexts.get(items[0]?.pitchId ?? '')?.timeZone ?? 'Asia/Tashkent';
      const local = zonedParts(this.clock.now(), tz);
      if (local.hour < DAILY_HOUR) continue;
      const tomorrow = addDays(local.date, 1);
      const list = items.filter((b) => b.businessDate === tomorrow);
      if (list.length === 0) continue;
      const fresh = await this.redis.set(
        `booking:daily:${ownerId}:${tomorrow}`,
        '1',
        'EX',
        3 * 86_400,
        'NX',
      );
      if (fresh !== 'OK') continue;
      const owner = await this.identity.contactOf(ownerId);
      // TZ 4.6: Owner kunlik jadvalni o'chirgan
      if (!owner || owner.dailyScheduleOff) continue;
      const lines: string[] = [];
      for (const b of list) {
        const c = contexts.get(b.pitchId);
        const p = b.playerId ? await this.identity.contactOf(b.playerId) : null;
        lines.push(
          ownerText.dailyLine({
            icon: STATUS_ICON[b.status],
            time: c
              ? `${formatTime(b.range.start, c.timeZone)}–${formatTime(b.range.end, c.timeZone)}`
              : '',
            pitch: c?.pitchName ?? '',
            name: p?.displayName ?? b.guest?.name ?? '—',
            phone: p?.phone
              ? PhoneNumber.parse(p.phone).format()
              : (b.guest?.phone?.format() ?? '—'),
          }),
        );
      }
      await this.messenger.send(
        owner.telegramId,
        `${ownerText.dailyTitle(tomorrow)}\n\n${lines.join('\n')}`,
      );
      sent++;
    }
    return sent;
  }
}
