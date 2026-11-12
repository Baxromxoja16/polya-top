import type { Language } from '@polya/shared-kernel';
import type { Context, SessionFlavor } from 'grammy';

/**
 * Joriy foydalanuvchi haqida bot qatlamiga kerakli minimal ma'lumot.
 * Identity konteksti middleware'da to'ldiradi; platforma Identity'ga bog'lanmaydi.
 */
export interface CurrentUser {
  id: string;
  telegramId: number;
  language: Language;
  displayName: string | null;
  phone: string | null;
  cityId: string | null;
  roles: readonly string[];
  /** TZ MK-4 */
  marketingOptOut: boolean;
  /** Shu update'da yaratildi (birinchi /start). */
  isNew: boolean;
}

/** Ko'p qadamli oqimdagi kutilayotgan qadam ("ismni yozing", "raqamni yuboring"). */
export interface PendingStep {
  kind: string;
  data?: Record<string, unknown>;
}

export interface SessionData {
  /** Keyingi matnli xabar shu qadamga tegishli. */
  awaiting?: PendingStep;
  /** Telefon tasdiqlangandan keyin davom ettiriladigan amal (TZ 5.2, 6-qadam). */
  afterPhone?: PendingStep;
  /**
   * Ko'p qadamli oqimlarning qoralamalari (masalan, stadion qo'shish). `awaiting` tozalansa ham
   * saqlanadi — foydalanuvchi menyuga chiqib ketib, keyin davom ettira oladi (TZ EC-O1).
   */
  drafts?: Record<string, Record<string, unknown>>;
}

interface BotFlavor {
  lang: Language;
  currentUser?: CurrentUser;
}

export type BotContext = Context & SessionFlavor<SessionData> & BotFlavor;
