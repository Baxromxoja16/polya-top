import { Global, Module } from '@nestjs/common';
import { IdempotencyStore } from '../idempotency.store.js';
import { AccessTokens } from './access-tokens.js';
import { AuthGuard } from './auth.guard.js';
import { RefreshTokenStore } from './refresh-token.store.js';

/**
 * TZ ID-7, 7.7: Web/Mini App autentifikatsiyasi va `Idempotency-Key` —
 * barcha modullarning HTTP controller'lari uchun
 */
@Global()
@Module({
  providers: [AccessTokens, AuthGuard, RefreshTokenStore, IdempotencyStore],
  exports: [AccessTokens, AuthGuard, RefreshTokenStore, IdempotencyStore],
})
export class AuthModule {}
