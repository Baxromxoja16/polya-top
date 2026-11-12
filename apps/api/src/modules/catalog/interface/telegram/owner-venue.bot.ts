import { Injectable } from '@nestjs/common';
import { DomainError, GeoPoint, Money } from '@polya/shared-kernel';
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
import { isMainMenuLabel } from '../../../../platform/telegram/main-menu.js';
import { TelegramMessenger } from '../../../../platform/telegram/telegram-messenger.js';
import { showMessage } from '../../../../platform/telegram/ui.js';
import { type CityId, GeographyQueries } from '../../../geography/index.js';
import { IdentityQueries } from '../../../identity/index.js';
import { OpeningHours, parsePriceInput } from '../../../scheduling/index.js';
import { ForbiddenError, NotFoundError } from '../../application/actor.js';
import {
  CatalogQueries,
  type PitchCardView,
  type VenueCardView,
} from '../../application/catalog.queries.js';
import {
  type VenueEdit,
  VenueManagementService,
} from '../../application/venue-management.service.js';
import { PITCH_FORMATS, type PitchId, SURFACES } from '../../domain/pitch.js';
import { AMENITIES, type Amenity, type VenueId } from '../../domain/venue.js';
import { formatSum } from './catalog.messages.js';
import { statusLabel } from './owner-onboarding.bot.js';
import { ownerVenueMessages } from './owner-venue.messages.js';
import { actorOf } from './telegram-actor.js';
import { AMENITY_LABELS, SURFACE_LABELS } from './venue-labels.js';

const EDIT = 'catalog.edit';
type TextField =
  | 'name'
  | 'landmark'
  | 'description'
  | 'phones'
  | 'pitchName'
  | 'size'
  | 'hours'
  | 'price';
type Field = TextField | 'location' | 'photos';

const ID = '([0-9a-f]{24})';

/** TZ VC-2b: Owner stadion ma'lumotlarini keyin, o'zi tahrirlaydi. */
@Injectable()
@TelegramFeature(FeatureOrder.MODULE + 10)
export class OwnerVenueBotFeature implements BotFeature {
  constructor(
    private readonly manage: VenueManagementService,
    private readonly queries: CatalogQueries,
    private readonly geography: GeographyQueries,
    private readonly identity: IdentityQueries,
    private readonly messenger: TelegramMessenger,
  ) {}

