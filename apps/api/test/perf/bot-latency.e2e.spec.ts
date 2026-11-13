import { getConnectionToken } from '@nestjs/mongoose';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { localizedText, Money } from '@polya/shared-kernel';
import type { Connection } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RegisterVenueUseCase } from '../../src/modules/catalog/application/register-venue.use-case.js';
import { VenueManagementService } from '../../src/modules/catalog/application/venue-management.service.js';
import type { VenueId } from '../../src/modules/catalog/domain/venue.js';
import { GeographyAdminService } from '../../src/modules/geography/index.js';
import { OpeningHours } from '../../src/modules/scheduling/index.js';
import { createTestBot, TelegramUserSim } from '../support/telegram-sim.js';
import { createTestApp, type Infra, startInfra } from '../support/test-app.js';

const USERS = 40;
const ROUNDS = 5;

const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] as number;
};

/**
 * TZ 10 (7-bosqich mezoni): bot p95 < 1 s. Telegram tarmog'isiz — ilova ichidagi ishlov berish vaqti
 * (Mongo + Redis bilan). 40 ta foydalanuvchi parallel: menyu, qidiruv, kartochka, sozlamalar.
 */
describe('Bot latency under parallel load (e2e): p95 < 1 s', () => {
  let infra: Infra;
  let app: NestFastifyApplication;
  let sims: TelegramUserSim[];
  let venueId: string;

  beforeAll(async () => {
    infra = await startInfra();
    const test = createTestBot();
    app = await createTestApp(
      { MONGO_URI: infra.mongoUri, REDIS_URL: infra.redisUrl },
      { bot: test.bot },
    );
    const city = await app
      .get(GeographyAdminService)
      .createCity({ name: localizedText({ uz: 'Olmaliq', ru: 'Алмалык' }) });
    const db = app.get<Connection>(getConnectionToken());
    for (let i = 0; i < 10; i++) {
      const r = await app.get(RegisterVenueUseCase).execute({
        actor: {
          userId: 'b'.repeat(24),
          roles: ['OWNER'],
          phone: '+998901170001',
          cityId: city.id,
        },
        name: `Arena ${i + 1}`,
        landmarkText: `${i + 1}-maktab yonida, markaz`,
        hours: OpeningHours.of(8, 0),
        pricePerHour: Money.of(100_000 + i * 10_000),
      });
      if (!r.ok) throw new Error(r.error);
      venueId = r.value.venue.id;
      await app
        .get(VenueManagementService)
        .approve({ userId: 'x', roles: ['ADMIN'], phone: null, cityId: null }, venueId as VenueId);
    }
    sims = Array.from(
      { length: USERS },
      (_, i) => new TelegramUserSim(test.bot, test.calls, 9_500_000 + i),
    );
    await Promise.all(sims.map((s) => s.send('/start')));
    await db.collection('users').updateMany({}, { $set: { cityId: city.id } });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await Promise.all([infra?.mongo.stop(), infra?.redis.stop()]);
  });

  it('p95 of update handling stays under 1 second', async () => {
    const actions: ((s: TelegramUserSim) => Promise<unknown>)[] = [
      (s) => s.send('/start'),
      (s) => s.send('maktab'),
      (s) => s.press(`cat:c:${venueId}`),
      (s) => s.send('⚙️ Sozlamalar'),
      (s) => s.send('⭐ Sevimlilar'),
    ];
    const durations: number[] = [];
    for (let round = 0; round < ROUNDS; round++) {
      await Promise.all(
        sims.map(async (s, i) => {
          const action = actions[(i + round) % actions.length] as (typeof actions)[number];
          const t0 = performance.now();
          await action(s);
          durations.push(performance.now() - t0);
        }),
      );
    }
    const p50 = percentile(durations, 50);
    const p95 = percentile(durations, 95);
    console.info(
      `bot latency: n=${durations.length} p50=${p50.toFixed(0)}ms p95=${p95.toFixed(0)}ms`,
    );
    expect(durations).toHaveLength(USERS * ROUNDS);
    expect(p95).toBeLessThan(1_000);
  }, 120_000);
});
