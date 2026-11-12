import { Schema, type Types } from 'mongoose';
import type { BookingSource, BookingStatus, RejectReason } from '../domain/booking.js';

export const BOOKING_MODEL = 'Booking';
export const SLOT_LOCK_MODEL = 'SlotLock';
export const BLOCK_MODEL = 'Block';

export interface BookingDocument {
  _id: Types.ObjectId;
  code: string;
  pitchId: Types.ObjectId;
  venueId: Types.ObjectId;
  ownerId: Types.ObjectId;
  playerId: Types.ObjectId | null;
  guest: { name: string; phone: string | null } | null;
  source: BookingSource;
  start: Date;
  end: Date;
  businessDate: string;
  price: number;
  currency: 'UZS';
  status: BookingStatus;
  rejectReason: RejectReason | null;
  note: string | null;
  expiresAt: Date | null;
  confirmedBy: string | null;
  lateCancel: boolean;
  history: {
    at: Date;
    from: BookingStatus | null;
    to: BookingStatus;
    by: string | null;
    note: string | null;
  }[];
  createdAt: Date;
  updatedAt: Date;
  /**
   * EC-B2: faol so'rov kaliti `player:pitch:start` — faqat PENDING/CONFIRMED'da to'ldiriladi.
   * Unique partial index ikki marta bosishdan ikkinchi so'rov yaratilishiga yo'l qo'ymaydi.
   */
  activeKey: string | null;
  version: number;
}

export const BookingSchema = new Schema<BookingDocument>(
  {
    code: { type: String, required: true },
    pitchId: { type: Schema.Types.ObjectId, required: true },
    venueId: { type: Schema.Types.ObjectId, required: true },
    ownerId: { type: Schema.Types.ObjectId, required: true },
    playerId: { type: Schema.Types.ObjectId, default: null },
    guest: { type: Schema.Types.Mixed, default: null },
    source: { type: String, required: true },
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    businessDate: { type: String, required: true },
    price: { type: Number, required: true },
    currency: { type: String, required: true },
    status: { type: String, required: true },
    rejectReason: { type: String, default: null },
    note: { type: String, default: null },
    expiresAt: { type: Date, default: null },
    confirmedBy: { type: String, default: null },
    lateCancel: { type: Boolean, default: false },
    history: { type: Schema.Types.Mixed, default: [] },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
    activeKey: { type: String, default: null },
    version: { type: Number, required: true },
  },
  { collection: 'bookings', versionKey: false },
);
BookingSchema.index({ code: 1 }, { unique: true, name: 'uniq_code' });
BookingSchema.index(
  { activeKey: 1 },
  {
    unique: true,
    name: 'uniq_active_request',
    partialFilterExpression: { activeKey: { $type: 'string' } },
  },
);
BookingSchema.index({ pitchId: 1, status: 1, start: 1 }, { name: 'pitch_status_start' });
BookingSchema.index({ playerId: 1, start: -1 }, { name: 'player_start' });
BookingSchema.index({ venueId: 1, start: 1 }, { name: 'venue_start' });
BookingSchema.index({ status: 1, expiresAt: 1 }, { name: 'status_expires' });
BookingSchema.index({ status: 1, end: 1 }, { name: 'status_end' });

/** TZ 7.5 / ADR-0002: double booking'ga qarshi kafolat — `{ pitchId, slotStart }` unique */
export interface SlotLockDocument {
  _id: Types.ObjectId;
  pitchId: Types.ObjectId;
  slotStart: Date;
  ownerType: 'BOOKING' | 'BLOCK';
  ownerRefId: Types.ObjectId;
  createdAt: Date;
}

export const SlotLockSchema = new Schema<SlotLockDocument>(
  {
    pitchId: { type: Schema.Types.ObjectId, required: true },
    slotStart: { type: Date, required: true },
    ownerType: { type: String, required: true },
    ownerRefId: { type: Schema.Types.ObjectId, required: true },
    createdAt: { type: Date, required: true },
  },
  { collection: 'slot_locks', versionKey: false },
);
SlotLockSchema.index({ pitchId: 1, slotStart: 1 }, { unique: true, name: 'uniq_pitch_slot' });
SlotLockSchema.index({ ownerRefId: 1 }, { name: 'owner_ref' });

export interface BlockDocument {
  _id: Types.ObjectId;
  pitchId: Types.ObjectId;
  venueId: Types.ObjectId;
  start: Date;
  end: Date;
  reason: string | null;
  createdBy: string;
  createdAt: Date;
  removedAt: Date | null;
  version: number;
}

export const BlockSchema = new Schema<BlockDocument>(
  {
    pitchId: { type: Schema.Types.ObjectId, required: true },
    venueId: { type: Schema.Types.ObjectId, required: true },
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    reason: { type: String, default: null },
    createdBy: { type: String, required: true },
    createdAt: { type: Date, required: true },
    removedAt: { type: Date, default: null },
    version: { type: Number, required: true },
  },
  { collection: 'blocks', versionKey: false },
);
BlockSchema.index({ pitchId: 1, start: 1 }, { name: 'pitch_start' });
