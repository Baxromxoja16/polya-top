import { Injectable, type OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model, type mongo, Schema, Types } from 'mongoose';

/** `_id` — satr (venueId/userId) bo'lgan kolleksiyalar uchun native driver tipi */
type StringIdCollection = mongo.Collection<{ _id: string }>;

import { isDuplicateKeyError, saveVersioned } from '../../../platform/database/versioned-save.js';
import {
  Campaign,
  type CampaignCounter,
  type CampaignKind,
  type CampaignStats,
  type CampaignStatus,
  EMPTY_STATS,
} from '../domain/campaign.js';
import { WEEK_MS, WEEKLY_LIMIT } from '../domain/marketing-policy.js';
import { AnnouncementStore, CampaignStore, MarketingQuota } from '../domain/marketing-ports.js';

export const CAMPAIGN_MODEL = 'Campaign';
export const ANNOUNCEMENT_MODEL = 'VenueAnnouncement';
export const QUOTA_MODEL = 'MarketingQuota';

// --- campaigns ---

interface CampaignDocument {
  _id: Types.ObjectId;
  kind: CampaignKind;
  cityId: string;
  venueIds: string[];
  status: CampaignStatus;
  cursor: string | null;
  createdAt: Date;
  finishedAt: Date | null;
  /** MK-7: bloklash ulushi tekshirilgan vaqt (atomik flag) */
  blockCheckedAt?: Date | null;
  stats: CampaignStats;
  version: number;
}

export const CampaignSchema = new Schema<CampaignDocument>(
  {
    kind: { type: String, required: true },
    cityId: { type: String, required: true },
    venueIds: { type: [String], default: [] },
    status: { type: String, required: true },
    cursor: { type: String, default: null },
    createdAt: { type: Date, required: true },
    finishedAt: { type: Date, default: null },
    blockCheckedAt: { type: Date, default: null },
    stats: { type: Schema.Types.Mixed, default: () => ({ ...EMPTY_STATS }) },
    version: { type: Number, required: true },
  },
  { collection: 'campaigns', versionKey: false },
);
CampaignSchema.index({ status: 1, finishedAt: 1 }, { name: 'status_finished' });

function toCampaign(d: CampaignDocument): Campaign {
  return Campaign.reconstitute(
    d._id.toHexString(),
    {
      kind: d.kind,
      cityId: d.cityId,
      venueIds: d.venueIds,
      status: d.status,
      cursor: d.cursor,
      createdAt: d.createdAt,
      finishedAt: d.finishedAt,
    },
    d.version,
  );
}

@Injectable()
export class MongoCampaignStore extends CampaignStore implements OnModuleInit {
  constructor(@InjectModel(CAMPAIGN_MODEL) private readonly model: Model<CampaignDocument>) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.model.createIndexes();
  }

  async find(id: string): Promise<Campaign | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const d = await this.model.findById(id).lean<CampaignDocument>().exec();
    return d ? toCampaign(d) : null;
  }

  async listSending(): Promise<Campaign[]> {
    const docs = await this.model
      .find({ status: 'SENDING' })
      .sort({ createdAt: 1 })
      .lean<CampaignDocument[]>()
      .exec();
    return docs.map(toCampaign);
  }

  async save(c: Campaign): Promise<void> {
    const fields = {
      _id: new Types.ObjectId(c.id),
      kind: c.kind,
      cityId: c.cityId,
      venueIds: [...c.venueIds],
      status: c.status,
      cursor: c.cursor,
      createdAt: c.createdAt,
      finishedAt: c.finishedAt,
      version: c.version + 1,
    };
    if (c.version === 0) {
      await this.model.collection.insertOne({
        ...fields,
        blockCheckedAt: null,
        stats: { ...EMPTY_STATS },
      });
    } else {
      // Statistika `$inc` bilan alohida yuritiladi — bu yerda tegilmaydi
      await saveVersioned(this.model, fields as CampaignDocument, c.version);
    }
    c.markPersisted();
  }

  async increment(id: string, counter: CampaignCounter, by = 1): Promise<void> {
    if (!Types.ObjectId.isValid(id)) return;
    await this.model.collection.updateOne(
      { _id: new Types.ObjectId(id) },
      { $inc: { [`stats.${counter}`]: by } },
    );
  }

  async stats(id: string): Promise<CampaignStats | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const d = await this.model.findById(id, { stats: 1 }).lean<CampaignDocument>().exec();
    return d ? { ...EMPTY_STATS, ...d.stats } : null;
  }

  async claimForBlockCheck(
    settledBefore: Date,
  ): Promise<{ campaign: Campaign; stats: CampaignStats } | null> {
    const d = await this.model.collection.findOneAndUpdate(
      { status: 'DONE', finishedAt: { $lte: settledBefore }, blockCheckedAt: null },
      { $set: { blockCheckedAt: new Date() } },
      { returnDocument: 'after' },
    );
    if (!d) return null;
    const doc = d as unknown as CampaignDocument;
    return { campaign: toCampaign(doc), stats: { ...EMPTY_STATS, ...doc.stats } };
  }
}

