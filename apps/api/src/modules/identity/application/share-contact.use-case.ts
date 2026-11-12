import { Injectable } from '@nestjs/common';
import {
  Clock,
  err,
  InvalidPhoneNumberError,
  ok,
  PhoneNumber,
  type Result,
} from '@polya/shared-kernel';
import type { TelegramId, User } from '../domain/user.js';
import { UserRepository } from '../domain/user.repository.js';
import { UserNotFoundError } from './errors.js';

export interface ShareContactInput {
  /** Xabarni yuborgan foydalanuvchi (`from.id`). */
  senderTelegramId: number;
  /** Ulashilgan kontaktning Telegram ID'si (`contact.user_id`); begona kontaktda bo'lmasligi mumkin. */
  contactTelegramId: number | undefined;
  phoneNumber: string;
}

export type ShareContactError = 'CONTACT_NOT_OWNED' | 'INVALID_PHONE';

/**
 * TZ ID-2, ID-3: telefon faqat "Kontaktni ulashish" orqali va faqat O'Z kontakti bo'lsa qabul qilinadi.
 * Raqam boshqa akkauntda bo'lsa (yangi Telegram akkaunt, eski raqam — EC-B12), eng oxirgi tasdiqlagan
 * akkaunt egasi hisoblanadi: eski akkauntdan raqam olinadi. Bandlov tarixi `userId`ga bog'langan,
 * shuning uchun yo'qolmaydi.
 */
@Injectable()
export class ShareContactUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: ShareContactInput): Promise<Result<User, ShareContactError>> {
    if (input.contactTelegramId !== input.senderTelegramId) return err('CONTACT_NOT_OWNED');

    let phone: PhoneNumber;
    try {
      phone = PhoneNumber.parse(input.phoneNumber);
    } catch (error) {
      if (error instanceof InvalidPhoneNumberError) return err('INVALID_PHONE');
      throw error;
    }

    const user = await this.users.findByTelegramId(input.senderTelegramId as TelegramId);
    if (!user) {
      throw new UserNotFoundError('Sender is not registered', {
        telegramId: input.senderTelegramId,
      });
    }

    const now = this.clock.now();
    const previousOwner = await this.users.findByPhone(phone);
    if (previousOwner && previousOwner.id !== user.id) {
      // Avval eski egadan olinadi — aks holda phone unique index yangi yozuvni rad etadi
      previousOwner.releasePhone(now);
      await this.users.save(previousOwner);
    }

    if (user.verifyPhone(phone, now)) await this.users.save(user);
    return ok(user);
  }
}
