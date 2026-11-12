import { Injectable } from '@nestjs/common';
import type { Language, TimeRange } from '@polya/shared-kernel';
import { type Composer, InlineKeyboard } from 'grammy';
import type { BotContext } from '../../../../platform/telegram/bot-context.js';
import {
  type BotFeature,
  FeatureOrder,
  TelegramFeature,
} from '../../../../platform/telegram/bot-feature.js';
import { defineMessages } from '../../../../platform/telegram/i18n.js';
import { showMessage } from '../../../../platform/telegram/ui.js';
import { SlotWatchService } from '../../application/slot-watch.service.js';
import type { WatchError } from '../../domain/slot-watch.js';
import { MAX_ACTIVE_WATCHES } from '../../domain/slot-watch.js';

const ID = '([0-9a-f]{24})';

export const watchMessages = defineMessages(
  {
    ask: "🔴 Bu vaqt band.\n\nBo'shab qolsa (bandlov bekor qilinsa), sizga birinchilardan xabar beraymi?",
    btnYes: '🔔 Ha, xabar bering',
    btnStop: "🔕 Kuzatishni to'xtatish",
    subscribed:
      "🔔 Kuzatyapmiz. Vaqt bo'shasa, obuna tartibida xabar beramiz (o'yin vaqti o'tgach obuna o'chadi).",
    stopped: "🔕 Kuzatish to'xtatildi.",
    freed: (p: { venue: string; when: string }) =>
      `🔔 Siz kutgan vaqt bo'shadi!\n\n🏟 ${p.venue}\n🕒 ${p.when}\n\nTezroq bandlang — boshqalar ham kutmoqda 👇`,
    btnBook: '📅 Bandlash',
  },
  {
    ask: '🔴 Это время занято.\n\nСообщить вам одним из первых, если оно освободится (бронь отменят)?',
    btnYes: '🔔 Да, сообщите',
    btnStop: '🔕 Перестать следить',
    subscribed:
      '🔔 Следим. Если время освободится, сообщим в порядке подписки (подписка удалится после игры).',
    stopped: '🔕 Слежение остановлено.',
    freed: (p) =>
      `🔔 Время, которое вы ждали, освободилось!\n\n🏟 ${p.venue}\n🕒 ${p.when}\n\nБронируйте быстрее — его ждут и другие 👇`,
    btnBook: '📅 Забронировать',
  },
);

export const watchErrors: Record<Language, Record<WatchError, string>> = {
  uz: {
    ALREADY_WATCHING: 'Bu vaqtni allaqachon kuzatyapsiz.',
    LIMIT_REACHED: `Bir vaqtda ko'pi bilan ${MAX_ACTIVE_WATCHES} ta vaqtni kuzatish mumkin.`,
    NOT_BOOKED: "Bu vaqt hozir bo'sh — bandlashingiz mumkin!",
    PAST: "Bu vaqt o'tib ketdi.",
  },
  ru: {
    ALREADY_WATCHING: 'Вы уже следите за этим временем.',
    LIMIT_REACHED: `Можно следить максимум за ${MAX_ACTIVE_WATCHES} слотами одновременно.`,
    NOT_BOOKED: 'Это время сейчас свободно — можно бронировать!',
    PAST: 'Это время уже прошло.',
  },
};

export const freedKeyboard = (lang: Language, pitchId: string, slotStart: Date) =>
  new InlineKeyboard().text(
    watchMessages[lang].btnBook,
    `bk:t:${pitchId}:${Math.floor(slotStart.getTime() / 1000)}`,
  );

/**
 * TZ VC-5d: 🔴 slot bosilganda (`bk:w:<pitch>:<sec>` — Catalog to'ri) obuna taklifi.
 */
@Injectable()
@TelegramFeature(FeatureOrder.MODULE)
export class SlotWatchBotFeature implements BotFeature {
  constructor(private readonly watches: SlotWatchService) {}

  register(bot: Composer<BotContext>): void {
    bot.callbackQuery(new RegExp(`^bk:w:${ID}:(\\d+)$`), async (ctx) => {
      await ctx.answerCallbackQuery();
      const m = watchMessages[ctx.lang];
      await ctx.reply(m.ask, {
        reply_markup: new InlineKeyboard().text(m.btnYes, `bk:wy:${ctx.match[1]}:${ctx.match[2]}`),
      });
    });
    bot.callbackQuery(new RegExp(`^bk:wy:${ID}:(\\d+)$`), async (ctx) => {
      const user = ctx.currentUser;
      if (!user) return void (await ctx.answerCallbackQuery());
      const [, pitchId, sec] = ctx.match;
      const start = new Date(Number(sec) * 1000);
      const r = await this.watches.watch(user.id, pitchId as string, start);
      const m = watchMessages[ctx.lang];
      if (!r.ok) {
        await ctx.answerCallbackQuery({ text: watchErrors[ctx.lang][r.error], show_alert: true });
        return;
      }
      await ctx.answerCallbackQuery();
      await showMessage(
        ctx,
        m.subscribed,
        new InlineKeyboard().text(m.btnStop, `bk:wn:${pitchId}:${sec}`),
      );
    });
    bot.callbackQuery(new RegExp(`^bk:wn:${ID}:(\\d+)$`), async (ctx) => {
      const user = ctx.currentUser;
      await ctx.answerCallbackQuery();
      if (!user) return;
      await this.watches.unwatch(
        user.id,
        ctx.match[1] as string,
        new Date(Number(ctx.match[2]) * 1000),
      );
      await showMessage(ctx, watchMessages[ctx.lang].stopped, new InlineKeyboard());
    });
  }
}
