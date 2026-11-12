import { Injectable } from '@nestjs/common';
import { GeoPoint } from '@polya/shared-kernel';
import { type Composer, InlineKeyboard, Keyboard } from 'grammy';
import type { BotContext } from '../../../../platform/telegram/bot-context.js';
import {
  type BotFeature,
  FeatureOrder,
  TelegramFeature,
} from '../../../../platform/telegram/bot-feature.js';
import { sendMainMenu } from '../../../../platform/telegram/core.features.js';
import { coreMessages } from '../../../../platform/telegram/core.messages.js';
import { hasRole } from '../../../../platform/telegram/guards.js';
import { isMainMenuLabel, menuLabels } from '../../../../platform/telegram/main-menu.js';
import { type CityId, GeographyQueries } from '../../../geography/index.js';
import {
  CatalogQueries,
  type SearchInput,
  type VenueListItem,
} from '../../application/catalog.queries.js';
import { FavoritesService } from '../../application/favorites.service.js';
import { searchMessages } from './player-search.messages.js';
import { listLine, venueCardText } from './venue-card.view.js';

const SEARCH = 'catalog.search';
const AWAIT_NEARBY = 'catalog.nearby';
const PAGE = 5;

interface SearchState {
  query?: string;
  lat?: number;
  lng?: number;
  districtId?: string;
  landmarkId?: string;
}

/** TZ VC-4…VC-7: o'yinchi qidiruvi, natijalar ro'yxati va stadion kartochkasi. */
@Injectable()
@TelegramFeature(FeatureOrder.MODULE + 20)
export class PlayerSearchBotFeature implements BotFeature {
  constructor(
    private readonly catalog: CatalogQueries,
    private readonly geography: GeographyQueries,
    private readonly favorites: FavoritesService,
  ) {}

  register(bot: Composer<BotContext>): void {
    bot.hears(menuLabels('nearby'), async (ctx) => {
      const m = searchMessages[ctx.lang];
      ctx.session.awaiting = { kind: AWAIT_NEARBY };
      await ctx.reply(m.askLocation, {
        reply_markup: new Keyboard()
          .requestLocation(m.btnSendLocation)
          .row()
          .text(m.btnByDistrict)
          .row()
          .text(coreMessages[ctx.lang].cancel)
          .resized()
          .oneTime(),
      });
    });

    bot.hears([searchMessages.uz.btnByDistrict, searchMessages.ru.btnByDistrict], (ctx) =>
      this.showDistricts(ctx),
    );

    bot.on('message:location', async (ctx) => {
      ctx.session.awaiting = undefined;
      const { latitude: lat, longitude: lng } = ctx.message.location;
      await sendMainMenu(ctx, '📍');
      await this.run(ctx, { lat, lng }, 0);
    });

    bot.callbackQuery(/^cat:sd:([0-9a-f]{24})$/, async (ctx) => {
      await ctx.answerCallbackQuery();
      await this.run(ctx, { districtId: ctx.match[1] as string }, 0);
    });
    bot.callbackQuery(/^cat:lm:([0-9a-f]{24})$/, async (ctx) => {
      await ctx.answerCallbackQuery();
      await this.run(ctx, { landmarkId: ctx.match[1] as string }, 0);
    });
    bot.callbackQuery(/^cat:more:(\d+)$/, async (ctx) => {
      await ctx.answerCallbackQuery();
      await this.run(ctx, this.state(ctx), Number(ctx.match[1]));
    });

    bot.callbackQuery(/^cat:c:([0-9a-f]{24})$/, async (ctx) => {
      await ctx.answerCallbackQuery();
      await this.showCard(ctx, ctx.match[1] as string);
    });
    bot.callbackQuery(/^cat:loc:([0-9a-f]{24})$/, async (ctx) => {
      const card = await this.catalog.venueCard(ctx.match[1] as string);
      const location = card?.venue.location;
      if (!card || !location) {
        return void (await ctx.answerCallbackQuery({
          text: searchMessages[ctx.lang].noLocation,
          show_alert: true,
        }));
      }
      await ctx.answerCallbackQuery();
      await ctx.replyWithVenue(
        location.lat,
        location.lng,
        card.venue.name,
        card.venue.landmarkText,
      );
    });

    // TZ VC-8: sevimlilar
    bot.callbackQuery(/^cat:fav:([0-9a-f]{24})$/, async (ctx) => {
      const userId = ctx.currentUser?.id;
      if (!userId) return;
      const venueId = ctx.match[1] as string;
      const m = searchMessages[ctx.lang];
      const isFavorite = await this.favorites.toggle(userId, venueId);
      await ctx.answerCallbackQuery({ text: isFavorite ? m.favoriteAdded : m.favoriteRemoved });
      await ctx
        .editMessageReplyMarkup({ reply_markup: this.cardKeyboard(ctx, venueId, isFavorite) })
        .catch(() => undefined);
    });
    bot.hears(menuLabels('favorites'), async (ctx) => {
      const m = searchMessages[ctx.lang];
      const items = await this.favorites.list(ctx.currentUser?.id ?? '', this.catalog);
      if (items.length === 0) return void (await ctx.reply(m.favoritesEmpty));
      await this.replyList(ctx, m.favorites, items, 0, false);
    });

    // Erkin matn — qidiruv so'rovi (TZ VC-4: "21 maktab", "bozor yonida", stadion nomi)
    bot.on('message:text', async (ctx, next) => {
      const text = ctx.message.text;
      if (ctx.session.awaiting || isMainMenuLabel(text) || text.startsWith('/')) return next();
      await this.run(ctx, { query: text.slice(0, 100) }, 0);
    });
  }

