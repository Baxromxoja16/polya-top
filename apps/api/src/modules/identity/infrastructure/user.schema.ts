import { Schema, type Types } from 'mongoose';

export const USER_MODEL = 'User';
export const USER_COLLECTION = 'users';

export interface UserDocument {
  _id: Types.ObjectId;
  telegramId: number;
  firstName: string;
  lastName: string | null;
  username: string | null;
  customName: string | null;
  cityId: string | null;
  phone: string | null;
  phoneVerifiedAt: Date | null;
  language: string;
  roles: string[];
  status: string;
  botBlocked: boolean;
  marketingOptOut: boolean;
  createdAt: Date;
  updatedAt: Date;
  /** Optimistic concurrency versiyasi (aggregate.version + 1 saqlangandan keyin). */
  version: number;
}

export const UserSchema = new Schema<UserDocument>(
  {
    telegramId: { type: Number, required: true },
    firstName: { type: String, default: '' },
    lastName: { type: String, default: null },
    username: { type: String, default: null },
    customName: { type: String, default: null },
    cityId: { type: String, default: null },
    phone: { type: String, default: null },
    phoneVerifiedAt: { type: Date, default: null },
    language: { type: String, required: true },
    roles: { type: [String], default: [] },
    status: { type: String, required: true },
    botBlocked: { type: Boolean, default: false },
    marketingOptOut: { type: Boolean, default: false },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
    version: { type: Number, required: true },
  },
  { collection: USER_COLLECTION, versionKey: false, timestamps: false },
);

// TZ 9: telegramId unique; phone unique sparse (Guest'larda phone = null, ular to'qnashmaydi)
UserSchema.index({ telegramId: 1 }, { unique: true, name: 'uniq_telegram_id' });
UserSchema.index(
  { phone: 1 },
  { unique: true, name: 'uniq_phone', partialFilterExpression: { phone: { $type: 'string' } } },
);
