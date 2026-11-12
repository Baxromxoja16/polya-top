import { Injectable, type OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Money, TimeRange } from '@polya/shared-kernel';
import { type Model, Schema, Types } from 'mongoose';
import { Promotion, PromotionStore } from '../domain/promotion.js';

export const PROMOTION_MODEL = 'Promotion';

interface PromotionDocument {
  _id: Types.ObjectId;
  venueId: string;
  pitchId: string;
  cityId: string;
  start: Date;
  end: Date;
  percent: number;
  basePrice: number;
  createdBy: string;
  createdAt: Date;
}

export const PromotionSchema = new Schema<PromotionDocument>(
  {
    venueId: { type: String, required: true },
    pitchId: { type: String, required: true },
    cityId: { type: String, required: true },
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    percent: { type: Number, required: true },
    basePrice: { type: Number, required: true },
    createdBy: { type: String, required: true },
    createdAt: { type: Date, required: true },
  },
  { collection: 'promotions', versionKey: false },
);
PromotionSchema.index({ pitchId: 1, end: 1 }, { name: 'pitch_end' });
PromotionSchema.index({ venueId: 1, createdAt: -1 }, { name: 'venue_created' });

const toDomain = (d: PromotionDocument) =>
  Promotion.reconstitute(d._id.toHexString(), {
    venueId: d.venueId,
    pitchId: d.pitchId,
    cityId: d.cityId,
    range: TimeRange.of(d.start, d.end),
    percent: d.percent,
    basePrice: Money.of(d.basePrice),
    createdBy: d.createdBy,
    createdAt: d.createdAt,
  });

@Injectable()
export class MongoPromotionStore extends PromotionStore implements OnModuleInit {
  constructor(@InjectModel(PROMOTION_MODEL) private readonly model: Model<PromotionDocument>) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.model.createIndexes();
  }

  async add(p: Promotion): Promise<void> {
    await this.model.collection.insertOne({
      _id: new Types.ObjectId(p.id),
      venueId: p.props.venueId,
      pitchId: p.props.pitchId,
      cityId: p.props.cityId,
      start: p.range.start,
      end: p.range.end,
      percent: p.props.percent,
      basePrice: p.props.basePrice.amount,
      createdBy: p.props.createdBy,
      createdAt: p.props.createdAt,
    });
  }

  async find(id: string): Promise<Promotion | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const d = await this.model.findById(id).lean<PromotionDocument>().exec();
    return d ? toDomain(d) : null;
  }

  async countSince(venueId: string, since: Date): Promise<number> {
    return this.model.countDocuments({ venueId, createdAt: { $gte: since } }).exec();
  }

  async overlapping(pitchIds: readonly string[], from: Date, to: Date): Promise<Promotion[]> {
    const docs = await this.model
      .find({ pitchId: { $in: [...pitchIds] }, start: { $lt: to }, end: { $gt: from } })
      .lean<PromotionDocument[]>()
      .exec();
    return docs.map(toDomain);
  }
}
