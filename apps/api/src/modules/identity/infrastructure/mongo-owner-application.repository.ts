import { Injectable, type OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model, Schema, Types } from 'mongoose';
import { isDuplicateKeyError, saveVersioned } from '../../../platform/database/versioned-save.js';
import {
  OwnerApplication,
  type OwnerApplicationId,
  OwnerApplicationRepository,
  type OwnerApplicationStatus,
  PendingApplicationExistsError,
} from '../domain/owner-application.js';
import type { UserId } from '../domain/user.js';

export const OWNER_APPLICATION_MODEL = 'OwnerApplication';

interface OwnerApplicationDocument {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  note: string;
  status: OwnerApplicationStatus;
  reviewedBy: Types.ObjectId | null;
  reviewedAt: Date | null;
  rejectReason: string | null;
  createdAt: Date;
  version: number;
}

export const OwnerApplicationSchema = new Schema<OwnerApplicationDocument>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    note: { type: String, required: true },
    status: { type: String, required: true },
    reviewedBy: { type: Schema.Types.ObjectId, default: null },
    reviewedAt: { type: Date, default: null },
    rejectReason: { type: String, default: null },
    createdAt: { type: Date, required: true },
    version: { type: Number, required: true },
  },
  { collection: 'owner_applications', versionKey: false },
);
// Bitta foydalanuvchida bir vaqtda faqat bitta ko'rib chiqilmagan ariza
OwnerApplicationSchema.index(
  { userId: 1 },
  { unique: true, name: 'uniq_pending_per_user', partialFilterExpression: { status: 'PENDING' } },
);

const oid = (id: string) => new Types.ObjectId(id);

@Injectable()
export class MongoOwnerApplicationRepository
  extends OwnerApplicationRepository
  implements OnModuleInit
{
  constructor(
    @InjectModel(OWNER_APPLICATION_MODEL) private readonly model: Model<OwnerApplicationDocument>,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.model.createIndexes();
  }

  async findById(id: OwnerApplicationId): Promise<OwnerApplication | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return toDomain(await this.model.findById(id).lean<OwnerApplicationDocument>().exec());
  }

  async findPendingByUser(userId: UserId): Promise<OwnerApplication | null> {
    return toDomain(
      await this.model
        .findOne({ userId: oid(userId), status: 'PENDING' })
        .lean<OwnerApplicationDocument>()
        .exec(),
    );
  }

  async save(app: OwnerApplication): Promise<void> {
    try {
      await saveVersioned(
        this.model,
        {
          _id: oid(app.id),
          userId: oid(app.userId),
          note: app.note,
          status: app.status,
          reviewedBy: app.reviewedBy ? oid(app.reviewedBy) : null,
          reviewedAt: app.reviewedAt,
          rejectReason: app.rejectReason,
          createdAt: app.createdAt,
          version: app.version + 1,
        },
        app.version,
      );
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new PendingApplicationExistsError('User already has a pending application');
      }
      throw error;
    }
    app.markPersisted();
  }
}

function toDomain(doc: OwnerApplicationDocument | null): OwnerApplication | null {
  if (!doc) return null;
  return OwnerApplication.reconstitute(
    doc._id.toHexString() as OwnerApplicationId,
    {
      userId: doc.userId.toHexString() as UserId,
      note: doc.note,
      status: doc.status,
      reviewedBy: (doc.reviewedBy?.toHexString() as UserId | undefined) ?? null,
      reviewedAt: doc.reviewedAt,
      rejectReason: doc.rejectReason,
      createdAt: doc.createdAt,
    },
    doc.version,
  );
}
