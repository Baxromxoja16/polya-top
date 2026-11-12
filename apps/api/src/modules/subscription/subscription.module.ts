import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FeatureGate } from './application/feature-gate.js';
import { SubscriptionStore } from './domain/subscription.js';
import {
  MongoSubscriptionStore,
  SUBSCRIPTION_MODEL,
  SubscriptionSchema,
} from './infrastructure/mongo-subscription.store.js';

/** Subscription (TZ 4.9): tariflar, obuna muddati, FeatureGate. Boshqa kontekstlarga bog'liq emas. */
@Module({
  imports: [MongooseModule.forFeature([{ name: SUBSCRIPTION_MODEL, schema: SubscriptionSchema }])],
  providers: [{ provide: SubscriptionStore, useClass: MongoSubscriptionStore }, FeatureGate],
  exports: [FeatureGate],
})
export class SubscriptionModule {}