  /** Deep link va boshqa joylardan ochiladi. */
  async showCard(ctx: BotContext, venueIdOrSlug: string): Promise<boolean> {
    const m = searchMessages[ctx.lang];
    const card = await this.catalog.venueCard(venueIdOrSlug);
    const canPreview =
      card && (card.venue.ownerId === ctx.currentUser?.id || hasRole(ctx, 'ADMIN'));
    if (!card || (!card.venue.isPublic && !canPreview)) {
      await ctx.reply(m.notAvailable);
      return false;
    }
    const userId = ctx.currentUser?.id;
    const favorite = userId ? await this.favorites.isFavorite(userId, card.venue.id) : false;
    const kb = this.cardKeyboard(ctx, card.venue.id, favorite);
    const text = venueCardText(card, ctx.lang);
    const photo = card.venue.photos[0];
    // Telegram caption chegarasi 1024 belgi
    if (photo && text.length <= 1024)
      await ctx.replyWithPhoto(photo, { caption: text, reply_markup: kb });
    else await ctx.reply(text, { reply_markup: kb });
    return true;
  }

  private async showDistricts(ctx: BotContext): Promise<void> {
    const m = searchMessages[ctx.lang];
    const cityId = await this.cityOf(ctx);
    if (!cityId) return;
    ctx.session.awaiting = undefined;
    const city = await this.geography.getCity(cityId as CityId);
    const districts = city?.districts.filter((d) => d.isActive) ?? [];
    if (districts.length === 0) return void (await sendMainMenu(ctx, m.noDistricts));
    const kb = new InlineKeyboard();
    for (const d of districts) kb.text(d.name[ctx.lang], `cat:sd:${d.id}`).row();
    await sendMainMenu(ctx, '🏘');
    await ctx.reply(m.chooseDistrict, { reply_markup: kb });
  }

