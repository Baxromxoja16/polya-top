import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model, Schema, Types } from 'mongoose';
import { saveVersioned } from '../../../platform/database/versioned-save.js';
import {
  Subscription,
  type SubscriptionPeriod,
  SubscriptionStore,
} from '../domain/subscription.js';

export const SUBSCRIPTION_MODEL = 'Subscription';

interface SubscriptionDocument {
  /** = venueId */
  _id: Types.ObjectId;
  history: SubscriptionPeriod[];
  version: number;
}

export const SubscriptionSchema = new Schema<SubscriptionDocument>(
  {
    history: { type: Schema.Types.Mixed, default: [] },
    version: { type: Number, required: true },
  },
  { collection: 'subscriptions', versionKey: false },
);

@Injectable()
export class MongoSubscriptionStore extends SubscriptionStore {
  constructor(
    @InjectModel(SUBSCRIPTION_MODEL) private readonly model: Model<SubscriptionDocument>,
  ) {
    super();
  }

  async find(venueId: string): Promise<Subscription | null> {
    return (await this.findMany([venueId]))[0] ?? null;
  }

  async findMany(venueIds: readonly string[]): Promise<Subscription[]> {
    const ids = venueIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
    const docs = await this.model
      .find({ _id: { $in: ids } })
      .lean<SubscriptionDocument[]>()
      .exec();
    return docs.map((d) =>
      Subscription.reconstitute(
        d._id.toHexString(),
        d.history.map((p) => ({
          ...p,
          startsAt: new Date(p.startsAt),
          endsAt: new Date(p.endsAt),
        })),
        d.version,
      ),
    );
  }

  async save(subscription: Subscription): Promise<void> {
    await saveVersioned(
      this.model,
      {
        _id: new Types.ObjectId(subscription.venueId),
        history: subscription.history.map((p) => ({ ...p })),
        version: subscription.version + 1,
      },
      subscription.version,
    );
    subscription.markPersisted();
  }
}
