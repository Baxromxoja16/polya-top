import { Injectable } from '@nestjs/common';
import { DomainError, GeoPoint, localizedText } from '@polya/shared-kernel';
import { type Composer, InlineKeyboard } from 'grammy';
import type { BotContext } from '../../../../platform/telegram/bot-context.js';
import {
  type BotFeature,
  FeatureOrder,
  TelegramFeature,
} from '../../../../platform/telegram/bot-feature.js';
import { isAdmin, splitFirstWord, splitPipe } from '../../../../platform/telegram/guards.js';
import {
  type CityView,
  GeographyAdminService,
  GeographyQueries,
} from '../../application/geography.service.js';
import type { CityId } from '../../domain/city.js';

const AWAIT_CENTER = 'geo.city.center';
const AWAIT_LANDMARK = 'geo.landmark.location';

const HELP = [
  '🛠 Admin: geografiya',
  '',
  "/cities — shaharlar ro'yxati",
  '/addcity Olmaliq | Алмалык',
  '/adddistrict olmaliq 5-mikrorayon | 5-микрорайон',
  '/setcenter olmaliq — keyin lokatsiya yuboring',
  '/addlandmark olmaliq Markaziy bozor | Центральный рынок | bozor, rynok',
  '/landmarks olmaliq',
  '',
  '/pending — tasdiqlanmagan stadionlar',
  '/premium <slug> [kun] — obuna holati / PREMIUM uzaytirish',
  '/reviews — shikoyat qilingan sharhlar',
  '/stats — statistika',
  '/blockuser <ID yoki +998…> | sabab · /unblockuser',
  '/blockvenue <slug> | sabab · /unblockvenue',
  "/transfervenue <slug> | <yangi egasi> — egalikni o'tkazish",
].join('\n');

/**
 * TZ CT-1…CT-3, VC-4b: shahar, hudud va orientirlarni faqat Admin boshqaradi.
 * Admin bo'lmagan foydalanuvchi uchun bu buyruqlar mavjud emas (fallback'ga tushadi).
 */
@Injectable()
@TelegramFeature(FeatureOrder.MODULE)
export class GeographyAdminBotFeature implements BotFeature {
  constructor(
    private readonly admin: GeographyAdminService,
    private readonly queries: GeographyQueries,
  ) {}

