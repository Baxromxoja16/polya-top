import { getConnectionToken } from '@nestjs/mongoose';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FixedClock, localizedText, Money } from '@polya/shared-kernel';
import type { Connection } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RegisterVenueUseCase } from '../../src/modules/catalog/application/register-venue.use-case.js';
import { VenueManagementService } from '../../src/modules/catalog/application/venue-management.service.js';
import type { VenueId } from '../../src/modules/catalog/domain/venue.js';
import { PremiumReminder } from '../../src/modules/catalog/index.js';
import { GeographyAdminService } from '../../src/modules/geography/index.js';
import { OpeningHours } from '../../src/modules/scheduling/index.js';
import { type ApiCall, createTestBot, TelegramUserSim } from '../support/telegram-sim.js';
import { createTestApp, type Infra, startInfra } from '../support/test-app.js';

const OWNER = 1_300_001;
const DAY = 86_400_000;
const START = new Date('2026-11-12T07:00:00Z');
const at = (days: number) => new Date(START.getTime() + days * DAY);

describe('PREMIUM expiry reminders (e2e): TZ 4.9', () => {
  let infra: Infra;
  let app: NestFastifyApplication;
  let calls: ApiCall[];
  let reminder: PremiumReminder;
  const clock = new FixedClock(START);
  const toOwner = () =>
    calls
      .filter((c) => c.method === 'sendMessage' && c.payload.chat_id === OWNER)
      .map((c) => String(c.payload.text));

  beforeAll(async () => {
    infra = await startInfra();
    const test = createTestBot();
    calls = test.calls;
    app = await createTestApp(
      { MONGO_URI: infra.mongoUri, REDIS_URL: infra.redisUrl },
      { bot: test.bot, clock },
    );
    reminder = app.get(PremiumReminder);
    const db = app.get<Connection>(getConnectionToken());
    const city = await app
      .get(GeographyAdminService)
      .createCity({ name: localizedText({ uz: 'Olmaliq', ru: 'Алмалык' }) });
    await new TelegramUserSim(test.bot, calls, OWNER).send('/start');
    const ownerId = String((await db.collection('users').findOne({ telegramId: OWNER }))?._id);
    const r = await app.get(RegisterVenueUseCase).execute({
      actor: { userId: ownerId, roles: ['OWNER'], phone: '+998901140001', cityId: city.id },
      name: 'Arena',
      landmarkText: 'Markaz, bozor yonida',
      hours: OpeningHours.of(8, 0),
      pricePerHour: Money.of(150_000),
    });
    if (!r.ok) throw new Error(r.error);
    // Tasdiq — "Asoschi hamkor" 90 kunlik PREMIUM
    await app
      .get(VenueManagementService)
      .approve(
        { userId: 'x', roles: ['ADMIN'], phone: null, cityId: null },
        r.value.venue.id as VenueId,
      );
  });

  afterAll(async () => {
    await app?.close();
    await Promise.all([infra?.mongo.stop(), infra?.redis.stop()]);
  });

  it('nothing while more than 7 days remain', async () => {
    clock.set(at(80));
    expect(await reminder.run()).toBe(0);
  });

  it('7 days before the end — once', async () => {
    clock.set(at(83.5));
    calls.length = 0;
    expect(await reminder.run()).toBe(1);
    expect(toOwner()[0]).toContain('⏳ «Arena»: PREMIUM 7 kundan keyin tugaydi');
    expect(await reminder.run()).toBe(0);
  });

  it('1 day before the end — once', async () => {
    clock.set(at(89.5));
    calls.length = 0;
    expect(await reminder.run()).toBe(1);
    expect(toOwner()[0]).toContain('PREMIUM ertaga tugaydi');
    expect(await reminder.run()).toBe(0);
  });

  it('after the end — nothing', async () => {
    clock.set(at(91));
    expect(await reminder.run()).toBe(0);
  });
});
