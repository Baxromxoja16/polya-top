import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../config/env.schema.js';
import { TelegramMessenger } from '../../../platform/telegram/telegram-messenger.js';
import { BookingService } from '../../booking/index.js';
import { CatalogQueries } from '../../catalog/index.js';
import { IdentityQueries } from '../../identity/index.js';
import { ratingKeyboard, reviewMessages } from './telegram/reviews.bot.js';

/** TZ RV-3: o'yin tugaganidan 2 soat o'tib baholash taklifi — bir marta (atomik flag, ADR-0006). */
@Injectable()
export class ReviewInviter implements OnApplicationBootstrap, OnApplicationShutdown {
  readonly #logger = new Logger(ReviewInviter.name);
  #timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly bookings: BookingService,
    private readonly catalog: CatalogQueries,
    private readonly identity: IdentityQueries,
    private readonly messenger: TelegramMessenger,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onApplicationBootstrap(): void {
    const seconds = this.config.get('BOOKING_SWEEP_SECONDS', { infer: true });
    if (seconds > 0) this.#timer = setInterval(() => void this.run(), seconds * 1000);
  }

  onApplicationShutdown(): void {
    if (this.#timer) clearInterval(this.#timer);
  }

  async run(): Promise<number> {
    try {
      let sent = 0;
      for (const b of await this.bookings.dueReviewInvites()) {
        const c = await this.catalog.pitchContext(b.pitchId);
        const player = b.playerId ? await this.identity.contactOf(b.playerId) : null;
        if (!c || !player || player.botBlocked) continue;
        await this.messenger.send(
          player.telegramId,
          reviewMessages[player.language].invite(c.venue.name),
          ratingKeyboard(b.id),
        );
        sent++;
      }
      return sent;
    } catch (error) {
      this.#logger.error({ err: error }, 'Review invites failed');
      return 0;
    }
  }
}
