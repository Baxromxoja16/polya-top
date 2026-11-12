import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GeographyModule } from '../geography/index.js';
import { SchedulingModule } from '../scheduling/index.js';
import { CatalogQueries } from './application/catalog.queries.js';
import { RegisterVenueUseCase } from './application/register-venue.use-case.js';
import { VenueManagementService } from './application/venue-management.service.js';
import { PitchRepository, VenueRepository } from './domain/repositories.js';
import {
  PITCH_MODEL,
  PitchSchema,
  VENUE_MODEL,
  VenueSchema,
} from './infrastructure/catalog.schemas.js';
import {
  MongoPitchRepository,
  MongoVenueRepository,
} from './infrastructure/mongo-catalog.repositories.js';

/** Venue Catalog (TZ 4.2): stadionlar, maydonlar, qidiruv. */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: VENUE_MODEL, schema: VenueSchema },
      { name: PITCH_MODEL, schema: PitchSchema },
    ]),
    GeographyModule,
    SchedulingModule,
  ],
  providers: [
    { provide: VenueRepository, useClass: MongoVenueRepository },
    { provide: PitchRepository, useClass: MongoPitchRepository },
    RegisterVenueUseCase,
    VenueManagementService,
    CatalogQueries,
  ],
  exports: [CatalogQueries],
})
export class CatalogModule {}
