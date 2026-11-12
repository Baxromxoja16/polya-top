import { Injectable } from '@nestjs/common';
import { isLanguage, LANGUAGES, type Language } from '@polya/shared-kernel';
import { type Composer, InlineKeyboard, Keyboard } from 'grammy';
import type { BotContext } from '../../../../platform/telegram/bot-context.js';
import {
  type BotFeature,
  FeatureOrder,
  TelegramFeature,
} from '../../../../platform/telegram/bot-feature.js';
import { sendMainMenu } from '../../../../platform/telegram/core.features.js';
import { coreMessages } from '../../../../platform/telegram/core.messages.js';
import { isMainMenuLabel, menuLabels } from '../../../../platform/telegram/main-menu.js';
import { showMessage } from '../../../../platform/telegram/ui.js';
import { CityCatalog } from '../../application/city-catalog.js';
import { ShareContactUseCase } from '../../application/share-contact.use-case.js';
import {
  ChangeCityUseCase,
  ChangeLanguageUseCase,
  RenameUserUseCase,
  SetBotBlockedUseCase,
} from '../../application/update-profile.use-cases.js';
import { PhoneNumber } from '../../domain/phone-number.js';
import type { User } from '../../domain/user.js';
import { toCurrentUser } from './identity.context.js';
import { identityMessages } from './identity.messages.js';
import { AWAITING_PHONE, askForPhone, PhoneGate } from './phone-gate.js';

const AWAITING_NAME = 'identity.rename';

const CB = {
  pickLanguage: 'id:lang',
  setLanguage: /^id:lang:(uz|ru)(:new)?$/,
  phone: 'id:phone',
  name: 'id:name',
  pickCity: 'id:city',
  setCity: /^id:city:([0-9a-f]{24})(:new)?$/,
} as const;

const LOOKS_LIKE_PHONE = /^[+\d][\d\s()-]{6,}$/;

@Injectable()
@TelegramFeature(FeatureOrder.MODULE)
export class IdentityBotFeature implements BotFeature {
  constructor(
    private readonly shareContact: ShareContactUseCase,
    private readonly changeLanguage: ChangeLanguageUseCase,
    private readonly renameUser: RenameUserUseCase,
    private readonly setBotBlocked: SetBotBlockedUseCase,
    private readonly phoneGate: PhoneGate,
    private readonly changeCity: ChangeCityUseCase,
    private readonly cities: CityCatalog,
  ) {}

  register(bot: Composer<BotContext>): void {
    // TZ ID-6, EC-T1: foydalanuvchi botni bloklasa/blokdan chiqarsa Telegram xizmat update'i yuboradi
    bot.on('my_chat_member', async (ctx) => {
      const status = ctx.myChatMember.new_chat_member.status;
      if (status === 'kicked')
        await this.setBotBlocked.execute({ telegramId: ctx.from.id, blocked: true });
      if (status === 'member')
        await this.setBotBlocked.execute({ telegramId: ctx.from.id, blocked: false });
    });

    bot.command('start', (ctx) => this.onStart(ctx));

    bot.callbackQuery(CB.pickLanguage, async (ctx) => {
      await ctx.answerCallbackQuery();
      await showMessage(ctx, identityMessages[ctx.lang].chooseLanguage, languageKeyboard());
    });

    bot.callbackQuery(CB.setLanguage, async (ctx) => {
      const language = ctx.match[1];
      // ':new' — birinchi /start'dagi tanlov: undan keyin xush kelibsiz matni ko'rsatiladi
      const onboarding = ctx.match[2] !== undefined;
      if (!isLanguage(language)) return;
      const user = await this.changeLanguage.execute({ telegramId: ctx.from.id, language });
      this.refreshContext(ctx, user);
      await ctx.answerCallbackQuery();
      const m = identityMessages[ctx.lang];
      await showMessage(ctx, m.languageSaved);
      // Onboarding: shahar tanlanmagan va bir nechta bo'lsa — avval shahar (TZ CT-4)
      if (onboarding && !ctx.currentUser?.cityId && (await this.askCity(ctx, true))) return;
      // Yangi tildagi menyu klaviaturasi bilan
      await sendMainMenu(
        ctx,
        onboarding ? m.welcomeNew(this.nameOf(ctx)) : coreMessages[ctx.lang].mainMenu,
      );
    });

    bot.callbackQuery(CB.pickCity, async (ctx) => {
      await ctx.answerCallbackQuery();
      if (!(await this.askCity(ctx, false))) await ctx.reply(identityMessages[ctx.lang].noCities);
    });

    bot.callbackQuery(CB.setCity, async (ctx) => {
      const onboarding = ctx.match[2] !== undefined;
      const result = await this.changeCity.execute({
        telegramId: ctx.from.id,
        cityId: ctx.match[1] as string,
      });
      const m = identityMessages[ctx.lang];
      if (!result.ok) {
        await ctx.answerCallbackQuery({ text: m.cityUnavailable });
        await this.askCity(ctx, onboarding);
        return;
      }
      this.refreshContext(ctx, result.value);
      await ctx.answerCallbackQuery();
      await showMessage(ctx, m.citySaved(await this.cityName(ctx)));
      await sendMainMenu(
        ctx,
        onboarding ? m.welcomeNew(this.nameOf(ctx)) : coreMessages[ctx.lang].mainMenu,
      );
    });

    bot.hears(menuLabels('settings'), (ctx) => this.showSettings(ctx));

    bot.callbackQuery(CB.phone, async (ctx) => {
      await ctx.answerCallbackQuery();
      await askForPhone(ctx);
    });

    bot.callbackQuery(CB.name, async (ctx) => {
      await ctx.answerCallbackQuery();
      ctx.session.awaiting = { kind: AWAITING_NAME };
      await ctx.reply(identityMessages[ctx.lang].askName, {
        reply_markup: cancelKeyboard(ctx.lang),
      });
    });

    // TZ ID-2, ID-3
    bot.on('message:contact', async (ctx) => {
      const m = identityMessages[ctx.lang];
      const contact = ctx.message.contact;
      const result = await this.shareContact.execute({
        senderTelegramId: ctx.from.id,
        contactTelegramId: contact.user_id,
        phoneNumber: contact.phone_number,
      });
      if (!result.ok) {
        await ctx.reply(result.error === 'CONTACT_NOT_OWNED' ? m.contactNotOwned : m.invalidPhone);
        await askForPhone(ctx);
        return;
      }
      this.refreshContext(ctx, result.value);
      if (ctx.session.awaiting?.kind === AWAITING_PHONE) ctx.session.awaiting = undefined;
      await sendMainMenu(ctx, m.phoneSaved(PhoneNumber.parse(contact.phone_number).format()));
      await this.phoneGate.resume(ctx);
    });

    bot.on('message:text', async (ctx, next) => {
      const step = ctx.session.awaiting;
      if (!step) return next();
      // Menyu tugmasi bosilsa — joriy oqim tashlanadi, menyu bandi ishlaydi (TZ EC-T9)
      if (isMainMenuLabel(ctx.message.text)) {
        ctx.session.awaiting = undefined;
        return next();
      }
      const m = identityMessages[ctx.lang];

      if (step.kind === AWAITING_NAME) {
        const result = await this.renameUser.execute({
          telegramId: ctx.from.id,
          name: ctx.message.text,
        });
        if (!result.ok) {
          await ctx.reply(m.invalidName, { reply_markup: cancelKeyboard(ctx.lang) });
          return;
        }
        ctx.session.awaiting = undefined;
        this.refreshContext(ctx, result.value);
        await sendMainMenu(ctx, m.nameSaved(result.value.displayName ?? ''));
        return;
      }

      if (step.kind === AWAITING_PHONE) {
        // TZ ID-2: qo'lda yozilgan raqam qabul qilinmaydi
        if (LOOKS_LIKE_PHONE.test(ctx.message.text.trim())) await ctx.reply(m.typedPhone);
        await askForPhone(ctx);
        return;
      }

      return next();
    });
  }

