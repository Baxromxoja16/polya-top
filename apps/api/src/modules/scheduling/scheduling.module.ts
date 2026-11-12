import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AvailabilityService } from './application/availability.service.js';
import { OccupancyRegistry } from './application/occupancy.js';
import { SchedulingFacade } from './application/scheduling.facade.js';
import { PitchScheduleRepository, PricingPlanRepository } from './domain/pitch-schedule.js';
import {
  MongoPitchScheduleRepository,
  MongoPricingPlanRepository,
  PRICING_MODEL,
  PricingSchema,
  SCHEDULE_MODEL,
  ScheduleSchema,
} from './infrastructure/mongo-scheduling.repositories.js';

/** Schedule & Pricing (TZ 4.3): maydonlarning ish vaqti va narxi. */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SCHEDULE_MODEL, schema: ScheduleSchema },
      { name: PRICING_MODEL, schema: PricingSchema },
    ]),
  ],
  providers: [
    { provide: PitchScheduleRepository, useClass: MongoPitchScheduleRepository },
    { provide: PricingPlanRepository, useClass: MongoPricingPlanRepository },
    SchedulingFacade,
    AvailabilityService,
    OccupancyRegistry,
  ],
  exports: [SchedulingFacade, AvailabilityService, OccupancyRegistry],
})
export class SchedulingModule {}
