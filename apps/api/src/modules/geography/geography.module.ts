import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GeographyAdminService, GeographyQueries } from './application/geography.service.js';
import { CityRepository, LandmarkRepository } from './domain/repositories.js';
import {
  CITY_MODEL,
  CitySchema,
  LANDMARK_MODEL,
  LandmarkSchema,
} from './infrastructure/geography.schemas.js';
import {
  MongoCityRepository,
  MongoLandmarkRepository,
} from './infrastructure/mongo-geography.repositories.js';
import { GeographyAdminBotFeature } from './interface/telegram/geography-admin.bot.js';

/** Geography (TZ 4.2.1): shaharlar, hududlar, orientirlar. Faqat Admin boshqaradi. */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CITY_MODEL, schema: CitySchema },
      { name: LANDMARK_MODEL, schema: LandmarkSchema },
    ]),
  ],
  providers: [
    { provide: CityRepository, useClass: MongoCityRepository },
    { provide: LandmarkRepository, useClass: MongoLandmarkRepository },
    GeographyAdminService,
    GeographyQueries,
    GeographyAdminBotFeature,
  ],
  exports: [GeographyQueries, GeographyAdminService],
})
export class GeographyModule {}
