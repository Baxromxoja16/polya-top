import { Module, type OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TelegramMessenger } from '../../platform/telegram/telegram-messenger.js';
import { CatalogModule } from '../catalog/index.js';
import { IdentityModule } from '../identity/index.js';
import { DiscountRegistry, SchedulingModule } from '../scheduling/index.js';
import { SubscriptionModule } from '../subscription/index.js';
import { campaignIdOfTag, MarketingService } from './application/marketing.service.js';
import { PromotionService } from './application/promotion.service.js';
import { AnnouncementStore, CampaignStore, MarketingQuota } from './domain/marketing-ports.js';
import { PromotionStore } from './domain/promotion.js';
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
import {
  MongoPromotionStore,
  PROMOTION_MODEL,
  PromotionSchema,
} from './infrastructure/mongo-promotion.store.js';
import { MarketingDispatcher } from './interface/marketing-dispatcher.js';
import { MarketingBotFeature } from './interface/telegram/marketing.bot.js';
import { PromotionBotFeature } from './interface/telegram/promotion.bot.js';

/** Marketing (TZ 4.6.1): "Yangi polya" e'loni, MK-1…MK-7 qoidalari, kampaniya statistikasi. */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CAMPAIGN_MODEL, schema: CampaignSchema },
      { name: ANNOUNCEMENT_MODEL, schema: AnnouncementSchema },
      { name: QUOTA_MODEL, schema: QuotaSchema },
      { name: PROMOTION_MODEL, schema: PromotionSchema },
    ]),
    CatalogModule,
    IdentityModule,
    SchedulingModule,
    SubscriptionModule,
  ],
  providers: [
    { provide: CampaignStore, useClass: MongoCampaignStore },
    { provide: AnnouncementStore, useClass: MongoAnnouncementStore },
    { provide: MarketingQuota, useClass: MongoMarketingQuota },
    { provide: PromotionStore, useClass: MongoPromotionStore },
    MarketingService,
    PromotionService,
    MarketingDispatcher,
    MarketingBotFeature,
    PromotionBotFeature,
  ],
  exports: [MarketingService, PromotionService],
})
export class MarketingModule implements OnModuleInit {
  constructor(
    private readonly messenger: TelegramMessenger,
    private readonly marketing: MarketingService,
    private readonly discounts: DiscountRegistry,
    private readonly promotions: PromotionService,
  ) {}

  /** MK-7: yetkazildi / bloklandi / xato — kampaniya statistikasiga; 4.9: chegirmalar narxga */
  onModuleInit(): void {
    this.discounts.use(this.promotions);
    this.messenger.onOutcome(async (tag, _chatId, outcome) => {
      const id = campaignIdOfTag(tag);
      if (id) await this.marketing.record(id, outcome);
    });
  }
}
