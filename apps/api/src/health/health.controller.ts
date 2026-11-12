import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, MongooseHealthIndicator } from '@nestjs/terminus';
import { RedisHealthIndicator } from './redis.health.js';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly mongo: MongooseHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  /** Liveness: process tirikmi (tashqi bog'liqliklarsiz). Orkestrator restart qarori uchun. */
  @Get('live')
  @HealthCheck()
  live() {
    return this.health.check([]);
  }

  /** Readiness: Mongo va Redis'ga ulanish bormi. Load balancer trafik yuborish qarori uchun. */
  @Get()
  @HealthCheck()
  ready() {
    return this.health.check([
      () => this.mongo.pingCheck('mongo', { timeout: 1_500 }),
      () => this.redis.check('redis'),
    ]);
  }
}
