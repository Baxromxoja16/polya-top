import { Injectable } from '@nestjs/common';
import { zonedParts } from '@polya/shared-kernel';
import { type Composer, InlineKeyboard } from 'grammy';
import type { BotContext } from '../../../../platform/telegram/bot-context.js';
import {
  type BotFeature,
  FeatureOrder,
  TelegramFeature,
} from '../../../../platform/telegram/bot-feature.js';
import { isAdmin, splitPipe } from '../../../../platform/telegram/guards.js';
import { ADMIN_MENU } from '../../../../platform/telegram/main-menu.js';
import { TelegramMessenger } from '../../../../platform/telegram/telegram-messenger.js';
import type { Booking } from '../../../booking/index.js';
import { type Actor, CatalogQueries } from '../../../catalog/index.js';
import { IdentityQueries } from '../../../identity/index.js';
import { ModerationService } from '../../application/moderation.service.js';
import { adminText, affectedMessages } from './admin.messages.js';

const pad = (n: number) => String(n).padStart(2, '0');

const actorOf = (ctx: BotContext): Actor => ({
  userId: ctx.currentUser?.id ?? '',
  roles: ctx.currentUser?.roles ?? [],
  phone: ctx.currentUser?.phone ?? null,
  cityId: ctx.currentUser?.cityId ?? null,
});

/**
 * TZ AD-2: `/blockuser`, `/unblockuser`, `/blockvenue` (tasdiq bilan, EC-B10), `/unblockvenue`.
 * Bloklash sababi stadion bloklanganda o'yinchilarga ko'rsatiladi.
 */
@Injectable()
@TelegramFeature(FeatureOrder.MODULE)
export class AdminModerationBotFeature implements BotFeature {
  constructor(
    private readonly moderation: ModerationService,
    private readonly catalog: CatalogQueries,
    private readonly identity: IdentityQueries,
    private readonly messenger: TelegramMessenger,
  ) {}