// --- venue announcements (MK-5, EC-M2) ---

interface AnnouncementDocument {
  /** = venueId: har bir stadion uchun bitta e'lon */
  _id: string;
  cityId: string;
  status: 'PENDING' | 'CLAIMED' | 'CANCELLED';
  campaignId: string | null;
  createdAt: Date;
}

export const AnnouncementSchema = new Schema<AnnouncementDocument>(
  {
    _id: { type: String, required: true },
    cityId: { type: String, required: true },
    status: { type: String, required: true },
    campaignId: { type: String, default: null },
    createdAt: { type: Date, required: true },
  },
  { collection: 'venue_announcements', versionKey: false },
);
AnnouncementSchema.index({ status: 1, cityId: 1 }, { name: 'status_city' });

@Injectable()
export class MongoAnnouncementStore extends AnnouncementStore implements OnModuleInit {
  constructor(
    @InjectModel(ANNOUNCEMENT_MODEL) private readonly model: Model<AnnouncementDocument>,
  ) {
    super();
  }

  private get raw(): StringIdCollection {
    return this.model.collection as unknown as StringIdCollection;
  }

  async onModuleInit(): Promise<void> {
    await this.model.createIndexes();
  }

  async ensurePending(venueId: string, cityId: string, now: Date): Promise<void> {
    try {
      await this.raw.updateOne(
        { _id: venueId },
        { $setOnInsert: { cityId, status: 'PENDING', campaignId: null, createdAt: now } },
        { upsert: true },
      );
    } catch (error) {
      // Parallel upsert: ikkinchisi duplicate key oladi — e'lon allaqachon bor
      if (!isDuplicateKeyError(error)) throw error;
    }
  }

  async pendingCities(): Promise<string[]> {
    return (await this.model.distinct('cityId', { status: 'PENDING' }).exec()) as string[];
  }

  async claimPending(cityId: string, campaignId: string): Promise<string[]> {
    const pending = await this.model
      .find({ status: 'PENDING', cityId }, { _id: 1 })
      .lean<{ _id: string }[]>()
      .exec();
    const ids = pending.map((p) => p._id);
    if (ids.length === 0) return [];
    // Shartli yangilash: parallel jarayon allaqachon olgan e'lonlar bu kampaniyaga tushmaydi
    await this.raw.updateMany(
      { _id: { $in: ids }, status: 'PENDING' },
      { $set: { status: 'CLAIMED', campaignId } },
    );
    const claimed = await this.model
      .find({ _id: { $in: ids }, campaignId }, { _id: 1 })
      .lean<{ _id: string }[]>()
      .exec();
    return claimed.map((c) => c._id);
  }

  async cancel(venueIds: readonly string[]): Promise<void> {
    await this.raw.updateMany({ _id: { $in: [...venueIds] } }, { $set: { status: 'CANCELLED' } });
  }
}

// --- weekly quota (MK-2) ---

interface QuotaDocument {
  /** = userId */
  _id: string;
  sentAt: Date[];
}

export const QuotaSchema = new Schema<QuotaDocument>(
  { _id: { type: String, required: true }, sentAt: { type: [Date], default: [] } },
  { collection: 'marketing_quota', versionKey: false },
);

@Injectable()
export class MongoMarketingQuota extends MarketingQuota {
  constructor(@InjectModel(QUOTA_MODEL) private readonly model: Model<QuotaDocument>) {
    super();
  }

  private get raw(): StringIdCollection {
    return this.model.collection as unknown as StringIdCollection;
  }

  /**
   * Atomik: bitta pipeline-update eski yozuvlarni tozalaydi va limit bo'lsa yangisini qo'shadi.
   * Parallel ikki kampaniya bitta odamga 3-xabarni yubora olmaydi.
   */
  async tryReserve(userId: string, now: Date): Promise<boolean> {
    const since = new Date(now.getTime() - WEEK_MS);
    const recent = {
      $filter: { input: { $ifNull: ['$sentAt', []] }, cond: { $gt: ['$$this', since] } },
    };
    const after = await this.raw.findOneAndUpdate(
      { _id: userId },
      [
        { $set: { sentAt: recent } },
        { $set: { reserved: { $lt: [{ $size: '$sentAt' }, WEEKLY_LIMIT] } } },
        {
          $set: {
            sentAt: { $cond: ['$reserved', { $concatArrays: ['$sentAt', [now]] }, '$sentAt'] },
          },
        },
      ],
      { upsert: true, returnDocument: 'after' },
    );
    const doc = after as unknown as (QuotaDocument & { reserved?: boolean }) | null;
    return doc?.reserved === true;
  }
}
