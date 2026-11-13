import { Module, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import type { Env } from '../../config/env.schema.js';
import { TelegramMessenger } from '../../platform/telegram/telegram-messenger.js';
import { GeographyModule } from '../geography/index.js';
import { AdminDirectory, StaticAdminDirectory } from './application/admin-directory.js';
import { CityCatalog } from './application/city-catalog.js';
import { EnsureUserUseCase } from './application/ensure-user.use-case.js';
import { IdentityQueries } from './application/identity.queries.js';
import { MarketingAudience } from './application/marketing-audience.js';
import {
  ReviewOwnerApplicationUseCase,
  SubmitOwnerApplicationUseCase,
} from './application/owner-application.use-cases.js';
import { ShareContactUseCase } from './application/share-contact.use-case.js';
import {
  ChangeCityUseCase,
  ChangeLanguageUseCase,
  GrantRoleUseCase,
  RenameUserUseCase,
  SetBotBlockedUseCase,
  SetDailyScheduleUseCase,
  SetMarketingOptOutUseCase,
  SetUserBlockedUseCase,
} from './application/update-profile.use-cases.js';
import { UserStatistics } from './application/user-statistics.js';
import { OwnerApplicationRepository } from './domain/owner-application.js';
import { UserRepository } from './domain/user.repository.js';
import { GeographyCityCatalog } from './infrastructure/geography-city-catalog.js';
import { MongoMarketingAudience } from './infrastructure/mongo-marketing-audience.js';
import {
  MongoOwnerApplicationRepository,
  OWNER_APPLICATION_MODEL,
  OwnerApplicationSchema,
} from './infrastructure/mongo-owner-application.repository.js';
import { MongoUserRepository } from './infrastructure/mongo-user.repository.js';
import { MongoUserStatistics } from './infrastructure/mongo-user-statistics.js';
import { USER_MODEL, UserSchema } from './infrastructure/user.schema.js';
import { IdentityBotFeature } from './interface/telegram/identity.bot.js';
import { IdentityContextFeature } from './interface/telegram/identity.context.js';
import { OwnerApplicationBotFeature } from './interface/telegram/owner-application.bot.js';
import { OwnerPreferencesBotFeature } from './interface/telegram/owner-preferences.bot.js';
import { PhoneGate } from './interface/telegram/phone-gate.js';

/** Identity bounded context (TZ 4.1): foydalanuvchi, telefon tasdiqlash, til, rollar. */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: USER_MODEL, schema: UserSchema },
      { name: OWNER_APPLICATION_MODEL, schema: OwnerApplicationSchema },
    ]),
    GeographyModule,
  ],
  providers: [
    { provide: UserRepository, useClass: MongoUserRepository },
    {
      provide: AdminDirectory,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new StaticAdminDirectory(config.get('ADMIN_TELEGRAM_IDS', { infer: true })),
    },
    { provide: CityCatalog, useClass: GeographyCityCatalog },
    { provide: OwnerApplicationRepository, useClass: MongoOwnerApplicationRepository },
    SubmitOwnerApplicationUseCase,
    ReviewOwnerApplicationUseCase,
    EnsureUserUseCase,
    IdentityQueries,
    { provide: MarketingAudience, useClass: MongoMarketingAudience },
    { provide: UserStatistics, useClass: MongoUserStatistics },
    ChangeCityUseCase,
    ShareContactUseCase,
    ChangeLanguageUseCase,
    RenameUserUseCase,
    SetBotBlockedUseCase,
    SetMarketingOptOutUseCase,
    SetUserBlockedUseCase,
    SetDailyScheduleUseCase,
    GrantRoleUseCase,
    OwnerPreferencesBotFeature,
    PhoneGate,
    IdentityContextFeature,
    IdentityBotFeature,
    OwnerApplicationBotFeature,
  ],
  exports: [
    PhoneGate,
    IdentityQueries,
    MarketingAudience,
    SetUserBlockedUseCase,
    UserStatistics,
    GrantRoleUseCase,
  ],
})
export class IdentityModule implements OnModuleInit {
  constructor(
    private readonly messenger: TelegramMessenger,
    private readonly setBotBlocked: SetBotBlockedUseCase,
  ) {}

  /** TZ ID-6, EC-T1: xabar 403 bilan qaytsa — foydalanuvchi botni bloklagan, keyingi xabarnomalar to'xtaydi. */
  onModuleInit(): void {
    this.messenger.onBlocked((chatId) =>
      this.setBotBlocked.execute({ telegramId: chatId, blocked: true }),
    );
  }
}
