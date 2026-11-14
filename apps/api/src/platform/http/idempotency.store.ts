import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS } from '../redis/redis.module.js';

/** Natija 24 soat saqlanadi — mijoz shu vaqt ichida bemalol qayta yuborishi mumkin */
export const IDEMPOTENCY_TTL_SECONDS = 24 * 3600;
/** Ishlov berish shu vaqtdan oshsa (jarayon yiqilgan) — kalit qayta bo'shaydi */
const PENDING_TTL_SECONDS = 60;

/** Saqlanadigan natija: muvaffaqiyat yoki BIZNES xatosi (5xx saqlanmaydi — qayta urinish mumkin) */
export type StoredOutcome =
  | { kind: 'ok'; status: number; body: unknown }
  | { kind: 'error'; status: number; code: string; message: string };

export type BeginResult =
  | { state: 'new' }
  | { state: 'replay'; outcome: StoredOutcome }
  | { state: 'in-progress' }
  /** Bir xil kalit boshqa so'rov tanasi bilan — mijoz xatosi */
  | { state: 'mismatch' };

interface Entry {
  fp: string;
  outcome?: StoredOutcome;
}

/**
 * TZ 7.7: `Idempotency-Key`. Kalit foydalanuvchi va amal bo'yicha ajratilgan (`scope`), so'rov
 * tanasining xeshi bilan bog'langan. Parallel bir xil so'rovlardan faqat bittasi bajariladi.
 */
@Injectable()
export class IdempotencyStore {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  static fingerprint(payload: unknown): string {
    return createHash('sha256').update(JSON.stringify(payload)).digest('base64url');
  }

  async begin(scope: string, key: string, fp: string): Promise<BeginResult> {
    const k = redisKey(scope, key);
    const claimed = await this.redis.set(
      k,
      JSON.stringify({ fp } satisfies Entry),
      'EX',
      PENDING_TTL_SECONDS,
      'NX',
    );
    if (claimed === 'OK') return { state: 'new' };
    const raw = await this.redis.get(k);
    // Oraliqda muddati tugadi — yana bir marta egallashga urinamiz
    if (!raw) return this.begin(scope, key, fp);
    const entry = JSON.parse(raw) as Entry;
    if (entry.fp !== fp) return { state: 'mismatch' };
    return entry.outcome ? { state: 'replay', outcome: entry.outcome } : { state: 'in-progress' };
  }

  async complete(scope: string, key: string, fp: string, outcome: StoredOutcome): Promise<void> {
    const entry: Entry = { fp, outcome };
    await this.redis.set(
      redisKey(scope, key),
      JSON.stringify(entry),
      'EX',
      IDEMPOTENCY_TTL_SECONDS,
    );
  }

  /** Kutilmagan xato — kalitni bo'shatamiz, mijoz qayta urina oladi */
  async abort(scope: string, key: string): Promise<void> {
    await this.redis.del(redisKey(scope, key));
  }
}

const redisKey = (scope: string, key: string) => `idem:${scope}:${key}`;
