import { createHmac, timingSafeEqual } from 'node:crypto';

/** Telegram WebApp `initData.user` maydonining bizga kerakli qismi */
export interface InitDataUser {
  id: number;
  firstName: string;
  lastName: string | null;
  username: string | null;
  languageCode: string | null;
}

export type InitDataError = 'MALFORMED' | 'BAD_SIGNATURE' | 'EXPIRED';

export type InitDataResult =
  | { ok: true; user: InitDataUser; authDate: Date }
  | { ok: false; error: InitDataError };

/** TZ ID-7: initData qancha vaqt amal qiladi (replay'dan himoya) */
export const INIT_DATA_MAX_AGE_SECONDS = 24 * 60 * 60;

/**
 * Telegram WebApp `initData` imzosini tekshiradi
 * (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app):
 *   secret = HMAC_SHA256(key = "WebAppData", data = botToken)
 *   hash   = hex(HMAC_SHA256(key = secret, data = data_check_string))
 * `data_check_string` — `hash` dan boshqa barcha juftliklar, kalit bo'yicha saralangan, `\n` bilan.
 */
export function verifyInitData(
  raw: string,
  botToken: string,
  now: Date,
  maxAgeSeconds = INIT_DATA_MAX_AGE_SECONDS,
): InitDataResult {
  if (raw.length === 0 || raw.length > 8192) return { ok: false, error: 'MALFORMED' };
  const params = new URLSearchParams(raw);
  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return { ok: false, error: 'MALFORMED' };
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(dataCheckString).digest();
  if (!timingSafeEqual(expected, Buffer.from(hash, 'hex'))) {
    return { ok: false, error: 'BAD_SIGNATURE' };
  }

  const authDateSec = Number(params.get('auth_date'));
  if (!Number.isInteger(authDateSec) || authDateSec <= 0) return { ok: false, error: 'MALFORMED' };
  const authDate = new Date(authDateSec * 1000);
  const ageSeconds = (now.getTime() - authDate.getTime()) / 1000;
  // Soatlar biroz farq qilishi mumkin — kelajakdagi 60 soniyagacha ruxsat
  if (ageSeconds > maxAgeSeconds || ageSeconds < -60) return { ok: false, error: 'EXPIRED' };

  const user = parseUser(params.get('user'));
  return user ? { ok: true, user, authDate } : { ok: false, error: 'MALFORMED' };
}

function parseUser(json: string | null): InitDataUser | null {
  if (!json) return null;
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const u = value as Record<string, unknown>;
  if (!Number.isSafeInteger(u.id) || (u.id as number) <= 0 || typeof u.first_name !== 'string') {
    return null;
  }
  const str = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : null);
  return {
    id: u.id as number,
    firstName: u.first_name,
    lastName: str(u.last_name),
    username: str(u.username),
    languageCode: str(u.language_code),
  };
}

/** Testlar va lokal ishlab chiqish uchun: imzolangan initData yasaydi */
export function signInitData(fields: Record<string, string>, botToken: string): string {
  const params = new URLSearchParams(fields);
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  params.set('hash', createHmac('sha256', secret).update(dataCheckString).digest('hex'));
  return params.toString();
}
