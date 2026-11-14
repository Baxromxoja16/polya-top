import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type Me,
  type RefreshRequest,
  refreshRequestSchema,
  type TelegramAuthRequest,
  type TokenPair,
  telegramAuthRequestSchema,
} from '@polya/contracts';
import { Clock } from '@polya/shared-kernel';
import type { Env } from '../../../../config/env.schema.js';
import { ACCESS_TTL_SECONDS, AccessTokens } from '../../../../platform/http/auth/access-tokens.js';
import { Auth, AuthGuard, type AuthPrincipal } from '../../../../platform/http/auth/auth.guard.js';
import { RefreshTokenStore } from '../../../../platform/http/auth/refresh-token.store.js';
import { verifyInitData } from '../../../../platform/http/auth/telegram-init-data.js';
import { ZodValidationPipe } from '../../../../platform/http/zod-validation.pipe.js';
import { UserNotFoundError } from '../../application/errors.js';
import { AccountBlockedError, WebSessionUseCase } from '../../application/web-session.use-case.js';
import type { User } from '../../domain/user.js';

/** TZ ID-7: Telegram Mini App / web-app uchun kirish */
@Controller()
export class AuthController {
  constructor(
    private readonly sessions: WebSessionUseCase,
    private readonly accessTokens: AccessTokens,
    private readonly refreshTokens: RefreshTokenStore,
    private readonly config: ConfigService<Env, true>,
    private readonly clock: Clock,
  ) {}

  @Post('auth/telegram')
  @HttpCode(200)
  async telegram(
    @Body(new ZodValidationPipe(telegramAuthRequestSchema)) body: TelegramAuthRequest,
  ): Promise<TokenPair> {
    const botToken = this.config.get('TELEGRAM_BOT_TOKEN', { infer: true });
    if (!botToken) {
      throw new ServiceUnavailableException({
        code: 'AUTH_UNAVAILABLE',
        message: 'Telegram auth is not configured',
      });
    }
    const verified = verifyInitData(body.initData, botToken, this.clock.now());
    if (!verified.ok) {
      throw new UnauthorizedException({
        code: verified.error === 'EXPIRED' ? 'INIT_DATA_EXPIRED' : 'INIT_DATA_INVALID',
        message: 'Telegram initData rejected',
      });
    }
    const { user: tg } = verified;
    const user = await guard(() =>
      this.sessions.login({
        telegramId: tg.id,
        profile: { firstName: tg.firstName, lastName: tg.lastName, username: tg.username },
        locale: tg.languageCode,
      }),
    );
    return this.issue(user, await this.refreshTokens.issue(user.id));
  }

  @Post('auth/refresh')
  @HttpCode(200)
  async refresh(
    @Body(new ZodValidationPipe(refreshRequestSchema)) body: RefreshRequest,
  ): Promise<TokenPair> {
    const owner = await this.refreshTokens.consume(body.refreshToken);
    if (!owner) {
      throw new UnauthorizedException({
        code: 'REFRESH_INVALID',
        message: 'Refresh token is invalid',
      });
    }
    const user = await guard(() => this.sessions.activeUser(owner.userId));
    const next = await this.refreshTokens.rotate(user.id, owner.family);
    if (!next) {
      throw new UnauthorizedException({ code: 'REFRESH_INVALID', message: 'Session was revoked' });
    }
    return this.issue(user, next);
  }

  /** Barcha qurilmalardan chiqish */
  @Post('auth/logout')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  async logout(@Auth() auth: AuthPrincipal): Promise<void> {
    await this.refreshTokens.revokeUser(auth.userId);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async me(@Auth() auth: AuthPrincipal): Promise<Me> {
    return toMe(await guard(() => this.sessions.activeUser(auth.userId)));
  }

  private issue(user: User, refreshToken: string): TokenPair {
    return {
      accessToken: this.accessTokens.sign(user.id, user.telegramId),
      expiresIn: ACCESS_TTL_SECONDS,
      refreshToken,
      tokenType: 'Bearer',
    };
  }
}

/** Sessiya xatolari 401/403 — 422 emas (frontend qayta kirishga yo'naltiradi) */
async function guard(run: () => Promise<User>): Promise<User> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof AccountBlockedError) {
      throw new ForbiddenException({ code: error.code, message: error.message });
    }
    if (error instanceof UserNotFoundError) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'User no longer exists' });
    }
    throw error;
  }
}

function toMe(user: User): Me {
  return {
    id: user.id,
    telegramId: user.telegramId,
    displayName: user.displayName,
    phone: user.phone?.value ?? null,
    language: user.language,
    roles: [...user.roles],
    cityId: user.cityId,
  };
}
