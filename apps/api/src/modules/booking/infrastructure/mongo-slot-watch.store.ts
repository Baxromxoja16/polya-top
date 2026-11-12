import { Injectable, type OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model, Schema, Types } from 'mongoose';
import { isDuplicateKeyError } from '../../../platform/database/versioned-save.js';
import { type SlotWatch, type SlotWatchStatus, SlotWatchStore } from '../domain/slot-watch.js';

export const SLOT_WATCH_MODEL = 'SlotWatch';

interface SlotWatchDocument {
  _id: Types.ObjectId;
  userId: string;
  pitchId: string;
  slotStart: Date;
  status: SlotWatchStatus;
  createdAt: Date;
  notifiedAt: Date | null;
  /** TTL: o'yin vaqti o'tgach obuna o'zi o'chadi (VC-5d) */
  expiresAt: Date;
}

export const SlotWatchSchema = new Schema<SlotWatchDocument>(
  {
    userId: { type: String, required: true },
    pitchId: { type: String, required: true },
    slotStart: { type: Date, required: true },
    status: { type: String, required: true },
    createdAt: { type: Date, required: true },
    notifiedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'slot_watches', versionKey: false },
);
// Bir foydalanuvchi bitta slotga bitta faol obuna
SlotWatchSchema.index(
  { userId: 1, pitchId: 1, slotStart: 1 },
  { unique: true, name: 'uniq_active', partialFilterExpression: { status: 'ACTIVE' } },
);
SlotWatchSchema.index({ status: 1, slotStart: 1 }, { name: 'status_slot' });
SlotWatchSchema.index({ pitchId: 1, slotStart: 1, createdAt: 1 }, { name: 'queue' });
SlotWatchSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'ttl' });

const toDomain = (d: SlotWatchDocument): SlotWatch => ({
  id: d._id.toHexString(),
  userId: d.userId,
  pitchId: d.pitchId,
  slotStart: d.slotStart,
  status: d.status,
  createdAt: d.createdAt,
  notifiedAt: d.notifiedAt,
});

@Injectable()
export class MongoSlotWatchStore extends SlotWatchStore implements OnModuleInit {
  constructor(@InjectModel(SLOT_WATCH_MODEL) private readonly model: Model<SlotWatchDocument>) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.model.createIndexes();
  }

  async add(w: SlotWatch): Promise<boolean> {
    try {
      await this.model.collection.insertOne({
        _id: new Types.ObjectId(w.id),
        userId: w.userId,
        pitchId: w.pitchId,
        slotStart: w.slotStart,
        status: w.status,
        createdAt: w.createdAt,
        notifiedAt: null,
        expiresAt: w.slotStart,
      });
      return true;
    } catch (error) {
      if (isDuplicateKeyError(error)) return false;
      throw error;
    }
  }

  async countActive(userId: string, now: Date): Promise<number> {
    return this.model.countDocuments({ userId, status: 'ACTIVE', slotStart: { $gt: now } }).exec();
  }

  async cancel(userId: string, pitchId: string, slotStart: Date): Promise<boolean> {
    const r = await this.model.collection.updateOne(
      { userId, pitchId, slotStart, status: 'ACTIVE' },
      { $set: { status: 'CANCELLED' } },
    );
    return r.modifiedCount === 1;
  }

  async activeSlots(now: Date): Promise<{ pitchId: string; slotStart: Date }[]> {
    const rows = await this.model
      .aggregate<{ _id: { pitchId: string; slotStart: Date } }>([
        { $match: { status: 'ACTIVE', slotStart: { $gt: now } } },
        { $group: { _id: { pitchId: '$pitchId', slotStart: '$slotStart' } } },
        { $sort: { '_id.slotStart': 1 } },
        { $limit: 500 },
      ])
      .exec();
    return rows.map((r) => r._id);
  }

  async queueOf(
    pitchId: string,
    slotStart: Date,
  ): Promise<{ active: SlotWatch[]; lastNotifiedAt: Date | null }> {
    const docs = await this.model
      .find({ pitchId, slotStart, status: { $in: ['ACTIVE', 'NOTIFIED'] } })
      .sort({ createdAt: 1, _id: 1 })
      .lean<SlotWatchDocument[]>()
      .exec();
    const notified = docs.map((d) => d.notifiedAt?.getTime() ?? 0).filter((t) => t > 0);
    return {
      active: docs.filter((d) => d.status === 'ACTIVE').map(toDomain),
      lastNotifiedAt: notified.length ? new Date(Math.max(...notified)) : null,
    };
  }

  async transition(id: string, to: 'NOTIFIED' | 'CANCELLED', now: Date): Promise<boolean> {
    const r = await this.model.collection.updateOne(
      { _id: new Types.ObjectId(id), status: 'ACTIVE' },
      { $set: { status: to, ...(to === 'NOTIFIED' ? { notifiedAt: now } : {}) } },
    );
    return r.modifiedCount === 1;
  }
}
