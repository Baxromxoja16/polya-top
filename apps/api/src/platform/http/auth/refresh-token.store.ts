import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS } from '../../redis/redis.module.js';

/** TZ ID-7: refresh token 30 kun */
export const REFRESH_TTL_SECONDS = 30 * 24 * 3600;

const digest = (token: string) => createHash('sha256').update(token).digest('base64url');
const tokenKey = (token: string) => `auth:rt:${digest(token)}`;
const usedKey = (token: string) => `auth:rt-used:${digest(token)}`;
const familyKey = (family: string) => `auth:rf:${family}`;
const userKey = (userId: string) => `auth:ru:${userId}`;

/**
 * Refresh token'lar: tasodifiy (opaque), Redis'da faqat SHA-256 xeshi saqlanadi.
 * Har ishlatilganda almashtiriladi (rotation). Ishlatilgan token qayta kelsa — o'g'irlangan deb
 * hisoblanadi va butun "oila" (bitta kirishdan chiqqan zanjir) bekor qilinadi (reuse detection).
 */
@Injectable()
export class RefreshTokenStore {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async issue(userId: string, family: string = randomBytes(12).toString('base64url')) {
    const token = randomBytes(32).toString('base64url');
    await this.redis
      .multi()
      .set(tokenKey(token), JSON.stringify({ userId, family }), 'EX', REFRESH_TTL_SECONDS)
      .set(familyKey(family), userId, 'EX', REFRESH_TTL_SECONDS)
      .sadd(userKey(userId), family)
      .expire(userKey(userId), REFRESH_TTL_SECONDS)
      .exec();
    return token;
  }

  /** Token to'g'ri bo'lsa uni yo'q qiladi va egasini qaytaradi; yangi tokenni `issue(userId, family)` beradi. */
  async consume(token: string): Promise<{ userId: string; family: string } | null> {
    const raw = await this.redis.getdel(tokenKey(token));
    if (!raw) {
      const family = await this.redis.get(usedKey(token));
      if (family) await this.redis.del(familyKey(family));
      return null;
    }
    const data = JSON.parse(raw) as { userId: string; family: string };
    await this.redis.set(usedKey(token), data.family, 'EX', REFRESH_TTL_SECONDS);
    const alive = await this.redis.exists(familyKey(data.family));
    return alive ? data : null;
  }

  /** Chiqish yoki bloklash: foydalanuvchining barcha sessiyalari */
  async revokeUser(userId: string): Promise<void> {
    const families = await this.redis.smembers(userKey(userId));
    if (families.length > 0) await this.redis.del(...families.map(familyKey));
    await this.redis.del(userKey(userId));
  }
}
