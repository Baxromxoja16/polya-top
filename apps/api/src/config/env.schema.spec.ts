import { describe, expect, it } from 'vitest';
import { InvalidEnvironmentError, validateEnv } from './env.schema.js';

const valid = {
  MONGO_URI: 'mongodb://localhost:27017/polya?directConnection=true',
  REDIS_URL: 'redis://localhost:6379',
};

describe('validateEnv', () => {
  it('applies defaults and coerces numbers', () => {
    const env = validateEnv({ ...valid, PORT: '8080' });
    expect(env).toMatchObject({ NODE_ENV: 'development', PORT: 8080, LOG_LEVEL: 'info' });
  });

  it('fails fast when required variables are missing', () => {
    expect(() => validateEnv({})).toThrow(InvalidEnvironmentError);
    expect(() => validateEnv({})).toThrow(/MONGO_URI/);
  });

  it('rejects wrong URI schemes', () => {
    expect(() => validateEnv({ ...valid, MONGO_URI: 'postgres://x' })).toThrow(/MONGO_URI/);
    expect(() => validateEnv({ ...valid, REDIS_URL: 'http://x' })).toThrow(/REDIS_URL/);
  });

  it('rejects out-of-range port', () => {
    expect(() => validateEnv({ ...valid, PORT: '70000' })).toThrow(/PORT/);
  });

  describe('Telegram', () => {
    const token = '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw1';

    it('bot is off by default and needs no token', () => {
      expect(validateEnv(valid).TELEGRAM_MODE).toBe('off');
    });

    it('polling requires a token', () => {
      expect(() => validateEnv({ ...valid, TELEGRAM_MODE: 'polling' })).toThrow(
        /TELEGRAM_BOT_TOKEN/,
      );
      expect(
        validateEnv({ ...valid, TELEGRAM_MODE: 'polling', TELEGRAM_BOT_TOKEN: token }),
      ).toMatchObject({
        TELEGRAM_MODE: 'polling',
      });
    });

    it('webhook requires secret and https PUBLIC_URL', () => {
      const base = { ...valid, TELEGRAM_MODE: 'webhook', TELEGRAM_BOT_TOKEN: token };
      expect(() => validateEnv(base)).toThrow(/TELEGRAM_WEBHOOK_SECRET[\s\S]*PUBLIC_URL/);
      expect(() =>
        validateEnv({
          ...base,
          TELEGRAM_WEBHOOK_SECRET: 's'.repeat(32),
          PUBLIC_URL: 'http://x.uz',
        }),
      ).toThrow(/PUBLIC_URL/);
      expect(
        validateEnv({
          ...base,
          TELEGRAM_WEBHOOK_SECRET: 's'.repeat(32),
          PUBLIC_URL: 'https://x.uz',
        }),
      ).toMatchObject({ TELEGRAM_MODE: 'webhook' });
    });

    it('rejects malformed token and short secret', () => {
      expect(() => validateEnv({ ...valid, TELEGRAM_BOT_TOKEN: 'abc' })).toThrow(
        /TELEGRAM_BOT_TOKEN/,
      );
      expect(() => validateEnv({ ...valid, TELEGRAM_WEBHOOK_SECRET: 'short' })).toThrow(
        /TELEGRAM_WEBHOOK_SECRET/,
      );
    });
  });
});
