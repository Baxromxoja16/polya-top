import { Injectable, type OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model, Schema, Types } from 'mongoose';
import { FavoritesRepository } from '../domain/favorites.js';

export const FAVORITE_MODEL = 'Favorite';

interface FavoriteDocument {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  venueId: Types.ObjectId;
  createdAt: Date;
}

export const FavoriteSchema = new Schema<FavoriteDocument>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    venueId: { type: Schema.Types.ObjectId, required: true },
    createdAt: { type: Date, required: true },
  },
  { collection: 'favorites', versionKey: false },
);
FavoriteSchema.index({ userId: 1, venueId: 1 }, { unique: true, name: 'uniq_user_venue' });
FavoriteSchema.index({ userId: 1, createdAt: -1 }, { name: 'user_recent' });

const oid = (id: string) => new Types.ObjectId(id);

@Injectable()
export class MongoFavoritesRepository extends FavoritesRepository implements OnModuleInit {
  constructor(@InjectModel(FAVORITE_MODEL) private readonly model: Model<FavoriteDocument>) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.model.createIndexes();
  }

  async add(userId: string, venueId: string, now: Date): Promise<void> {
    // Upsert — ikki marta bosilsa ham bitta yozuv
    await this.model.updateOne(
      { userId: oid(userId), venueId: oid(venueId) },
      { $setOnInsert: { createdAt: now } },
      { upsert: true },
    );
  }

  async remove(userId: string, venueId: string): Promise<void> {
    await this.model.deleteOne({ userId: oid(userId), venueId: oid(venueId) });
  }

  async has(userId: string, venueId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(venueId)) return false;
    return (await this.model.exists({ userId: oid(userId), venueId: oid(venueId) })) !== null;
  }

  async venueIdsOf(userId: string, limit: number): Promise<string[]> {
    if (!Types.ObjectId.isValid(userId)) return [];
    const docs = await this.model
      .find({ userId: oid(userId) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean<FavoriteDocument[]>()
      .exec();
    return docs.map((d) => d.venueId.toHexString());
  }
}
