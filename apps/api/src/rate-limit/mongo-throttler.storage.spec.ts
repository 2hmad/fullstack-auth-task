import { randomUUID } from 'node:crypto';
import mongoose, { type Connection, type Model } from 'mongoose';
import { isolatedMongoUri } from '../../test/utils/mongo.js';
import { MongoThrottlerStorage } from './mongo-throttler.storage.js';
import { RateLimitEntity, RateLimitSchema } from './rate-limit.schema.js';

const MINUTE = 60_000;

describe('MongoThrottlerStorage', () => {
  let connection: Connection;
  let model: Model<RateLimitEntity>;
  let storage: MongoThrottlerStorage;

  const hit = (
    key: string,
    { ttl = MINUTE, limit = 2, block = MINUTE, name = 'credentials', on = storage } = {},
  ) => on.increment(key, ttl, limit, block, name);

  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  beforeAll(async () => {
    connection = await mongoose
      .createConnection(isolatedMongoUri(), { maxPoolSize: 20 })
      .asPromise();
    model = connection.model(
      RateLimitEntity.name,
      RateLimitSchema,
    ) as unknown as Model<RateLimitEntity>;
    await model.init();
    storage = new MongoThrottlerStorage(model);
  });

  afterAll(async () => {
    await connection.dropDatabase();
    await connection.close();
  });

  it('counts hits and blocks the one past the limit', async () => {
    const key = randomUUID();
    expect(await hit(key)).toMatchObject({ totalHits: 1, isBlocked: false, timeToBlockExpire: 0 });
    expect(await hit(key)).toMatchObject({ totalHits: 2, isBlocked: false });
    const blocked = await hit(key);
    expect(blocked).toMatchObject({ totalHits: 3, isBlocked: true, timeToBlockExpire: 60 });
    expect(blocked.timeToExpire).toBeGreaterThan(50);
    expect(blocked.timeToExpire).toBeLessThanOrEqual(60);
  });

  it('is shared between instances', async () => {
    const key = randomUUID();
    const other = new MongoThrottlerStorage(model);
    await hit(key);
    await hit(key, { on: other });
    expect((await hit(key)).isBlocked).toBe(true);
    expect((await hit(key, { on: other })).isBlocked).toBe(true);
  });

  it('counts every one of many concurrent first hits', async () => {
    const key = randomUUID();
    const results = await Promise.all(Array.from({ length: 30 }, () => hit(key, { limit: 10 })));
    expect(results.filter((result) => !result.isBlocked)).toHaveLength(10);
  });

  it('keeps keys and throttlers apart', async () => {
    const key = randomUUID();
    await hit(key, { limit: 1 });
    expect((await hit(key, { limit: 1 })).isBlocked).toBe(true);
    expect((await hit(randomUUID(), { limit: 1 })).isBlocked).toBe(false);
    expect((await hit(key, { limit: 1, name: 'account' })).isBlocked).toBe(false);
  });

  it('does not extend a block, or grow, while it is being hit', async () => {
    const key = randomUUID();
    for (let count = 0; count < 3; count += 1) await hit(key);
    const before = await model.findById(`credentials:${key}`).lean();
    for (let count = 0; count < 5; count += 1) {
      expect((await hit(key)).totalHits).toBe(3);
    }
    const after = await model.findById(`credentials:${key}`).lean();
    expect(after?.hits).toHaveLength(3);
    expect(after?.blockedUntil).toEqual(before?.blockedUntil);
  });

  it('allows the key again after the block', async () => {
    const key = randomUUID();
    const options = { limit: 1, ttl: 300, block: 300 };
    await hit(key, options);
    expect((await hit(key, options)).isBlocked).toBe(true);
    await wait(400);
    expect(await hit(key, options)).toMatchObject({ totalHits: 1, isBlocked: false });
  });

  it('forgets a hit once it is older than the window, not all of them at once', async () => {
    const key = randomUUID();
    const options = { limit: 2, ttl: 600, block: 600 };
    await hit(key, options);
    await wait(400);
    await hit(key, options);
    await wait(300);
    // The first hit has left the window, the second has not.
    expect(await hit(key, options)).toMatchObject({ totalHits: 2, isBlocked: false });
    expect((await hit(key, options)).isBlocked).toBe(true);
  });

  it('lets MongoDB delete the document, but not before the block ends', async () => {
    const key = randomUUID();
    for (let count = 0; count < 2; count += 1) await hit(key, { limit: 1, block: 5 * MINUTE });
    const doc = await model.findById(`credentials:${key}`).lean();
    expect(doc!.expiresAt.getTime()).toBeGreaterThanOrEqual(doc!.blockedUntil!.getTime());
    const indexes = await model.collection.indexes();
    expect(indexes).toContainEqual(
      expect.objectContaining({ key: { expiresAt: 1 }, expireAfterSeconds: 0 }),
    );
  });

  it('keeps the general limit in memory, without touching the database', async () => {
    const key = randomUUID();
    const inMemory = { name: 'default', limit: 1 };
    expect((await hit(key, inMemory)).isBlocked).toBe(false);
    expect((await hit(key, inMemory)).isBlocked).toBe(true);
    expect(await model.countDocuments({ _id: `default:${key}` })).toBe(0);
  });
});
