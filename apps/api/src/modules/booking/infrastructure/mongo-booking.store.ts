import { Injectable, type OnModuleInit } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ConcurrencyConflictError, Money, PhoneNumber, TimeRange } from '@polya/shared-kernel';
import { type ClientSession, type Connection, type Model, type QueryFilter, Types } from 'mongoose';
import { isDuplicateKeyError, saveVersioned } from '../../../platform/database/versioned-save.js';
import { SLOT_MINUTES } from '../../scheduling/index.js';
import { Block, type BlockId } from '../domain/block.js';
import { Booking, type BookingId, type BookingStatus } from '../domain/booking.js';
import {
  BookingStore,
  DuplicateActiveRequestError,
  type PitchOccupancyView,
  SlotTakenError,
} from '../domain/booking-store.js';
import {
  BLOCK_MODEL,
  type BlockDocument,
  BOOKING_MODEL,
  type BookingDocument,
  SLOT_LOCK_MODEL,
  type SlotLockDocument,
} from './booking.schemas.js';

const oid = (id: string) => new Types.ObjectId(id);
const validIds = (ids: readonly string[]) =>
  ids.filter((id) => Types.ObjectId.isValid(id)).map(oid);
const ACTIVE: BookingStatus[] = ['PENDING', 'CONFIRMED'];

