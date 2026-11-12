import { Injectable, type OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model, Schema, Types } from 'mongoose';
import { isDuplicateKeyError, saveVersioned } from '../../../platform/database/versioned-save.js';
import {
  DuplicateReviewError,
  type HiddenReason,
  type OwnerReply,
  Review,
  type ReviewId,
  type ReviewStatus,
  ReviewStore,
} from '../domain/review.js';

export const REVIEW_MODEL = 'Review';

interface ReviewDocument {
  _id: Types.ObjectId;
  bookingId: Types.ObjectId;
  venueId: Types.ObjectId;
  pitchId: Types.ObjectId;
  authorId: Types.ObjectId;
  rating: number;
  text: string | null;
  status: ReviewStatus;
  hiddenReason: HiddenReason | null;
  reporters: string[];
  ownerReply: OwnerReply | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export const ReviewSchema = new Schema<ReviewDocument>(
  {
    bookingId: { type: Schema.Types.ObjectId, required: true },
    venueId: { type: Schema.Types.ObjectId, required: true },
    pitchId: { type: Schema.Types.ObjectId, required: true },
    authorId: { type: Schema.Types.ObjectId, required: true },
    rating: { type: Number, required: true },
    text: { type: String, default: null },
    status: { type: String, required: true },
    hiddenReason: { type: String, default: null },
    reporters: { type: [String], default: [] },
    ownerReply: { type: Schema.Types.Mixed, default: null },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
    version: { type: Number, required: true },
  },
  { collection: 'reviews', versionKey: false },
);
// TZ RV-1: bitta bandlov — bitta sharh
ReviewSchema.index({ bookingId: 1 }, { unique: true, name: 'uniq_booking' });
ReviewSchema.index({ venueId: 1, status: 1, createdAt: -1 }, { name: 'venue_status_recent' });
ReviewSchema.index({ status: 1, updatedAt: 1 }, { name: 'moderation' });

const oid = (id: string) => new Types.ObjectId(id);

@Injectable()
export class MongoReviewStore extends ReviewStore implements OnModuleInit {
  constructor(@InjectModel(REVIEW_MODEL) private readonly model: Model<ReviewDocument>) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.model.createIndexes();
  }

  async findById(id: ReviewId): Promise<Review | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return toReview(await this.model.findById(id).lean<ReviewDocument>().exec());
  }

  async findByBooking(bookingId: string): Promise<Review | null> {
    if (!Types.ObjectId.isValid(bookingId)) return null;
    return toReview(
      await this.model
        .findOne({ bookingId: oid(bookingId) })
        .lean<ReviewDocument>()
        .exec(),
    );
  }

  async listVisibleByVenue(venueId: string, limit: number, offset = 0): Promise<Review[]> {
    if (!Types.ObjectId.isValid(venueId)) return [];
    const docs = await this.model
      .find({ venueId: oid(venueId), status: 'VISIBLE' })
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .lean<ReviewDocument[]>()
      .exec();
    return docs.map((d) => toReview(d) as Review);
  }

  async listHidden(limit: number): Promise<Review[]> {
    const docs = await this.model
      .find({ status: 'HIDDEN' })
      .sort({ updatedAt: 1 })
      .limit(limit)
      .lean<ReviewDocument[]>()
      .exec();
    return docs.map((d) => toReview(d) as Review);
  }

  async ratingOf(venueId: string): Promise<{ avg: number; count: number }> {
    const [row] = await this.model
      .aggregate<{ avg: number; count: number }>([
        { $match: { venueId: oid(venueId), status: 'VISIBLE' } },
        { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
      ])
      .exec();
    return { avg: row?.avg ?? 0, count: row?.count ?? 0 };
  }

  async save(review: Review): Promise<void> {
    try {
      await saveVersioned(
        this.model,
        {
          _id: oid(review.id),
          bookingId: oid(review.bookingId),
          venueId: oid(review.venueId),
          pitchId: oid(review.pitchId),
          authorId: oid(review.authorId),
          rating: review.rating,
          text: review.text,
          status: review.status,
          hiddenReason: review.hiddenReason,
          reporters: [...review.reporters],
          ownerReply: review.ownerReply,
          createdAt: review.createdAt,
          updatedAt: review.updatedAt,
          version: review.version + 1,
        },
        review.version,
      );
    } catch (error) {
      if (isDuplicateKeyError(error))
        throw new DuplicateReviewError('Booking already has a review');
      throw error;
    }
    review.markPersisted();
  }
}

function toReview(d: ReviewDocument | null): Review | null {
  if (!d) return null;
  return Review.reconstitute(
    d._id.toHexString() as ReviewId,
    {
      bookingId: d.bookingId.toHexString(),
      venueId: d.venueId.toHexString(),
      pitchId: d.pitchId.toHexString(),
      authorId: d.authorId.toHexString(),
      rating: d.rating,
      text: d.text,
      status: d.status,
      hiddenReason: d.hiddenReason,
      reporters: d.reporters,
      ownerReply: d.ownerReply,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    },
    d.version,
  );
}
