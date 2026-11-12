import { Bot } from 'grammy';
import type { Update, UserFromGetMe } from 'grammy/types';
import type { BotContext } from '../../src/platform/telegram/bot-context.js';

export interface ApiCall {
  method: string;
  // biome-ignore lint/suspicious/noExplicitAny: test helper — Telegram payloadlari turlicha
  payload: Record<string, any>;
}

export const TEST_BOT_INFO = {
  id: 42,
  is_bot: true,
  first_name: 'Polya',
  username: 'polya_test_bot',
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
} as UserFromGetMe;

/**
 * Tarmoqqa chiqmaydigan bot: barcha Telegram API chaqiruvlari `calls`ga yoziladi va soxta javob qaytadi.
 */
export interface FakeFailure {
  error_code: number;
  description: string;
  parameters?: { retry_after?: number };
}

/**
 * Tarmoqqa chiqmaydigan bot: barcha Telegram API chaqiruvlari `calls`ga yoziladi va soxta javob qaytadi.
 * `failNext(chatId, ...)` — shu chatga keyingi yuborish xato bilan qaytadi (403/429 simulyatsiyasi).
 */
export function createTestBot(): {
  bot: Bot<BotContext>;
  calls: ApiCall[];
  failNext: (chatId: number, failure: FakeFailure) => void;
} {
  const calls: ApiCall[] = [];
  const failures = new Map<number, FakeFailure[]>();
  const bot = new Bot<BotContext>('42:TEST-TOKEN-0000000000000000000000000000', {
    botInfo: TEST_BOT_INFO,
  });
  let messageId = 1000;
  bot.api.config.use(async (_prev, method, payload) => {
    const p = (payload ?? {}) as ApiCall['payload'];
    calls.push({ method, payload: p });
    const queued = failures.get(Number(p.chat_id));
    const failure = queued?.shift();
    // biome-ignore lint/suspicious/noExplicitAny: soxta Telegram xato javobi
    if (failure) return { ok: false, ...failure } as any;
    const result = method.startsWith('send')
      ? {
          message_id: ++messageId,
          date: Math.floor(Date.now() / 1000),
          chat: { id: p.chat_id, type: 'private' },
          text: p.text,
        }
      : true;
    // biome-ignore lint/suspicious/noExplicitAny: soxta Telegram javobi
    return { ok: true, result } as any;
  });
  const failNext = (chatId: number, failure: FakeFailure) => {
    failures.set(chatId, [...(failures.get(chatId) ?? []), failure]);
  };
  return { bot, calls, failNext };
}

let updateSeq = 1;
export const nextUpdateId = () => updateSeq++;

/** Bitta Telegram foydalanuvchisini simulyatsiya qiladi. */
export class TelegramUserSim {
  #cursor = 0;

  constructor(
    readonly bot: Bot<BotContext>,
    private readonly calls: ApiCall[],
    readonly id: number,
    private readonly profile: { first_name: string; language_code?: string } = {
      first_name: 'Ali',
      language_code: 'uz',
    },
  ) {}

  get from() {
    return { id: this.id, is_bot: false, ...this.profile };
  }

  private get chat() {
    return { id: this.id, type: 'private' as const, first_name: this.profile.first_name };
  }

  /** Oxirgi amaldan keyingi API chaqiruvlari. */
  async act(update: Omit<Update, 'update_id'>, updateId = nextUpdateId()): Promise<ApiCall[]> {
    this.#cursor = this.calls.length;
    await this.bot.handleUpdate({ update_id: updateId, ...update } as Update);
    return this.calls.slice(this.#cursor);
  }

  send(text: string, chat: object = this.chat) {
    const entities = text.startsWith('/')
      ? [{ type: 'bot_command' as const, offset: 0, length: text.split(' ')[0]?.length ?? 0 }]
      : undefined;
    return this.act({
      message: {
        message_id: nextUpdateId(),
        date: Math.floor(Date.now() / 1000),
        chat,
        from: this.from,
        text,
        ...(entities ? { entities } : {}),
      },
    } as Omit<Update, 'update_id'>);
  }

  press(data: string) {
    return this.act({
      callback_query: {
        id: String(nextUpdateId()),
        from: this.from,
        chat_instance: 'ci',
        data,
        message: {
          message_id: 1,
          date: Math.floor(Date.now() / 1000),
          chat: this.chat,
          text: '...',
        },
      },
    } as Omit<Update, 'update_id'>);
  }

  sendLocation(latitude: number, longitude: number) {
    return this.act({
      message: {
        message_id: nextUpdateId(),
        date: Math.floor(Date.now() / 1000),
        chat: this.chat,
        from: this.from,
        location: { latitude, longitude },
      },
    } as Omit<Update, 'update_id'>);
  }

  sendPhoto(fileId: string, caption?: string) {
    return this.act({
      message: {
        message_id: nextUpdateId(),
        date: Math.floor(Date.now() / 1000),
        chat: this.chat,
        from: this.from,
        photo: [
          { file_id: `${fileId}-small`, file_unique_id: `${fileId}-s`, width: 90, height: 90 },
          { file_id: fileId, file_unique_id: `${fileId}-u`, width: 1280, height: 960 },
        ],
        ...(caption ? { caption } : {}),
      },
    } as Omit<Update, 'update_id'>);
  }

  /** `userId: null` — Telegram user'ga bog'lanmagan kontakt kartochkasi (qo'lda yozilgan). */
  shareContact(phoneNumber: string, userId: number | null = this.id) {
    return this.act({
      message: {
        message_id: nextUpdateId(),
        date: Math.floor(Date.now() / 1000),
        chat: this.chat,
        from: this.from,
        contact: {
          phone_number: phoneNumber,
          first_name: 'Contact',
          ...(userId === null ? {} : { user_id: userId }),
        },
      },
    } as Omit<Update, 'update_id'>);
  }

  setBotStatus(status: 'kicked' | 'member') {
    const member = (s: string) => ({ user: TEST_BOT_INFO, status: s });
    return this.act({
      my_chat_member: {
        chat: this.chat,
        from: this.from,
        date: Math.floor(Date.now() / 1000),
        old_chat_member: member(status === 'kicked' ? 'member' : 'kicked'),
        new_chat_member: member(status),
      },
    } as Omit<Update, 'update_id'>);
  }
}

/** Javoblardagi matnlar (sendMessage + editMessageText). */
export const texts = (calls: ApiCall[]) =>
  calls
    .filter((c) => c.method === 'sendMessage' || c.method === 'editMessageText')
    .map((c) => String(c.payload.text));

/** Inline tugmalarning callback_data'lari. */
export const buttons = (calls: ApiCall[]) =>
  calls.flatMap((c) =>
    // biome-ignore lint/suspicious/noExplicitAny: Telegram markup
    ((c.payload.reply_markup?.inline_keyboard ?? []) as any[][]).flat().map((b) => b.callback_data),
  );

/** Reply-klaviatura yozuvlari. */
export const keyboardLabels = (calls: ApiCall[]) =>
  calls.flatMap((c) =>
    // biome-ignore lint/suspicious/noExplicitAny: Telegram markup
    ((c.payload.reply_markup?.keyboard ?? []) as any[][])
      .flat()
      .map((b) => (typeof b === 'string' ? b : b.text)),
  );