@Injectable()
export class MongoBookingStore extends BookingStore implements OnModuleInit {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(BOOKING_MODEL) private readonly bookings: Model<BookingDocument>,
    @InjectModel(SLOT_LOCK_MODEL) private readonly locks: Model<SlotLockDocument>,
    @InjectModel(BLOCK_MODEL) private readonly blocks: Model<BlockDocument>,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await Promise.all([
      this.bookings.createIndexes(),
      this.locks.createIndexes(),
      this.blocks.createIndexes(),
    ]);
  }

  async findById(id: BookingId): Promise<Booking | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return toBooking(await this.bookings.findById(id).lean<BookingDocument>().exec());
  }

  async findByCode(code: string): Promise<Booking | null> {
    return toBooking(await this.bookings.findOne({ code }).lean<BookingDocument>().exec());
  }

  async findActiveOverlapping(pitchId: string, range: TimeRange): Promise<Booking[]> {
    return this.many({
      pitchId: oid(pitchId),
      status: { $in: ACTIVE },
      start: { $lt: range.end },
      end: { $gt: range.start },
    });
  }

  async findPlayerActiveOverlapping(playerId: string, range: TimeRange): Promise<Booking[]> {
    if (!Types.ObjectId.isValid(playerId)) return [];
    return this.many({
      playerId: oid(playerId),
      status: { $in: ACTIVE },
      start: { $lt: range.end },
      end: { $gt: range.start },
    });
  }

  async countPlayerPending(playerId: string): Promise<number> {
    if (!Types.ObjectId.isValid(playerId)) return 0;
    return this.bookings.countDocuments({ playerId: oid(playerId), status: 'PENDING' });
  }

  async listByPlayer(
    playerId: string,
    f: { endAfter?: Date; endBefore?: Date; statuses?: BookingStatus[]; limit: number },
  ): Promise<Booking[]> {
    if (!Types.ObjectId.isValid(playerId)) return [];
    const filter: QueryFilter<BookingDocument> = { playerId: oid(playerId) };
    if (f.statuses) filter.status = { $in: f.statuses };
    if (f.endAfter || f.endBefore) {
      filter.end = {
        ...(f.endAfter ? { $gt: f.endAfter } : {}),
        ...(f.endBefore ? { $lte: f.endBefore } : {}),
      };
    }
    const upcoming = Boolean(f.endAfter);
    const docs = await this.bookings
      .find(filter)
      .sort({ start: upcoming ? 1 : -1 })
      .limit(f.limit)
      .lean<BookingDocument[]>()
      .exec();
    return docs.map((d) => toBooking(d) as Booking);
  }

  async listByVenues(
    venueIds: readonly string[],
    f: { from: Date; to: Date; statuses?: BookingStatus[] },
  ): Promise<Booking[]> {
    return this.many(
      {
        venueId: { $in: validIds(venueIds) },
        start: { $lt: f.to },
        end: { $gt: f.from },
        ...(f.statuses ? { status: { $in: f.statuses } } : {}),
      },
      { start: 1 },
    );
  }

  async listPendingByVenues(venueIds: readonly string[]): Promise<Booking[]> {
    return this.many(
      { venueId: { $in: validIds(venueIds) }, status: 'PENDING' },
      { start: 1, createdAt: 1 },
    );
  }

  async findDueForExpiry(now: Date, limit: number): Promise<Booking[]> {
    return this.many({ status: 'PENDING', expiresAt: { $lte: now } }, { expiresAt: 1 }, limit);
  }

  async findDueForCompletion(now: Date, limit: number): Promise<Booking[]> {
    return this.many({ status: 'CONFIRMED', end: { $lte: now } }, { end: 1 }, limit);
  }

  async occupancy(
    pitchIds: readonly string[],
    from: Date,
    to: Date,
  ): Promise<Map<string, PitchOccupancyView>> {
    const ids = validIds(pitchIds);
    const [locks, pending] = await Promise.all([
      this.locks
        .find({ pitchId: { $in: ids }, slotStart: { $gte: from, $lt: to } })
        .lean<SlotLockDocument[]>()
        .exec(),
      this.bookings
        .find({ pitchId: { $in: ids }, status: 'PENDING', start: { $lt: to }, end: { $gt: from } })
        .lean<BookingDocument[]>()
        .exec(),
    ]);
    const result = new Map<string, PitchOccupancyView>();
    const of = (pitchId: string) => {
      const existing = result.get(pitchId);
      if (existing) return existing;
      const created: PitchOccupancyView = { booked: new Set(), requested: new Map() };
      result.set(pitchId, created);
      return created;
    };
    for (const l of locks) of(l.pitchId.toHexString()).booked.add(l.slotStart.getTime());
    for (const b of pending) {
      const view = of(b.pitchId.toHexString());
      for (const part of TimeRange.of(b.start, b.end).split(SLOT_MINUTES)) {
        const key = part.start.getTime();
        view.requested.set(key, (view.requested.get(key) ?? 0) + 1);
      }
    }
    return result;
  }

  async insertRequest(booking: Booking): Promise<void> {
    try {
      await saveVersioned(this.bookings, toDoc(booking), 0);
    } catch (error) {
      if (isDuplicateKeyError(error) && 'activeKey' in (error.keyPattern ?? {})) {
        throw new DuplicateActiveRequestError('Player already has an active request for this slot');
      }
      throw error;
    }
    booking.markPersisted();
  }

  async save(booking: Booking): Promise<void> {
    await saveVersioned(this.bookings, toDoc(booking), booking.version);
    booking.markPersisted();
  }

  async commitOccupy(booking: Booking, rejected: readonly Booking[]): Promise<void> {
    await this.transaction(async (session) => {
      await saveVersioned(this.bookings, toDoc(booking), booking.version, session);
      await this.lock(booking.pitchId, booking.range, 'BOOKING', booking.id, session);
      for (const r of rejected) await saveVersioned(this.bookings, toDoc(r), r.version, session);
    });
    for (const b of [booking, ...rejected]) b.markPersisted();
  }

  async commitRelease(booking: Booking): Promise<void> {
    await this.transaction(async (session) => {
      await saveVersioned(this.bookings, toDoc(booking), booking.version, session);
      await this.locks.collection.deleteMany({ ownerRefId: oid(booking.id) }, { session });
    });
    booking.markPersisted();
  }

  async findBlock(id: BlockId): Promise<Block | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return toBlock(await this.blocks.findById(id).lean<BlockDocument>().exec());
  }

  async listActiveBlocks(pitchIds: readonly string[], from: Date, to: Date): Promise<Block[]> {
    const docs = await this.blocks
      .find({
        pitchId: { $in: validIds(pitchIds) },
        removedAt: null,
        start: { $lt: to },
        end: { $gt: from },
      })
      .sort({ start: 1 })
      .lean<BlockDocument[]>()
      .exec();
    return docs.map((d) => toBlock(d) as Block);
  }

  async commitBlock(block: Block, rejected: readonly Booking[]): Promise<void> {
    await this.transaction(async (session) => {
      await saveVersioned(this.blocks, toBlockDoc(block), block.version, session);
      await this.lock(block.pitchId, block.range, 'BLOCK', block.id, session);
      for (const r of rejected) await saveVersioned(this.bookings, toDoc(r), r.version, session);
    });
    block.markPersisted();
    for (const r of rejected) r.markPersisted();
  }

  async commitUnblock(block: Block): Promise<void> {
    await this.transaction(async (session) => {
      await saveVersioned(this.blocks, toBlockDoc(block), block.version, session);
      await this.locks.collection.deleteMany({ ownerRefId: oid(block.id) }, { session });
    });
    block.markPersisted();
  }

  /** Har bir 1 soatlik bo'lak uchun lock; biri band bo'lsa — butun tranzaksiya bekor (E11000 → SlotTakenError). */
  private async lock(
    pitchId: string,
    range: TimeRange,
    ownerType: 'BOOKING' | 'BLOCK',
    ownerRefId: string,
    session: ClientSession,
  ): Promise<void> {
    const now = new Date();
    const docs = range.split(SLOT_MINUTES).map((part) => ({
      _id: new Types.ObjectId(),
      pitchId: oid(pitchId),
      slotStart: part.start,
      ownerType,
      ownerRefId: oid(ownerRefId),
      createdAt: now,
    }));
    try {
      await this.locks.collection.insertMany(docs, { session, ordered: true });
    } catch (error) {
      // E11000 — slot allaqachon band; WriteConflict — boshqa tranzaksiya aynan hozir shu slotni olyapti.
      // Ikkalasi ham "slot band": qayta urinish faqat raqobatni kuchaytiradi (50 parallel tasdiqlash testi).
      if (isDuplicateKeyError(error) || isWriteConflict(error))
        throw new SlotTakenError('Slot is already taken');
      throw error;
    }
  }

  /**
   * Bitta urinishli tranzaksiya. `withTransaction`ning avtomatik qayta urinishi ishlatilmaydi:
   * slot uchun raqobat (WriteConflict) — biznes natija (SlotTaken), vaqtinchalik xato emas.
   * Faqat commit natijasi noma'lum bo'lsa (tarmoq) commit qayta yuboriladi.
   */
  private async transaction(work: (session: ClientSession) => Promise<void>): Promise<void> {
    const session = await this.connection.startSession();
    try {
      session.startTransaction({
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
      });
      try {
        await work(session);
      } catch (error) {
        await session.abortTransaction().catch(() => undefined);
        if (error instanceof SlotTakenError || error instanceof ConcurrencyConflictError)
          throw error;
        if (isWriteConflict(error)) throw new ConcurrencyConflictError('Concurrent modification');
        if (isDuplicateKeyError(error)) throw new SlotTakenError('Slot is already taken');
        throw error;
      }
      for (let attempt = 1; ; attempt++) {
        try {
          await session.commitTransaction();
          return;
        } catch (error) {
          if (attempt < 3 && hasLabel(error, 'UnknownTransactionCommitResult')) continue;
          throw error;
        }
      }
    } finally {
      await session.endSession();
    }
  }

  private async many(
    filter: QueryFilter<BookingDocument>,
    sort: Record<string, 1 | -1> = { start: 1 },
    limit = 500,
  ): Promise<Booking[]> {
    const docs = await this.bookings
      .find(filter)
      .sort(sort)
      .limit(limit)
      .lean<BookingDocument[]>()
      .exec();
    return docs.map((d) => toBooking(d) as Booking);
  }
}