  register(bot: Composer<BotContext>): void {
    const admin = bot.filter(isAdmin);

    // Admin menyusi: hozircha buyruq formatini ko'rsatadi (qadamma-qadam oqim — keyingi bosqich)
    admin.hears(ADMIN_MENU.block, (ctx) =>
      ctx.reply(
        [
          adminText.usageBlockUser,
          adminText.usageUnblockUser,
          adminText.usageBlockVenue,
          adminText.usageUnblockVenue,
        ].join('\n'),
      ),
    );
    admin.hears(ADMIN_MENU.transfer, (ctx) => ctx.reply(adminText.usageTransfer));

    admin.command('blockuser', async (ctx) => {
      const [ref, reason] = splitPipe(ctx.match);
      if (!ref) return void (await ctx.reply(adminText.usageBlockUser));
      const r = await this.moderation.blockUser(ref, reason || adminText.defaultReason);
      if (!r.ok) return void (await ctx.reply(this.errorText(r.error)));
      for (const b of r.value) await this.notifyOwner(b);
      await ctx.reply(adminText.userBlocked(r.value.length));
    });

    admin.command('unblockuser', async (ctx) => {
      const ref = ctx.match.trim();
      if (!ref) return void (await ctx.reply(adminText.usageUnblockUser));
      const r = await this.moderation.unblockUser(ref);
      await ctx.reply(r.ok ? adminText.userUnblocked : this.errorText(r.error));
    });

    admin.command('blockvenue', async (ctx) => {
      const [slug, reason] = splitPipe(ctx.match);
      if (!slug) return void (await ctx.reply(adminText.usageBlockVenue));
      const impact = await this.moderation.venueImpact(slug);
      if (!impact) return void (await ctx.reply(adminText.notFound));
      const why = reason || adminText.defaultReason;
      // Sabab callback'ga sig'maydi — sessiyada saqlanadi
      ctx.session.drafts = { ...ctx.session.drafts, adminBlockVenue: { reason: why } };
      await ctx.reply(
        adminText.confirmVenue({ name: impact.name, future: impact.future, reason: why }),
        {
          reply_markup: new InlineKeyboard().text(
            adminText.btnConfirmBlock,
            `adm:bv:${impact.venueId}`,
          ),
        },
      );
    });

    admin.callbackQuery(/^adm:bv:([0-9a-f]{24})$/, async (ctx) => {
      await ctx.answerCallbackQuery();
      const reason = String(ctx.session.drafts?.adminBlockVenue?.reason ?? adminText.defaultReason);
      const r = await this.moderation.blockVenue(actorOf(ctx), ctx.match[1] as string, reason);
      if (!r.ok) return void (await ctx.reply(adminText.alreadyHandled));
      for (const b of r.value.cancelled) await this.notifyPlayer(b, reason);
      await ctx
        .editMessageReplyMarkup({ reply_markup: new InlineKeyboard() })
        .catch(() => undefined);
      await ctx.reply(adminText.venueBlocked(r.value.name, r.value.cancelled.length));
    });

    // EC-T10
    admin.command('transfervenue', async (ctx) => {
      const [slug, ref] = splitPipe(ctx.match);
      if (!slug || !ref) return void (await ctx.reply(adminText.usageTransfer));
      const r = await this.moderation.transferVenue(actorOf(ctx), slug, ref);
      if (!r.ok)
        return void (await ctx.reply(
          r.error === 'VENUE_NOT_FOUND'
            ? adminText.notFound
            : r.error === 'USER_NOT_FOUND'
              ? adminText.userNotFound
              : adminText.noChange,
        ));
      const { venueName, previousOwnerId, newOwner } = r.value;
      await this.messenger.send(
        newOwner.telegramId,
        affectedMessages[newOwner.language].becameOwner(venueName),
      );
      const previous = await this.identity.contactOf(previousOwnerId);
      if (previous)
        await this.messenger.send(
          previous.telegramId,
          affectedMessages[previous.language].lostOwnership(venueName),
        );
      await ctx.reply(
        adminText.transferred(venueName, newOwner.displayName ?? String(newOwner.telegramId)),
      );
    });

    admin.command('unblockvenue', async (ctx) => {
      const slug = ctx.match.trim();
      if (!slug) return void (await ctx.reply(adminText.usageUnblockVenue));
      const r = await this.moderation.unblockVenue(actorOf(ctx), slug);
      if (r.ok) await ctx.reply(adminText.venueUnblocked(r.value));
      else await ctx.reply(r.error === 'NOT_FOUND' ? adminText.notFound : adminText.noChange);
    });
  }

  private errorText(error: 'NOT_FOUND' | 'IS_ADMIN' | 'NO_CHANGE'): string {
    return error === 'NOT_FOUND'
      ? adminText.notFound
      : error === 'IS_ADMIN'
        ? adminText.isAdmin
        : adminText.noChange;
  }

  private async describe(b: Booking): Promise<{ venue: string; when: string } | null> {
    const c = await this.catalog.pitchContext(b.pitchId);
    if (!c) return null;
    const s = zonedParts(b.range.start, c.timeZone);
    const e = zonedParts(b.range.end, c.timeZone);
    return {
      venue: c.venue.name,
      when: `${pad(s.day)}.${pad(s.month)} ${pad(s.hour)}:${pad(s.minute)}–${pad(e.hour)}:${pad(e.minute)}`,
    };
  }

  /** EC-B11 */
  private async notifyOwner(b: Booking): Promise<void> {
    const [d, owner] = await Promise.all([this.describe(b), this.identity.contactOf(b.ownerId)]);
    if (d && owner)
      await this.messenger.send(
        owner.telegramId,
        affectedMessages[owner.language].playerBlockedToOwner(d),
      );
  }

  /** EC-B10 */
  private async notifyPlayer(b: Booking, reason: string): Promise<void> {
    if (!b.playerId) return; // qo'lda bandlov — mehmonning Telegram'i yo'q
    const [d, player] = await Promise.all([this.describe(b), this.identity.contactOf(b.playerId)]);
    if (d && player)
      await this.messenger.send(
        player.telegramId,
        affectedMessages[player.language].venueBlockedToPlayer({ ...d, reason }),
      );
  }
}
