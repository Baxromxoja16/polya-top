import { Module, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import type { Env } from '../../config/env.schema.js';
import { BookingModule } from '../booking/index.js';
import { CatalogModule } from '../catalog/index.js';
import { IdentityModule } from '../identity/index.js';
import { ConditionService } from './application/condition.service.js';
import { ReviewService } from './application/review.service.js';
import { ConditionStore } from './domain/condition.js';
import { configureProfanity, ReviewStore } from './domain/review.js';
import {
  CONDITION_MODEL,
  ConditionSchema,
  MongoConditionStore,
} from './infrastructure/mongo-condition.store.js';
import {
  MongoReviewStore,
  REVIEW_MODEL,
  ReviewSchema,
} from './infrastructure/mongo-review.store.js';
import { ReviewInviter } from './interface/review-inviter.js';
import { ReviewsBotFeature } from './interface/telegram/reviews.bot.js';

/** Reviews (TZ 4.5): sharhlar, Owner javobi, shikoyatlar, moderatsiya, reyting, maydon holati. */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: REVIEW_MODEL, schema: ReviewSchema },
      { name: CONDITION_MODEL, schema: ConditionSchema },
    ]),
    BookingModule,
    CatalogModule,
    IdentityModule,
  ],
  providers: [
    { provide: ReviewStore, useClass: MongoReviewStore },
    { provide: ConditionStore, useClass: MongoConditionStore },
    ReviewService,
    ConditionService,
    ReviewsBotFeature,
    ReviewInviter,
  ],
  exports: [ReviewService, ReviewInviter],
})
export class ReviewsModule implements OnModuleInit {
  constructor(private readonly config: ConfigService<Env, true>) {}

  /** EC-R5: so'kinish ro'yxati konfiguratsiyadan kengaytiriladi */
  onModuleInit(): void {
    configureProfanity(this.config.get('PROFANITY_EXTRA', { infer: true }));
  }
}
