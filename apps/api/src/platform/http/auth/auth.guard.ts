import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { AccessTokens } from './access-tokens.js';

/** Tekshirilgan access token egasi — controller'larga `@Auth()` orqali beriladi */
export interface AuthPrincipal {
  userId: string;
  telegramId: number;
}

type AuthedRequest = FastifyRequest & { principal?: AuthPrincipal };

/**
 * `Authorization: Bearer <access token>`. Xatolar 401 Problem Details:
 * `UNAUTHORIZED` (yo'q/noto'g'ri) yoki `TOKEN_EXPIRED` (frontend refresh qiladi).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly tokens: AccessTokens) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const header = request.headers.authorization;
    const match = typeof header === 'string' ? /^Bearer +([\w.-]+) *$/i.exec(header) : null;
    if (!match?.[1]) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Bearer token required' });
    }
    const result = this.tokens.verify(match[1]);
    if (!result.ok) {
      throw result.error === 'EXPIRED'
        ? new UnauthorizedException({ code: 'TOKEN_EXPIRED', message: 'Access token expired' })
        : new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Invalid access token' });
    }
    request.principal = { userId: result.claims.sub, telegramId: result.claims.tid };
    return true;
  }
}

/** `@UseGuards(AuthGuard)` bilan birga: `me(@Auth() auth: AuthPrincipal)` */
export const Auth = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthPrincipal => {
  const principal = ctx.switchToHttp().getRequest<AuthedRequest>().principal;
  if (!principal) throw new UnauthorizedException();
  return principal;
});
