import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { GeoPoint, localizedText, Money } from '@polya/shared-kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Actor } from '../../src/modules/catalog/application/actor.js';
import { RegisterVenueUseCase } from '../../src/modules/catalog/application/register-venue.use-case.js';
import { VenueManagementService } from '../../src/modules/catalog/application/venue-management.service.js';
import type { VenueId } from '../../src/modules/catalog/domain/venue.js';
import { type CityView, GeographyAdminService } from '../../src/modules/geography/index.js';
import { OpeningHours } from '../../src/modules/scheduling/index.js';
import {
  type ApiCall,
  buttons,
  createTestBot,
  TelegramUserSim,
  texts,
} from '../support/telegram-sim.js';
import { createTestApp, type Infra, startInfra } from '../support/test-app.js';

const C = { lat: 40.8447, lng: 69.5983 };
const at = (km: number) => GeoPoint.of(C.lat + km / 111, C.lng);

describe('Player search and venue card (e2e): TZ VC-4…VC-7, EC-O6, EC-O7', () => {
  let infra: Infra;
  let app: NestFastifyApplication;
  let calls: ApiCall[];
  let player: TelegramUserSim;
  let city: CityView;
  const admin: Actor = { userId: 'a'.repeat(24), roles: ['ADMIN'], phone: null, cityId: null };

  beforeAll(async () => {
    infra = await startInfra();
    const test = createTestBot();
    calls = test.calls;
    app = await createTestApp(
      { MONGO_URI: infra.mongoUri, REDIS_URL: infra.redisUrl },
      { bot: test.bot },
    );
    const geo = app.get(GeographyAdminService);
    city = await geo.createCity({ name: localizedText({ uz: 'Olmaliq', ru: 'Алмалык' }) });
    city = await geo.addDistrict(city.id, localizedText({ uz: 'Markaz', ru: 'Центр' }));
    for (const [uz, ru] of [
      ['Markaziy bozor', 'Центральный рынок'],
      ['Dehqon bozori', 'Дехканский рынок'],
    ]) {
      await geo.addLandmark({
        cityId: city.id,
        name: localizedText({ uz: uz as string, ru: ru as string }),
        synonyms: ['bozor'],
        location: at(2),
      });
    }

    const owner: Actor = {
      userId: 'b'.repeat(24),
      roles: ['OWNER'],
      phone: '+998901112233',
      cityId: city.id,
    };
    const register = app.get(RegisterVenueUseCase);
    const manage = app.get(VenueManagementService);
    const make = async (name: string, landmarkText: string, km: number | null, approve = true) => {
      const r = await register.execute({
        actor: owner,
        name,
        landmarkText,
        hours: OpeningHours.of(8, 0),
        pricePerHour: Money.of(150_000),
      });
      if (!r.ok) throw new Error(r.error);
      const id = r.value.venue.id as VenueId;
      if (km !== null) await manage.edit(owner, id, { kind: 'location', value: at(km) });
      await manage.edit(owner, id, { kind: 'district', value: city.districts[0]?.id ?? null });
      if (approve) await manage.approve(admin, id);
    };
    await make('Olmaliq Arena', '5-mikrorayon, 21-maktab orqasida', 1);
    await make('Metallurg', "Stadion ko'chasi, zavod yonida", 6);
    await make('Hidden Pending', 'Tasdiqlanmagan stadion joyi', 0.5, false);

    player = new TelegramUserSim(test.bot, calls, 960_001);
    await player.send('/start');
  });

  afterAll(async () => {
    await app?.close();
    await Promise.all([infra?.mongo.stop(), infra?.redis.stop()]);
  });

  it('VC-4a: free text finds a venue by landmark words', async () => {
    const out = await player.send('21maktab');
    expect(texts(out)[0]).toContain("🔎 «21maktab» bo'yicha");
    expect(texts(out)[0]).toContain("1. Olmaliq Arena · 150 000 so'm dan");
    expect(buttons(out)[0]).toMatch(/^cat:c:[0-9a-f]{24}$/);
  });

  it('EC-O6: nothing found explains how to search', async () => {
    expect(texts(await player.send('zzzqqq'))[0]).toContain('😕 Hech narsa topilmadi');
  });

  it('EC-O7: an ambiguous landmark asks which one', async () => {
    const out = await player.send('bozor');
    expect(texts(out)).toEqual(['Qaysi joyni nazarda tutdingiz?']);
    const chosen = await player.press(buttons(out)[0] as string);
    expect(texts(chosen)[0]).toContain('yaqinidagi stadionlar');
    expect(texts(chosen)[0]).toContain('Olmaliq Arena');
    expect(texts(chosen)[0]).not.toContain('Metallurg');
  });

  it('VC-4 (a): nearby search with location — sorted by distance, pending excluded', async () => {
    const asked = await player.send('📍 Yaqin atrofdagi stadionlar');
    expect(texts(asked)[0]).toContain('Lokatsiyangizni yuboring');
    const out = await player.sendLocation(C.lat, C.lng);
    const list = texts(out).find((t) => t.startsWith('🔎')) as string;
    expect(list).toContain('Yaqin atrofdagi stadionlar');
    expect(list.indexOf('Olmaliq Arena')).toBeLessThan(list.indexOf('Metallurg'));
    expect(list).toMatch(/Olmaliq Arena · 1\.0 km/);
    expect(list).not.toContain('Hidden Pending');
  });

  it('VC-4 (b): district search', async () => {
    const pick = await player.send("🏘 Hudud bo'yicha");
    const district = buttons(pick).find((b) => b?.startsWith('cat:sd:')) as string;
    const out = await player.press(district);
    expect(texts(out)[0]).toContain('Markaz hududidagi stadionlar');
  });

  it('VC-7: card shows landmark, phone, pitch hours and price, with a location button', async () => {
    const list = await player.send('Olmaliq Arena');
    const out = await player.press(buttons(list)[0] as string);
    const card = texts(out)[0] as string;
    expect(card).toContain('🏟 Olmaliq Arena');
    expect(card).toContain('📞 Telefon: +998 90 111 22 33');
    expect(card).toContain("⚽ 1-maydon\n   🕒 08:00–00:00 · 💰 150 000 so'm/soat");
    const loc = await player.press(buttons(out).find((b) => b?.startsWith('cat:loc:')) as string);
    expect(loc.find((c) => c.method === 'sendVenue')?.payload).toMatchObject({
      title: 'Olmaliq Arena',
    });
  });

  it('TZ 5.4: deep link opens the card directly', async () => {
    const out = await player.send('/start v_olmaliq-arena');
    expect(texts(out)[0]).toContain('🏟 Olmaliq Arena');
  });

  it('VC-1: a pending venue is not available via deep link to players', async () => {
    const out = await player.send('/start v_hidden-pending');
    expect(texts(out)[0]).toBe('Bu stadion hozir mavjud emas.');
  });

  it('VC-8: add to favorites from the card, list them, remove again', async () => {
    const list = await player.send('Olmaliq Arena');
    const card = await player.press(buttons(list)[0] as string);
    const fav = buttons(card).find((b) => b?.startsWith('cat:fav:')) as string;

    const added = await player.press(fav);
    expect(added[0]).toMatchObject({
      method: 'answerCallbackQuery',
      payload: { text: "⭐ Sevimlilarga qo'shildi" },
    });
    await player.press(fav.replace('cat:fav:', 'cat:fav:')); // ikkinchi bosish — olib tashlaydi
    await player.press(fav); // yana qo'shadi

    const favorites = await player.send('⭐ Sevimlilar');
    expect(texts(favorites)[0]).toContain('⭐ Sevimli stadionlar');
    expect(texts(favorites)[0]).toContain('1. Olmaliq Arena');

    await player.press(fav);
    expect(texts(await player.send('⭐ Sevimlilar'))[0]).toContain("ro'yxati bo'sh");
  });
});