  private async run(ctx: BotContext, state: SearchState, offset: number): Promise<void> {
    const m = searchMessages[ctx.lang];
    const cityId = await this.cityOf(ctx);
    if (!cityId) return;
    this.saveState(ctx, state);

    const input: SearchInput = { cityId, limit: PAGE, offset };
    if (state.query) input.query = state.query;
    if (state.districtId) input.districtId = state.districtId;
    if (state.landmarkId) input.landmarkId = state.landmarkId;
    if (state.lat !== undefined && state.lng !== undefined)
      input.near = GeoPoint.of(state.lat, state.lng);

    const out = await this.catalog.search(input);

    if (out.landmarkChoices.length > 0 && offset === 0) {
      const kb = new InlineKeyboard();
      for (const l of out.landmarkChoices.slice(0, 8))
        kb.text(l.name[ctx.lang], `cat:lm:${l.id}`).row();
      await ctx.reply(m.chooseLandmark, { reply_markup: kb });
      return;
    }
    if (out.hits.length === 0) {
      if (offset > 0) return;
      const any = state.query || state.districtId || state.landmarkId || state.lat !== undefined;
      const allInCity = any ? await this.catalog.search({ cityId, limit: 1 }) : out;
      await ctx.reply(allInCity.hits.length === 0 ? m.noVenuesInCity : m.nothingFound);
      return;
    }

    const city = state.districtId ? await this.geography.getCity(cityId as CityId) : null;
    const title =
      state.landmarkId || out.usedLandmark
        ? m.titleLandmark(out.usedLandmark?.name[ctx.lang] ?? '')
        : state.query
          ? m.titleQuery(state.query)
          : state.lat !== undefined
            ? m.titleNearby
            : state.districtId
              ? m.titleDistrict(
                  city?.districts.find((d) => d.id === state.districtId)?.name[ctx.lang] ?? '',
                )
              : m.titleAll;

    await this.replyList(ctx, m.results(title), out.hits, offset, out.hits.length === PAGE);
  }

  private async replyList(
    ctx: BotContext,
    title: string,
    items: VenueListItem[],
    offset: number,
    more: boolean,
  ): Promise<void> {
    const lines = items.map((h, i) => listLine(h, offset + i + 1, ctx.lang));
    const kb = new InlineKeyboard();
    items.forEach((h, i) => {
      kb.text(`${offset + i + 1}. ${h.venue.name}`, `cat:c:${h.venue.id}`);
      if (i % 2 === 1) kb.row();
    });
    if (more) kb.row().text(searchMessages[ctx.lang].btnMore, `cat:more:${offset + PAGE}`);
    await ctx.reply(`${title}\n\n${lines.join('\n\n')}`, { reply_markup: kb });
  }

  private cardKeyboard(ctx: BotContext, venueId: string, favorite: boolean): InlineKeyboard {
    const m = searchMessages[ctx.lang];
    return new InlineKeyboard()
      .text(m.btnLocation, `cat:loc:${venueId}`)
      .text(favorite ? m.btnUnfavorite : m.btnFavorite, `cat:fav:${venueId}`);
  }

  /** TZ CT-5: qidiruv foydalanuvchi shahri doirasida. */
  private async cityOf(ctx: BotContext): Promise<string | null> {
    const cityId = ctx.currentUser?.cityId ?? null;
    if (cityId) return cityId;
    const cities = await this.geography.listCities({ activeOnly: true });
    await ctx.reply(searchMessages[ctx.lang][cities.length ? 'chooseCity' : 'noCities']);
    return null;
  }

  private state(ctx: BotContext): SearchState {
    return (ctx.session.drafts?.[SEARCH] as SearchState | undefined) ?? {};
  }

  private saveState(ctx: BotContext, state: SearchState): void {
    ctx.session.drafts = { ...(ctx.session.drafts ?? {}), [SEARCH]: { ...state } };
  }
}

/** TZ 5.4: deep link `t.me/<bot>?start=v_<slug>` — stadion o'z Instagram'iga qo'yadigan havola. */
@Injectable()
@TelegramFeature(FeatureOrder.MODULE - 5)
export class VenueDeepLinkBotFeature implements BotFeature {
  constructor(private readonly search: PlayerSearchBotFeature) {}

  register(bot: Composer<BotContext>): void {
    bot.command('start', async (ctx, next) => {
      const payload = ctx.match.trim();
      if (!payload.startsWith('v_')) return next();
      await this.search.showCard(ctx, payload.slice(2));
      await sendMainMenu(ctx);
    });
  }
}
