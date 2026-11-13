import { Injectable } from '@nestjs/common';
import type { Composer } from 'grammy';
import type { BotContext } from '../../../../platform/telegram/bot-context.js';
import {
  type BotFeature,
  FeatureOrder,
  TelegramFeature,
} from '../../../../platform/telegram/bot-feature.js';
import { isAdmin } from '../../../../platform/telegram/guards.js';
import {
  type BookingFunnel,
  type PlatformStats,
  StatisticsService,
} from '../../application/statistics.service.js';

const line = (title: string, f: BookingFunnel) =>
  `${title}: so'rov ${f.requests} · ✅ ${f.confirmed} · ❌ ${f.rejected} · ⌛ ${f.expired} · ` +
  `🚫 ${f.cancelled} · 👻 ${f.noShow} · konversiya ${f.conversion}%`;

export function statsText(s: PlatformStats): string {
  const v = s.venues;
  return [
    '📊 Polya.top statistikasi',
    '',
    `👥 Foydalanuvchilar: ${s.users.total} (7 kunda +${s.users.newSince})`,
    `   Owner: ${s.users.owners} · ⛔ bloklangan: ${s.users.blocked} · 🔕 botni bloklagan: ${s.users.botBlocked}`,
    `🏟 Stadionlar: ✅ ${v.APPROVED ?? 0} · ⏳ ${v.PENDING_REVIEW ?? 0} · ❌ ${v.REJECTED ?? 0} · 🗄 ${v.ARCHIVED ?? 0} · ⛔ ${v.BLOCKED ?? 0}`,
    '',
    line('📅 24 soat', s.today),
    line('🗓 7 kun', s.week),
  ].join('\n');
}

/** TZ AD-4: `/stats` */
@Injectable()
@TelegramFeature(FeatureOrder.MODULE)
export class AdminStatsBotFeature implements BotFeature {
  constructor(private readonly stats: StatisticsService) {}

  register(bot: Composer<BotContext>): void {
    bot
      .filter(isAdmin)
      .command('stats', async (ctx) => ctx.reply(statsText(await this.stats.snapshot())));
  }
}