  register(bot: Composer<BotContext>): void {
    const owner = bot.filter((ctx) => hasRole(ctx, 'OWNER') || hasRole(ctx, 'ADMIN'));

    owner.callbackQuery(new RegExp(`^cat:v:${ID}$`), (ctx) =>
      this.guard(ctx, () => this.showVenue(ctx, ctx.match[1] as string)),
    );

    // Matn/lokatsiya/rasm kutadigan maydonlar
    owner.callbackQuery(
      new RegExp(`^cat:e:(name|landmark|description|phones|location|photos):${ID}$`),
      (ctx) =>
        this.guard(ctx, () =>
          this.askField(ctx, ctx.match[1] as Field, { venueId: ctx.match[2] as string }),
        ),
    );
    owner.callbackQuery(new RegExp(`^cat:e:(pitchName):${ID}$`), (ctx) =>
      this.guard(ctx, () => this.askField(ctx, 'pitchName', { venueId: ctx.match[2] as string })),
    );
    owner.callbackQuery(new RegExp(`^cat:pe:(size|hours|price):${ID}$`), (ctx) =>
      this.guard(ctx, () =>
        this.askField(ctx, ctx.match[1] as Field, { pitchId: ctx.match[2] as string }),
      ),
    );

    owner.callbackQuery(new RegExp(`^cat:photos:clear:${ID}$`), (ctx) =>
      this.guard(ctx, async () => {
        await this.edit(ctx, ctx.match[1] as string, { kind: 'clearPhotos' });
        await this.showVenue(ctx, ctx.match[1] as string);
      }),
    );
    owner.callbackQuery(new RegExp(`^cat:done:${ID}$`), (ctx) =>
      this.guard(ctx, async () => {
        ctx.session.awaiting = undefined;
        await sendMainMenu(ctx, ownerVenueMessages[ctx.lang].saved);
        await this.showVenue(ctx, ctx.match[1] as string, true);
      }),
    );

    owner.callbackQuery(new RegExp(`^cat:am:${ID}(?::([A-Z_]+))?$`), (ctx) =>
      this.guard(ctx, async () => {
        const venueId = ctx.match[1] as string;
        const amenity = ctx.match[2] as Amenity | undefined;
        if (amenity && (AMENITIES as readonly string[]).includes(amenity)) {
          await this.edit(ctx, venueId, { kind: 'amenity', value: amenity });
        }
        await this.showAmenities(ctx, venueId);
      }),
    );

    owner.callbackQuery(new RegExp(`^cat:ds:${ID}(?::(${ID.slice(1, -1)}|none))?$`), (ctx) =>
      this.guard(ctx, async () => {
        const venueId = ctx.match[1] as string;
        const choice = ctx.match[2];
        if (choice) {
          await this.edit(ctx, venueId, {
            kind: 'district',
            value: choice === 'none' ? null : choice,
          });
          return this.showVenue(ctx, venueId);
        }
        await this.showDistricts(ctx, venueId);
      }),
    );

    owner.callbackQuery(new RegExp(`^cat:st:(archive|restore|resubmit):${ID}$`), (ctx) =>
      this.guard(ctx, async () => {
        await this.manage.setStatus(
          actorOf(ctx),
          ctx.match[2] as VenueId,
          ctx.match[1] as 'archive',
        );
        await this.showVenue(ctx, ctx.match[2] as string);
      }),
    );

    owner.callbackQuery(new RegExp(`^cat:pitches:${ID}$`), (ctx) =>
      this.guard(ctx, () => this.showPitches(ctx, ctx.match[1] as string)),
    );
    owner.callbackQuery(new RegExp(`^cat:p:${ID}$`), (ctx) =>
      this.guard(ctx, () => this.showPitch(ctx, ctx.match[1] as string)),
    );
    owner.callbackQuery(new RegExp(`^cat:pf:${ID}:(${PITCH_FORMATS.join('|')})$`), (ctx) =>
      this.pitchEdit(ctx, ctx.match[1] as string, {
        kind: 'format',
        value: ctx.match[2] as (typeof PITCH_FORMATS)[number],
      }),
    );
    owner.callbackQuery(new RegExp(`^cat:ps:${ID}:(${SURFACES.join('|')})$`), (ctx) =>
      this.pitchEdit(ctx, ctx.match[1] as string, {
        kind: 'surface',
        value: ctx.match[2] as (typeof SURFACES)[number],
      }),
    );
    owner.callbackQuery(new RegExp(`^cat:pi:${ID}:([01])$`), (ctx) =>
      this.pitchEdit(ctx, ctx.match[1] as string, { kind: 'indoor', value: ctx.match[2] === '1' }),
    );
    owner.callbackQuery(new RegExp(`^cat:pl:${ID}:([01])$`), (ctx) =>
      this.pitchEdit(ctx, ctx.match[1] as string, {
        kind: 'lighting',
        value: ctx.match[2] === '1',
      }),
    );

    owner.on('message:text', async (ctx, next) => {
      const step = ctx.session.awaiting;
      if (step?.kind !== EDIT || isMainMenuLabel(ctx.message.text)) return next();
      await this.guard(ctx, () => this.onText(ctx, step.data ?? {}, ctx.message.text));
    });
    owner.on('message:location', async (ctx, next) => {
      const step = ctx.session.awaiting;
      if (step?.kind !== EDIT || step.data?.field !== 'location') return next();
      const { latitude, longitude } = ctx.message.location;
      await this.guard(ctx, async () => {
        ctx.session.awaiting = undefined;
        await this.edit(ctx, step.data?.venueId as string, {
          kind: 'location',
          value: GeoPoint.of(latitude, longitude),
        });
        await sendMainMenu(ctx, ownerVenueMessages[ctx.lang].saved);
        await this.showVenue(ctx, step.data?.venueId as string, true);
      });
    });
    owner.on('message:photo', async (ctx, next) => {
      const step = ctx.session.awaiting;
      if (step?.kind !== EDIT || step.data?.field !== 'photos') return next();
      const venueId = step.data.venueId as string;
      const best = ctx.message.photo.at(-1);
      if (!best) return;
      const m = ownerVenueMessages[ctx.lang];
      try {
        const { venue } = await this.edit(ctx, venueId, { kind: 'photo', value: best.file_id });
        await ctx.reply(m.photoAdded(venue.photos.length), {
          reply_markup: doneKeyboard(ctx, venueId),
        });
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
        ctx.session.awaiting = undefined;
        await ctx.reply(m.photoLimit(await this.manage.photoLimit(venueId as VenueId)), {
          reply_markup: doneKeyboard(ctx, venueId),
        });
      }
    });
  }

