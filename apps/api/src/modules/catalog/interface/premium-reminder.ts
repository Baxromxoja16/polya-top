import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Clock, zonedParts } from '@polya/shared-kernel';
import type { Redis } from 'ioredis';
import type { Env } from '../../../config/env.schema.js';
import { REDIS } from '../../../platform/redis/redis.module.js';
import { TelegramMessenger } from '../../../platform/telegram/telegram-messenger.js';
import { IdentityQueries } from '../../identity/index.js';
import { FeatureGate } from '../../subscription/index.js';
import { CatalogQueries } from '../application/catalog.queries.js';
import { catalogMessages } from './telegram/catalog.messages.js';

const DAY_MS = 86_400_000;
/** TZ 4.9: PREMIUM tugashidan 7 kun va 1 kun oldin eslatma */
const STAGES = [7, 1] as const;

/**
 * Owner'ga PREMIUM muddati tugayotgani haqida eslatma (TZ 4.9). Holatdan kelib chiqadi (ADR-0006):
 * har bir (stadion, muddat oxiri, bosqich) uchun bir marta — Redis SET NX.
 * Interval — `MARKETING_TICK_SECONDS` (0 — o'chiq; testlar `run()`ni o'zi chaqiradi).
 */
@Injectable()
export class PremiumReminder implements OnApplicationBootstrap, OnApplicationShutdown {
  readonly #logger = new Logger(PremiumReminder.name);
  #timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly features: FeatureGate,
    private readonly catalog: CatalogQueries,
    private readonly identity: IdentityQueries,
    private readonly messenger: TelegramMessenger,
    private readonly config: ConfigService<Env, true>,
    private readonly clock: Clock,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  onApplicationBootstrap(): void {
    const seconds = this.config.get('MARKETING_TICK_SECONDS', { infer: true });
    if (seconds > 0) this.#timer = setInterval(() => void this.run(), seconds * 1000);
  }

  onApplicationShutdown(): void {
    if (this.#timer) clearInterval(this.#timer);
  }

  async run(): Promise<number> {
    let sent = 0;
    try {
      const now = this.clock.now().getTime();
      for (const { venueId, endsAt } of await this.features.endingWithin(STAGES[0] * DAY_MS)) {
        const left = endsAt.getTime() - now;
        // Eng kichik mos bosqich: 1 kun qolganda "1", undan oldin "7"
        const stage = STAGES.findLast((d) => left <= d * DAY_MS);
        if (!stage) continue;
        const key = `sub:remind:${venueId}:${endsAt.getTime()}:${stage}`;
        if ((await this.redis.set(key, '1', 'EX', 30 * 86_400, 'NX')) !== 'OK') continue;
        const card = await this.catalog.venueCard(venueId);
        const owner = card ? await this.identity.contactOf(card.venue.ownerId) : null;
        if (!card || !owner) continue;
        const p = zonedParts(endsAt, await this.catalog.timeZoneOf(card.venue.cityId));
        const pad = (n: number) => String(n).padStart(2, '0');
        await this.messenger.send(
          owner.telegramId,
          catalogMessages[owner.language].premiumEnding(
            card.venue.name,
            stage,
            `${pad(p.day)}.${pad(p.month)}.${p.year}`,
          ),
        );
        sent++;
      }
    } catch (error) {
      this.#logger.error({ err: error }, 'Premium reminder failed');
    }
    return sent;
  }
}
