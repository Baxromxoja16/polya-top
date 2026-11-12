import { Module, type OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TelegramMessenger } from '../../platform/telegram/telegram-messenger.js';
import { CatalogModule } from '../catalog/index.js';
import { IdentityModule } from '../identity/index.js';
import { campaignIdOfTag, MarketingService } from './application/marketing.service.js';
import { AnnouncementStore, CampaignStore, MarketingQuota } from './domain/marketing-ports.js';
import {
  ANNOUNCEMENT_MODEL,
  AnnouncementSchema,
  CAMPAIGN_MODEL,
  CampaignSchema,
  MongoAnnouncementStore,
  MongoCampaignStore,
  MongoMarketingQuota,
  QUOTA_MODEL,
  QuotaSchema,
} from './infrastructure/mongo-marketing.stores.js';
import { MarketingDispatcher } from './interface/marketing-dispatcher.js';
import { MarketingBotFeature } from './interface/telegram/marketing.bot.js';

/** Marketing (TZ 4.6.1): "Yangi polya" e'loni, MK-1…MK-7 qoidalari, kampaniya statistikasi. */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CAMPAIGN_MODEL, schema: CampaignSchema },
      { name: ANNOUNCEMENT_MODEL, schema: AnnouncementSchema },
      { name: QUOTA_MODEL, schema: QuotaSchema },
    ]),
    CatalogModule,
    IdentityModule,
  ],
  providers: [
    { provide: CampaignStore, useClass: MongoCampaignStore },
    { provide: AnnouncementStore, useClass: MongoAnnouncementStore },
    { provide: MarketingQuota, useClass: MongoMarketingQuota },
    MarketingService,
    MarketingDispatcher,
    MarketingBotFeature,
  ],
  exports: [MarketingService],
})
export class MarketingModule implements OnModuleInit {
  constructor(
    private readonly messenger: TelegramMessenger,
    private readonly marketing: MarketingService,
  ) {}

  /** MK-7: yetkazildi / bloklandi / xato — kampaniya statistikasiga */
  onModuleInit(): void {
    this.messenger.onOutcome(async (tag, _chatId, outcome) => {
      const id = campaignIdOfTag(tag);
      if (id) await this.marketing.record(id, outcome);
    });
  }
}
