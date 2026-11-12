import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DEFAULT_LANGUAGE, isLanguage } from '@polya/shared-kernel';
import { type Model, Types } from 'mongoose';
import { type AudienceMember, MarketingAudience } from '../application/marketing-audience.js';
import { USER_MODEL, type UserDocument } from './user.schema.js';

@Injectable()
export class MongoMarketingAudience extends MarketingAudience {
  constructor(@InjectModel(USER_MODEL) private readonly model: Model<UserDocument>) {
    super();
  }

  async page(cityId: string, afterUserId: string | null, limit: number): Promise<AudienceMember[]> {
    const docs = await this.model
      .find(
        {
          cityId,
          status: 'ACTIVE',
          botBlocked: { $ne: true },
          marketingOptOut: { $ne: true },
          ...(afterUserId ? { _id: { $gt: new Types.ObjectId(afterUserId) } } : {}),
        },
        { telegramId: 1, language: 1 },
      )
      .sort({ _id: 1 })
      .limit(limit)
      .lean<{ _id: Types.ObjectId; telegramId: number; language: string }[]>()
      .exec();
    return docs.map((d) => ({
      userId: d._id.toHexString(),
      telegramId: d.telegramId,
      language: isLanguage(d.language) ? d.language : DEFAULT_LANGUAGE,
    }));
  }
}
