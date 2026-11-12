import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { Env } from '../../config/env.schema.js';

export const REDIS = Symbol('REDIS');

@Injectable()
class RedisLifecycle implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.redis.status !== 'end') await this.redis.quit();
  }
}

/** Bot sessiyasi, rate limit, deduplikatsiya va BullMQ uchun umumiy Redis ulanishi. */
@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const redis = new Redis(config.get('REDIS_URL', { infer: true }), {
          connectionName: 'polya-api',
          maxRetriesPerRequest: 3,
        });
        // Tinglovchisiz ioredis xatoni stderr'ga "Unhandled error event" qilib chiqaradi.
        // Ulanish uzilishi kutilgan holat: ioredis o'zi qayta ulanadi, readiness esa /health'da ko'rinadi.
        const logger = new Logger('Redis');
        let lastLoggedAt = 0;
        redis.on('error', (error: Error) => {
          const now = Date.now();
          if (now - lastLoggedAt < 10_000) return; // qayta ulanish urinishlari log'ni to'ldirib yubormasin
          lastLoggedAt = now;
          logger.warn({ err: error }, 'Redis connection error');
        });
        return redis;
      },
    },
    RedisLifecycle,
  ],
  exports: [REDIS],
})
export class RedisModule {}
