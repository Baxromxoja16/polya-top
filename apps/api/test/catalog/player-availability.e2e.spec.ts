import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { addDays, localizedText, Money, zonedParts, zonedToUtc } from '@polya/shared-kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Actor } from '../../src/modules/catalog/application/actor.js';
import { RegisterVenueUseCase } from '../../src/modules/catalog/application/register-venue.use-case.js';
import { VenueManagementService } from '../../src/modules/catalog/application/venue-management.service.js';
import type { PitchId } from '../../src/modules/catalog/domain/pitch.js';
import type { VenueId } from '../../src/modules/catalog/domain/venue.js';
import { GeographyAdminService } from '../../src/modules/geography/index.js';
import { OpeningHours } from '../../src/modules/scheduling/index.js';
import { buttons, createTestBot, TelegramUserSim, texts } from '../support/telegram-sim.js';
import { createTestApp, type Infra, startInfra } from '../support/test-app.js';

const TZ = 'Asia/Tashkent';

describe('Player availability (e2e): TZ 5.2, VC-5b, VC-6, SP-8', () => {
  let infra: Infra;
  let app: NestFastifyApplication;
  let player: TelegramUserSim;
  let openPitch: string;
  let closedTomorrowPitch: string;
  let openVenue: string;
  const today = () => zonedParts(new Date(), TZ).date;
  const tomorrow = () => addDays(today(), 1);

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
    const owner: Actor = {
      userId: 'b'.repeat(24),
      roles: ['OWNER'],
      phone: '+998901112233',
      cityId: city.id,
    };
    const admin: Actor = { userId: 'a'.repeat(24), roles: ['ADMIN'], phone: null, cityId: null };
    const register = app.get(RegisterVenueUseCase);
    const manage = app.get(VenueManagementService);
    const make = async (name: string, price: number) => {
      const r = await register.execute({
        actor: owner,
        name,
        landmarkText: `${name} orientiri, markaz`,
        hours: OpeningHours.of(0, 0), // 24 soat — test vaqtidan qat'i nazar slotlar bor
        pricePerHour: Money.of(price),
      });
      if (!r.ok) throw new Error(r.error);
      await manage.approve(admin, r.value.venue.id as VenueId);
      return r.value;
    };
    const a = await make('Arzon Arena', 100_000);
    const b = await make('Qimmat Arena', 200_000);
    openPitch = a.pitch.id;
    openVenue = a.venue.id;
    closedTomorrowPitch = b.pitch.id;
    await manage.setPitchException(owner, b.pitch.id as PitchId, tomorrow(), null);

    player = new TelegramUserSim(test.bot, test.calls, 980_001);
    await player.send('/start');
  });

  afterAll(async () => {
    await app?.close();
    await Promise.all([infra?.mongo.stop(), infra?.redis.stop()]);
  });

  it('TZ 5.2: "Bo\'sh maydon topish" offers "now" and the next 7 days', async () => {
    const out = await player.send("⚽ Bo'sh maydon topish");
    expect(buttons(out)[0]).toBe('fs:now');
    expect(buttons(out)).toContain(`fs:d:${today()}`);
    expect(buttons(out).filter((b) => b?.startsWith('fs:d:'))).toHaveLength(7);
  });

  it('picking a day shows hour buttons including after-midnight hours (EC-S1)', async () => {
    const out = await player.press(`fs:d:${tomorrow()}`);
    expect(texts(out)[0]).toContain('Ertaga');
    expect(buttons(out)).toContain(`fs:t:${tomorrow()}:20`);
    expect(buttons(out)).toContain(`fs:t:${tomorrow()}:25`);
  });

  it('SP-2 + SP-8: results exclude a pitch closed that day; cheapest first; slot buttons for booking', async () => {
    const out = await player.press(`fs:t:${tomorrow()}:20`);
    const text = texts(out)[0] as string;
    expect(text).toContain("1. Arzon Arena · 1-maydon · 100 000 so'm/soat");
    expect(text).not.toContain('Qimmat Arena');
    const start = Math.floor(zonedToUtc(tomorrow(), 20, TZ).getTime() / 1000);
    expect(buttons(out)).toContain(`bk:t:${openPitch}:${start}`);
  });

  it('VC-5b: "Hozir bo\'sh" lists pitches free within 3 hours', async () => {
    const out = await player.press('fs:now');
    const text = texts(out)[0] as string;
    expect(text).toContain("⚡ Keyingi 3 soatda bo'sh maydonlar");
    expect(text).toContain('Arzon Arena');
  });

  it('VC-6: the card shows a free-time grid with hour buttons', async () => {
    const dates = await player.press(`cat:av:${openVenue}`);
    expect(buttons(dates)).toContain(`cat:avd:${openPitch}:${tomorrow()}`);
    const grid = await player.press(`cat:avd:${openPitch}:${tomorrow()}`);
    expect(texts(grid)[0]).toContain('⚽ 1-maydon · Ertaga');
    expect(texts(grid)[0]).toContain("💰 100 000 so'm/soat");
    const slotButtons = buttons(grid).filter((b) => b?.startsWith(`bk:t:${openPitch}:`));
    expect(slotButtons).toHaveLength(24);
  });

  it('a closed day shows an empty grid', async () => {
    const grid = await player.press(`cat:avd:${closedTomorrowPitch}:${tomorrow()}`);
    expect(texts(grid)[0]).toContain("bo'sh vaqt yo'q");
  });

  it('until Booking exists, a slot button explains booking is coming', async () => {
    const out = await player.press(`bk:t:${openPitch}:123`);
    expect(out[0]).toMatchObject({ method: 'answerCallbackQuery', payload: { show_alert: true } });
  });
});
