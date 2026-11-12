import { Module, type OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CatalogModule } from '../catalog/index.js';
import { IdentityModule } from '../identity/index.js';
import { OccupancyRegistry, SchedulingModule } from '../scheduling/index.js';
import { BookingQueries } from './application/booking.queries.js';
import { BookingService } from './application/booking.service.js';
import { BookingStore } from './domain/booking-store.js';
import {
  BLOCK_MODEL,
  BlockSchema,
  BOOKING_MODEL,
  BookingSchema,
  SLOT_LOCK_MODEL,
  SlotLockSchema,
} from './infrastructure/booking.schemas.js';
import { MongoBookingStore } from './infrastructure/mongo-booking.store.js';
import { BookingSweeper } from './interface/booking-sweeper.js';
import { BookingFlowBotFeature } from './interface/telegram/booking-flow.bot.js';
import { MyBookingsBotFeature } from './interface/telegram/my-bookings.bot.js';

/** Booking (TZ 4.4) — core domain. */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BOOKING_MODEL, schema: BookingSchema },
      { name: SLOT_LOCK_MODEL, schema: SlotLockSchema },
      { name: BLOCK_MODEL, schema: BlockSchema },
    ]),
    CatalogModule,
    SchedulingModule,
    IdentityModule,
  ],
  providers: [
    { provide: BookingStore, useClass: MongoBookingStore },
    BookingService,
    BookingQueries,
    BookingFlowBotFeature,
    MyBookingsBotFeature,
    BookingSweeper,
  ],
  exports: [BookingService, BookingQueries, BookingSweeper],
})
export class BookingModule implements OnModuleInit {
  constructor(
    private readonly registry: OccupancyRegistry,
    private readonly store: BookingStore,
  ) {}

  /** TZ SP-8: Scheduling bandlikni Booking'dan oladi (port orqali, aylanma bog'liqliksiz). */
  onModuleInit(): void {
    this.registry.use({ load: (pitchIds, from, to) => this.store.occupancy(pitchIds, from, to) });
  }
}