  private async showVenue(ctx: BotContext, venueId: string, asNew = false): Promise<void> {
    const card = await this.card(ctx, venueId);
    const m = ownerVenueMessages[ctx.lang];
    const v = card.venue;
    const pct = v.completeness();
    const hints = [
      v.photos.length === 0 && m.hintPhoto,
      !v.location && m.hintLocation,
      v.amenities.length === 0 && m.hintAmenities,
      !v.pitchDetailsComplete && m.hintPitch,
      !v.description && m.hintDescription,
    ].filter(Boolean);
    const text = [
      `🏟 ${v.name} · ${statusLabel(ctx, v.status)}`,
      `📍 ${v.landmarkText}`,
      `🗺 ${m.location}: ${v.location ? m.yes : m.no} · 🖼 ${m.photos}: ${v.photos.length}`,
      `🏘 ${m.district}: ${card.districtName?.[ctx.lang] ?? m.notSet}`,
      `📞 ${m.phones}: ${v.phones.map((p) => p.format()).join(', ')}`,
      ...card.pitches.map((p) => pitchLine(ctx, p)),
      '',
      m.completeness(pct),
      ...hints,
    ].join('\n');

    const id = v.id;
    const kb = new InlineKeyboard()
      .text(m.btnPhotos, `cat:e:photos:${id}`)
      .text(m.btnLocation, `cat:e:location:${id}`)
      .row()
      .text(m.btnName, `cat:e:name:${id}`)
      .text(m.btnLandmark, `cat:e:landmark:${id}`)
      .row()
      .text(m.btnDescription, `cat:e:description:${id}`)
      .text(m.btnDistrict, `cat:ds:${id}`)
      .row()
      .text(m.btnAmenities, `cat:am:${id}`)
      .text(m.btnPhones, `cat:e:phones:${id}`)
      .row()
      .text(m.btnPitches, `cat:pitches:${id}`)
      .row();
    if (v.status === 'ARCHIVED') kb.text(m.btnRestore, `cat:st:restore:${id}`);
    else if (v.status === 'REJECTED')
      kb.text(m.btnResubmit, `cat:st:resubmit:${id}`).text(m.btnArchive, `cat:st:archive:${id}`);
    else if (v.status !== 'BLOCKED') kb.text(m.btnArchive, `cat:st:archive:${id}`);
    kb.row().text(m.btnBack, 'cat:panel');

    if (asNew) await ctx.reply(text, { reply_markup: kb });
    else await showMessage(ctx, text, kb);
  }

  private async showPitches(ctx: BotContext, venueId: string): Promise<void> {
    const card = await this.card(ctx, venueId);
    const m = ownerVenueMessages[ctx.lang];
    const kb = new InlineKeyboard();
    for (const p of card.pitches) kb.text(`⚽ ${p.name}`, `cat:p:${p.id}`).row();
    kb.text(m.btnAddPitch, `cat:e:pitchName:${venueId}`).row().text(m.btnBack, `cat:v:${venueId}`);
    await showMessage(ctx, card.pitches.map((p) => pitchLine(ctx, p)).join('\n'), kb);
  }

  private async showPitch(ctx: BotContext, pitchId: string): Promise<void> {
    const { card, pitch } = await this.pitchCard(ctx, pitchId);
    const m = ownerVenueMessages[ctx.lang];
    const kb = new InlineKeyboard();
    for (const f of PITCH_FORMATS)
      kb.text(`${pitch.format === f ? '● ' : ''}${f}`, `cat:pf:${pitch.id}:${f}`);
    kb.row();
    for (const s of SURFACES)
      kb.text(
        `${pitch.surface === s ? '● ' : ''}${SURFACE_LABELS[s][ctx.lang]}`,
        `cat:ps:${pitch.id}:${s}`,
      ).row();
    kb.text(`${pitch.indoor === true ? '● ' : ''}${m.btnIndoor}`, `cat:pi:${pitch.id}:1`)
      .text(`${pitch.indoor === false ? '● ' : ''}${m.btnOutdoor}`, `cat:pi:${pitch.id}:0`)
      .row()
      .text(`${pitch.lighting === true ? '● ' : ''}${m.btnLightOn}`, `cat:pl:${pitch.id}:1`)
      .text(`${pitch.lighting === false ? '● ' : ''}${m.btnLightOff}`, `cat:pl:${pitch.id}:0`)
      .row()
      .text(m.btnSize, `cat:pe:size:${pitch.id}`)
      .text(m.btnHours, `cat:pe:hours:${pitch.id}`)
      .text(m.btnPrice, `cat:pe:price:${pitch.id}`)
      .row()
      .text(m.btnWeek, `cat:wk:${pitch.id}`)
      .text(m.btnExceptions, `cat:ex:${pitch.id}`)
      .row()
      .text(m.btnRules, `cat:pr:${pitch.id}`)
      .row()
      .text(m.btnGrid, `bk:og:${pitch.id}`)
      .row()
      .text(m.btnBack, `cat:pitches:${card.venue.id}`);
    await showMessage(ctx, `${m.pitchTitle(pitch.name)}\n${pitchLine(ctx, pitch)}`, kb);
  }

