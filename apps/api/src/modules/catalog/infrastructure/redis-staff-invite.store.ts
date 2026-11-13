import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS } from '../../../platform/redis/redis.module.js';
import { StaffInviteStore } from '../application/staff.service.js';

const TTL_SECONDS = 48 * 3600;
const key = (token: string) => `catalog:staff-invite:${token}`;

/** Taklif kodi: tasodifiy, bir martalik (GETDEL), 48 soat amal qiladi */
@Injectable()
export class RedisStaffInviteStore extends StaffInviteStore {
  constructor(@Inject(REDIS) private readonly redis: Redis) {
    super();
  }

  async create(venueId: string): Promise<string> {
    // Telegram /start payload: [A-Za-z0-9_-], ≤ 64 belgi
    const token = randomBytes(12).toString('base64url');
    await this.redis.set(key(token), venueId, 'EX', TTL_SECONDS);
    return token;
  }

  async consume(token: string): Promise<string | null> {
    if (!/^[\w-]{8,40}$/.test(token)) return null;
    return this.redis.getdel(key(token));
  }
}
