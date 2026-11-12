import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GeographyModule } from '../geography/index.js';
import { IdentityModule } from '../identity/index.js';
import { SchedulingModule } from '../scheduling/index.js';
import { CatalogQueries } from './application/catalog.queries.js';
import { FavoritesService } from './application/favorites.service.js';
import { FreeSearchService } from './application/free-search.service.js';
import { RegisterVenueUseCase } from './application/register-venue.use-case.js';
import { VenueManagementService } from './application/venue-management.service.js';
import { FavoritesRepository } from './domain/favorites.js';
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
import {
  FAVORITE_MODEL,
  FavoriteSchema,
  MongoFavoritesRepository,
} from './infrastructure/mongo-favorites.repository.js';
import { OwnerOnboardingBotFeature } from './interface/telegram/owner-onboarding.bot.js';
import { OwnerScheduleBotFeature } from './interface/telegram/owner-schedule.bot.js';
import { OwnerVenueBotFeature } from './interface/telegram/owner-venue.bot.js';
import {
  PlayerSearchBotFeature,
  VenueDeepLinkBotFeature,
} from './interface/telegram/player-search.bot.js';

/** Venue Catalog (TZ 4.2): stadionlar, maydonlar, qidiruv. */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: VENUE_MODEL, schema: VenueSchema },
      { name: PITCH_MODEL, schema: PitchSchema },
      { name: FAVORITE_MODEL, schema: FavoriteSchema },
    ]),
    GeographyModule,
    SchedulingModule,
    IdentityModule,
  ],
  providers: [
    { provide: VenueRepository, useClass: MongoVenueRepository },
    { provide: PitchRepository, useClass: MongoPitchRepository },
    { provide: FavoritesRepository, useClass: MongoFavoritesRepository },
    FavoritesService,
    FreeSearchService,
    RegisterVenueUseCase,
    VenueManagementService,
    CatalogQueries,
    OwnerOnboardingBotFeature,
    OwnerVenueBotFeature,
    OwnerScheduleBotFeature,
    PlayerSearchBotFeature,
    VenueDeepLinkBotFeature,
  ],
  exports: [CatalogQueries],
})
export class CatalogModule {}