  private async showAmenities(ctx: BotContext, venueId: string): Promise<void> {
    const card = await this.card(ctx, venueId);
    const m = ownerVenueMessages[ctx.lang];
    const kb = new InlineKeyboard();
    for (const a of AMENITIES) {
      kb.text(
        `${card.venue.amenities.includes(a) ? '✅' : '▫️'} ${AMENITY_LABELS[a][ctx.lang]}`,
        `cat:am:${venueId}:${a}`,
      ).row();
    }
    kb.text(m.btnBack, `cat:v:${venueId}`);
    await showMessage(ctx, m.chooseAmenities, kb);
  }

  private async showDistricts(ctx: BotContext, venueId: string): Promise<void> {
    const card = await this.card(ctx, venueId);
    const m = ownerVenueMessages[ctx.lang];
    const city = await this.geography.getCity(card.venue.cityId as CityId);
    const districts = city?.districts.filter((d) => d.isActive) ?? [];
    const kb = new InlineKeyboard();
    for (const d of districts)
      kb.text(
        `${card.venue.districtId === d.id ? '● ' : ''}${d.name[ctx.lang]}`,
        `cat:ds:${venueId}:${d.id}`,
      ).row();
    kb.text(m.btnNoDistrict, `cat:ds:${venueId}:none`).row().text(m.btnBack, `cat:v:${venueId}`);
    await showMessage(ctx, districts.length ? m.chooseDistrict : m.noDistricts, kb);
  }

  private async askField(
    ctx: BotContext,
    field: Field,
    target: { venueId?: string; pitchId?: string },
  ): Promise<void> {
    await ctx.answerCallbackQuery().catch(() => undefined);
    const m = ownerVenueMessages[ctx.lang];
    ctx.session.awaiting = { kind: EDIT, data: { field, ...target } };
    const cancel = new Keyboard().text(coreMessages[ctx.lang].cancel).resized().oneTime();
    if (field === 'location') {
      return void (await ctx.reply(m.askLocation, {
        reply_markup: new Keyboard()
          .requestLocation(m.btnLocation)
          .row()
          .text(coreMessages[ctx.lang].cancel)
          .resized()
          .oneTime(),
      }));
    }
    if (field === 'photos') {
      const card = await this.card(ctx, target.venueId as string);
      return void (await ctx.reply(
        m.askPhotos(
          Math.max(
            0,
            (await this.manage.photoLimit(target.venueId as VenueId)) - card.venue.photos.length,
          ),
        ),
        {
          reply_markup: new InlineKeyboard()
            .text(m.btnDone, `cat:done:${target.venueId}`)
            .text(m.btnClearPhotos, `cat:photos:clear:${target.venueId}`),
        },
      ));
    }
    const prompt: Record<TextField, string> = {
      name: m.askName,
      landmark: m.askLandmark,
      description: m.askDescription,
      phones: m.askPhones,
      pitchName: m.askPitchName,
      size: m.askSize,
      hours: m.askHours,
      price: m.askPrice,
    };
    await ctx.reply(prompt[field], { reply_markup: cancel });
  }

