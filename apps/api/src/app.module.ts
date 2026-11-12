import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.schema.js';
import { HealthModule } from './health/health.module.js';
import { BookingModule } from './modules/booking/index.js';
import { CatalogModule } from './modules/catalog/index.js';
import { GeographyModule } from './modules/geography/index.js';
import { IdentityModule } from './modules/identity/index.js';
import { MarketingModule } from './modules/marketing/index.js';
import { ReviewsModule } from './modules/reviews/index.js';
import { SchedulingModule } from './modules/scheduling/index.js';
import { SubscriptionModule } from './modules/subscription/index.js';
import { DatabaseModule } from './platform/database/database.module.js';
import { LoggerModule } from './platform/logging/logger.module.js';
import { RedisModule } from './platform/redis/redis.module.js';
import { TelegramModule } from './platform/telegram/telegram.module.js';
import { ClockModule } from './platform/time/clock.module.js';

/**
 * Composition root. Bounded context modullari (`src/modules/*`) shu yerga ulanadi.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnv }),
    LoggerModule,
    DatabaseModule,
    RedisModule,
    ClockModule,
    TelegramModule,
    HealthModule,
    IdentityModule,
    GeographyModule,
    SchedulingModule,
    CatalogModule,
    BookingModule,
    ReviewsModule,
    SubscriptionModule,
    MarketingModule,
  ],
})
export class AppModule {}
