import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Clock, type Language, zonedParts } from '@polya/shared-kernel';
import { InlineKeyboard } from 'grammy';
import type { Env } from '../../../config/env.schema.js';
import { TelegramMessenger } from '../../../platform/telegram/telegram-messenger.js';
import { CatalogQueries, type VenueListItem } from '../../catalog/index.js';
import { IdentityQueries } from '../../identity/index.js';
import { campaignTag, MarketingService } from '../application/marketing.service.js';
import type { Campaign } from '../domain/campaign.js';
import type { Promotion } from '../domain/promotion.js';
import { blockAlert, formatSum, marketingMessages } from './telegram/marketing.messages.js';

export interface DispatchReport {
  started: number;
  sent: number;
  alerts: number;
}

/** Kampaniya xabaridagi tugma: bosish hisoblanadi (MK-7), keyin stadion kartochkasi ochiladi */
export const openCallback = (campaignId: string, venueId: string) =>
  `mk:o:${campaignId}:${venueId}`;

const hhmm = (d: Date, tz: string) => {
  const p = zonedParts(d, tz);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
};

/**
 * Marketing fon jarayoni (TZ 4.6.1). Interval — `MARKETING_TICK_SECONDS` (0 — o'chiq; testlar `run()`).
 * Yuborish `TelegramMessenger` navbati orqali (MK-6: ≤ 25 xabar/s).
 */
@Injectable()
export class MarketingDispatcher implements OnApplicationBootstrap, OnApplicationShutdown {
  readonly #logger = new Logger(MarketingDispatcher.name);
  #timer: NodeJS.Timeout | null = null;
  #running = false;

  constructor(
    private readonly marketing: MarketingService,
    private readonly identity: IdentityQueries,
    private readonly catalog: CatalogQueries,
    private readonly messenger: TelegramMessenger,
    private readonly config: ConfigService<Env, true>,
    private readonly clock: Clock,
  ) {}

  onApplicationBootstrap(): void {
    const seconds = this.config.get('MARKETING_TICK_SECONDS', { infer: true });
    if (seconds > 0) this.#timer = setInterval(() => void this.run(), seconds * 1000);
  }

  onApplicationShutdown(): void {
    if (this.#timer) clearInterval(this.#timer);
  }

  async run(): Promise<DispatchReport> {
    const report: DispatchReport = { started: 0, sent: 0, alerts: 0 };
    if (this.#running) return report;
    this.#running = true;
    try {
      await this.marketing.discover();
      report.started = (await this.marketing.startNewVenueCampaigns()).length;
      for (const campaign of await this.marketing.listSending())
        report.sent += await this.sendChunk(campaign);
      for (const { campaign, stats } of await this.marketing.dueBlockAlerts()) {
        const text = blockAlert({ id: campaign.id, ...stats });
        await this.messenger.sendToMany(this.identity.adminTelegramIds(), text);
        report.alerts++;
      }
      return report;
    } catch (error) {
      this.#logger.error({ err: error }, 'Marketing dispatch failed');
      return report;
    } finally {
      this.#running = false;
    }
  }

  private async sendChunk(campaign: Campaign): Promise<number> {
    const chunk = await this.marketing.nextChunk(campaign);
    if (!chunk) return 0;
    const timeZone = await this.catalog.timeZoneOf(campaign.cityId);
    let sent = 0;
    for (const r of chunk.recipients) {
      const m = marketingMessages[r.language];
      const [venue] = chunk.venues;
      const text =
        chunk.promotion && venue
          ? this.promotionText(chunk.promotion, venue, timeZone, r.language)
          : this.newVenuesText(chunk.venues, r.language);
      const kb = new InlineKeyboard();
      for (const i of chunk.venues)
        kb.text(m.btnOpen(i.venue.name), openCallback(campaign.id, i.venue.id)).row();
      // MK-4: har bir marketing xabarida o'chirish tugmasi (Identity ekrani)
      kb.text(m.btnOptOut, 'id:mkt:off');
      if (await this.messenger.send(r.telegramId, text, kb, { tag: campaignTag(campaign.id) }))
        sent++;
    }
    if (sent) await this.marketing.record(campaign.id, 'sent', sent);
    return sent;
  }

  private newVenuesText(venues: VenueListItem[], lang: Language): string {
    const m = marketingMessages[lang];
    const lines = venues.map((i) => ({
      name: i.venue.name,
      landmark: i.venue.landmarkText,
      price: i.minPricePerHour ? formatSum(i.minPricePerHour.amount) : null,
    }));
    const [first] = lines;
    return lines.length === 1 && first ? m.newVenue(first) : m.newVenues(lines);
  }

  private promotionText(p: Promotion, venue: VenueListItem, tz: string, lang: Language): string {
    const m = marketingMessages[lang];
    const today = zonedParts(this.clock.now(), tz).date;
    const day = zonedParts(p.range.start, tz).date === today ? m.today : m.tomorrow;
    return m.promotion({
      percent: p.props.percent,
      venue: venue.venue.name,
      landmark: venue.venue.landmarkText,
      when: `${day} ${hhmm(p.range.start, tz)}–${hhmm(p.range.end, tz)}`,
      oldPrice: formatSum(p.props.basePrice.amount),
      newPrice: formatSum(p.discountedPrice.amount),
    });
  }
}
