import type { Campaign, CampaignCounter, CampaignStats } from './campaign.js';

export abstract class CampaignStore {
  abstract find(id: string): Promise<Campaign | null>;
  abstract listSending(): Promise<Campaign[]>;
  abstract save(campaign: Campaign): Promise<void>;
  abstract increment(id: string, counter: CampaignCounter, by?: number): Promise<void>;
  abstract stats(id: string): Promise<CampaignStats | null>;
  /** MK-7: `settledBefore`dan oldin tugagan, hali tekshirilmagan bittasini atomik "claim" qiladi */
  abstract claimForBlockCheck(
    settledBefore: Date,
  ): Promise<{ campaign: Campaign; stats: CampaignStats } | null>;
}

/** MK-5, EC-M2: "Yangi polya" e'loni — har bir stadion uchun bir marta (`venueId` noyob) */
export abstract class AnnouncementStore {
  /** Yo'q bo'lsa PENDING sifatida qo'shadi; bor bo'lsa hech narsa qilmaydi */
  abstract ensurePending(venueId: string, cityId: string, now: Date): Promise<void>;
  abstract pendingCities(): Promise<string[]>;
  /** Shahardagi barcha PENDING e'lonlarni atomik ravishda kampaniyaga biriktiradi */
  abstract claimPending(cityId: string, campaignId: string): Promise<string[]>;
  abstract cancel(venueIds: readonly string[]): Promise<void>;
}

/** MK-2: atomik — limit bo'lsa joy band qiladi va `true` qaytaradi */
export abstract class MarketingQuota {
  abstract tryReserve(userId: string, now: Date): Promise<boolean>;
}
