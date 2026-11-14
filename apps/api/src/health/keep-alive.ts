import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema.js';

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Render free tarifi 15 daqiqa kiruvchi HTTP trafik bo'lmasa servisni uxlatadi — shunda
 * bandlov sweep'i, marketing va BullMQ worker ham to'xtaydi. Servis o'zini TASHQI URL orqali
 * (`PUBLIC_URL`, Render proksisi orqali — ichki localhost hisoblanmaydi) `KEEP_ALIVE_MINUTES`
 * oralig'ida chaqirib turadi. 0 — o'chiq.
 */
@Injectable()
export class KeepAlive implements OnApplicationBootstrap, OnApplicationShutdown {
  readonly #logger = new Logger(KeepAlive.name);
  #timer: NodeJS.Timeout | null = null;

  constructor(private readonly config: ConfigService<Env, true>) {}

  onApplicationBootstrap(): void {
    const minutes = this.config.get('KEEP_ALIVE_MINUTES', { infer: true });
    if (minutes === 0) return;
    const base = this.config.get('PUBLIC_URL', { infer: true });
    if (!base) {
      this.#logger.warn('KEEP_ALIVE_MINUTES is set but PUBLIC_URL is empty — keep-alive disabled');
      return;
    }
    const url = new URL('/health/ping', base).toString();
    this.#timer = setInterval(() => void this.ping(url), minutes * 60_000);
    this.#timer.unref();
    this.#logger.log(`Keep-alive: ${url} every ${minutes} min`);
  }

  onApplicationShutdown(): void {
    if (this.#timer) clearInterval(this.#timer);
  }

  /** Xato hech qachon tashlanmaydi — keyingi urinish navbatdagi intervalda. */
  async ping(url: string): Promise<boolean> {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { 'user-agent': 'polya-keep-alive' },
      });
      if (!res.ok) this.#logger.warn(`Keep-alive ping → HTTP ${res.status}`);
      return res.ok;
    } catch (error) {
      this.#logger.warn({ err: error }, 'Keep-alive ping failed');
      return false;
    }
  }
}
