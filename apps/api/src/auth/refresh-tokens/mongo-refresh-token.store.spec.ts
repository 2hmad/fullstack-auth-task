import { randomUUID } from 'node:crypto';
import mongoose, { type Connection, type Model } from 'mongoose';
import { isolatedMongoUri } from '../../../test/utils/mongo.js';
import { MongoRefreshTokenStore, type RefreshTokenRecord } from './mongo-refresh-token.store.js';
import {
  RefreshTokenEntity,
  RefreshTokenSchema,
  RevokedRefreshTokenFamilyEntity,
  RevokedRefreshTokenFamilySchema,
} from './refresh-token.schema.js';

describe('MongoRefreshTokenStore', () => {
  let connection: Connection;
  let store: MongoRefreshTokenStore;

  const record = (overrides: Partial<RefreshTokenRecord> = {}): RefreshTokenRecord => ({
    id: randomUUID(),
    familyId: randomUUID(),
    userId: randomUUID(),
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
    familyExpiresAt: new Date(Date.now() + 120_000),
    ...overrides,
  });

  beforeAll(async () => {
    connection = await mongoose
      .createConnection(isolatedMongoUri(), { maxPoolSize: 10 })
      .asPromise();
    const tokens = connection.model(RefreshTokenEntity.name, RefreshTokenSchema);
    const revoked = connection.model(
      RevokedRefreshTokenFamilyEntity.name,
      RevokedRefreshTokenFamilySchema,
    );
    await Promise.all([tokens.init(), revoked.init()]);
    store = new MongoRefreshTokenStore(
      tokens as unknown as Model<RefreshTokenEntity>,
      revoked as unknown as Model<RevokedRefreshTokenFamilyEntity>,
      { absoluteTtlSeconds: 30 * 24 * 60 * 60 },
    );
  });

  afterAll(async () => {
    await connection.dropDatabase();
    await connection.close();
  });

  it('returns what was saved, without fields that were never set', async () => {
    const saved = record();
    await store.saveRefreshToken(saved);
    const found = await store.getRefreshToken(saved.id);
    expect(found).toEqual(saved);
    expect(found).not.toHaveProperty('usedAt');
  });

  it('answers undefined for an unknown token', async () => {
    expect(await store.getRefreshToken(randomUUID())).toBeUndefined();
  });

  it('refuses a second token with the same id', async () => {
    const saved = record();
    await store.saveRefreshToken(saved);
    await expect(store.saveRefreshToken({ ...saved })).rejects.toThrow();
  });

  it('marks a token used once, and records when', async () => {
    const saved = record();
    await store.saveRefreshToken(saved);
    const at = new Date('2026-06-01T00:00:00Z');
    expect(await store.markRefreshTokenUsed(saved.id, at)).toBe(true);
    expect(await store.markRefreshTokenUsed(saved.id, new Date())).toBe(false);
    expect((await store.getRefreshToken(saved.id))?.usedAt).toEqual(at);
  });

  it('lets exactly one of many concurrent calls spend a token', async () => {
    const saved = record();
    await store.saveRefreshToken(saved);
    const results = await Promise.all(
      Array.from({ length: 10 }, () => store.markRefreshTokenUsed(saved.id, new Date())),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('does not mark an unknown token', async () => {
    expect(await store.markRefreshTokenUsed(randomUUID(), new Date())).toBe(false);
  });

  it('revokes one family, idempotently, including tokens saved after the revocation', async () => {
    const [revoked, other] = [record(), record()];
    await store.saveRefreshToken(revoked);
    await store.saveRefreshToken(other);
    expect(await store.isRefreshTokenFamilyRevoked(revoked.familyId)).toBe(false);

    await store.revokeRefreshTokenFamily(revoked.familyId);
    await store.revokeRefreshTokenFamily(revoked.familyId);
    await store.saveRefreshToken(record({ familyId: revoked.familyId }));

    expect(await store.isRefreshTokenFamilyRevoked(revoked.familyId)).toBe(true);
    expect(await store.isRefreshTokenFamilyRevoked(other.familyId)).toBe(false);
  });

  it('lets MongoDB delete expired families and old revocations', async () => {
    const ttl = async (name: string) =>
      (await connection.collection(name).indexes()).filter(
        (index) => index.expireAfterSeconds === 0,
      );
    expect(await ttl('refresh_tokens')).toEqual([
      expect.objectContaining({ key: { familyExpiresAt: 1 } }),
    ]);
    expect(await ttl('revoked_refresh_token_families')).toEqual([
      expect.objectContaining({ key: { expiresAt: 1 } }),
    ]);
  });
});
