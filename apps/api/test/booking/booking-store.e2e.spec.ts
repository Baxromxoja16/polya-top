import { Money, ObjectIdGenerator, TimeRange } from '@polya/shared-kernel';
import { MongoDBContainer, type StartedMongoDBContainer } from '@testcontainers/mongodb';
import mongoose, { type Connection } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Block, type BlockId } from '../../src/modules/booking/domain/block.js';
import { Booking, type BookingId } from '../../src/modules/booking/domain/booking.js';
import {
  DuplicateActiveRequestError,
  SlotTakenError,
} from '../../src/modules/booking/domain/booking-store.js';
import {
  BLOCK_MODEL,
  BlockSchema,
  BOOKING_MODEL,
  type BookingDocument,
  BookingSchema,
  SLOT_LOCK_MODEL,
  SlotLockSchema,
} from '../../src/modules/booking/infrastructure/booking.schemas.js';
import { MongoBookingStore } from '../../src/modules/booking/infrastructure/mongo-booking.store.js';
import { MONGO_IMAGE } from '../support/test-app.js';

const ids = new ObjectIdGenerator();
const id = () => ids.next();
const now = new Date();
const hour = (h: number) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 2, h));
const pitchId = id();

const request = (startHour: number, hours = 1, playerId = id()) =>
  Booking.request({
    id: id() as BookingId,
    code: `PT-${id().slice(-6)}`,
    pitchId,
    venueId: id(),
    ownerId: id(),
    playerId,
    range: TimeRange.ofDuration(hour(startHour), hours * 60),
    businessDate: '2026-11-14',
    price: Money.of(150_000 * hours),
    now,
  });

describe('MongoBookingStore (e2e): ADR-0002 double booking guarantee', () => {
  let container: StartedMongoDBContainer;
  let connection: Connection;
  let store: MongoBookingStore;

  beforeAll(async () => {
    container = await new MongoDBContainer(MONGO_IMAGE).start();
    connection = await mongoose
      .createConnection(`${container.getConnectionString()}/booking-test?directConnection=true`)
      .asPromise();
    store = new MongoBookingStore(
      connection,
      connection.model<BookingDocument>(BOOKING_MODEL, BookingSchema) as never,
      connection.model(SLOT_LOCK_MODEL, SlotLockSchema) as never,
      connection.model(BLOCK_MODEL, BlockSchema) as never,
    );
    await store.onModuleInit();
  });

  afterAll(async () => {
    await connection?.close();
    await container?.stop();
  });

  beforeEach(async () => {
    await Promise.all(
      ['bookings', 'slot_locks', 'blocks'].map((c) => connection.collection(c).deleteMany({})),
    );
  });

  it('DoD: 50 parallel confirmations of different requests on one slot → exactly one wins', async () => {
    const requests = Array.from({ length: 50 }, () => request(15));
    for (const r of requests) await store.insertRequest(r);

    const results = await Promise.allSettled(
      requests.map(async (r) => {
        r.confirm('owner', now);
        await store.commitOccupy(r, []);
      }),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(failures.every((f) => f.reason instanceof SlotTakenError)).toBe(true);
    expect(await connection.collection('bookings').countDocuments({ status: 'CONFIRMED' })).toBe(1);
    expect(await connection.collection('slot_locks').countDocuments()).toBe(1);
  });

  it('EC-B1b: a partial overlap (19–21 vs 20–21) is caught at the 20:00 lock', async () => {
    const a = request(14, 2);
    const b = request(15, 1);
    await store.insertRequest(a);
    await store.insertRequest(b);
    a.confirm('owner', now);
    await store.commitOccupy(a, []);
    b.confirm('owner', now);
    await expect(store.commitOccupy(b, [])).rejects.toBeInstanceOf(SlotTakenError);
    // tranzaksiya bekor bo'ldi — B bazada hali PENDING
    expect((await store.findById(b.id))?.status).toBe('PENDING');
  });

  it('BK-3c: confirming rejects overlapping requests in the same transaction', async () => {
    const winner = request(15);
    const loser = request(15);
    await store.insertRequest(winner);
    await store.insertRequest(loser);
    winner.confirm('owner', now);
    loser.rejectAsTaken(now);
    await store.commitOccupy(winner, [loser]);
    expect((await store.findById(loser.id))?.rejectReason).toBe('SLOT_TAKEN');
  });

  it('a failing lock rolls back the rejections too (atomicity)', async () => {
    const blocker = request(15);
    await store.insertRequest(blocker);
    blocker.confirm('owner', now);
    await store.commitOccupy(blocker, []);

    const late = request(15);
    const other = request(15);
    await store.insertRequest(late);
    await store.insertRequest(other);
    late.confirm('owner', now);
    other.rejectAsTaken(now);
    await expect(store.commitOccupy(late, [other])).rejects.toBeInstanceOf(SlotTakenError);
    expect((await store.findById(other.id))?.status).toBe('PENDING');
  });

  it('BK-8: a block and a booking can never share a slot', async () => {
    const booking = request(16);
    await store.insertRequest(booking);
    const block = Block.create({
      id: id() as BlockId,
      pitchId,
      venueId: id(),
      range: TimeRange.ofDuration(hour(16), 60),
      reason: "ta'mir",
      createdBy: 'owner',
      now,
    });
    const results = await Promise.allSettled([
      store.commitBlock(block, []),
      (async () => {
        booking.confirm('owner', now);
        await store.commitOccupy(booking, []);
      })(),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await connection.collection('slot_locks').countDocuments()).toBe(1);
  });

  it('cancelling a confirmed booking frees its slots for others', async () => {
    const first = request(17, 2);
    await store.insertRequest(first);
    first.confirm('owner', now);
    await store.commitOccupy(first, []);
    expect(await connection.collection('slot_locks').countDocuments()).toBe(2);

    first.cancelByOwner('owner', "yomg'ir", now);
    await store.commitRelease(first);
    expect(await connection.collection('slot_locks').countDocuments()).toBe(0);

    const second = request(17);
    await store.insertRequest(second);
    second.confirm('owner', now);
    await expect(store.commitOccupy(second, [])).resolves.toBeUndefined();
  });

  it('EC-B2: the same player cannot have two active requests for the same pitch and start', async () => {
    const player = id();
    await store.insertRequest(request(18, 1, player));
    await expect(store.insertRequest(request(18, 1, player))).rejects.toBeInstanceOf(
      DuplicateActiveRequestError,
    );
  });

  it('a finished request frees the active key (player can ask again)', async () => {
    const player = id();
    const first = request(19, 1, player);
    await store.insertRequest(first);
    first.cancelByPlayer(player, now);
    await store.save(first);
    await expect(store.insertRequest(request(19, 1, player))).resolves.toBeUndefined();
  });

  it('occupancy reports locks as booked and pending requests per slot', async () => {
    const confirmed = request(10);
    const pendingA = request(11, 2);
    const pendingB = request(11);
    for (const b of [confirmed, pendingA, pendingB]) await store.insertRequest(b);
    confirmed.confirm('owner', now);
    await store.commitOccupy(confirmed, []);

    const view = (await store.occupancy([pitchId], hour(0), hour(23))).get(pitchId);
    expect([...(view?.booked ?? [])]).toEqual([hour(10).getTime()]);
    expect(view?.requested.get(hour(11).getTime())).toBe(2);
    expect(view?.requested.get(hour(12).getTime())).toBe(1);
  });
});
