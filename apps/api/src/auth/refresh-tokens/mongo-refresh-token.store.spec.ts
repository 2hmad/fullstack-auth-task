import type { AuthenticationStorage } from '@nestjs/authentication';
import { authenticationStoreContract } from '@nestjs/authentication/testing';
import mongoose, { type Connection, type Model } from 'mongoose';
import { isolatedMongoUri } from '../../../test/utils/mongo.js';
import { MongoRefreshTokenStore } from './mongo-refresh-token.store.js';
import {
  RefreshTokenEntity,
  RefreshTokenSchema,
  RevokedRefreshTokenFamilyEntity,
  RevokedRefreshTokenFamilySchema,
} from './refresh-token.schema.js';

/**
 * Runs the official @nestjs/authentication store contract against our MongoDB store,
 * including the concurrency cases (two refreshes of one token: exactly one may win).
 */
describe('MongoRefreshTokenStore', () => {
  let connection: Connection;
  const registered: unknown[] = [];
  const storage = { registerSource: (sources: unknown) => registered.push(sources) };

  const createStore = () =>
    new MongoRefreshTokenStore(
      connection.model(
        RefreshTokenEntity.name,
        RefreshTokenSchema,
      ) as unknown as Model<RefreshTokenEntity>,
      connection.model(
        RevokedRefreshTokenFamilyEntity.name,
        RevokedRefreshTokenFamilySchema,
      ) as unknown as Model<RevokedRefreshTokenFamilyEntity>,
      { absoluteTtlSeconds: 30 * 24 * 60 * 60 },
      storage as unknown as AuthenticationStorage,
    );

  beforeAll(async () => {
    connection = await mongoose
      .createConnection(isolatedMongoUri(), { maxPoolSize: 10 })
      .asPromise();
    await Promise.all(Object.values(connection.models).map((model) => model.init()));
  });

  afterAll(async () => {
    await connection.dropDatabase();
    await connection.close();
  });

  it('registers itself as the refresh-token source', () => {
    createStore();
    expect(registered.at(-1)).toEqual({ refreshTokens: expect.any(MongoRefreshTokenStore) });
  });

  const cases = authenticationStoreContract(() => ({ refreshTokens: createStore() }), {
    contracts: ['refreshTokens'],
    concurrent: true,
  });

  it.each(cases.map((c) => [c.name, c] as const))('%s', async (_name, contractCase) => {
    await contractCase.run();
  });
});