  private async onStart(ctx: BotContext): Promise<void> {
    ctx.session.awaiting = undefined;
    const m = identityMessages[ctx.lang];
    if (ctx.currentUser?.isNew) {
      await ctx.reply(m.chooseLanguage, { reply_markup: languageKeyboard(true) });
      return;
    }
    await sendMainMenu(ctx, m.welcomeBack(this.nameOf(ctx)));
  }

  /** @returns tanlash kerakmi edi (faol shahar 2+ ta). Bitta yoki yo'q bo'lsa — so'ralmaydi. */
  private async askCity(ctx: BotContext, onboarding: boolean): Promise<boolean> {
    const cities = await this.cities.activeCities();
    if (cities.length === 0 || (onboarding && cities.length === 1)) return false;
    const kb = new InlineKeyboard();
    for (const c of cities)
      kb.text(c.name[ctx.lang], `id:city:${c.id}${onboarding ? ':new' : ''}`).row();
    await showMessage(ctx, identityMessages[ctx.lang].chooseCity, kb);
    return true;
  }

  private async cityName(ctx: BotContext): Promise<string | null> {
    const id = ctx.currentUser?.cityId;
    if (!id) return null;
    return (await this.cities.activeCities()).find((c) => c.id === id)?.name[ctx.lang] ?? null;
  }

  private async showSettings(ctx: BotContext): Promise<void> {
    const m = identityMessages[ctx.lang];
    const phone = ctx.currentUser?.phone;
    await ctx.reply(
      m.settings(
        this.nameOf(ctx),
        phone ? PhoneNumber.parse(phone).format() : m.notSet,
        m.languageName,
        (await this.cityName(ctx)) ?? m.notSet,
      ),
      {
        reply_markup: new InlineKeyboard()
          .text(m.btnLanguage, CB.pickLanguage)
          .row()
          .text(m.btnPhone, CB.phone)
          .row()
          .text(m.btnName, CB.name)
          .row()
          .text(m.btnCity, CB.pickCity),
      },
    );
  }

  /** TZ EC-T6: ism bo'sh/emoji bo'lsa — "Foydalanuvchi #1234" */
  private nameOf(ctx: BotContext): string {
    const user = ctx.currentUser;
    if (user?.displayName) return user.displayName;
    const tail = String(user?.telegramId ?? ctx.from?.id ?? '').slice(-4);
    return identityMessages[ctx.lang].fallbackName(tail);
  }

  private refreshContext(ctx: BotContext, user: User): void {
    ctx.currentUser = toCurrentUser(user, ctx.currentUser?.isNew ?? false);
    ctx.lang = user.language;
  }
}

function languageKeyboard(onboarding = false): InlineKeyboard {
  const kb = new InlineKeyboard();
  const flags: Record<Language, string> = { uz: '🇺🇿', ru: '🇷🇺' };
  for (const lang of LANGUAGES)
    kb.text(
      `${flags[lang]} ${identityMessages[lang].languageName}`,
      `id:lang:${lang}${onboarding ? ':new' : ''}`,
    );
  return kb;
}

function cancelKeyboard(lang: Language): Keyboard {
  return new Keyboard().text(coreMessages[lang].cancel).resized().oneTime();
}
