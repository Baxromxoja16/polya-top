import { Injectable, type OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConcurrencyConflictError, DEFAULT_LANGUAGE, isLanguage } from '@polya/shared-kernel';
import { type Model, Types } from 'mongoose';
import { PhoneNumber } from '../domain/phone-number.js';
import { ROLES, type Role, type TelegramId, User, type UserId } from '../domain/user.js';
import {
  PhoneAlreadyTakenError,
  UserAlreadyExistsError,
  UserRepository,
} from '../domain/user.repository.js';
import { USER_MODEL, type UserDocument } from './user.schema.js';

@Injectable()
export class MongoUserRepository extends UserRepository implements OnModuleInit {
  constructor(@InjectModel(USER_MODEL) private readonly model: Model<UserDocument>) {
    super();
  }

  /** Indekslar ilova ishga tushganda yaratiladi (idempotent) — unique kafolatlar har doim bor. */
  async onModuleInit(): Promise<void> {
    await this.model.createIndexes();
  }

  async findById(id: UserId): Promise<User | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return toDomain(await this.model.findById(id).lean<UserDocument>().exec());
  }

  async findByTelegramId(telegramId: TelegramId): Promise<User | null> {
    return toDomain(await this.model.findOne({ telegramId }).lean<UserDocument>().exec());
  }

  async findByPhone(phone: PhoneNumber): Promise<User | null> {
    return toDomain(await this.model.findOne({ phone: phone.value }).lean<UserDocument>().exec());
  }

  async save(user: User): Promise<void> {
    const doc = toDocument(user);
    try {
      if (user.version === 0) {
        await this.model.collection.insertOne(doc);
      } else {
        const { _id, ...fields } = doc;
        const result = await this.model.collection.updateOne(
          { _id, version: user.version },
          { $set: fields },
        );
        if (result.matchedCount === 0) {
          throw new ConcurrencyConflictError('User was modified concurrently', { id: user.id });
        }
      }
    } catch (error) {
      throw translateDuplicateKey(error);
    }
    user.markPersisted();
  }
}

function toDocument(user: User): UserDocument {
  const p = user.telegramProfile;
  return {
    _id: new Types.ObjectId(user.id),
    telegramId: user.telegramId,
    firstName: p.firstName,
    lastName: p.lastName,
    username: p.username,
    customName: user.customName,
    phone: user.phone?.value ?? null,
    phoneVerifiedAt: user.phoneVerifiedAt,
    language: user.language,
    roles: [...user.roles],
    status: user.status,
    botBlocked: user.botBlocked,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    version: user.version + 1,
  };
}

function toDomain(doc: UserDocument | null): User | null {
  if (!doc) return null;
  return User.reconstitute(
    doc._id.toHexString() as UserId,
    {
      telegramId: doc.telegramId as TelegramId,
      telegramProfile: {
        firstName: doc.firstName,
        lastName: doc.lastName,
        username: doc.username,
      },
      customName: doc.customName,
      phone: doc.phone ? PhoneNumber.parse(doc.phone) : null,
      phoneVerifiedAt: doc.phoneVerifiedAt,
      language: isLanguage(doc.language) ? doc.language : DEFAULT_LANGUAGE,
      roles: doc.roles.filter((r): r is Role => (ROLES as readonly string[]).includes(r)),
      status: doc.status === 'BLOCKED' ? 'BLOCKED' : 'ACTIVE',
      botBlocked: doc.botBlocked,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    },
    doc.version,
  );
}

function translateDuplicateKey(error: unknown): unknown {
  if (!isDuplicateKey(error)) return error;
  const pattern = error.keyPattern ?? {};
  if ('phone' in pattern)
    return new PhoneAlreadyTakenError('Phone already belongs to another user');
  return new UserAlreadyExistsError('User already exists', { keyPattern: pattern });
}

function isDuplicateKey(
  error: unknown,
): error is { code: number; keyPattern?: Record<string, unknown> } {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000
  );
}
