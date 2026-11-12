import { Module, type OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CatalogModule } from '../catalog/index.js';
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
  ],
  providers: [
    { provide: BookingStore, useClass: MongoBookingStore },
    BookingService,
    BookingQueries,
  ],
  exports: [BookingService, BookingQueries],
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
