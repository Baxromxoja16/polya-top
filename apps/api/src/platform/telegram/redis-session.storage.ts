import type { StorageAdapter } from 'grammy';
import type { Redis } from 'ioredis';

/**
 * grammY sessiyasi Redis'da (TZ 6: API stateless, gorizontal kengaytiriladi).
 * TTL har yozuvda yangilanadi: faol foydalanuvchining sessiyasi yo'qolmaydi.
 */
export class RedisSessionStorage<T> implements StorageAdapter<T> {
  constructor(
    private readonly redis: Redis,
    private readonly ttlSeconds: number,
    private readonly prefix = 'tg:session:',
  ) {}

  async read(key: string): Promise<T | undefined> {
    const raw = await this.redis.get(this.prefix + key);
    if (raw === null) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return undefined; // buzilgan sessiya — yangidan boshlanadi
    }
  }

  async write(key: string, value: T): Promise<void> {
    await this.redis.set(this.prefix + key, JSON.stringify(value), 'EX', this.ttlSeconds);
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(this.prefix + key);
  }
}
