import { createHmac, timingSafeEqual } from 'node:crypto';

/** Access token ichidagi da'volar (claims) */
export interface AccessClaims {
  /** Foydalanuvchi ID (UserId) */
  sub: string;
  /** Telegram ID — log va diagnostika uchun */
  tid: number;
  iat: number;
  exp: number;
}

export type JwtError = 'MALFORMED' | 'BAD_SIGNATURE' | 'EXPIRED';

const HEADER = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));

/**
 * Minimal HS256 JWT (faqat o'zimiz chiqaramiz va o'zimiz tekshiramiz). Tashqi kutubxona kerak emas:
 * algoritm qat'iy belgilangan (`alg: none` / RS↔HS almashtirish hujumlari yo'q).
 */
export function signJwt(
  claims: Omit<AccessClaims, 'iat' | 'exp'>,
  secret: string,
  now: Date,
  ttlSeconds: number,
): string {
  const iat = Math.floor(now.getTime() / 1000);
  const payload = base64url(JSON.stringify({ ...claims, iat, exp: iat + ttlSeconds }));
  return `${HEADER}.${payload}.${sign(`${HEADER}.${payload}`, secret)}`;
}

export function verifyJwt(
  token: string,
  secret: string,
  now: Date,
): { ok: true; claims: AccessClaims } | { ok: false; error: JwtError } {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== HEADER) return { ok: false, error: 'MALFORMED' };
  const [header, payload, signature] = parts as [string, string, string];
  const expected = Buffer.from(sign(`${header}.${payload}`, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ok: false, error: 'BAD_SIGNATURE' };
  }
  let claims: AccessClaims;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as AccessClaims;
  } catch {
    return { ok: false, error: 'MALFORMED' };
  }
  if (
    typeof claims.sub !== 'string' ||
    !Number.isSafeInteger(claims.tid) ||
    !Number.isSafeInteger(claims.exp)
  ) {
    return { ok: false, error: 'MALFORMED' };
  }
  if (claims.exp <= Math.floor(now.getTime() / 1000)) return { ok: false, error: 'EXPIRED' };
  return { ok: true, claims };
}

function sign(input: string, secret: string): string {
  return createHmac('sha256', secret).update(input).digest('base64url');
}

function base64url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}
