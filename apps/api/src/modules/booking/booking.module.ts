import { Module, type OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CatalogModule } from '../catalog/index.js';
import { IdentityModule } from '../identity/index.js';
import { OccupancyRegistry, SchedulingModule } from '../scheduling/index.js';
import { BookingQueries } from './application/booking.queries.js';
import { BookingService } from './application/booking.service.js';
import { SlotWatchService } from './application/slot-watch.service.js';
import { BookingStore } from './domain/booking-store.js';
import { SlotWatchStore } from './domain/slot-watch.js';
import {
  BLOCK_MODEL,
  BlockSchema,
  BOOKING_MODEL,
  BookingSchema,
  SLOT_LOCK_MODEL,
  SlotLockSchema,
} from './infrastructure/booking.schemas.js';
import { MongoBookingStore } from './infrastructure/mongo-booking.store.js';
import {
  MongoSlotWatchStore,
  SLOT_WATCH_MODEL,
  SlotWatchSchema,
} from './infrastructure/mongo-slot-watch.store.js';
import { BookingSweeper } from './interface/booking-sweeper.js';
import { BookingsController } from './interface/http/bookings.controller.js';
import { BookingFlowBotFeature } from './interface/telegram/booking-flow.bot.js';
import { MyBookingsBotFeature } from './interface/telegram/my-bookings.bot.js';
import { OwnerBookingsBotFeature } from './interface/telegram/owner-bookings.bot.js';
import { SlotWatchBotFeature } from './interface/telegram/slot-watch.bot.js';

/** Booking (TZ 4.4) — core domain. */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BOOKING_MODEL, schema: BookingSchema },
      { name: SLOT_LOCK_MODEL, schema: SlotLockSchema },
      { name: BLOCK_MODEL, schema: BlockSchema },
      { name: SLOT_WATCH_MODEL, schema: SlotWatchSchema },
    ]),
    CatalogModule,
    SchedulingModule,
    IdentityModule,
  ],
  controllers: [BookingsController],
  providers: [
    { provide: BookingStore, useClass: MongoBookingStore },
    { provide: SlotWatchStore, useClass: MongoSlotWatchStore },
    SlotWatchService,
    SlotWatchBotFeature,
    BookingService,
    BookingQueries,
    BookingFlowBotFeature,
    MyBookingsBotFeature,
    OwnerBookingsBotFeature,
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
