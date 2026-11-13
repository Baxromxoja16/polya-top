import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { type UserCounts, UserStatistics } from '../application/user-statistics.js';
import { USER_MODEL, type UserDocument } from './user.schema.js';

@Injectable()
export class MongoUserStatistics extends UserStatistics {
  constructor(@InjectModel(USER_MODEL) private readonly model: Model<UserDocument>) {
    super();
  }

  async counts(since: Date): Promise<UserCounts> {
    const [total, newSince, owners, blocked, botBlocked] = await Promise.all([
      this.model.estimatedDocumentCount().exec(),
      this.model.countDocuments({ createdAt: { $gte: since } }).exec(),
      this.model.countDocuments({ roles: 'OWNER' }).exec(),
      this.model.countDocuments({ status: 'BLOCKED' }).exec(),
      this.model.countDocuments({ botBlocked: true }).exec(),
    ]);
    return { total, newSince, owners, blocked, botBlocked };
  }
}
