import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BookingModule } from '../booking/index.js';
import { CatalogModule } from '../catalog/index.js';
import { IdentityModule } from '../identity/index.js';
import { ReviewService } from './application/review.service.js';
import { ReviewStore } from './domain/review.js';
import {
  MongoReviewStore,
  REVIEW_MODEL,
  ReviewSchema,
} from './infrastructure/mongo-review.store.js';

/** Reviews (TZ 4.5): sharhlar, Owner javobi, shikoyatlar, moderatsiya, stadion reytingi. */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: REVIEW_MODEL, schema: ReviewSchema }]),
    BookingModule,
    CatalogModule,
    IdentityModule,
  ],
  providers: [{ provide: ReviewStore, useClass: MongoReviewStore }, ReviewService],
  exports: [ReviewService],
})
export class ReviewsModule {}