  private async onText(
    ctx: BotContext,
    data: Record<string, unknown>,
    text: string,
  ): Promise<void> {
    const m = ownerVenueMessages[ctx.lang];
    const venueId = data.venueId as string | undefined;
    const pitchId = data.pitchId as PitchId | undefined;
    const actor = actorOf(ctx);
    try {
      switch (data.field as TextField) {
        case 'name':
        case 'landmark':
          await this.edit(ctx, venueId as string, { kind: data.field as 'name', value: text });
          break;
        case 'description':
          await this.edit(ctx, venueId as string, {
            kind: 'description',
            value: text.trim() === '-' ? null : text,
          });
          break;
        case 'phones':
          await this.edit(ctx, venueId as string, {
            kind: 'phones',
            value: text
              .split(/[,;\n]/)
              .map((s) => s.trim())
              .filter(Boolean),
          });
          break;
        case 'pitchName': {
          const pitch = await this.manage.addPitch(actor, venueId as VenueId, text);
          ctx.session.awaiting = undefined;
          await sendMainMenu(ctx, m.saved);
          return this.showPitch(ctx, pitch.id);
        }
        case 'size':
          await this.manage.editPitch(actor, pitchId as PitchId, { kind: 'size', value: text });
          break;
        case 'hours':
          await this.manage.setPitchHours(actor, pitchId as PitchId, OpeningHours.parse(text));
          break;
        case 'price': {
          const price = parsePriceInput(text);
          if (price.kind !== 'ok') return void (await ctx.reply(m.invalid));
          await this.manage.setPitchPrice(actor, pitchId as PitchId, Money.of(price.amount));
          break;
        }
      }
    } catch (error) {
      if (
        error instanceof DomainError &&
        !(error instanceof ForbiddenError) &&
        !(error instanceof NotFoundError)
      ) {
        return void (await ctx.reply(m.invalid));
      }
      throw error;
    }
    ctx.session.awaiting = undefined;
    await sendMainMenu(ctx, m.saved);
    if (pitchId) await this.showPitch(ctx, pitchId);
    else await this.showVenue(ctx, venueId as string, true);
  }

  private async pitchEdit(
    ctx: BotContext,
    pitchId: string,
    change: Parameters<VenueManagementService['editPitch']>[2],
  ): Promise<void> {
    await this.guard(ctx, async () => {
      await this.manage.editPitch(actorOf(ctx), pitchId as PitchId, change);
      await this.showPitch(ctx, pitchId);
    });
  }

  private async edit(ctx: BotContext, venueId: string, change: VenueEdit) {
    const outcome = await this.manage.edit(actorOf(ctx), venueId as VenueId, change);
    if (outcome.notifyAdmins) {
      // TZ EC-O5: tasdiqlangan stadion nomi/orientiri o'zgardi — qayta tasdiq shart emas, lekin admin biladi
      await this.messenger.sendToMany(
        this.identity.adminTelegramIds(),
        `✏️ Stadion ma'lumoti o'zgardi: «${outcome.venue.name}»\n📍 ${outcome.venue.landmarkText}`,
      );
    }
    return outcome;
  }

  private async card(ctx: BotContext, venueId: string): Promise<VenueCardView> {
    const card = await this.queries.venueCard(venueId);
    if (!card) throw new NotFoundError('Venue not found');
    if (card.venue.ownerId !== ctx.currentUser?.id && !hasRole(ctx, 'ADMIN'))
      throw new ForbiddenError('Not owner');
    return card;
  }

  private async pitchCard(
    ctx: BotContext,
    pitchId: string,
  ): Promise<{ card: VenueCardView; pitch: PitchCardView }> {
    const venueId = await this.queries.venueIdOfPitch(pitchId);
    const card = await this.card(ctx, venueId ?? '');
    const pitch = card.pitches.find((p) => p.id === pitchId);
    if (!pitch) throw new NotFoundError('Pitch not found');
    return { card, pitch };
  }

  /** Begona yoki eskirgan tugma — "eskirgan" alert (TZ EC-D1: callback'dagi ID'ga ishonilmaydi). */
  private async guard(ctx: BotContext, action: () => Promise<void>): Promise<void> {
    try {
      await action();
      if (ctx.callbackQuery) await ctx.answerCallbackQuery().catch(() => undefined);
    } catch (error) {
      if (error instanceof ForbiddenError || error instanceof NotFoundError) {
        if (ctx.callbackQuery)
          await ctx.answerCallbackQuery({
            text: coreMessages[ctx.lang].staleButton,
            show_alert: true,
          });
        return;
      }
      throw error;
    }
  }
}

function doneKeyboard(ctx: BotContext, venueId: string): InlineKeyboard {
  return new InlineKeyboard().text(ownerVenueMessages[ctx.lang].btnDone, `cat:done:${venueId}`);
}

function pitchLine(ctx: BotContext, p: PitchCardView): string {
  const m = ownerVenueMessages[ctx.lang];
  const parts = [
    p.format,
    p.surface ? SURFACE_LABELS[p.surface][ctx.lang] : null,
    p.size,
    p.indoor === null ? null : p.indoor ? m.btnIndoor : m.btnOutdoor,
  ].filter(Boolean);
  const hours = p.setup?.uniformHours ? p.setup.uniformHours.format() : '—';
  const price = p.setup?.basePricePerHour
    ? `${formatSum(p.setup.basePricePerHour.amount)} ${m.perHour}`
    : '—';
  return `⚽ ${p.name}${parts.length ? ` (${parts.join(', ')})` : ''} · 🕒 ${hours} · 💰 ${price}`;
}
