import { type Language, zonedParts } from '@polya/shared-kernel';
import { InlineKeyboard } from 'grammy';
import type { BotContext } from '../../../../platform/telegram/bot-context.js';
import { defineMessages } from '../../../../platform/telegram/i18n.js';
import type { VenueManagementService } from '../../application/venue-management.service.js';
import type { PitchId } from '../../domain/pitch.js';
import { actorOf } from './telegram-actor.js';

const SHOWN = 8;
const pad = (n: number) => String(n).padStart(2, '0');

const m = defineMessages(
  {
    warning: (count: number, list: string) =>
      `⚠️ Yangi ish vaqtidan tashqarida qolgan ${count} ta band vaqt bor:\n${list}\n\n` +
      "Ular avtomatik bekor qilinmadi. Kerak bo'lsa, o'yinchiga sabab yozib bekor qiling 👇",
    btnSchedule: "📋 Bandlovlarni ko'rish",
  },
  {
    warning: (count, list) =>
      `⚠️ Вне нового расписания осталось занятых часов: ${count}\n${list}\n\n` +
      'Они не отменены автоматически. При необходимости отмените с указанием причины 👇',
    btnSchedule: '📋 Посмотреть брони',
  },
);

export function conflictText(lang: Language, slots: Date[], timeZone: string): string {
  const lines = slots.slice(0, SHOWN).map((d) => {
    const p = zonedParts(d, timeZone);
    return `• ${pad(p.day)}.${pad(p.month)} ${pad(p.hour)}:${pad(p.minute)}`;
  });
  if (slots.length > SHOWN) lines.push(`… +${slots.length - SHOWN}`);
  return m[lang].warning(slots.length, lines.join('\n'));
}

/**
 * TZ EC-S2, EC-S3: jadval saqlangach — ziddiyat bo'lsa ogohlantirish va Booking'ning Owner
 * jadvali ekraniga tugma (`bk:og:<pitch>`, faqat callback protokoli).
 */
export async function warnScheduleConflicts(
  ctx: BotContext,
  manage: VenueManagementService,
  pitchId: string,
): Promise<void> {
  const { slots, timeZone } = await manage.scheduleConflicts(actorOf(ctx), pitchId as PitchId);
  if (slots.length === 0) return;
  await ctx.reply(conflictText(ctx.lang, slots, timeZone), {
    reply_markup: new InlineKeyboard().text(m[ctx.lang].btnSchedule, `bk:og:${pitchId}`),
  });
}
