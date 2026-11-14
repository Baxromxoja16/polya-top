import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller.js';
import { KeepAlive } from './keep-alive.js';
import { RedisHealthIndicator } from './redis.health.js';

@Module({
  imports: [TerminusModule.forRoot({ logger: false })],
  controllers: [HealthController],
  providers: [RedisHealthIndicator, KeepAlive],
})
export class HealthModule {}
