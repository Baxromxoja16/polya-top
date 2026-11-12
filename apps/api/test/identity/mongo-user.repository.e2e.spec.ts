import { MongoDBContainer, type StartedMongoDBContainer } from '@testcontainers/mongodb';
import mongoose, { type Connection } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoUserRepository } from '../../src/modules/identity/infrastructure/mongo-user.repository.js';
import {
  USER_MODEL,
  type UserDocument,
  UserSchema,
} from '../../src/modules/identity/infrastructure/user.schema.js';
import { describeUserRepositoryContract, newUser } from '../contracts/user-repository.contract.js';
import { MONGO_IMAGE } from '../support/test-app.js';

let container: StartedMongoDBContainer;
let connection: Connection;
let repo: MongoUserRepository;

beforeAll(async () => {
  container = await new MongoDBContainer(MONGO_IMAGE).start();
  connection = await mongoose
    .createConnection(`${container.getConnectionString()}/identity-test?directConnection=true`)
    .asPromise();
  repo = new MongoUserRepository(connection.model<UserDocument>(USER_MODEL, UserSchema));
  await repo.onModuleInit();
});

afterAll(async () => {
  await connection?.close();
  await container?.stop();
});

describeUserRepositoryContract('mongo', () => repo);

describe('MongoUserRepository specifics', () => {
  it('EC: 20 parallel inserts with the same telegramId → exactly one row', async () => {
    const telegramId = 777_000_111;
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => repo.save(newUser(telegramId))),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await connection.collection('users').countDocuments({ telegramId })).toBe(1);
  });

  it('creates the unique indexes', async () => {
    const names = (await connection.collection('users').indexes()).map((i) => i.name);
    expect(names).toEqual(expect.arrayContaining(['uniq_telegram_id', 'uniq_phone']));
  });
});