function toDoc(b: Booking): BookingDocument {
  return {
    _id: oid(b.id),
    code: b.code,
    pitchId: oid(b.pitchId),
    venueId: oid(b.venueId),
    ownerId: oid(b.ownerId),
    playerId: b.playerId ? oid(b.playerId) : null,
    guest: b.guest ? { name: b.guest.name, phone: b.guest.phone?.value ?? null } : null,
    source: b.source,
    start: b.range.start,
    end: b.range.end,
    businessDate: b.businessDate,
    price: b.price.amount,
    currency: b.price.currency,
    status: b.status,
    rejectReason: b.rejectReason,
    note: b.note,
    expiresAt: b.expiresAt,
    confirmedBy: b.confirmedBy,
    lateCancel: b.lateCancel,
    history: b.history.map((h) => ({ ...h })),
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
    activeKey:
      b.isActive && b.playerId ? `${b.playerId}:${b.pitchId}:${b.range.start.getTime()}` : null,
    version: b.version + 1,
  };
}

function toBooking(d: BookingDocument | null): Booking | null {
  if (!d) return null;
  return Booking.reconstitute(
    d._id.toHexString() as BookingId,
    {
      code: d.code,
      pitchId: d.pitchId.toHexString(),
      venueId: d.venueId.toHexString(),
      ownerId: d.ownerId.toHexString(),
      playerId: d.playerId?.toHexString() ?? null,
      guest: d.guest
        ? { name: d.guest.name, phone: d.guest.phone ? PhoneNumber.parse(d.guest.phone) : null }
        : null,
      source: d.source,
      range: TimeRange.of(d.start, d.end),
      businessDate: d.businessDate,
      price: Money.of(d.price, d.currency),
      status: d.status,
      rejectReason: d.rejectReason,
      note: d.note,
      expiresAt: d.expiresAt,
      confirmedBy: d.confirmedBy,
      lateCancel: d.lateCancel,
      history: d.history,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    },
    d.version,
  );
}

function toBlockDoc(b: Block): BlockDocument {
  return {
    _id: oid(b.id),
    pitchId: oid(b.pitchId),
    venueId: oid(b.venueId),
    start: b.range.start,
    end: b.range.end,
    reason: b.reason,
    createdBy: b.createdBy,
    createdAt: b.createdAt,
    removedAt: b.removedAt,
    version: b.version + 1,
  };
}

function toBlock(d: BlockDocument | null): Block | null {
  if (!d) return null;
  return Block.reconstitute(
    d._id.toHexString() as BlockId,
    {
      pitchId: d.pitchId.toHexString(),
      venueId: d.venueId.toHexString(),
      range: TimeRange.of(d.start, d.end),
      reason: d.reason,
      createdBy: d.createdBy,
      createdAt: d.createdAt,
      removedAt: d.removedAt,
    },
    d.version,
  );
}

const WRITE_CONFLICT = 112;

function isWriteConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    ((error as { code?: unknown }).code === WRITE_CONFLICT ||
      hasLabel(error, 'TransientTransactionError'))
  );
}

function hasLabel(error: unknown, label: string): boolean {
  const fn = (error as { hasErrorLabel?: (l: string) => boolean } | null)?.hasErrorLabel;
  return typeof fn === 'function' && fn.call(error, label);
}
