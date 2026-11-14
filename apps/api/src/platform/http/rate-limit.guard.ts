import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Redis } from 'ioredis';
import type { Env } from '../../config/env.schema.js';
import { REDIS } from '../redis/redis.module.js';
import { AccessTokens } from './auth/access-tokens.js';

/** Anonim so'rovlar IP bo'yicha: mobil operatorlarda ko'p abonent bitta IP ortida (CGNAT) */
export const ANONYMOUS_MULTIPLIER = 5;
const EXEMPT = [/^\/health/, /^\/api\/v1\/telegram\//];

/**
 * TZ 6 (Xavfsizlik), EC-D4: REST uchun daqiqalik limit. Imzosi to'g'ri access token bo'lsa —
 * foydalanuvchi bo'yicha (token'ni almashtirib chetlab bo'lmaydi), aks holda — IP bo'yicha.
 * Oshganda 429 + `Retry-After`.
 */
@Injectable()
export class HttpRateLimitGuard implements CanActivate {
  readonly #perMinute: number;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly tokens: AccessTokens,
    config: ConfigService<Env, true>,
  ) {
    this.#perMinute = config.get('HTTP_RATE_LIMIT_PER_MINUTE', { infer: true });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.#perMinute <= 0 || context.getType() !== 'http') return true;
    const http = context.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    if (EXEMPT.some((re) => re.test(request.url))) return true;

    const userId = this.userOf(request);
    const subject = userId ? `u:${userId}` : `ip:${request.ip}`;
    const limit = userId ? this.#perMinute : this.#perMinute * ANONYMOUS_MULTIPLIER;
    const window = Math.floor(Date.now() / 60_000);
    const key = `http:rate:${subject}:${window}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, 70);
    if (count <= limit) return true;

    const retryAfter = 60 - Math.floor((Date.now() / 1000) % 60);
    void http.getResponse<FastifyReply>().header('retry-after', String(retryAfter));
    throw new HttpException(
      { code: 'RATE_LIMITED', message: 'Too many requests, slow down', retryAfter },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private userOf(request: FastifyRequest): string | null {
    const header = request.headers.authorization;
    const match = typeof header === 'string' ? /^Bearer +([\w.-]+) *$/i.exec(header) : null;
    if (!match?.[1]) return null;
    const result = this.tokens.verify(match[1]);
    return result.ok ? result.claims.sub : null;
  }
}
