import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import type { Env } from '../../config/env.schema.js';
import { GeographyModule } from '../geography/index.js';
import { AdminDirectory, StaticAdminDirectory } from './application/admin-directory.js';
import { CityCatalog } from './application/city-catalog.js';
import { EnsureUserUseCase } from './application/ensure-user.use-case.js';
import {
  ReviewOwnerApplicationUseCase,
  SubmitOwnerApplicationUseCase,
} from './application/owner-application.use-cases.js';
import { ShareContactUseCase } from './application/share-contact.use-case.js';
import {
  ChangeCityUseCase,
  ChangeLanguageUseCase,
  RenameUserUseCase,
  SetBotBlockedUseCase,
} from './application/update-profile.use-cases.js';
import { OwnerApplicationRepository } from './domain/owner-application.js';
import { UserRepository } from './domain/user.repository.js';
import { GeographyCityCatalog } from './infrastructure/geography-city-catalog.js';
import {
  MongoOwnerApplicationRepository,
  OWNER_APPLICATION_MODEL,
  OwnerApplicationSchema,
} from './infrastructure/mongo-owner-application.repository.js';
import { MongoUserRepository } from './infrastructure/mongo-user.repository.js';
import { USER_MODEL, UserSchema } from './infrastructure/user.schema.js';
import { IdentityBotFeature } from './interface/telegram/identity.bot.js';
import { IdentityContextFeature } from './interface/telegram/identity.context.js';
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
    ChangeCityUseCase,
    ShareContactUseCase,
    ChangeLanguageUseCase,
    RenameUserUseCase,
    SetBotBlockedUseCase,
    PhoneGate,
    IdentityContextFeature,
    IdentityBotFeature,
  ],
  exports: [PhoneGate],
})
export class IdentityModule {}
