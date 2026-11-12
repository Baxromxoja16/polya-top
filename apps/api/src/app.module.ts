import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.schema.js';
import { HealthModule } from './health/health.module.js';
import { DatabaseModule } from './platform/database/database.module.js';
import { LoggerModule } from './platform/logging/logger.module.js';
import { RedisModule } from './platform/redis/redis.module.js';
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
    HealthModule,
  ],
})
export class AppModule {}
