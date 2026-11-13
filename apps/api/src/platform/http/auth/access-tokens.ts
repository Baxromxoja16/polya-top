import { randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Clock } from '@polya/shared-kernel';
import type { Env } from '../../../config/env.schema.js';
import { type AccessClaims, type JwtError, signJwt, verifyJwt } from './jwt.js';

/** TZ ID-7: access token 15 daqiqa */
export const ACCESS_TTL_SECONDS = 15 * 60;

@Injectable()
export class AccessTokens {
  readonly #secret: string;

  constructor(
    config: ConfigService<Env, true>,
    private readonly clock: Clock,
  ) {
    const secret = config.get('JWT_SECRET', { infer: true });
    if (!secret) {
      // Faqat lokal/test (produksiyada env sxemasi talab qiladi): qayta ishga tushganda tokenlar bekor
      new Logger(AccessTokens.name).warn('JWT_SECRET is not set — using an ephemeral key');
    }
    this.#secret = secret ?? randomBytes(48).toString('base64url');
  }

  sign(userId: string, telegramId: number): string {
    return signJwt(
      { sub: userId, tid: telegramId },
      this.#secret,
      this.clock.now(),
      ACCESS_TTL_SECONDS,
    );
  }

  verify(token: string): { ok: true; claims: AccessClaims } | { ok: false; error: JwtError } {
    return verifyJwt(token, this.#secret, this.clock.now());
  }
}
