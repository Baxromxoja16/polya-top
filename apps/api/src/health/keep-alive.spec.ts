import type { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../config/env.schema.js';
import { KeepAlive } from './keep-alive.js';

function configOf(values: Partial<Env>): ConfigService<Env, true> {
  return { get: (key: keyof Env) => values[key] } as unknown as ConfigService<Env, true>;
}

describe('KeepAlive', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('pings the public URL every N minutes', async () => {
    const keepAlive = new KeepAlive(
      configOf({ KEEP_ALIVE_MINUTES: 10, PUBLIC_URL: 'https://polya.onrender.com' }),
    );
    keepAlive.onApplicationBootstrap();

    await vi.advanceTimersByTimeAsync(9 * 60_000);
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://polya.onrender.com/health/ping');
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    keepAlive.onApplicationShutdown();
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does nothing when disabled or when there is no public URL', async () => {
    new KeepAlive(
      configOf({ KEEP_ALIVE_MINUTES: 0, PUBLIC_URL: 'https://x.onrender.com' }),
    ).onApplicationBootstrap();
    new KeepAlive(configOf({ KEEP_ALIVE_MINUTES: 10 })).onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never throws on network errors or non-2xx', async () => {
    const keepAlive = new KeepAlive(configOf({}));
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'));
    await expect(keepAlive.ping('https://x/health/ping')).resolves.toBe(false);
    fetchMock.mockResolvedValueOnce(new Response('', { status: 502 }));
    await expect(keepAlive.ping('https://x/health/ping')).resolves.toBe(false);
    await expect(keepAlive.ping('https://x/health/ping')).resolves.toBe(true);
  });
});
