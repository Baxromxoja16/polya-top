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
});
