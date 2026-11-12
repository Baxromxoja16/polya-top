import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BookingModule } from '../booking/index.js';
import { CatalogModule } from '../catalog/index.js';
import { IdentityModule } from '../identity/index.js';
import { ConditionService } from './application/condition.service.js';
import { ReviewService } from './application/review.service.js';
import { ConditionStore } from './domain/condition.js';
import { ReviewStore } from './domain/review.js';
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
export class ReviewsModule {}
