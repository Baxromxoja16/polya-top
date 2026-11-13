import { Global, Module } from '@nestjs/common';
import { AccessTokens } from './access-tokens.js';
import { AuthGuard } from './auth.guard.js';
import { RefreshTokenStore } from './refresh-token.store.js';

/** TZ ID-7: Web/Mini App autentifikatsiyasi — barcha modullarning HTTP controller'lari uchun */
@Global()
@Module({
  providers: [AccessTokens, AuthGuard, RefreshTokenStore],
  exports: [AccessTokens, AuthGuard, RefreshTokenStore],
})
export class AuthModule {}
