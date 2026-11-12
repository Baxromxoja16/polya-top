import { Inject, Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import type { Redis } from 'ioredis';
import { REDIS } from '../platform/redis/redis.module.js';

const PING_TIMEOUT_MS = 1_000;

@Injectable()
export class RedisHealthIndicator {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly indicators: HealthIndicatorService,
  ) {}

  async check<const Key extends string>(key: Key) {
    const indicator = this.indicators.check(key);
    try {
      const pong = await withTimeout(this.redis.ping(), PING_TIMEOUT_MS);
      return pong === 'PONG' ? indicator.up() : indicator.down({ message: `Unexpected: ${pong}` });
    } catch (error) {
      return indicator.down({ message: error instanceof Error ? error.message : String(error) });
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
