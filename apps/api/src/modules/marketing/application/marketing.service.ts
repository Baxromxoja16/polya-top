import { Injectable } from '@nestjs/common';
import { Clock, IdGenerator, zonedParts } from '@polya/shared-kernel';
import { CatalogQueries, type VenueListItem } from '../../catalog/index.js';
import { type AudienceMember, MarketingAudience } from '../../identity/index.js';
import {
  Campaign,
  type CampaignCounter,
  type CampaignStats,
  exceedsBlockRatio,
} from '../domain/campaign.js';
import { isWithinSendingWindow } from '../domain/marketing-policy.js';
import { AnnouncementStore, CampaignStore, MarketingQuota } from '../domain/marketing-ports.js';

/** Shu muddat ichida tasdiqlangan stadionlar e'lon qilinadi (eskilari — yo'q) */
const DISCOVERY_WINDOW_MS = 3 * 86_400_000;
/** MK-6: bitta tick'da bitta kampaniyadan ko'pi bilan shuncha foydalanuvchi */
export const CHUNK_SIZE = 200;
/** MK-7: navbatdagi xabarlar natijasi kelishi uchun kutish */
const BLOCK_CHECK_DELAY_MS = 10 * 60_000;

/** Telegram tegi: `mk:<campaignId>` — yetkazish natijasi shu orqali kampaniyaga yoziladi */
export const campaignTag = (id: string) => `mk:${id}`;
export const campaignIdOfTag = (tag: string) => (tag.startsWith('mk:') ? tag.slice(3) : null);

export interface ChunkToSend {
  campaign: Campaign;
  venues: VenueListItem[];
  recipients: AudienceMember[];
}

/**
 * Marketing kampaniyalari (TZ 4.6.1). Triggerlar holatdan kelib chiqadi (ADR-0006):
 * tasdiqlangan stadion → PENDING e'lon → oyna ochilganda kampaniya → bo'laklab yuborish.
 */
@Injectable()
export class MarketingService {
  constructor(
    private readonly campaigns: CampaignStore,
    private readonly announcements: AnnouncementStore,
    private readonly quota: MarketingQuota,
    private readonly audience: MarketingAudience,
    private readonly catalog: CatalogQueries,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  /** MK-5: yangi tasdiqlangan stadionlar uchun e'lon (har biriga bir marta — EC-M2) */
  async discover(): Promise<void> {
    const now = this.clock.now();
    const since = new Date(now.getTime() - DISCOVERY_WINDOW_MS);
    for (const venue of await this.catalog.approvedSince(since))
      await this.announcements.ensurePending(venue.id, venue.cityId, now);
  }

  /** MK-3 */
  async isSendingWindow(cityId: string): Promise<boolean> {
    const tz = await this.catalog.timeZoneOf(cityId);
    return isWithinSendingWindow(zonedParts(this.clock.now(), tz).hour);
  }

  /**
   * EC-M3: shahardagi barcha kutayotgan e'lonlar bitta umumiy xabarga birlashadi.
   * Shaharda yuborilayotgan "yangi polya" kampaniyasi bo'lsa, keyingilari navbatda kutadi.
   */
  async startNewVenueCampaigns(): Promise<Campaign[]> {
    const sending = await this.campaigns.listSending();
    const started: Campaign[] = [];
    for (const cityId of await this.announcements.pendingCities()) {
      if (sending.some((c) => c.kind === 'NEW_VENUES' && c.cityId === cityId)) continue;
      if (!(await this.isSendingWindow(cityId))) continue;
      const id = this.ids.next();
      const claimed = await this.announcements.claimPending(cityId, id);
      const items = await this.catalog.venuesByIds(claimed);
      // MK-5: faqat ommaviy va bandlash ishlaydigan (narx bor) stadionlar
      const eligible = items.filter((i) => i.venue.isPublic && i.minPricePerHour !== null);
      const rejected = claimed.filter((v) => !eligible.some((i) => i.venue.id === v));
      if (rejected.length) await this.announcements.cancel(rejected);
      if (eligible.length === 0) continue;
      const campaign = Campaign.start({
        id,
        kind: 'NEW_VENUES',
        cityId,
        venueIds: eligible.map((i) => i.venue.id),
        now: this.clock.now(),
      });
      await this.campaigns.save(campaign);
      started.push(campaign);
    }
    return started;
  }

  /**
   * Keyingi bo'lak: kursor surilib saqlanadi, limiti borlar (MK-2) qaytariladi.
   * `null` — kampaniya hozir yuborilmaydi (oyna yopiq) yoki yopildi.
   */
  async nextChunk(campaign: Campaign): Promise<ChunkToSend | null> {
    if (!(await this.isSendingWindow(campaign.cityId))) return null;
    const venues = (await this.catalog.venuesByIds([...campaign.venueIds])).filter(
      (i) => i.venue.isPublic,
    );
    const now = this.clock.now();
    if (venues.length === 0) {
      // EC-M1: stadion(lar) bloklandi/arxivlandi — qolganlarga yuborilmaydi
      campaign.cancel(now);
      await this.campaigns.save(campaign);
      return null;
    }
    const page = await this.audience.page(campaign.cityId, campaign.cursor, CHUNK_SIZE);
    const recipients: AudienceMember[] = [];
    for (const member of page) {
      if (await this.quota.tryReserve(member.userId, now)) recipients.push(member);
    }
    const skipped = page.length - recipients.length;
    if (skipped) await this.campaigns.increment(campaign.id, 'skipped', skipped);
    const last = page.at(-1);
    if (page.length < CHUNK_SIZE) campaign.finish(now);
    else if (last) campaign.advance(last.userId);
    await this.campaigns.save(campaign);
    return { campaign, venues, recipients };
  }

  listSending(): Promise<Campaign[]> {
    return this.campaigns.listSending();
  }

  async record(campaignId: string, counter: CampaignCounter, by = 1): Promise<void> {
    await this.campaigns.increment(campaignId, counter, by);
  }

  stats(campaignId: string): Promise<CampaignStats | null> {
    return this.campaigns.stats(campaignId);
  }

  /** MK-7: tugagan kampaniyalarda bloklash ulushi > 2% — Admin'ga ogohlantirish (bir marta) */
  async dueBlockAlerts(): Promise<{ campaign: Campaign; stats: CampaignStats }[]> {
    const settledBefore = new Date(this.clock.now().getTime() - BLOCK_CHECK_DELAY_MS);
    const alerts: { campaign: Campaign; stats: CampaignStats }[] = [];
    for (;;) {
      const claimed = await this.campaigns.claimForBlockCheck(settledBefore);
      if (!claimed) return alerts;
      if (exceedsBlockRatio(claimed.stats)) alerts.push(claimed);
    }
  }
}
