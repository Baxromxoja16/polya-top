import { Module } from '@nestjs/common';
import { BookingModule } from '../booking/index.js';
import { CatalogModule } from '../catalog/index.js';
import { IdentityModule } from '../identity/index.js';
import { ModerationService } from './application/moderation.service.js';
import { AdminModerationBotFeature } from './interface/telegram/admin.bot.js';

/**
 * Admin (TZ 4.7): bir nechta kontekstni muvofiqlashtiruvchi yuqori qatlam — bloklash, statistika.
 * Boshqa kontekstlar Admin'ni bilmaydi.
 */
@Module({
  imports: [IdentityModule, CatalogModule, BookingModule],
  providers: [ModerationService, AdminModerationBotFeature],
})
export class AdminModule {}
