import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS } from '../../redis/redis.module.js';

/** TZ ID-7: refresh token 30 kun */
export const REFRESH_TTL_SECONDS = 30 * 24 * 3600;

const digest = (token: string) => createHash('sha256').update(token).digest('base64url');
const tokenKey = (token: string) => `auth:rt:${digest(token)}`;
const usedKey = (token: string) => `auth:rt-used:${digest(token)}`;
const FAMILY_PREFIX = 'auth:rf:';
const familyKey = (family: string) => `${FAMILY_PREFIX}${family}`;
const userKey = (userId: string) => `auth:ru:${userId}`;

/**
 * Refresh token'lar: tasodifiy (opaque), Redis'da faqat SHA-256 xeshi saqlanadi.
 * Har ishlatilganda almashtiriladi (rotation). Ishlatilgan token qayta kelsa — o'g'irlangan deb
 * hisoblanadi va butun "oila" (bitta kirishdan chiqqan zanjir) bekor qilinadi (reuse detection).
 */
/**
 * Atomik iste'mol: token bir marta beriladi; ishlatilgan token qayta kelsa — oila o'chiriladi.
 * "used" belgisi GETDEL bilan BIR skriptda qo'yiladi, aks holda parallel qayta ishlatish sezilmaydi.
 * KEYS: token, used · ARGV: ttl, familyPrefix → [raw | false, alive 0/1]
 */
const CONSUME = `
local raw = redis.call('GETDEL', KEYS[1])
if not raw then
  local fam = redis.call('GET', KEYS[2])
  if fam then redis.call('DEL', ARGV[2] .. fam) end
  return {false, 0}
end
local fam = cjson.decode(raw).family
redis.call('SET', KEYS[2], fam, 'EX', ARGV[1])
return {raw, redis.call('EXISTS', ARGV[2] .. fam)}
`;

/** Rotatsiya: oila hali tirik bo'lsagina yangi token (bekor qilingan oila qayta tiklanmaydi). KEYS: family, token */
const ROTATE = `
if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
redis.call('SET', KEYS[2], ARGV[1], 'EX', ARGV[2])
redis.call('EXPIRE', KEYS[1], ARGV[2])
return 1
`;

@Injectable()
export class RefreshTokenStore {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  /** Yangi kirish — yangi oila */
  async issue(userId: string): Promise<string> {
    const family = randomBytes(12).toString('base64url');
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

  /** Token to'g'ri bo'lsa uni yo'q qiladi va egasini qaytaradi; yangisini `rotate()` beradi. */
  async consume(token: string): Promise<{ userId: string; family: string } | null> {
    const [raw, alive] = (await this.redis.eval(
      CONSUME,
      2,
      tokenKey(token),
      usedKey(token),
      REFRESH_TTL_SECONDS,
      FAMILY_PREFIX,
    )) as [string | null, number];
    if (!raw || alive !== 1) return null;
    return JSON.parse(raw) as { userId: string; family: string };
  }

  /** Shu oilada keyingi token; oila oraliqda bekor qilingan bo'lsa (logout, reuse) — `null` */
  async rotate(userId: string, family: string): Promise<string | null> {
    const token = randomBytes(32).toString('base64url');
    const ok = await this.redis.eval(
      ROTATE,
      2,
      familyKey(family),
      tokenKey(token),
      JSON.stringify({ userId, family }),
      REFRESH_TTL_SECONDS,
    );
    if (ok !== 1) return null;
    await this.redis.expire(userKey(userId), REFRESH_TTL_SECONDS);
    return token;
  }

  /** Chiqish yoki bloklash: foydalanuvchining barcha sessiyalari */
  async revokeUser(userId: string): Promise<void> {
    const families = await this.redis.smembers(userKey(userId));
    if (families.length > 0) await this.redis.del(...families.map(familyKey));
    await this.redis.del(userKey(userId));
  }
}
