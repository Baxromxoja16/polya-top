import { Injectable, type OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model, Schema, Types } from 'mongoose';
import { type ConditionReport, ConditionStore } from '../domain/condition.js';

export const CONDITION_MODEL = 'ConditionReport';

interface ConditionDocument {
  _id: Types.ObjectId;
  venueId: Types.ObjectId;
  authorId: Types.ObjectId;
  byOwner: boolean;
  text: string;
  createdAt: Date;
  /** TTL indeks — muddati o'tgach Mongo o'zi o'chiradi */
  expiresAt: Date;
}

export const ConditionSchema = new Schema<ConditionDocument>(
  {
    venueId: { type: Schema.Types.ObjectId, required: true },
    authorId: { type: Schema.Types.ObjectId, required: true },
    byOwner: { type: Boolean, default: false },
    text: { type: String, required: true },
    createdAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'condition_reports', versionKey: false },
);
ConditionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'ttl' });
ConditionSchema.index({ venueId: 1, createdAt: -1 }, { name: 'venue_recent' });

@Injectable()
export class MongoConditionStore extends ConditionStore implements OnModuleInit {
  constructor(@InjectModel(CONDITION_MODEL) private readonly model: Model<ConditionDocument>) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.model.createIndexes();
  }

  async add(report: ConditionReport): Promise<void> {
    await this.model.collection.insertOne({
      _id: new Types.ObjectId(),
      venueId: new Types.ObjectId(report.venueId),
      authorId: new Types.ObjectId(report.authorId),
      byOwner: report.byOwner,
      text: report.text,
      createdAt: report.createdAt,
      expiresAt: report.expiresAt,
    });
  }

  async latest(venueId: string, now: Date): Promise<ConditionReport | null> {
    if (!Types.ObjectId.isValid(venueId)) return null;
    // TTL fon jarayoni kechikishi mumkin — shuning uchun filtr ham
    const doc = await this.model
      .findOne({ venueId: new Types.ObjectId(venueId), expiresAt: { $gt: now } })
      .sort({ createdAt: -1 })
      .lean<ConditionDocument>()
      .exec();
    if (!doc) return null;
    return {
      venueId: doc.venueId.toHexString(),
      authorId: doc.authorId.toHexString(),
      byOwner: doc.byOwner,
      text: doc.text,
      createdAt: doc.createdAt,
      expiresAt: doc.expiresAt,
    };
  }
}
