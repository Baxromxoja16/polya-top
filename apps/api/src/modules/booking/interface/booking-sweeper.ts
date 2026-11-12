import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../config/env.schema.js';
import { CatalogQueries } from '../../catalog/index.js';
import { BookingService } from '../application/booking.service.js';
import { bookingMessages } from './telegram/booking.messages.js';
import { BookingFlowBotFeature } from './telegram/booking-flow.bot.js';
import { formatRange } from './telegram/booking-format.js';

/**
 * TZ BK-3f, BK-9: muddati o'tgan so'rovlar va tugagan o'yinlar uchun davriy tekshiruv.
 * Ko'p nusxada ham xavfsiz (optimistic versiya). Interval `BOOKING_SWEEP_SECONDS`, 0 — o'chiq (testlar).
 * 5-bosqichda BullMQ'ga ko'chiriladi — `run()` o'zgarmaydi.
 */
@Injectable()
export class BookingSweeper implements OnApplicationBootstrap, OnApplicationShutdown {
  readonly #logger = new Logger(BookingSweeper.name);
  #timer: NodeJS.Timeout | null = null;
  #running = false;

  constructor(
    private readonly bookings: BookingService,
    private readonly catalog: CatalogQueries,
    private readonly flow: BookingFlowBotFeature,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onApplicationBootstrap(): void {
    const seconds = this.config.get('BOOKING_SWEEP_SECONDS', { infer: true });
    if (seconds > 0) this.#timer = setInterval(() => void this.run(), seconds * 1000);
  }

  onApplicationShutdown(): void {
    if (this.#timer) clearInterval(this.#timer);
  }

  async run(): Promise<{ expired: number; completed: number }> {
    if (this.#running) return { expired: 0, completed: 0 };
    this.#running = true;
    try {
      const { expired, completed } = await this.bookings.sweep();
      for (const b of expired) {
        const c = await this.catalog.pitchContext(b.pitchId);
        if (!c) continue;
        await this.flow.notifyPlayer(b, (lang) =>
          bookingMessages[lang].expiredToPlayer({
            venue: c.venue.name,
            when: formatRange(b.range, c.timeZone, lang),
          }),
        );
      }
      return { expired: expired.length, completed: completed.length };
    } catch (error) {
      this.#logger.error({ err: error }, 'Booking sweep failed');
      return { expired: 0, completed: 0 };
    } finally {
      this.#running = false;
    }
  }
}
