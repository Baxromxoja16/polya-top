import { Injectable, Logger, Module, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection, MongooseModule } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import type { Env } from '../../config/env.schema.js';

export class ReplicaSetRequiredError extends Error {
  override readonly name = 'ReplicaSetRequiredError';
}

/**
 * Double booking kafolati Mongo tranzaksiyalariga tayanadi (TZ 7.5, ADR-0002),
 * tranzaksiyalar esa faqat replica set'da ishlaydi. Standalone Mongo bilan ilova ishga tushmaydi.
 */
@Injectable()
export class ReplicaSetGuard implements OnApplicationBootstrap {
  readonly #logger = new Logger(ReplicaSetGuard.name);

  constructor(@InjectConnection() private readonly connection: Connection) {}

  async onApplicationBootstrap(): Promise<void> {
    const db = this.connection.db;
    if (!db) throw new ReplicaSetRequiredError('MongoDB connection is not established');
    const hello = await db.admin().command({ hello: 1 });
    if (typeof hello.setName !== 'string') {
      throw new ReplicaSetRequiredError(
        'MongoDB must run as a replica set: transactions are required (see docs/adr/0002)',
      );
    }
    this.#logger.log(`MongoDB replica set "${hello.setName}" detected`);
  }
}

@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        uri: config.get('MONGO_URI', { infer: true }),
        // Produksiyada indekslar migratsiya orqali boshqariladi, avtomatik emas
        autoIndex: config.get('NODE_ENV', { infer: true }) !== 'production',
        serverSelectionTimeoutMS: 5_000,
      }),
    }),
  ],
  providers: [ReplicaSetGuard],
})
export class DatabaseModule {}