  register(bot: Composer<BotContext>): void {
    const admin = bot.filter(isAdmin);

    admin.command('admin', (ctx) => ctx.reply(HELP));

    admin.command('cities', async (ctx) => {
      const cities = await this.queries.listCities();
      if (cities.length === 0)
        return void (await ctx.reply("Shaharlar yo'q. /addcity bilan qo'shing."));
      const kb = new InlineKeyboard();
      for (const c of cities)
        kb.text(`${c.isActive ? '⏸' : '▶️'} ${c.slug}`, `geo:toggle:${c.id}`).row();
      await ctx.reply(cities.map(describeCity).join('\n\n'), { reply_markup: kb });
    });

    admin.callbackQuery(/^geo:toggle:([0-9a-f]{24})$/, async (ctx) => {
      const id = ctx.match[1] as CityId;
      const city = await this.queries.getCity(id);
      if (!city) return void (await ctx.answerCallbackQuery({ text: 'Topilmadi' }));
      await ctx.answerCallbackQuery();
      if (city.isActive) {
        // EC-C2: nofaol qilishdan oldin ogohlantirish
        return void (await ctx.reply(
          `⚠️ «${city.name.uz}» nofaol qilinsa:\n` +
            "• qidiruv va yangi stadion qo'shish to'xtaydi;\n" +
            "• mavjud stadionlar va bandlovlar o'z kuchida qoladi;\n" +
            "• shaharni tanlash ro'yxatidan yo'qoladi.\n\nDavom etasizmi?",
          {
            reply_markup: new InlineKeyboard()
              .text('⏸ Ha, nofaol qilish', `geo:off:${id}`)
              .text('Bekor', 'geo:cancel'),
          },
        ));
      }
      await ctx.reply(describeCity(await this.admin.setCityActive(id, true)));
    });

    admin.callbackQuery(/^geo:off:([0-9a-f]{24})$/, async (ctx) => {
      const updated = await this.admin.setCityActive(ctx.match[1] as CityId, false);
      await ctx.answerCallbackQuery({ text: 'Nofaol qilindi' });
      await ctx.editMessageText(describeCity(updated)).catch(() => undefined);
    });

    admin.callbackQuery('geo:cancel', async (ctx) => {
      await ctx.answerCallbackQuery({ text: 'Bekor qilindi' });
      await ctx.editMessageReplyMarkup().catch(() => undefined);
    });

    admin.command('addcity', (ctx) =>
      this.guard(ctx, async () => {
        const [uz = '', ru = ''] = splitPipe(ctx.match);
        const city = await this.admin.createCity({ name: localizedText({ uz, ru }) });
        await ctx.reply(
          `✅ Shahar qo'shildi:\n${describeCity(city)}\n\nMarkazini belgilash: /setcenter ${city.slug}`,
        );
      }),
    );

    admin.command('adddistrict', (ctx) =>
      this.guard(ctx, async () => {
        const [slug, rest] = splitFirstWord(ctx.match);
        const [uz = '', ru = ''] = splitPipe(rest);
        const city = await this.citySlug(slug);
        const updated = await this.admin.addDistrict(city.id, localizedText({ uz, ru }));
        await ctx.reply(`✅ Hudud qo'shildi:\n${describeCity(updated)}`);
      }),
    );

    admin.command('setcenter', (ctx) =>
      this.guard(ctx, async () => {
        const city = await this.citySlug(splitFirstWord(ctx.match)[0]);
        ctx.session.awaiting = { kind: AWAIT_CENTER, data: { cityId: city.id } };
        await ctx.reply(`📍 ${city.name.uz} markazining lokatsiyasini yuboring (📎 → Lokatsiya).`);
      }),
    );

    admin.command('addlandmark', (ctx) =>
      this.guard(ctx, async () => {
        const [slug, rest] = splitFirstWord(ctx.match);
        const [uz = '', ru = '', synonyms = ''] = splitPipe(rest);
        const city = await this.citySlug(slug);
        const name = localizedText({ uz, ru });
        ctx.session.awaiting = {
          kind: AWAIT_LANDMARK,
          data: { cityId: city.id, name, synonyms: synonyms.split(',').map((s) => s.trim()) },
        };
        await ctx.reply(`📍 «${name.uz}» lokatsiyasini yuboring (📎 → Lokatsiya).`);
      }),
    );

    admin.command('landmarks', (ctx) =>
      this.guard(ctx, async () => {
        const city = await this.citySlug(splitFirstWord(ctx.match)[0]);
        const list = await this.queries.listLandmarks(city.id);
        await ctx.reply(
          list.length === 0
            ? "Orientirlar yo'q."
            : list
                .map(
                  (l) =>
                    `${l.isActive ? '•' : '◦'} ${l.name.uz} / ${l.name.ru} — ${l.searchTerms.join(', ')}`,
                )
                .join('\n'),
        );
      }),
    );

    admin.on('message:location', async (ctx, next) => {
      const step = ctx.session.awaiting;
      if (step?.kind !== AWAIT_CENTER && step?.kind !== AWAIT_LANDMARK) return next();
      const { latitude, longitude } = ctx.message.location;
      const point = GeoPoint.of(latitude, longitude);
      const data = step.data ?? {};
      ctx.session.awaiting = undefined;
      await this.guard(ctx, async () => {
        if (step.kind === AWAIT_CENTER) {
          const city = await this.admin.setCityCenter(data.cityId as CityId, point);
          await ctx.reply(`✅ ${city.name.uz} markazi saqlandi.`);
          return;
        }
        const landmark = await this.admin.addLandmark({
          cityId: data.cityId as CityId,
          name: localizedText(data.name as { uz: string; ru: string }),
          synonyms: (data.synonyms as string[] | undefined) ?? [],
          location: point,
        });
        await ctx.reply(
          `✅ Orientir qo'shildi: ${landmark.name.uz}\nQidiruv: ${landmark.searchTerms.join(', ')}`,
        );
      });
    });
  }

  private async citySlug(slug: string): Promise<CityView> {
    const city = slug ? await this.queries.getCityBySlug(slug) : null;
    if (!city) throw new AdminInputError(`Shahar topilmadi: «${slug}». /cities ni ko'ring.`);
    return city;
  }

  /** Domain xatolari admin'ga tushunarli matn bo'lib qaytadi, bot yiqilmaydi. */
  private async guard(ctx: BotContext, action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      if (error instanceof AdminInputError) return void (await ctx.reply(`❌ ${error.message}`));
      if (error instanceof DomainError) {
        return void (await ctx.reply(`❌ ${error.code}: ${error.message}\n\n${HELP}`));
      }
      throw error;
    }
  }
}

class AdminInputError extends Error {}

function describeCity(c: CityView): string {
  const districts = c.districts.map((d) => `   ${d.isActive ? '•' : '◦'} ${d.name.uz}`).join('\n');
  const center = c.center
    ? `${c.center.lat.toFixed(4)}, ${c.center.lng.toFixed(4)}`
    : 'belgilanmagan';
  return [
    `${c.isActive ? '🟢' : '⚪️'} ${c.name.uz} / ${c.name.ru} (${c.slug})`,
    `   Markaz: ${center} · ${c.timezone}`,
    districts || "   Hududlar yo'q",
  ].join('\n');
}
